import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { check } from "@tauri-apps/plugin-updater";

// Éléments du DOM (Principaux)
const printerSelect = document.getElementById("printer-select") as HTMLSelectElement;
const dropZone = document.getElementById("drop-zone") as HTMLDivElement;
const fileList = document.getElementById("file-list") as HTMLUListElement;
const printBtn = document.getElementById("print-btn") as HTMLButtonElement;
const statusMessage = document.getElementById("status-message") as HTMLParagraphElement;
const sortBtn = document.getElementById("sort-btn") as HTMLButtonElement;
const themeToggle = document.getElementById("theme-toggle") as HTMLButtonElement;
const moonIcon = document.getElementById("moon-icon") as any;
const sunIcon = document.getElementById("sun-icon") as any;

// Éléments du DOM (Options)
const toggleOptionsBtn = document.getElementById("toggle-options-btn") as HTMLButtonElement;
const optionsPanel = document.getElementById("options-panel") as HTMLDivElement;
const optCopies = document.getElementById("opt-copies") as HTMLInputElement;
const optColor = document.getElementById("opt-color") as HTMLSelectElement;
const optDuplex = document.getElementById("opt-duplex") as HTMLSelectElement;
const optPaper = document.getElementById("opt-paper") as HTMLSelectElement;

// Éléments du DOM (Options avancées PDF)
const optPageRange = document.getElementById("opt-page-range") as HTMLInputElement;
const optPageFilter = document.getElementById("opt-page-filter") as HTMLSelectElement;
const optScale = document.getElementById("opt-scale") as HTMLSelectElement;

// Éléments de profil
const profileSelect = document.getElementById("profile-select") as HTMLSelectElement;
const saveProfileBtn = document.getElementById("save-profile-btn") as HTMLButtonElement;
const optSchedule = document.getElementById("opt-schedule") as HTMLInputElement;
const optMergePdf = document.getElementById("opt-merge-pdf") as HTMLInputElement;
const optSlipSheets = document.getElementById("opt-slip-sheets") as HTMLInputElement;
const filterPdfBtn = document.getElementById("filter-pdf-btn") as HTMLButtonElement;
const filterImgBtn = document.getElementById("filter-img-btn") as HTMLButtonElement;
const exportLogsBtn = document.getElementById("export-logs-btn") as HTMLButtonElement;

// Éléments du DOM (Modal)
const printModal = document.getElementById("print-modal") as HTMLDivElement;
const printModalContent = document.getElementById("print-modal-content") as HTMLDivElement;
const modalSuccessCount = document.getElementById("modal-success-count") as HTMLSpanElement;
const modalErrorCount = document.getElementById("modal-error-count") as HTMLSpanElement;
const modalCleanBtn = document.getElementById("modal-clean-btn") as HTMLButtonElement;
const modalCloseBtn = document.getElementById("modal-close-btn") as HTMLButtonElement;

// État de l'application
let filesToPrint: string[] = [];
let printLogs: string[] = []; 
let successPaths: string[] = [];

// ==== FONCTIONS DE BASE ====

async function loadPrinters() {
  try {
    const printers: string[] = await invoke("get_printers");
    printerSelect.innerHTML = "";
    printers.forEach((printer) => {
      const option = document.createElement("option");
      option.value = printer;
      option.textContent = printer;
      printerSelect.appendChild(option);
    });
    
    // Charger le profil après les imprimantes pour sélectionner la bonne
    loadProfilesFromStorage();
  } catch (error) {
    statusMessage.textContent = "Erreur de chargement des imprimantes.";
  }
}

// ==== GESTION DES PROFILS ====
function loadProfilesFromStorage() {
  const profilesRaw = localStorage.getItem("tauriPrintProfiles");
  if (profilesRaw) {
    try {
      const profiles = JSON.parse(profilesRaw);
      profileSelect.innerHTML = '<option value="default">Par défaut</option>';
      for (const name in profiles) {
        const option = document.createElement("option");
        option.value = name;
        option.textContent = name;
        profileSelect.appendChild(option);
      }
    } catch(e) {}
  }
}

profileSelect.addEventListener("change", () => {
  if (profileSelect.value === "default") return;
  const profilesRaw = localStorage.getItem("tauriPrintProfiles");
  if (!profilesRaw) return;
  const profiles = JSON.parse(profilesRaw);
  const p = profiles[profileSelect.value];
  if (p) {
    if (p.printer && Array.from(printerSelect.options).some(o => o.value === p.printer)) {
      printerSelect.value = p.printer;
    }
    optCopies.value = p.copies || "1";
    optColor.value = p.color || "true";
    optDuplex.value = p.duplex || "OneSided";
    optPaper.value = p.paper || "A4";
    if (optPageRange) optPageRange.value = p.page_range || "";
    if (optPageFilter) optPageFilter.value = p.page_filter || "all";
    if (optScale) optScale.value = p.scale || "fit";
  }
});

