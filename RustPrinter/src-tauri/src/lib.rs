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

#[derive(Deserialize)]
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
    #[serde(default)]
    _reverse: bool,            // Impression en ordre inversé
}

// ============================================================
// Utilitaires internes
// ============================================================

/// Résout le chemin de SumatraPDF embarqué dans les ressources de l'application.
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

#[tauri::command]
fn open_file_dialog() -> Result<Vec<String>, String> {
    let script = r#"
        Add-Type -AssemblyName System.Windows.Forms
        $dialog = New-Object System.Windows.Forms.OpenFileDialog
        $dialog.Multiselect = $true
        $dialog.Filter = "Tous les fichiers (*.*)|*.*|Fichiers PDF (*.pdf)|*.pdf|Images|*.png;*.jpg;*.jpeg"
        $dialog.Title = "Sélectionnez les fichiers à imprimer"
        if ($dialog.ShowDialog() -eq 'OK') {
            $dialog.FileNames -join "|"
        }
    "#;
    let mut cmd = Command::new("powershell");
    #[cfg(target_os = "windows")]
    cmd.creation_flags(0x08000000);
    let output = cmd
        .args(&["-Sta", "-Command", script])
        .output()
        .map_err(|e| e.to_string())?;

    let result = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if result.is_empty() {
        return Ok(Vec::new());
    }

    let paths: Vec<String> = result.split('|').map(|s| s.to_string()).collect();
    Ok(paths)
}

