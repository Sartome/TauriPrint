// src/main.ts
import { invoke } from "@tauri-apps/api/core";

// Éléments du DOM
const printerSelect = document.getElementById("printer-select") as HTMLSelectElement;
const dropZone = document.getElementById("drop-zone") as HTMLDivElement;
const fileList = document.getElementById("file-list") as HTMLUListElement;
const printBtn = document.getElementById("print-btn") as HTMLButtonElement;
const statusMessage = document.getElementById("status-message") as HTMLParagraphElement;

// État de l'application
let filesToPrint: string[] = [];

// Fonction pour récupérer la liste des imprimantes depuis Rust
async function loadPrinters() {
  try {
    statusMessage.textContent = "Recherche des imprimantes...";
    // Appel de la commande Rust "get_printers"
    const printers: string[] = await invoke("get_printers");
    
    printerSelect.innerHTML = ""; // Vider la liste
    
    if (printers.length === 0) {
      printerSelect.innerHTML = "<option>Aucune imprimante trouvée</option>";
      return;
    }

    printers.forEach((printer) => {
      const option = document.createElement("option");
      option.value = printer;
      option.textContent = printer;
      printerSelect.appendChild(option);
    });

    statusMessage.textContent = "Prêt.";
  } catch (error) {
    statusMessage.textContent = `Erreur: ${error}`;
    statusMessage.classList.add("text-red-500");
  }
}

// Ajouter un fichier simulé à la liste
function addSimulatedFile() {
  const fileName = `Document_${filesToPrint.length + 1}.pdf`;
  const filePath = `C:\\Documents\\${fileName}`; // Chemin simulé
  
  filesToPrint.push(filePath);
  
  const li = document.createElement("li");
  li.className = "flex justify-between items-center bg-slate-100 px-3 py-2 rounded text-sm text-slate-700";
  li.innerHTML = `
    <span class="truncate">${fileName}</span>
    <span class="text-xs font-semibold text-slate-400 status-badge">En attente</span>
  `;
  fileList.appendChild(li);
}

// Fonction pour lancer l'impression
async function startPrinting() {
  const selectedPrinter = printerSelect.value;
  
  if (!selectedPrinter) {
    statusMessage.textContent = "Veuillez sélectionner une imprimante.";
    return;
  }

  if (filesToPrint.length === 0) {
    statusMessage.textContent = "Aucun fichier à imprimer.";
    return;
  }

  printBtn.disabled = true;
  const listItems = fileList.querySelectorAll("li");

  for (let i = 0; i < filesToPrint.length; i++) {
    const file = filesToPrint[i];
    const badge = listItems[i].querySelector(".status-badge") as HTMLSpanElement;
    
    badge.textContent = "Impression...";
    badge.className = "text-xs font-semibold text-blue-500 status-badge";
    statusMessage.textContent = `Impression de ${file}...`;

    try {
      // Appel de la commande Rust "print_file"
      const result: string = await invoke("print_file", { 
        filePath: file, 
        printer: selectedPrinter 
      });
      
      badge.textContent = "Terminé";
      badge.className = "text-xs font-semibold text-green-500 status-badge";
      console.log(result);
    } catch (error) {
      badge.textContent = "Erreur";
      badge.className = "text-xs font-semibold text-red-500 status-badge";
      console.error(error);
    }
  }

  statusMessage.textContent = "Impression par lots terminée !";
  printBtn.disabled = false;
  filesToPrint = []; // On vide la liste après impression
}

// Écouteurs d'événements
window.addEventListener("DOMContentLoaded", loadPrinters);
dropZone.addEventListener("click", addSimulatedFile);
printBtn.addEventListener("click", startPrinting);