saveProfileBtn.addEventListener("click", () => {
  const name = prompt("Entrez un nom pour ce profil d'impression :");
  if (!name || name.trim() === "") return;
  
  const currentConfig = {
    printer: printerSelect.value,
    copies: optCopies.value,
    color: optColor.value,
    duplex: optDuplex.value,
    paper: optPaper.value,
    page_range: optPageRange?.value || "",
    page_filter: optPageFilter?.value || "all",
    scale: optScale?.value || "fit"
  };
  
  let profiles: any = {};
  const profilesRaw = localStorage.getItem("tauriPrintProfiles");
  if (profilesRaw) {
    try { profiles = JSON.parse(profilesRaw); } catch(e) {}
  }
  
  profiles[name] = currentConfig;
  localStorage.setItem("tauriPrintProfiles", JSON.stringify(profiles));
  
  loadProfilesFromStorage();
  profileSelect.value = name;
});

function addFile(filePath: string) {
  if (filesToPrint.includes(filePath)) return;
  filesToPrint.push(filePath);
  renderFileList();
}

function renderFileList() {
  fileList.innerHTML = "";
  filesToPrint.forEach((filePath, index) => {
    const fileName = filePath.split(/[/\\]/).pop() || filePath;
    const li = document.createElement("li");
    li.className = "flex justify-between items-center bg-slate-100 dark:bg-slate-700/80 px-3 py-2 rounded text-sm text-slate-700 dark:text-slate-200 cursor-grab active:cursor-grabbing border border-transparent dark:border-slate-600 transition-colors";
    li.draggable = true;
    li.dataset.index = index.toString();
    li.innerHTML = `
      <span class="truncate flex-1 pointer-events-none" title="${filePath}">${fileName}</span>
      <button class="ml-2 text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 font-bold" onclick="removeFile(${index})">✕</button>
      <span class="ml-4 text-xs font-semibold text-slate-400 dark:text-slate-400 status-badge pointer-events-none">En attente</span>
    `;
    li.addEventListener("dragstart", handleDragStart);
    li.addEventListener("dragover", handleDragOver);
    li.addEventListener("drop", handleDrop);
    li.addEventListener("dragenter", handleDragEnter);
    li.addEventListener("dragleave", handleDragLeave);
    fileList.appendChild(li);
  });
}

let draggedItemIndex: number | null = null;
function handleDragStart(e: DragEvent) { draggedItemIndex = parseInt((e.target as HTMLElement).dataset.index || "0"); if (e.dataTransfer) { e.dataTransfer.effectAllowed = "move"; } }
function handleDragOver(e: DragEvent) { e.preventDefault(); if (e.dataTransfer) { e.dataTransfer.dropEffect = "move"; } }
function handleDragEnter(e: DragEvent) { e.preventDefault(); (e.currentTarget as HTMLElement).classList.add("border-blue-400"); }
function handleDragLeave(e: DragEvent) { (e.currentTarget as HTMLElement).classList.remove("border-blue-400"); }
function handleDrop(e: DragEvent) {
  e.preventDefault();
  const target = e.currentTarget as HTMLElement;
  target.classList.remove("border-blue-400");
  const targetIndex = parseInt(target.dataset.index || "0");
  if (draggedItemIndex !== null && draggedItemIndex !== targetIndex) {
    const item = filesToPrint.splice(draggedItemIndex, 1)[0];
    filesToPrint.splice(targetIndex, 0, item);
    renderFileList();
  }
  draggedItemIndex = null;
}

(window as any).removeFile = (index: number) => {
  filesToPrint.splice(index, 1);
  renderFileList();
};

function sortFilesAlphabetically() {
  filesToPrint.sort((a, b) => {
    const nameA = a.split(/[/\\]/).pop()?.toLowerCase() || "";
    const nameB = b.split(/[/\\]/).pop()?.toLowerCase() || "";
    return nameA.localeCompare(nameB);
  });
  renderFileList();
}

// ==== V2: DOSSIERS ====
async function setupTauriDragDrop() {
  await listen("tauri://drag-drop", async (event) => {
    const payload = event.payload as any;
    if (payload && payload.paths) {
      statusMessage.textContent = "Analyse des fichiers...";
      // Rust va analyser les dossiers et retourner tous les fichiers
      try {
        const files: string[] = await invoke("process_dropped_paths", { paths: payload.paths });
        files.forEach((path) => addFile(path));
        statusMessage.textContent = `${files.length} fichier(s) ajouté(s).`;
      } catch(e) {
        console.error(e);
        statusMessage.textContent = "Erreur lors de la lecture des dossiers.";
      }
    }
  });
}

