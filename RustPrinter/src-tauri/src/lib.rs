// src-tauri/src/lib.rs

use serde::Deserialize;
use std::fs;
use std::io::Write;
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;
use std::path::Path;
use std::process::Command;
use std::sync::Mutex;
use walkdir::WalkDir;

use notify::{Event, EventKind, RecursiveMode, Watcher};
use tauri::{Emitter, Manager, State};

// ============================================================
// État global pour le Hot Folder
// ============================================================

/// Contient le watcher du hot folder. `None` si aucun dossier n'est surveillé.
struct HotFolderState(Mutex<Option<notify::RecommendedWatcher>>);

// ============================================================
// Structures de données
// ============================================================

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct PrintOptions {
    copies: u32,
    color: bool,
    duplex: String,
    paper_size: String,
    // Nouvelles options avancées
    #[serde(default)]
    page_range: String,       // ex: "1-5,7,10" ou vide = toutes
    #[serde(default)]
    page_filter: String,      // "all", "even", "odd"
    #[serde(default)]
    scale: String,            // "fit", "shrink", "noscale"
}


use serde::Serialize;
use printpdf::*;
use std::io::BufWriter;

#[derive(Serialize, Deserialize, Default, Clone)]
pub struct AnalyticsData {
    pub total_pages_printed: u32,
    pub success_count: u32,
    pub error_count: u32,
    pub printers_used: std::collections::HashMap<String, u32>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct QueueItem {
    pub id: String,
    pub file_path: String,
    pub printer: String,
    pub options: Option<PrintOptions>,
    pub status: String, // "pending", "printing", "completed", "error"
}

pub struct PrintQueueState {
    pub queue: Mutex<Vec<QueueItem>>,
    pub is_paused: Mutex<bool>,
    pub is_running: Mutex<bool>,
}

// ============================================================
// Utilitaires internes
// ============================================================

/// Résout le chemin de SumatraPDF embarqué dans les ressources de l'application.

fn get_analytics_path(app: &tauri::AppHandle) -> std::path::PathBuf {
    let mut path = app.path().app_data_dir().unwrap_or_else(|_| std::path::PathBuf::from("."));
    if !path.exists() {
        let _ = fs::create_dir_all(&path);
    }
    path.push("analytics.json");
    path
}

#[tauri::command]
fn get_analytics(app: tauri::AppHandle) -> Result<AnalyticsData, String> {
    let path = get_analytics_path(&app);
    if path.exists() {
        let content = fs::read_to_string(&path).unwrap_or_default();
        if let Ok(data) = serde_json::from_str(&content) {
            return Ok(data);
        }
    }
    Ok(AnalyticsData::default())
}

fn update_analytics(app: &tauri::AppHandle, success: bool, pages: u32, printer: String) {
    let mut data = get_analytics(app.clone()).unwrap_or_default();
    if success {
        data.success_count += 1;
        data.total_pages_printed += pages;
        *data.printers_used.entry(printer).or_insert(0) += 1;
    } else {
        data.error_count += 1;
    }
    let path = get_analytics_path(app);
    if let Ok(json) = serde_json::to_string_pretty(&data) {
        let _ = fs::write(path, json);
    }
}

fn get_sumatra_path(app_handle: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    // En mode dev, SumatraPDF est dans src-tauri/resources/
    let resource_dir = app_handle
        .path()
        .resource_dir()
        .map_err(|e| format!("Impossible de trouver le dossier ressources: {}", e))?;
    let sumatra = resource_dir.join("resources").join("SumatraPDF.exe");
    if sumatra.exists() {
        return Ok(sumatra);
    }
    // Fallback : directement dans resources/
    let sumatra_alt = resource_dir.join("SumatraPDF.exe");
    if sumatra_alt.exists() {
        return Ok(sumatra_alt);
    }
    // Dernier fallback : chemin relatif (mode dev)
    let dev_path = std::path::PathBuf::from("resources").join("SumatraPDF.exe");
    if dev_path.exists() {
        return Ok(dev_path);
    }
    Err("SumatraPDF.exe introuvable dans les ressources de l'application.".to_string())
}

// ============================================================
// Commandes Tauri — Impression
// ============================================================


fn convert_image_to_pdf(image_path: &str) -> Result<String, String> {
    let temp_dir = std::env::temp_dir();
    let file_name = std::path::Path::new(image_path).file_stem().unwrap_or_default().to_string_lossy();
    let output_path = temp_dir.join(format!("{}_converted.pdf", file_name));
    
    let img = ::image::open(image_path).map_err(|e| format!("Erreur lecture image: {}", e))?;
    use ::image::GenericImageView;
    let (width, height) = img.dimensions();
    
    let dpi = 300.0;
    let w_mm = (width as f64) * 25.4 / dpi;
    let h_mm = (height as f64) * 25.4 / dpi;
    
    let (doc, page1, layer1) = PdfDocument::new("Converted Image", Mm(w_mm), Mm(h_mm), "Layer 1");
    let current_layer = doc.get_page(page1).get_layer(layer1);
    
    let mut bytes: Vec<u8> = Vec::new();
    let mut cursor = std::io::Cursor::new(&mut bytes);
    img.write_to(&mut cursor, ::image::ImageFormat::Jpeg).map_err(|e| e.to_string())?;
    
    let decoder = printpdf::image_crate::codecs::jpeg::JpegDecoder::new(std::io::Cursor::new(&bytes)).map_err(|e| e.to_string())?;
    let pdf_image = printpdf::Image::try_from(decoder).map_err(|e| e.to_string())?;
    
    pdf_image.add_to_layer(current_layer.clone(), ImageTransform::default());
    
    let file = std::fs::File::create(&output_path).map_err(|e| e.to_string())?;
    let mut buf_writer = BufWriter::new(file);
    doc.save(&mut buf_writer).map_err(|e| e.to_string())?;
    
    Ok(output_path.to_string_lossy().into_owned())
}

#[tauri::command]
fn get_printers() -> Result<Vec<String>, String> {
    #[cfg(target_os = "windows")]
    {
        let mut cmd = Command::new("powershell");
        cmd.creation_flags(0x08000000);
        let output = cmd
            .args([
                "-Command",
                "Get-Printer | Select-Object -ExpandProperty Name",
            ])
            .output()
            .map_err(|e| format!("Échec de l'exécution PowerShell: {}", e))?;

        if !output.status.success() {
            return Err("Erreur lors de la récupération des imprimantes".to_string());
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        let printers: Vec<String> = stdout
            .lines()
            .map(|line| line.trim().to_string())
            .filter(|line| !line.is_empty())
            .collect();

        Ok(printers)
    }
    #[cfg(not(target_os = "windows"))]
    {
        let output = Command::new("lpstat")
            .args(["-p"])
            .output()
            .map_err(|e| format!("Échec de lpstat: {}", e))?;

        let stdout = String::from_utf8_lossy(&output.stdout);
        let mut printers = Vec::new();
        for line in stdout.lines() {
            if line.starts_with("printer ") {
                let parts: Vec<&str> = line.split_whitespace().collect();
                if parts.len() > 1 {
                    printers.push(parts[1].to_string());
                }
            }
        }
        Ok(printers)
    }
}



fn print_file_internal(
    app_handle: &tauri::AppHandle,
    file_path: &str,
    printer: &str,
    options: Option<&PrintOptions>,
) -> Result<String, String> {
    if file_path.is_empty() {
        return Err("Le chemin du fichier est invalide.".to_string());
    }
    let copies = options.map(|o| o.copies).unwrap_or(1).max(1);
    
    let mut actual_path = file_path.to_string();
    if !actual_path.to_lowercase().ends_with(".pdf") {
        actual_path = convert_image_to_pdf(&actual_path)?;
    }

    #[cfg(target_os = "windows")]
    {
        let sumatra = get_sumatra_path(app_handle)?;
        let mut settings_parts: Vec<String> = Vec::new();

        let page_range = options.map(|o| o.page_range.as_str()).unwrap_or("");
        if !page_range.is_empty() { settings_parts.push(page_range.to_string()); }

        let page_filter = options.map(|o| o.page_filter.as_str()).unwrap_or("all");
        match page_filter {
            "even" => settings_parts.push("even".to_string()),
            "odd" => settings_parts.push("odd".to_string()),
            _ => {}
        }

        let color = options.map(|o| o.color).unwrap_or(true);
        settings_parts.push(if color { "color".to_string() } else { "monochrome".to_string() });

        let duplex = options.map(|o| o.duplex.as_str()).unwrap_or("OneSided");
        match duplex {
            "TwoSidedLongEdge" => settings_parts.push("duplexlong".to_string()),
            "TwoSidedShortEdge" => settings_parts.push("duplexshort".to_string()),
            _ => settings_parts.push("simplex".to_string()),
        }

        let scale = options.map(|o| o.scale.as_str()).unwrap_or("fit");
        match scale {
            "noscale" => settings_parts.push("noscale".to_string()),
            "shrink" => settings_parts.push("shrink".to_string()),
            _ => settings_parts.push("fit".to_string()),
        }

        let paper = options.map(|o| o.paper_size.as_str()).unwrap_or("A4");
        settings_parts.push(format!("paper={}", paper));

        if copies > 1 {
            settings_parts.push(format!("{}x", copies));
        }

        let settings_str = settings_parts.join(",");

        let mut cmd = Command::new(&sumatra);
        cmd.creation_flags(0x08000000);
        cmd.args([
            "-print-to",
            printer,
            "-print-settings",
            &settings_str,
            "-silent",
            &actual_path,
        ]);

        let output = cmd.output().map_err(|e| format!("Échec SumatraPDF: {}", e))?;
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            if !stderr.is_empty() {
                return Err(format!("Erreur SumatraPDF: {}", stderr));
            }
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        let output = Command::new("lp")
            .args(["-d", printer, "-n", &copies.to_string(), &actual_path])
            .output()
            .map_err(|e| format!("Échec lp: {}", e))?;
        if !output.status.success() {
            return Err(format!("Erreur CUPS: {}", String::from_utf8_lossy(&output.stderr)));
        }
    }

    Ok(format!("Le fichier {} a été expédié au spooler ({} copies).", file_path, copies))
}

#[tauri::command]
fn print_file(
    app_handle: tauri::AppHandle,
    file_path: String,
    printer: String,
    options: Option<PrintOptions>,
) -> Result<String, String> {
    print_file_internal(&app_handle, &file_path, &printer, options.as_ref())
}



#[tauri::command]
fn start_queue(app: tauri::AppHandle, state: State<PrintQueueState>, items: Vec<QueueItem>) -> Result<(), String> {
    {
        let mut q = state.queue.lock().unwrap();
        *q = items;
        *state.is_paused.lock().unwrap() = false;
    }
    
    let app_clone = app.clone();
    std::thread::spawn(move || {
        let state = app_clone.state::<PrintQueueState>();
        *state.is_running.lock().unwrap() = true;
        
        loop {
            while *state.is_paused.lock().unwrap() {
                std::thread::sleep(std::time::Duration::from_millis(500));
            }
            
            let mut next_idx = None;
            {
                let q = state.queue.lock().unwrap();
                for (i, item) in q.iter().enumerate() {
                    if item.status == "pending" {
                        next_idx = Some(i);
                        break;
                    }
                }
            }
            
            if let Some(idx) = next_idx {
                let item = {
                    let mut q = state.queue.lock().unwrap();
                    q[idx].status = "printing".to_string();
                    let _ = app_clone.emit("queue-progress", q.clone());
                    q[idx].clone()
                };
                
                let res = print_file_internal(&app_clone, &item.file_path, &item.printer, item.options.as_ref());
                
                {
                    let mut q = state.queue.lock().unwrap();
                    if res.is_ok() {
                        q[idx].status = "completed".to_string();
                        update_analytics(&app_clone, true, 1, item.printer.clone());
                    } else {
                        q[idx].status = "error".to_string();
                        update_analytics(&app_clone, false, 0, item.printer.clone());
                    }
                    let _ = app_clone.emit("queue-progress", q.clone());
                }
            } else {
                break;
            }
        }
        *state.is_running.lock().unwrap() = false;
        let _ = app_clone.emit("queue-finished", ());
    });
    Ok(())
}

#[tauri::command]
fn pause_queue(state: State<PrintQueueState>) {
    *state.is_paused.lock().unwrap() = true;
}

#[tauri::command]
fn resume_queue(state: State<PrintQueueState>) {
    *state.is_paused.lock().unwrap() = false;
}

#[tauri::command]
fn cancel_queue_item(state: State<PrintQueueState>, index: usize) -> Result<(), String> {
    let mut q = state.queue.lock().unwrap();
    if index < q.len() {
        q.remove(index);
    }
    Ok(())
}

#[tauri::command]
fn reorder_queue(state: State<PrintQueueState>, old_index: usize, new_index: usize) -> Result<(), String> {
    let mut q = state.queue.lock().unwrap();
    if old_index < q.len() && new_index < q.len() {
        let item = q.remove(old_index);
        q.insert(new_index, item);
    }
    Ok(())
}

// ============================================================
// Commandes Tauri — Gestion de fichiers
// ============================================================

#[tauri::command]
fn process_dropped_paths(paths: Vec<String>) -> Vec<String> {
    let mut files = Vec::new();
    for path_str in paths {
        let path = Path::new(&path_str);
        if path.is_file() {
            files.push(path_str);
        } else if path.is_dir() {
            for entry in WalkDir::new(path).into_iter().filter_map(|e| e.ok()) {
                if entry.path().is_file() {
                    if let Some(p) = entry.path().to_str() {
                        files.push(p.to_string());
                    }
                }
            }
        }
    }
    files
}

#[tauri::command]
fn generate_slip_sheet(text: String) -> Result<String, String> {
    let temp_dir = std::env::temp_dir();
    let safe_text = text.replace("/", "_").replace("\\", "_").replace(" ", "_").replace("..", "_");
    let file_path = temp_dir.join(format!("slip_sheet_{}.txt", safe_text));
    let mut file = fs::File::create(&file_path).map_err(|e| e.to_string())?;

    let content = format!("\n\n========================================\n\n  PAGE DE GARDE\n  Document : {}\n\n========================================\n", text);
    file.write_all(content.as_bytes())
        .map_err(|e| e.to_string())?;

    Ok(file_path.to_string_lossy().into_owned())
}



#[tauri::command]
fn check_print_jobs(printer: String) -> Result<u32, String> {
    #[cfg(target_os = "windows")]
    {
        let mut cmd = Command::new("powershell");
        cmd.creation_flags(0x08000000);
        let output = cmd
            .args([
                "-Command",
                &format!(
                    "(Get-PrintJob -PrinterName '{}').Count",
                    printer.replace("'", "''")
                ),
            ])
            .output()
            .map_err(|e| format!("Erreur PS: {}", e))?;
        Ok(String::from_utf8_lossy(&output.stdout)
            .trim()
            .parse::<u32>()
            .unwrap_or(0))
    }
    #[cfg(not(target_os = "windows"))]
    {
        Ok(0) // Placeholder
    }
}

/// Retourne le nombre de pages d'un fichier PDF via lopdf.
#[tauri::command]
fn get_pdf_page_count(file_path: String) -> Result<u32, String> {
    if !file_path.to_lowercase().ends_with(".pdf") {
        return Err("Le fichier n'est pas un PDF.".to_string());
    }
    let doc = lopdf::Document::load(&file_path)
        .map_err(|e| format!("Impossible de lire le PDF: {}", e))?;
    Ok(doc.get_pages().len() as u32)
}

/// Retourne le nombre de pages de plusieurs fichiers PDF en un seul appel (optimisation).
#[tauri::command]
fn get_pdf_page_counts(file_paths: Vec<String>) -> Result<std::collections::HashMap<String, u32>, String> {
    let mut counts = std::collections::HashMap::new();
    for path in file_paths {
        if path.to_lowercase().ends_with(".pdf") {
            if let Ok(doc) = lopdf::Document::load(&path) {
                counts.insert(path, doc.get_pages().len() as u32);
            }
        }
    }
    Ok(counts)
}

// ============================================================
// NOUVEAU — Fusion PDF (lopdf)
// ============================================================

/// Remplace les références d'objets dans un objet lopdf selon une table de correspondance.
fn remap_object_refs(
    obj: &lopdf::Object,
    id_map: &std::collections::BTreeMap<lopdf::ObjectId, lopdf::ObjectId>,
) -> lopdf::Object {
    match obj {
        lopdf::Object::Reference(id) => {
            lopdf::Object::Reference(*id_map.get(id).unwrap_or(id))
        }
        lopdf::Object::Array(arr) => {
            lopdf::Object::Array(arr.iter().map(|o| remap_object_refs(o, id_map)).collect())
        }
        lopdf::Object::Dictionary(dict) => {
            let mut new_dict = lopdf::Dictionary::new();
            for (key, val) in dict.iter() {
                new_dict.set(key.clone(), remap_object_refs(val, id_map));
            }
            lopdf::Object::Dictionary(new_dict)
        }
        lopdf::Object::Stream(stream) => {
            let mut new_dict = lopdf::Dictionary::new();
            for (key, val) in stream.dict.iter() {
                new_dict.set(key.clone(), remap_object_refs(val, id_map));
            }
            lopdf::Object::Stream(lopdf::Stream::new(new_dict, stream.content.clone()))
        }
        other => other.clone(),
    }
}

/// Fusionne plusieurs fichiers PDF en un seul fichier temporaire.
/// Retourne le chemin du fichier fusionné.
#[tauri::command]
fn merge_pdfs(paths: Vec<String>) -> Result<String, String> {
    use std::collections::BTreeMap;

    if paths.is_empty() {
        return Err("Aucun fichier PDF à fusionner.".to_string());
    }

    // Filtrer uniquement les PDF
    let pdf_paths: Vec<&String> = paths
        .iter()
        .filter(|p| p.to_lowercase().ends_with(".pdf"))
        .collect();

    if pdf_paths.is_empty() {
        return Err("Aucun fichier PDF trouvé dans la liste.".to_string());
    }

    if pdf_paths.len() == 1 {
        return Ok(pdf_paths[0].clone());
    }

    // Charger le premier document comme base
    let mut merged_doc = lopdf::Document::load(&pdf_paths[0])
        .map_err(|e| format!("Erreur lecture du PDF '{}': {}", pdf_paths[0], e))?;

    // Pour chaque PDF suivant, copier tous les objets avec des IDs remappés
    for pdf_path in &pdf_paths[1..] {
        let doc = lopdf::Document::load(pdf_path)
            .map_err(|e| format!("Erreur lecture du PDF '{}': {}", pdf_path, e))?;

        // Calculer l'offset pour éviter les conflits d'ID
        let max_id = merged_doc
            .objects
            .keys()
            .map(|(id, _)| *id)
            .max()
            .unwrap_or(0);

        // Créer la table de correspondance des IDs
        let mut id_map: BTreeMap<lopdf::ObjectId, lopdf::ObjectId> = BTreeMap::new();
        for old_id in doc.objects.keys() {
            let new_id = (old_id.0 + max_id + 1, old_id.1);
            id_map.insert(*old_id, new_id);
        }

        // Copier tous les objets avec les références remappées
        for (old_id, obj) in &doc.objects {
            let new_id = id_map[old_id];
            let remapped = remap_object_refs(obj, &id_map);
            merged_doc.objects.insert(new_id, remapped);
        }

        // Trouver les pages du document source et les ajouter au Pages tree du document fusionné
        let source_pages = doc.get_pages();
        let mut sorted_pages: Vec<_> = source_pages.into_iter().collect();
        sorted_pages.sort_by_key(|(num, _)| *num);

        // Récupérer le Pages ID du document fusionné via le catalog
        let pages_id = {
            let cat_dict = merged_doc
                .catalog()
                .map_err(|e| format!("Erreur catalog: {}", e))?;
            match cat_dict.get(b"Pages") {
                Ok(lopdf::Object::Reference(pages_ref)) => *pages_ref,
                _ => return Err("Structure PDF invalide: 'Pages' introuvable dans le catalog.".to_string()),
            }
        };

        // Ajouter chaque page source au Kids array du Pages dict fusionné
        for (_page_num, old_page_id) in &sorted_pages {
            let new_page_id = id_map
                .get(old_page_id)
                .ok_or_else(|| "Erreur de remapping d'ID de page.".to_string())?;

            // Mettre à jour le Parent de la page pour pointer vers le Pages du document fusionné
            if let Ok(lopdf::Object::Dictionary(ref mut page_dict)) =
                merged_doc.get_object_mut(*new_page_id)
            {
                page_dict.set("Parent", lopdf::Object::Reference(pages_id));
            }

            // Ajouter au Kids array
            if let Ok(lopdf::Object::Dictionary(ref mut pages_dict)) =
                merged_doc.get_object_mut(pages_id)
            {
                if let Ok(lopdf::Object::Array(ref mut kids)) = pages_dict.get_mut(b"Kids") {
                    kids.push(lopdf::Object::Reference(*new_page_id));
                }
                // Mettre à jour le Count
                if let Ok(lopdf::Object::Integer(ref mut count)) = pages_dict.get_mut(b"Count") {
                    *count += 1;
                }
            }
        }
    }

    // Sauvegarder le fichier fusionné dans un fichier temporaire
    let temp_dir = std::env::temp_dir();
    let output_path = temp_dir.join("tauriprint_merged.pdf");
    merged_doc
        .save(&output_path)
        .map_err(|e| format!("Erreur lors de la sauvegarde du PDF fusionné: {}", e))?;

    Ok(output_path.to_string_lossy().into_owned())
}

// ============================================================
// NOUVEAU — Hot Folder (notify)
// ============================================================

/// Démarre la surveillance d'un dossier. Émet un événement "hot-folder-file"
/// vers le frontend chaque fois qu'un nouveau fichier est créé dans le dossier.
#[tauri::command]
fn start_hot_folder(
    app: tauri::AppHandle,
    state: State<HotFolderState>,
    folder_path: String,
) -> Result<String, String> {
    let path = Path::new(&folder_path);
    if !path.exists() || !path.is_dir() {
        return Err(format!("Le dossier '{}' n'existe pas.", folder_path));
    }

    // Créer les sous-dossiers de traitement
    let printed_dir = path.join("Imprimé");
    let errors_dir = path.join("Erreurs");
    fs::create_dir_all(&printed_dir)
        .map_err(|e| format!("Impossible de créer le dossier 'Imprimé': {}", e))?;
    fs::create_dir_all(&errors_dir)
        .map_err(|e| format!("Impossible de créer le dossier 'Erreurs': {}", e))?;

    // Arrêter le watcher précédent s'il existe
    {
        let mut watcher_lock = state
            .0
            .lock()
            .map_err(|e| format!("Erreur de verrouillage: {}", e))?;
        *watcher_lock = None;
    }

    // Créer un nouveau watcher
    let app_clone = app.clone();
    let mut watcher = notify::recommended_watcher(move |res: Result<Event, notify::Error>| {
        if let Ok(event) = res {
            // Ne réagir qu'aux créations de fichiers
            if matches!(event.kind, EventKind::Create(_)) {
                for path in event.paths {
                    if path.is_file() {
                        // Petite pause pour s'assurer que le fichier est complètement écrit
                        std::thread::sleep(std::time::Duration::from_millis(500));
                        if let Some(path_str) = path.to_str() {
                            let _ = app_clone.emit("hot-folder-file", path_str.to_string());
                        }
                    }
                }
            }
        }
    })
    .map_err(|e| format!("Erreur lors de la création du watcher: {}", e))?;

    // Surveiller le dossier (non-récursif pour éviter de surveiller Imprimé/ et Erreurs/)
    watcher
        .watch(Path::new(&folder_path), RecursiveMode::NonRecursive)
        .map_err(|e| format!("Erreur lors du démarrage de la surveillance: {}", e))?;

    // Stocker le watcher dans l'état global
    {
        let mut watcher_lock = state
            .0
            .lock()
            .map_err(|e| format!("Erreur de verrouillage: {}", e))?;
        *watcher_lock = Some(watcher);
    }

    Ok(format!(
        "Surveillance démarrée sur '{}'",
        folder_path
    ))
}

/// Arrête la surveillance du hot folder.
#[tauri::command]
fn stop_hot_folder(state: State<HotFolderState>) -> Result<String, String> {
    let mut watcher_lock = state
        .0
        .lock()
        .map_err(|e| format!("Erreur de verrouillage: {}", e))?;
    *watcher_lock = None;
    Ok("Surveillance arrêtée.".to_string())
}

// ============================================================
// NOUVEAU — Déplacement de fichier (post-impression hot folder)
// ============================================================

/// Déplace un fichier vers un dossier de destination.
/// Utilisé pour déplacer les fichiers imprimés vers "Imprimé/" ou "Erreurs/".
#[tauri::command]
fn move_file(state: State<HotFolderState>, source: String, is_error: bool) -> Result<String, String> {
    let hot_folder_opt = state.0.lock().map_err(|e| e.to_string())?;
    if hot_folder_opt.is_none() {
        return Err("Aucun Hot Folder actuellement surveillé.".to_string());
    }
    
    let src = Path::new(&source);
    if !src.exists() {
        return Err(format!("Le fichier source '{}' n'existe pas.", source));
    }

    // Le dest_folder est déduit de la source, qui DOIT se trouver dans le dossier surveillé
    let parent_dir = src.parent().ok_or_else(|| "Fichier sans dossier parent.".to_string())?;
    
    let sub_folder = if is_error { "Erreurs" } else { "Imprimé" };
    let dest_dir = parent_dir.join(sub_folder);
    
    if !dest_dir.exists() {
        fs::create_dir_all(&dest_dir)
            .map_err(|e| format!("Impossible de créer le dossier destination: {}", e))?;
    }

    let file_name = src
        .file_name()
        .ok_or_else(|| "Nom de fichier invalide.".to_string())?;
    let dest_path = dest_dir.join(file_name);

    let final_dest = if dest_path.exists() {
        let stem = dest_path.file_stem().and_then(|s| s.to_str()).unwrap_or("file");
        let ext = dest_path.extension().and_then(|s| s.to_str()).unwrap_or("");
        let timestamp = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
        if ext.is_empty() {
            dest_dir.join(format!("{}_{}", stem, timestamp))
        } else {
            dest_dir.join(format!("{}_{}.{}", stem, timestamp, ext))
        }
    } else {
        dest_path
    };

    if let Err(e) = fs::rename(src, &final_dest) {
        fs::copy(src, &final_dest).map_err(|copy_err| {
            format!("Impossible de déplacer le fichier: rename_err={}, copy_err={}", e, copy_err)
        })?;
        let _ = fs::remove_file(src);
    }

    Ok(final_dest.to_string_lossy().into_owned())
}


/// Retourne la version actuelle de l'application définie dans tauri.conf.json.
#[tauri::command]
fn get_app_version(app_handle: tauri::AppHandle) -> String {
    app_handle.package_info().version.to_string()
}


// ============================================================
// Point d'entrée Tauri
// ============================================================

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(HotFolderState(Mutex::new(None)))
        .manage(PrintQueueState { queue: Mutex::new(Vec::new()), is_paused: Mutex::new(false), is_running: Mutex::new(false) })
        .invoke_handler(tauri::generate_handler![
            get_printers,
            print_file,
            process_dropped_paths,
            generate_slip_sheet,
            check_print_jobs,
            merge_pdfs,
            get_pdf_page_count,
            get_pdf_page_counts,
            // Nouvelles commandes Phase 1
            start_hot_folder,
            stop_hot_folder,
            move_file,
            get_app_version,
            get_analytics,
            start_queue,
            pause_queue,
            resume_queue,
            cancel_queue_item,
            reorder_queue
        ])
        .run(tauri::generate_context!())
        .expect("Erreur fatale lors du lancement de l'application Tauri");
}

// ============================================================
// Tests
// ============================================================

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn test_generate_slip_sheet() {
        let res = generate_slip_sheet("Test Doc".to_string());
        assert!(res.is_ok());
        let path = res.unwrap();
        assert!(fs::metadata(&path).is_ok());
        let content = fs::read_to_string(&path).unwrap();
        assert!(content.contains("Test Doc"));
    }

