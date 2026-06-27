import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { check } from "@tauri-apps/plugin-updater";
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";

// Éléments du DOM (Principaux)
const printerSelect = document.getElementById("printer-select") as HTMLSelectElement;
const dropZone = document.getElementById("drop-zone") as HTMLDivElement;
const fileList = document.getElementById("file-list") as HTMLUListElement;
const printBtn = document.getElementById("print-btn") as HTMLButtonElement;
const statusMessage = document.getElementById("status-message") as HTMLParagraphElement;
const sortBtn = document.getElementById("sort-btn") as HTMLButtonElement;
const themeToggle = document.getElementById("theme-toggle") as HTMLButtonElement;
const moonIcon = document.getElementById("moon-icon") as unknown as SVGElement;
const sunIcon = document.getElementById("sun-icon") as unknown as SVGElement;
const appVersionSpan = document.getElementById("app-version") as HTMLSpanElement;

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
const optRetry = document.getElementById("opt-retry") as HTMLSelectElement;

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

// Éléments du DOM (Phase 2 — Nouveautés)
const fileCountBadge = document.getElementById("file-count") as HTMLSpanElement;
const clearAllBtn = document.getElementById("clear-all-btn") as HTMLButtonElement;
const cancelBtn = document.getElementById("cancel-btn") as HTMLButtonElement;
const progressSection = document.getElementById("progress-section") as HTMLDivElement;
const progressBar = document.getElementById("progress-bar") as HTMLDivElement;
const progressCounter = document.getElementById("progress-counter") as HTMLSpanElement;
const progressLabel = document.getElementById("progress-label") as HTMLSpanElement;

// Éléments du DOM (Hot Folder)
const hotFolderSelectBtn = document.getElementById("hot-folder-select-btn") as HTMLButtonElement;
const hotFolderStopBtn = document.getElementById("hot-folder-stop-btn") as HTMLButtonElement;
const hotFolderPath = document.getElementById("hot-folder-path") as HTMLParagraphElement;
const hotFolderStatus = document.getElementById("hot-folder-status") as HTMLSpanElement;

// État de l'application
let filesToPrint: string[] = [];
let printLogs: string[] = []; 
let successPaths: string[] = [];
let printCancelled = false;
let hotFolderActive = false;
let currentHotFolderPath = "";

// Interfaces pour le typage
interface PrintProfile {
  printer: string;
  copies: string;
  color: string;
  duplex: string;
  paper: string;
  page_range: string;
  page_filter: string;
  scale: string;
}

interface PrintOptionsPayload {
  copies: number;
  color: boolean;
  duplex: string;
  paper_size: string;
  page_range: string;
  page_filter: string;
  scale: string;
  reverse: boolean;
}

// ============================================================
// NOTIFICATIONS SYSTÈME
// ============================================================

async function notify(title: string, body: string) {
  try {
    let granted = await isPermissionGranted();
    if (!granted) {
      const permission = await requestPermission();
      granted = permission === "granted";
    }
    if (granted) {
      sendNotification({ title, body });
    }
  } catch (e) {
    console.warn("Notification non supportée:", e);
  }
}

// ============================================================
// FONCTIONS DE BASE
// ============================================================

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
    console.error("Erreur chargement imprimantes:", error);
  }
}

// ============================================================
// COMPTEUR DE FICHIERS
// ============================================================

function updateFileCount() {
  fileCountBadge.textContent = filesToPrint.length.toString();
}

// ============================================================
// GESTION DES PROFILS
// ============================================================

function loadProfilesFromStorage() {
  const profilesRaw = localStorage.getItem("tauriPrintProfiles");
  if (profilesRaw) {
    try {
      const profiles: Record<string, PrintProfile> = JSON.parse(profilesRaw);
      profileSelect.innerHTML = '<option value="default">Par défaut</option>';
      for (const name in profiles) {
        const option = document.createElement("option");
        option.value = name;
        option.textContent = name;
        profileSelect.appendChild(option);
      }
    } catch(e) {
      console.warn("Profils corrompus dans le localStorage:", e);
    }
  }
}

profileSelect.addEventListener("change", () => {
  if (profileSelect.value === "default") return;
  const profilesRaw = localStorage.getItem("tauriPrintProfiles");
  if (!profilesRaw) return;
  try {
    const profiles: Record<string, PrintProfile> = JSON.parse(profilesRaw);
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
  } catch(e) {
    console.warn("Erreur de lecture du profil:", e);
  }
});