// ==== V2: FILTRES ====
filterPdfBtn.addEventListener("click", () => {
  filesToPrint = filesToPrint.filter(f => f.toLowerCase().endsWith(".pdf"));
  renderFileList();
});
filterImgBtn.addEventListener("click", () => {
  const imgExts = [".jpg", ".jpeg", ".png", ".gif", ".webp"];
  filesToPrint = filesToPrint.filter(f => !imgExts.some(ext => f.toLowerCase().endsWith(ext)));
  renderFileList();
});

// (Les profils sont gérés par le nouveau système profileSelect/tauriPrintProfiles ci-dessus)


// ==== V2: LOGS ====
function logPrint(status: string, file: string, printer: string) {
  const date = new Date().toISOString();
  printLogs.push(`"${date}","${status}","${file}","${printer}"`);
}

exportLogsBtn.addEventListener("click", async () => {
  try {
    const result: string = await invoke("export_logs", { logs: printLogs, destPath: "print_logs.csv" });
    alert(result);
  } catch (error) {
    alert("Erreur lors de l'export: " + error);
  }
});

// ==== IMPRESSION (AVEC PLANIFICATEUR, MERGE ET SLIP SHEETS) ====
async function executePrintProcess() {
  const selectedPrinter = printerSelect.value;
  if (!selectedPrinter || filesToPrint.length === 0) return;

  printBtn.disabled = true;
  exportLogsBtn.classList.add("hidden");
  printLogs = []; // Reset logs
  successPaths = [];
  let errorCount = 0;
  const listItems = fileList.querySelectorAll("li");

  const options = {
    copies: parseInt(optCopies.value) || 1,
    color: optColor.value === "true",
    duplex: optDuplex.value,
    paper_size: optPaper.value,
    page_range: optPageRange?.value || "",
    page_filter: optPageFilter?.value || "all",
    scale: optScale?.value || "fit",
    reverse: false
  };

  if (optMergePdf.checked) {
    statusMessage.textContent = "Fusion des PDF en cours...";
    try {
      // V2: Merge PDFs
      const mergedFile: string = await invoke("merge_pdfs", { paths: filesToPrint });
      statusMessage.textContent = "Impression du PDF fusionné...";
      await invoke("print_file", { filePath: mergedFile, printer: selectedPrinter, options });
      logPrint("Succès", "Lot Fusionné", selectedPrinter);
      successPaths = [...filesToPrint];
      statusMessage.textContent = "Lot fusionné imprimé !";
    } catch (e) {
      statusMessage.textContent = `Erreur fusion: ${e}`;
      errorCount = filesToPrint.length;
      logPrint("Erreur Fusion", "Lot Fusionné", selectedPrinter);
    }
    printBtn.disabled = false;
    exportLogsBtn.classList.remove("hidden");
    return;
  }

  for (let i = 0; i < filesToPrint.length; i++) {
    const file = filesToPrint[i];
    const badge = listItems[i].querySelector(".status-badge") as HTMLSpanElement;
    badge.textContent = "Impression...";
    badge.className = "ml-4 text-xs font-semibold text-blue-500 status-badge";
    statusMessage.textContent = `Impression de ${file.split(/[/\\]/).pop()}...`;

    try {
      // V2: Slip sheets
      if (optSlipSheets.checked) {
        const slipFile: string = await invoke("generate_slip_sheet", { text: file.split(/[/\\]/).pop() || file });
        await invoke("print_file", { filePath: slipFile, printer: selectedPrinter, options: { copies: 1, color: false, duplex: "OneSided", paper_size: "A4" } });
      }

      await invoke("print_file", { filePath: file, printer: selectedPrinter, options });
      badge.textContent = "Terminé";
      badge.className = "ml-4 text-xs font-semibold text-green-500 status-badge";
      logPrint("Succès", file, selectedPrinter);
      successPaths.push(file);
    } catch (error) {
      badge.textContent = "Erreur";
      badge.className = "ml-4 text-xs font-semibold text-red-500 status-badge";
      logPrint(`Erreur: ${error}`, file, selectedPrinter);
      errorCount++;
    }
  }

  statusMessage.textContent = "Impression par lots terminée !";
  printBtn.disabled = false;
  exportLogsBtn.classList.remove("hidden");

  // V2: Affichage Modal
  modalSuccessCount.textContent = successPaths.length.toString();
  modalErrorCount.textContent = errorCount.toString();
  printModal.classList.remove("hidden");
  setTimeout(() => {
    printModal.classList.remove("opacity-0");
    printModalContent.classList.remove("scale-95");
  }, 50);
}