    #[test]
    fn test_export_logs() {
        let temp_dir = std::env::temp_dir();
        let file_path = temp_dir.join("test_logs.csv");
        let logs = vec!["2023-01-01,Succès,fichier.pdf,Imprimante1".to_string()];

        let res = export_logs(logs, file_path.to_string_lossy().to_string());
        assert!(res.is_ok());
        let content = fs::read_to_string(&file_path).unwrap();
        assert!(content.contains("Date,Statut,Fichier,Imprimante"));
        assert!(content.contains("fichier.pdf"));
    }

    #[test]
    fn test_process_dropped_paths() {
        let temp_dir = std::env::temp_dir().join("printmax_test_dir");
        let _ = fs::create_dir_all(&temp_dir);
        let file1 = temp_dir.join("test1.txt");
        let file2 = temp_dir.join("test2.txt");
        let _ = fs::write(&file1, "hello");
        let _ = fs::write(&file2, "world");

        let paths = vec![temp_dir.to_string_lossy().to_string()];
        let results = process_dropped_paths(paths);

        assert!(results.len() >= 2);
        assert!(results.iter().any(|p| p.contains("test1.txt")));
        assert!(results.iter().any(|p| p.contains("test2.txt")));
    }

    #[test]
    fn test_move_file() {
        let temp_dir = std::env::temp_dir().join("printmax_move_test");
        let _ = fs::create_dir_all(&temp_dir);
        let dest_dir = temp_dir.join("dest");
        let _ = fs::create_dir_all(&dest_dir);

        let source_file = temp_dir.join("test_move.txt");
        let _ = fs::write(&source_file, "move test");

        let result = move_file(
            source_file.to_string_lossy().to_string(),
            dest_dir.to_string_lossy().to_string(),
        );
        assert!(result.is_ok());
        assert!(!source_file.exists());
        assert!(dest_dir.join("test_move.txt").exists());

        // Cleanup
        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_merge_pdfs_empty() {
        let result = merge_pdfs(Vec::new());
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Aucun fichier PDF"));
    }

    #[test]
    fn test_merge_pdfs_no_pdfs() {
        let result = merge_pdfs(vec!["file.txt".to_string(), "file.jpg".to_string()]);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Aucun fichier PDF trouvé"));
    }
}
