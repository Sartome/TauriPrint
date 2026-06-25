// src-tauri/src/lib.rs

// 1. Commande pour lister les imprimantes
// Pour l'instant, on renvoie une liste simulée. 
// Plus tard, nous utiliserons des commandes PowerShell ou l'API Windows pour récupérer les vraies imprimantes.
#[tauri::command]
fn get_printers() -> Vec<String> {
    vec![
        "Microsoft Print to PDF".to_string(),
        "Fax".to_string(),
        "Imprimante Bureau_HP".to_string(),
    ]
}

// 2. Commande pour imprimer un fichier
// Gère les erreurs proprement avec Result<String, String> pour que TypeScript puisse les "catch"
#[tauri::command]
fn print_file(file_path: String, printer: String) -> Result<String, String> {
    println!(">>> Rust a reçu l'ordre d'imprimer : {} sur {}", file_path, printer);
    
    // Simulation d'un temps de traitement pour voir l'interface réagir
    std::thread::sleep(std::time::Duration::from_secs(1));

    if file_path.is_empty() {
        return Err("Le chemin du fichier est invalide.".to_string());
    }

    // Le succès renvoie un simple message formaté
    Ok(format!("Le fichier {} a été expédié au spooler.", file_path))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Enregistrement de nos fonctions pour qu'elles soient visibles par TypeScript
        .invoke_handler(tauri::generate_handler![
            get_printers,
            print_file
        ])
        .run(tauri::generate_context!())
        .expect("Erreur fatale lors du lancement de l'application Tauri");
}