async function startPrinting() {
  const selectedPrinter = printerSelect.value;
  if (!selectedPrinter) { statusMessage.textContent = "Sélectionnez une imprimante."; return; }
  if (filesToPrint.length === 0) { statusMessage.textContent = "Aucun fichier."; return; }

  // V2: Planificateur
  if (optSchedule.value) {
    const now = new Date();
    const [hours, minutes] = optSchedule.value.split(":");
    const scheduledTime = new Date();
    scheduledTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);
    
    if (scheduledTime < now) {
      scheduledTime.setDate(scheduledTime.getDate() + 1); // C'est pour le lendemain
    }
    
    const delay = scheduledTime.getTime() - now.getTime();
    statusMessage.textContent = `Impression planifiée à ${optSchedule.value} (${Math.round(delay/60000)} min restantes).`;
    printBtn.disabled = true;
    setTimeout(() => {
      executePrintProcess();
    }, delay);
  } else {
    executePrintProcess();
  }
}

// ==== THEME ====
function toggleDarkMode() {
  const html = document.documentElement;
  html.classList.toggle("dark");
  if (html.classList.contains("dark")) {
    moonIcon.classList.add("hidden"); sunIcon.classList.remove("hidden");
    localStorage.setItem("theme", "dark");
  } else {
    moonIcon.classList.remove("hidden"); sunIcon.classList.add("hidden");
    localStorage.setItem("theme", "light");
  }
}

function initTheme() {
  if (localStorage.getItem("theme") === "dark" || (!("theme" in localStorage) && window.matchMedia("(prefers-color-scheme: dark)").matches)) {
    document.documentElement.classList.add("dark");
    moonIcon.classList.add("hidden"); sunIcon.classList.remove("hidden");
  } else {
    document.documentElement.classList.remove("dark");
    moonIcon.classList.remove("hidden"); sunIcon.classList.add("hidden");
  }
}

// ==== INIT ====
window.addEventListener("DOMContentLoaded", () => {
  initTheme();
  loadPrinters();
  loadProfilesFromStorage();
  setupTauriDragDrop();
});

sortBtn.addEventListener("click", sortFilesAlphabetically);
printBtn.addEventListener("click", startPrinting);
themeToggle.addEventListener("click", toggleDarkMode);
toggleOptionsBtn.addEventListener("click", () => optionsPanel.classList.toggle("hidden"));

dropZone.addEventListener("click", async () => {
  try {
    const selected: string[] = await invoke("open_file_dialog");
    if (selected && selected.length > 0) {
      statusMessage.textContent = "Analyse des fichiers sélectionnés...";
      const files: string[] = await invoke("process_dropped_paths", { paths: selected });
      files.forEach((path) => addFile(path));
      statusMessage.textContent = `${files.length} fichier(s) ajouté(s).`;
    }
  } catch (err) {
    statusMessage.textContent = "Aucun fichier sélectionné.";
    console.error(err);
  }
});

const updateBtn = document.getElementById("update-btn") as HTMLButtonElement | null;
if (updateBtn) {
  updateBtn.addEventListener("click", async () => {
    try {
      updateBtn.disabled = true;
      const originalText = updateBtn.innerHTML;
      updateBtn.innerHTML = "Recherche en cours...";
      
      const update = await check();
      if (update) {
        const wantsUpdate = confirm(`Une nouvelle version (${update.version}) est disponible !\n\nNotes :\n${update.body || 'Améliorations diverses'}\n\nVoulez-vous la télécharger et l'installer maintenant ?`);
        if (wantsUpdate) {
          updateBtn.innerHTML = "Téléchargement & Installation...";
          await update.downloadAndInstall();
          alert("Mise à jour installée avec succès. L'application va redémarrer.");
        }
      } else {
        alert("Vous possédez déjà la dernière version de TauriPrint !");
      }
      updateBtn.innerHTML = originalText;
    } catch (e) {
      console.error(e);
      alert("Erreur lors de la recherche de mise à jour: " + e);
      updateBtn.innerHTML = "Rechercher une mise à jour";
    } finally {
      updateBtn.disabled = false;
    }
  });
}

window.addEventListener("dragover", (e) => e.preventDefault());
window.addEventListener("drop", (e) => e.preventDefault());

// ==== MODAL EVENTS ====
function closeModal() {
  printModal.classList.add("opacity-0");
  printModalContent.classList.add("scale-95");
  setTimeout(() => {
    printModal.classList.add("hidden");
  }, 300);
}

modalCloseBtn.addEventListener("click", closeModal);
modalCleanBtn.addEventListener("click", () => {
  filesToPrint = filesToPrint.filter(f => !successPaths.includes(f));
  successPaths = [];
  renderFileList();
  closeModal();
});