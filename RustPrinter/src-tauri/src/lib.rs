// src-tauri/src/lib.rs

use serde::Deserialize;
use std::fs;
use std::io::Write;
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;
use std::path::Path;
use std::process::Command;
use walkdir::WalkDir;

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

/// Résout le chemin de SumatraPDF embarqué dans les ressources de l'application.
fn get_sumatra_path(app_handle: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    use tauri::Manager;
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
                    $FilePath = "{}"
                    
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

#[tauri::command]
fn merge_pdfs(_paths: Vec<String>) -> Result<String, String> {
    // La fusion via lopdf requiert un traitement complexe (mapping d'IDs d'objets, ressources, etc.).
    // Pour l'instant, on prévient l'utilisateur que c'est une fonctionnalité "expérimentale" qui
    // nécessiterait un script Python ou Ghostscript pour être 100% robuste avec des PDF complexes.
    // L'implémentation complète avec lopdf pur prendrait plusieurs centaines de lignes.
    Err("La fusion PDF native en Rust est en cours de développement (expérimental). Désactivez la fusion pour le moment.".to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            get_printers,
            print_file,
            process_dropped_paths,
            generate_slip_sheet,
            export_logs,
            check_print_jobs,
            merge_pdfs,
            open_file_dialog
        ])
        .run(tauri::generate_context!())
        .expect("Erreur fatale lors du lancement de l'application Tauri");
}

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
}