#[tauri::command]
fn print_file(
    app_handle: tauri::AppHandle,
    file_path: String,
    printer: String,
    options: Option<PrintOptions>,
) -> Result<String, String> {
    if file_path.is_empty() {
        return Err("Le chemin du fichier est invalide.".to_string());
    }
    let copies = options.as_ref().map(|o| o.copies).unwrap_or(1).max(1);
    let is_pdf = file_path.to_lowercase().ends_with(".pdf");

    #[cfg(target_os = "windows")]
    {
        if is_pdf {
            // === MOTEUR SUMATRAPDF (pour les PDF) ===
            let sumatra = get_sumatra_path(&app_handle)?;

            // Construire les print-settings
            let mut settings_parts: Vec<String> = Vec::new();

            // Plage de pages
            let page_range = options.as_ref().map(|o| o.page_range.as_str()).unwrap_or("");
            if !page_range.is_empty() {
                settings_parts.push(page_range.to_string());
            }

            // Pages paires / impaires
            let page_filter = options.as_ref().map(|o| o.page_filter.as_str()).unwrap_or("all");
            match page_filter {
                "even" => settings_parts.push("even".to_string()),
                "odd" => settings_parts.push("odd".to_string()),
                _ => {}
            }

            // Couleur / N&B
            let color = options.as_ref().map(|o| o.color).unwrap_or(true);
            settings_parts.push(if color { "color".to_string() } else { "monochrome".to_string() });

            // Recto-verso
            let duplex = options.as_ref().map(|o| o.duplex.as_str()).unwrap_or("OneSided");
            match duplex {
                "TwoSidedLongEdge" => settings_parts.push("duplexlong".to_string()),
                "TwoSidedShortEdge" => settings_parts.push("duplexshort".to_string()),
                _ => settings_parts.push("simplex".to_string()),
            }

            // Mise à l'échelle
            let scale = options.as_ref().map(|o| o.scale.as_str()).unwrap_or("fit");
            match scale {
                "noscale" => settings_parts.push("noscale".to_string()),
                "shrink" => settings_parts.push("shrink".to_string()),
                _ => settings_parts.push("fit".to_string()),
            }

            // Taille du papier
            let paper = options.as_ref().map(|o| o.paper_size.as_str()).unwrap_or("A4");
            settings_parts.push(format!("paper={}", paper));

            // Nombre de copies
            if copies > 1 {
                settings_parts.push(format!("{}x", copies));
            }

            let settings_str = settings_parts.join(",");

            let mut cmd = Command::new(&sumatra);
            cmd.creation_flags(0x08000000);
            cmd.args([
                "-print-to",
                &printer,
                "-print-settings",
                &settings_str,
                "-silent",
                &file_path,
            ]);

            let output = cmd.output().map_err(|e| format!("Échec SumatraPDF: {}", e))?;

            if !output.status.success() {
                let stderr = String::from_utf8_lossy(&output.stderr);
                if !stderr.is_empty() {
                    return Err(format!("Erreur SumatraPDF: {}", stderr));
                }
            }
        } else {
            // === FALLBACK POWERSHELL (pour les fichiers non-PDF) ===
            let color_str = options
                .as_ref()
                .map(|o| if o.color { "$true" } else { "$false" })
                .unwrap_or("$true");
            let duplex_str = options
                .as_ref()
                .map(|o| o.duplex.as_str())
                .unwrap_or("OneSided");
            let paper_size_str = options
                .as_ref()
                .map(|o| o.paper_size.as_str())
                .unwrap_or("A4");

            let ps_script = format!(
                r#"
                $ErrorActionPreference = 'Stop'
                try {{
                    $PrinterName = '{}'
                    $FilePath = '{}'
                    
                    $DefaultPrinter = (Get-WmiObject -Query "SELECT * FROM Win32_Printer WHERE Default=$true").Name
                    $Network = New-Object -ComObject WScript.Network
                    $Network.SetDefaultPrinter($PrinterName)
                    
                    $oldConfig = Get-PrintConfiguration -PrinterName $PrinterName
                    Set-PrintConfiguration -PrinterName $PrinterName -Color {} -DuplexingMode {} -PaperSize {}
                    
                    for ($i = 1; $i -le {}; $i++) {{
                        $proc = Start-Process -FilePath $FilePath -Verb Print -WindowStyle Hidden -PassThru
                        if ($null -ne $proc) {{
                            try {{
                                $proc | Wait-Process -Timeout 10 -ErrorAction Stop
                            }} catch {{ }}
                            if (-not $proc.HasExited) {{
                                $proc | Stop-Process -Force -ErrorAction SilentlyContinue
                            }}
                        }} else {{
                            Start-Sleep -Seconds 10
                        }}
                        Start-Sleep -Seconds 2
                    }}
                    
                    Set-PrintConfiguration -PrinterName $PrinterName -Color $oldConfig.Color -DuplexingMode $oldConfig.DuplexingMode -PaperSize $oldConfig.PaperSize
                    
                    if ($DefaultPrinter) {{ $Network.SetDefaultPrinter($DefaultPrinter) }}
                }} catch {{
                    Write-Error $_.Exception.Message
                    exit 1
                }}
                "#,
                printer.replace("'", "''"),
                file_path.replace("'", "''"),
                color_str,
                duplex_str,
                paper_size_str,
                copies
            );

            let mut cmd = Command::new("powershell");
            cmd.creation_flags(0x08000000);
            let output = cmd
                .args(["-Command", &ps_script])
                .output()
                .map_err(|e| format!("Échec PowerShell: {}", e))?;

            if !output.status.success() {
                return Err(format!(
                    "Erreur d'impression: {}",
                    String::from_utf8_lossy(&output.stderr)
                ));
            }
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        let output = Command::new("lp")
            .args(["-d", &printer, "-n", &copies.to_string(), &file_path])
            .output()
            .map_err(|e| format!("Échec lp: {}", e))?;
        if !output.status.success() {
            return Err(format!(
                "Erreur CUPS: {}",
                String::from_utf8_lossy(&output.stderr)
            ));
        }
    }

    Ok(format!(
        "Le fichier {} a été expédié au spooler ({} copies).",
        file_path, copies
    ))
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
    let file_path = temp_dir.join(format!("slip_sheet_{}.txt", text.replace(" ", "_")));
    let mut file = fs::File::create(&file_path).map_err(|e| e.to_string())?;

    let content = format!("\n\n========================================\n\n  PAGE DE GARDE\n  Document : {}\n\n========================================\n", text);
    file.write_all(content.as_bytes())
        .map_err(|e| e.to_string())?;

    Ok(file_path.to_string_lossy().into_owned())
}

#[tauri::command]
fn export_logs(logs: Vec<String>, dest_path: String) -> Result<String, String> {
    let mut file = fs::File::create(&dest_path).map_err(|e| e.to_string())?;
    file.write_all(b"Date,Statut,Fichier,Imprimante\n")
        .map_err(|e| e.to_string())?;
    for log in logs {
        file.write_all(format!("{}\n", log).as_bytes())
            .map_err(|e| e.to_string())?;
    }
    Ok(format!("Logs exportés vers {}", dest_path))
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
fn move_file(source: String, dest_folder: String) -> Result<String, String> {
    let src = Path::new(&source);
    if !src.exists() {
        return Err(format!("Le fichier source '{}' n'existe pas.", source));
    }

    let dest_dir = Path::new(&dest_folder);
    if !dest_dir.exists() {
        fs::create_dir_all(dest_dir)
            .map_err(|e| format!("Impossible de créer le dossier destination: {}", e))?;
    }

    let file_name = src
        .file_name()
        .ok_or_else(|| "Nom de fichier invalide.".to_string())?;
    let dest_path = dest_dir.join(file_name);

    // Si un fichier du même nom existe, ajouter un suffixe
    let final_dest = if dest_path.exists() {
        let stem = dest_path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("file");
        let ext = dest_path
            .extension()
            .and_then(|s| s.to_str())
            .unwrap_or("");
        let timestamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);
        if ext.is_empty() {
            dest_dir.join(format!("{}_{}", stem, timestamp))
        } else {
            dest_dir.join(format!("{}_{}.{}", stem, timestamp, ext))
        }
    } else {
        dest_path
    };

    fs::rename(src, &final_dest).map_err(|e| {
        // Si rename échoue (cross-device), essayer copy + delete
        match fs::copy(src, &final_dest) {
            Ok(_) => {
                let _ = fs::remove_file(src);
                return format!("");
            }
            Err(_) => format!("Impossible de déplacer le fichier: {}", e),
        }
    })?;

    Ok(final_dest.to_string_lossy().into_owned())
}

/// Ouvre un dialogue de sélection de dossier (pour le Hot Folder).
#[tauri::command]
fn select_folder_dialog() -> Result<String, String> {
    let script = r#"
        Add-Type -AssemblyName System.Windows.Forms
        $dialog = New-Object System.Windows.Forms.FolderBrowserDialog
        $dialog.Description = "Sélectionnez le dossier à surveiller (Hot Folder)"
        $dialog.ShowNewFolderButton = $true
        if ($dialog.ShowDialog() -eq 'OK') {
            $dialog.SelectedPath
        }
    "#;
    let mut cmd = Command::new("powershell");
    #[cfg(target_os = "windows")]
    cmd.creation_flags(0x08000000);
    let output = cmd
        .args(&["-Sta", "-Command", script])
        .output()
        .map_err(|e| e.to_string())?;

    let result = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if result.is_empty() {
        return Err("Aucun dossier sélectionné.".to_string());
    }
    Ok(result)
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
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(HotFolderState(Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![
            get_printers,
            print_file,
            process_dropped_paths,
            generate_slip_sheet,
            export_logs,
            check_print_jobs,
            merge_pdfs,
            open_file_dialog,
            get_pdf_page_count,
            // Nouvelles commandes Phase 1
            start_hot_folder,
            stop_hot_folder,
            move_file,
            select_folder_dialog,
            get_app_version
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