saveProfileBtn.addEventListener("click", () => {
  const name = prompt("Entrez un nom pour ce profil d'impression :");
  if (!name || name.trim() === "") return;
  
  const currentConfig: PrintProfile = {
    printer: printerSelect.value,
    copies: optCopies.value,
    color: optColor.value,
    duplex: optDuplex.value,
    paper: optPaper.value,
    page_range: optPageRange?.value || "",
    page_filter: optPageFilter?.value || "all",
    scale: optScale?.value || "fit"
  };
  
  let profiles: Record<string, PrintProfile> = {};
  const profilesRaw = localStorage.getItem("tauriPrintProfiles");
  if (profilesRaw) {
    try { profiles = JSON.parse(profilesRaw); } catch(e) {
      console.warn("Profils corrompus, réinitialisation:", e);
    }
  }
  
  profiles[name] = currentConfig;
  localStorage.setItem("tauriPrintProfiles", JSON.stringify(profiles));
  
  loadProfilesFromStorage();
  profileSelect.value = name;
});

// ============================================================
// GESTION DES FICHIERS
// ============================================================

function addFile(filePath: string) {
  if (filesToPrint.includes(filePath)) return;
  filesToPrint.push(filePath);
  renderFileList();
}

async function renderFileList() {
  fileList.innerHTML = "";
  updateFileCount();

  for (let index = 0; index < filesToPrint.length; index++) {
    const filePath = filesToPrint[index];
    const fileName = filePath.split(/[/\\]/).pop() || filePath;
    const isPdf = filePath.toLowerCase().endsWith(".pdf");
    const li = document.createElement("li");
    li.className = "flex justify-between items-center bg-slate-100 dark:bg-slate-700/80 px-3 py-2 rounded text-sm text-slate-700 dark:text-slate-200 cursor-grab active:cursor-grabbing border border-transparent dark:border-slate-600 transition-colors";
    li.draggable = true;
    li.dataset.index = index.toString();

    // Info pages pour les PDF
    let pageInfo = "";
    if (isPdf) {
      try {
        const pageCount: number = await invoke("get_pdf_page_count", { filePath });
        pageInfo = `<span class="ml-2 text-xs text-slate-400 dark:text-slate-500 font-mono">${pageCount}p</span>`;
      } catch {
        pageInfo = `<span class="ml-2 text-xs text-slate-400 dark:text-slate-500 font-mono">?p</span>`;
      }
    }

    li.innerHTML = `
      <span class="truncate flex-1 pointer-events-none" title="${filePath}">${fileName}${pageInfo}</span>
      <button class="ml-2 text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 font-bold" onclick="removeFile(${index})">✕</button>
      <span class="ml-4 text-xs font-semibold text-slate-400 dark:text-slate-400 status-badge pointer-events-none">En attente</span>
    `;
    li.addEventListener("dragstart", handleDragStart);
    li.addEventListener("dragover", handleDragOver);
    li.addEventListener("drop", handleDrop);
    li.addEventListener("dragenter", handleDragEnter);
    li.addEventListener("dragleave", handleDragLeave);
    fileList.appendChild(li);
  }
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

(window as unknown as Record<string, (index: number) => void>).removeFile = (index: number) => {
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

// ==== BOUTON TOUT VIDER ====
clearAllBtn.addEventListener("click", () => {
  if (filesToPrint.length === 0) return;
  filesToPrint = [];
  renderFileList();
  statusMessage.textContent = "Liste vidée.";
});

// ==== DOSSIERS ====
async function setupTauriDragDrop() {
  await listen("tauri://drag-drop", async (event) => {
    const payload = event.payload as { paths?: string[] };
    if (payload && payload.paths) {
      statusMessage.textContent = "Analyse des fichiers...";
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

// ==== FILTRES ====
filterPdfBtn.addEventListener("click", () => {
  filesToPrint = filesToPrint.filter(f => f.toLowerCase().endsWith(".pdf"));
  renderFileList();
});
filterImgBtn.addEventListener("click", () => {
  const imgExts = [".jpg", ".jpeg", ".png", ".gif", ".webp"];
  filesToPrint = filesToPrint.filter(f => !imgExts.some(ext => f.toLowerCase().endsWith(ext)));
  renderFileList();
});

// ==== LOGS ====
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

// ============================================================
// BARRE DE PROGRESSION
// ============================================================

function showProgress(current: number, total: number) {
  progressSection.classList.remove("hidden");
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;
  progressBar.style.width = `${pct}%`;
  progressCounter.textContent = `${current} / ${total}`;
  progressLabel.textContent = current === total ? "Impression terminée !" : "Impression en cours...";
}

function hideProgress() {
  progressSection.classList.add("hidden");
  progressBar.style.width = "0%";
}

// ============================================================
// OPTIONS UTILITAIRES
// ============================================================

function getCurrentOptions(): PrintOptionsPayload {
  return {
    copies: parseInt(optCopies.value) || 1,
    color: optColor.value === "true",
    duplex: optDuplex.value,
    paper_size: optPaper.value,
    page_range: optPageRange?.value || "",
    page_filter: optPageFilter?.value || "all",
    scale: optScale?.value || "fit",
    reverse: false
  };
}

// ============================================================
// NOUVEAU — RETRY AUTOMATIQUE
// ============================================================

/**
 * Tente d'imprimer un fichier avec un nombre de tentatives configurable.
 * En cas d'échec, attend 2 secondes avant de réessayer.
 */
async function printWithRetry(
  file: string,
  printer: string,
  options: PrintOptionsPayload,
  maxRetries: number
): Promise<string> {
  let lastError = "";
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result: string = await invoke("print_file", {
        filePath: file,
        printer,
        options,
      });
      return result;
    } catch (error) {
      lastError = String(error);
      if (attempt < maxRetries) {
        // Attendre 2 secondes avant de réessayer
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
  }
  throw new Error(lastError);
}

// ============================================================
// IMPRESSION PRINCIPALE
// ============================================================

async function executePrintProcess() {
  const selectedPrinter = printerSelect.value;
  if (!selectedPrinter || filesToPrint.length === 0) return;

  // Confirmation avant impression
  const fileCount = filesToPrint.length;
  const copies = parseInt(optCopies.value) || 1;
  const maxRetries = parseInt(optRetry?.value || "0");
  const confirmMsg = `Vous êtes sur le point d'imprimer ${fileCount} fichier(s) (${copies} copie(s) chacun) sur « ${selectedPrinter} ».${maxRetries > 0 ? `\nRetry: ${maxRetries} tentative(s) en cas d'erreur.` : ""}\n\nContinuer ?`;
  if (!confirm(confirmMsg)) {
    statusMessage.textContent = "Impression annulée par l'utilisateur.";
    return;
  }

  printBtn.disabled = true;
  cancelBtn.classList.remove("hidden");
  exportLogsBtn.classList.add("hidden");
  printCancelled = false;
  printLogs = [];
  successPaths = [];
  let errorCount = 0;
  const listItems = fileList.querySelectorAll("li");

  const options = getCurrentOptions();

  // === FUSION PDF ===
  if (optMergePdf.checked) {
    statusMessage.textContent = "Fusion des PDF en cours...";
    try {
      const mergedFile: string = await invoke("merge_pdfs", {
        paths: filesToPrint,
      });
      statusMessage.textContent = "Impression du PDF fusionné...";
      await printWithRetry(mergedFile, selectedPrinter, options, maxRetries);
      logPrint("Succès", "Lot Fusionné", selectedPrinter);
      successPaths = [...filesToPrint];
      statusMessage.textContent = "Lot fusionné imprimé !";
      await notify("TauriPrint", `Lot fusionné imprimé avec succès (${filesToPrint.length} fichiers).`);
    } catch (e) {
      statusMessage.textContent = `Erreur fusion: ${e}`;
      errorCount = filesToPrint.length;
      logPrint(`Erreur Fusion: ${e}`, "Lot Fusionné", selectedPrinter);
      await notify("TauriPrint — Erreur", `Échec de la fusion/impression: ${e}`);
    }
    printBtn.disabled = false;
    cancelBtn.classList.add("hidden");
    exportLogsBtn.classList.remove("hidden");
    hideProgress();

    // Affichage Modal
    modalSuccessCount.textContent = successPaths.length.toString();
    modalErrorCount.textContent = errorCount.toString();
    printModal.classList.remove("hidden");
    setTimeout(() => {
      printModal.classList.remove("opacity-0");
      printModalContent.classList.remove("scale-95");
    }, 50);
    return;
  }

  // === IMPRESSION SÉQUENTIELLE ===
  showProgress(0, filesToPrint.length);

  for (let i = 0; i < filesToPrint.length; i++) {
    // Vérifier l'annulation
    if (printCancelled) {
      statusMessage.textContent = `Impression annulée. ${successPaths.length} fichier(s) imprimé(s) sur ${filesToPrint.length}.`;
      await notify("TauriPrint", `Impression annulée. ${successPaths.length}/${filesToPrint.length} fichier(s) imprimé(s).`);
      break;
    }

    const file = filesToPrint[i];
    const badge = listItems[i].querySelector(".status-badge") as HTMLSpanElement;
    badge.textContent = "Impression...";
    badge.className = "ml-4 text-xs font-semibold text-blue-500 status-badge";
    statusMessage.textContent = `Impression de ${file.split(/[/\\]/).pop()}... (${i + 1}/${filesToPrint.length})`;
    showProgress(i, filesToPrint.length);

    try {
      // Slip sheets
      if (optSlipSheets.checked) {
        const slipFile: string = await invoke("generate_slip_sheet", { text: file.split(/[/\\]/).pop() || file });
        await invoke("print_file", { filePath: slipFile, printer: selectedPrinter, options: { copies: 1, color: false, duplex: "OneSided", paper_size: "A4" } });
      }

      await printWithRetry(file, selectedPrinter, options, maxRetries);
      badge.textContent = "Terminé";
      badge.className = "ml-4 text-xs font-semibold text-green-500 status-badge";
      logPrint("Succès", file, selectedPrinter);
      successPaths.push(file);

      // Si Hot Folder actif, déplacer le fichier vers "Imprimé/"
      if (hotFolderActive && currentHotFolderPath) {
        try {
          const printedDir = currentHotFolderPath + "\\Imprimé";
          await invoke("move_file", { source: file, destFolder: printedDir });
        } catch (moveErr) {
          console.warn("Impossible de déplacer le fichier après impression:", moveErr);
        }
      }
    } catch (error) {
      badge.textContent = maxRetries > 0 ? `Erreur (${maxRetries + 1} essais)` : "Erreur";
      badge.className = "ml-4 text-xs font-semibold text-red-500 status-badge";
      logPrint(`Erreur: ${error}`, file, selectedPrinter);
      errorCount++;

      // Si Hot Folder actif, déplacer vers "Erreurs/"
      if (hotFolderActive && currentHotFolderPath) {
        try {
          const errorsDir = currentHotFolderPath + "\\Erreurs";
          await invoke("move_file", { source: file, destFolder: errorsDir });
        } catch (moveErr) {
          console.warn("Impossible de déplacer le fichier en erreur:", moveErr);
        }
      }
    }

    showProgress(i + 1, filesToPrint.length);
  }

  if (!printCancelled) {
    statusMessage.textContent = "Impression par lots terminée !";
    // Notification de fin
    await notify(
      "TauriPrint — Impression terminée",
      `${successPaths.length} fichier(s) imprimé(s) avec succès.${errorCount > 0 ? ` ${errorCount} erreur(s).` : ""}`
    );
  }
  printBtn.disabled = false;
  cancelBtn.classList.add("hidden");
  exportLogsBtn.classList.remove("hidden");

  // Affichage Modal
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

  // Planificateur
  if (optSchedule.value) {
    const now = new Date();
    const [hours, minutes] = optSchedule.value.split(":");
    const scheduledTime = new Date();
    scheduledTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);
    
    if (scheduledTime < now) {
      scheduledTime.setDate(scheduledTime.getDate() + 1);
    }
    
    const delay = scheduledTime.getTime() - now.getTime();
    statusMessage.textContent = `Impression planifiée à ${optSchedule.value} (${Math.round(delay/60000)} min restantes).`;
    printBtn.disabled = true;
    await notify("TauriPrint", `Impression planifiée à ${optSchedule.value}.`);
    setTimeout(() => {
      executePrintProcess();
    }, delay);
  } else {
    executePrintProcess();
  }
}

// ============================================================
// NOUVEAU — HOT FOLDER
// ============================================================

hotFolderSelectBtn.addEventListener("click", async () => {
  try {
    const folderPath: string = await invoke("select_folder_dialog");
    if (folderPath) {
      statusMessage.textContent = "Démarrage de la surveillance...";
      const result: string = await invoke("start_hot_folder", { folderPath });
      
      currentHotFolderPath = folderPath;
      hotFolderActive = true;
      
      // Mettre à jour l'UI
      hotFolderPath.textContent = folderPath;
      hotFolderPath.title = folderPath;
      hotFolderStatus.classList.remove("hidden");
      hotFolderSelectBtn.classList.add("hidden");
      hotFolderStopBtn.classList.remove("hidden");
      
      statusMessage.textContent = result;
      await notify("TauriPrint — Hot Folder", `Surveillance démarrée sur : ${folderPath}`);
    }
  } catch (err) {
    statusMessage.textContent = `Erreur Hot Folder: ${err}`;
    console.error("Hot folder error:", err);
  }
});

hotFolderStopBtn.addEventListener("click", async () => {
  try {
    const result: string = await invoke("stop_hot_folder");
    
    hotFolderActive = false;
    currentHotFolderPath = "";
    
    // Mettre à jour l'UI
    hotFolderPath.textContent = "Aucun dossier surveillé";
    hotFolderPath.title = "Aucun dossier surveillé";
    hotFolderStatus.classList.add("hidden");
    hotFolderSelectBtn.classList.remove("hidden");
    hotFolderStopBtn.classList.add("hidden");
    
    statusMessage.textContent = result;
  } catch (err) {
    statusMessage.textContent = `Erreur: ${err}`;
    console.error("Hot folder stop error:", err);
  }
});

// Écouter les fichiers détectés par le Hot Folder
async function setupHotFolderListener() {
  await listen("hot-folder-file", async (event) => {
    const filePath = event.payload as string;
    
    // Ignorer les fichiers dans les sous-dossiers "Imprimé" et "Erreurs"
    if (filePath.includes("\\Imprimé\\") || filePath.includes("\\Erreurs\\")) {
      return;
    }
    
    addFile(filePath);
    statusMessage.textContent = `Hot Folder: ${filePath.split(/[/\\]/).pop()} détecté.`;
    
    // Auto-impression si une imprimante est sélectionnée
    const selectedPrinter = printerSelect.value;
    if (selectedPrinter && hotFolderActive) {
      const options = getCurrentOptions();
      const maxRetries = parseInt(optRetry?.value || "0");
      const fileName = filePath.split(/[/\\]/).pop() || filePath;
      
      statusMessage.textContent = `Hot Folder: impression de ${fileName}...`;
      
      try {
        await printWithRetry(filePath, selectedPrinter, options, maxRetries);
        statusMessage.textContent = `Hot Folder: ${fileName} imprimé avec succès.`;
        logPrint("Succès (Hot Folder)", filePath, selectedPrinter);
        
        // Déplacer vers "Imprimé/"
        try {
          const printedDir = currentHotFolderPath + "\\Imprimé";
          await invoke("move_file", { source: filePath, destFolder: printedDir });
          // Retirer de la liste car le fichier a été déplacé
          filesToPrint = filesToPrint.filter(f => f !== filePath);
          renderFileList();
        } catch (moveErr) {
          console.warn("Déplacement post-impression échoué:", moveErr);
        }

        await notify("TauriPrint — Hot Folder", `${fileName} imprimé avec succès.`);
      } catch (error) {
        statusMessage.textContent = `Hot Folder: erreur sur ${fileName}.`;
        logPrint(`Erreur (Hot Folder): ${error}`, filePath, selectedPrinter);
        
        // Déplacer vers "Erreurs/"
        try {
          const errorsDir = currentHotFolderPath + "\\Erreurs";
          await invoke("move_file", { source: filePath, destFolder: errorsDir });
          filesToPrint = filesToPrint.filter(f => f !== filePath);
          renderFileList();
        } catch (moveErr) {
          console.warn("Déplacement vers erreurs échoué:", moveErr);
        }

        await notify("TauriPrint — Erreur Hot Folder", `Échec impression: ${fileName}`);
      }
    }
  });
}

// ============================================================
// ANNULATION
// ============================================================

cancelBtn.addEventListener("click", () => {
  printCancelled = true;
  cancelBtn.disabled = true;
  cancelBtn.textContent = "Annulation...";
  statusMessage.textContent = "Annulation en cours, veuillez patienter...";
  // L'annulation prend effet au prochain tour de la boucle for dans executePrintProcess
  setTimeout(() => {
    cancelBtn.disabled = false;
    cancelBtn.textContent = "✕ Annuler";
  }, 2000);
});

// ============================================================
// THEME
// ============================================================

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

// ============================================================
// INIT
// ============================================================

async function loadAppVersion() {
  try {
    const version: string = await invoke("get_app_version");
    if (appVersionSpan) {
      appVersionSpan.textContent = `v${version}`;
    }
  } catch (err) {
    console.error("Erreur de récupération de la version:", err);
  }
}

window.addEventListener("DOMContentLoaded", () => {
  initTheme();
  loadPrinters();
  setupTauriDragDrop();
  setupHotFolderListener();
  loadAppVersion();
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

// ============================================================
// MODAL EVENTS
// ============================================================

function closeModal() {
  printModal.classList.add("opacity-0");
  printModalContent.classList.add("scale-95");
  setTimeout(() => {
    printModal.classList.add("hidden");
    hideProgress();
  }, 300);
}

modalCloseBtn.addEventListener("click", closeModal);
modalCleanBtn.addEventListener("click", () => {
  filesToPrint = filesToPrint.filter(f => !successPaths.includes(f));
  successPaths = [];
  renderFileList();
  closeModal();
});