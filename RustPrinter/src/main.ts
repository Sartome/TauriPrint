// @ts-nocheck
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { check } from "@tauri-apps/plugin-updater";
import { open, save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
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
const optOrientation = document.getElementById("opt-orientation") as HTMLSelectElement;
const optPaperSource = document.getElementById("opt-paper-source") as HTMLSelectElement;
const optPaperType = document.getElementById("opt-paper-type") as HTMLSelectElement;

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

// Éléments du DOM (Modal paramètres par fichier)
const fsModal = document.getElementById("file-settings-modal") as HTMLDivElement;
const fsModalTitle = document.getElementById("fs-modal-title") as HTMLHeadingElement;
const fsModalCloseBtn = document.getElementById("fs-modal-close-btn") as HTMLButtonElement;
const fsOptCopies = document.getElementById("fs-opt-copies") as HTMLInputElement;
const fsOptColor = document.getElementById("fs-opt-color") as HTMLSelectElement;
const fsOptDuplex = document.getElementById("fs-opt-duplex") as HTMLSelectElement;
const fsOptPageRange = document.getElementById("fs-opt-page-range") as HTMLInputElement;
const fsModalResetBtn = document.getElementById("fs-modal-reset-btn") as HTMLButtonElement;
const fsModalSaveBtn = document.getElementById("fs-modal-save-btn") as HTMLButtonElement;
let currentSettingsIndex = -1;

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


// Éléments du DOM (Paramètres & Propriétés)
const settingsBtn = document.getElementById("settings-btn") as HTMLButtonElement;
const settingsModal = document.getElementById("settings-modal") as HTMLDivElement;
const settingsCloseBtn = document.getElementById("settings-close-btn") as HTMLButtonElement;
const printerPropertiesBtn = document.getElementById("printer-properties-btn") as HTMLButtonElement;
const settingLogMode = document.getElementById("setting-log-mode") as HTMLInputElement;
const settingCompatMode = document.getElementById("setting-compat-mode") as HTMLInputElement;
const settingsTabBtns = document.querySelectorAll(".settings-tab-btn");
const settingsTabs = document.querySelectorAll(".settings-tab");

const dashboardBtn = document.getElementById("dashboard-btn") as HTMLButtonElement;
const dashboardModal = document.getElementById("dashboard-modal") as HTMLDivElement;
const dashboardCloseBtn = document.getElementById("dashboard-close-btn") as HTMLButtonElement;
const statTotalPages = document.getElementById("stat-total-pages") as HTMLParagraphElement;
const statSuccess = document.getElementById("stat-success") as HTMLSpanElement;
const statErrors = document.getElementById("stat-errors") as HTMLSpanElement;
let analyticsChartInstance: any = null;

const pauseQueueBtn = document.getElementById("pause-queue-btn") as HTMLButtonElement;
const resumeQueueBtn = document.getElementById("resume-queue-btn") as HTMLButtonElement;

// État de l'application
interface FileItem {
  path: string;
  options: Partial<PrintOptionsPayload> | null;
}
let filesToPrint: FileItem[] = [];
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
  orientation: string;
  paper_source: string;
  paper_type: string;
  page_range: string;
  page_filter: string;
  scale: string;
}

interface PrintOptionsPayload {
  copies: number;
  color: boolean;
  duplex: string;
  paper_size: string;
  orientation: string;
  paper_source: string;
  paper_type: string;
  page_range: string;
  page_filter: string;
  scale: string;
  reverse: boolean;
  compatibility_mode: boolean;
  // Options Pro
  archive_success: string;
  archive_error: string;
  auto_rotate: boolean;
  print_as_image: boolean;
  stapling: string;
  punching: string;
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
    
    // Mettre à jour les capacités
    await updatePrinterCapabilities();
  } catch (error) {
    statusMessage.textContent = "Erreur de chargement des imprimantes.";
    console.error("Erreur chargement imprimantes:", error);
  }
}

printerSelect.addEventListener("change", updatePrinterCapabilities);

async function updatePrinterCapabilities() {
  const printer = printerSelect.value;
  if (!printer) return;
  try {
    const caps: any = await invoke("get_printer_capabilities", { printer });
    
    // Update Color options
    if (caps.color_supported) {
      optColor.innerHTML = '<option value="true">Couleur</option><option value="false">Noir & Blanc</option>';
    } else {
      optColor.innerHTML = '<option value="false">Noir & Blanc</option>';
    }
    
    // Update Duplex options
    if (caps.duplex_supported) {
      optDuplex.innerHTML = '<option value="OneSided">Simple face</option><option value="TwoSidedLongEdge">Recto-verso (Bord long)</option><option value="TwoSidedShortEdge">Recto-verso (Bord court)</option>';
    } else {
      optDuplex.innerHTML = '<option value="OneSided">Simple face</option>';
    }
    
    // Update Paper options
    if (caps.supported_paper_sizes && caps.supported_paper_sizes.length > 0) {
      const sizes = caps.supported_paper_sizes;
      optPaper.innerHTML = '';
      
      // On force A4 par défaut car l'API Windows l'oublie très souvent ou utilise des codes personnalisés
      optPaper.innerHTML += '<option value="A4">A4</option>';
      
      if (sizes.includes(8)) optPaper.innerHTML += '<option value="A3">A3</option>';
      if (sizes.includes(11)) optPaper.innerHTML += '<option value="A5">A5</option>';
      if (sizes.includes(1)) optPaper.innerHTML += '<option value="Letter">Lettre US</option>';
      if (sizes.includes(5)) optPaper.innerHTML += '<option value="Legal">Légal US</option>';
    } else {
      // Fallback si on n'a pas pu lire les formats
      optPaper.innerHTML = '<option value="A4">A4</option><option value="A3">A3</option><option value="A5">A5</option><option value="Letter">Lettre US</option><option value="Legal">Légal US</option>';
    }
  } catch(e) {
    console.warn("Erreur capacités imprimante:", e);
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
  if (filesToPrint.some(f => f.path === filePath)) return;
  filesToPrint.push({ path: filePath, options: null });
  renderFileList();
}

let renderId = 0;


async function renderFileList() {
  const currentRenderId = ++renderId;
  updateFileCount();

  let pdfPageCounts = {};
  try {
    const pdfFiles = filesToPrint.filter(f => f.path.toLowerCase().endsWith(".pdf")).map(f => f.path);
    if (pdfFiles.length > 0) {
      pdfPageCounts = await invoke("get_pdf_page_counts", { filePaths: pdfFiles });
    }
  } catch (e) {}

  if (currentRenderId !== renderId) return; // Abort if another render started

  fileList.innerHTML = "";

  for (let index = 0; index < filesToPrint.length; index++) {
    const fileItem = filesToPrint[index];
    const filePath = fileItem.path;
    const fileName = filePath.split(/[\\/]/).pop() || filePath;
    const isPdf = filePath.toLowerCase().endsWith(".pdf");
    const isImg = filePath.match(/\.(jpg|jpeg|png|gif|webp)$/i);
    
    const li = document.createElement("li");
    li.className = "flex items-center bg-slate-100 dark:bg-slate-700/80 p-2 rounded text-sm text-slate-700 dark:text-slate-200 cursor-grab active:cursor-grabbing border border-transparent dark:border-slate-600 transition-colors gap-3";
    li.draggable = true;
    li.dataset.index = index.toString();

    // Conteneur miniature
    const thumbContainer = document.createElement("div");
    thumbContainer.className = "w-10 h-10 shrink-0 bg-slate-200 dark:bg-slate-800 rounded overflow-hidden flex items-center justify-center";
    
    if (isImg) {
      const img = document.createElement("img");
      img.src = convertFileSrc(filePath);
      img.className = "w-full h-full object-cover";
      thumbContainer.appendChild(img);
    } else {
      thumbContainer.innerHTML = '📄';
    }

    const titleContainer = document.createElement("div");
    titleContainer.className = "flex-1 min-w-0 pointer-events-none";
    
    const titleSpan = document.createElement("div");
    titleSpan.className = "truncate font-medium flex-1";
    titleSpan.title = filePath;
    titleSpan.textContent = fileName;
    titleContainer.appendChild(titleSpan);

    if (isPdf) {
      const pageSpan = document.createElement("div");
      pageSpan.className = "text-[10px] text-slate-400 font-mono";
      const pageCount = pdfPageCounts[filePath];
      pageSpan.textContent = pageCount !== undefined ? `${pageCount} pages` : `? pages`;
      titleContainer.appendChild(pageSpan);
    }

    const settingsBtn = document.createElement("button");
    settingsBtn.className = "text-slate-400 hover:text-blue-500 font-bold px-2";
    settingsBtn.innerHTML = "⚙️";
    settingsBtn.title = "Paramètres de ce fichier";
    settingsBtn.onclick = () => openFileSettings(index);
    if (fileItem.options !== null) {
      settingsBtn.classList.add("text-blue-500");
    }

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "text-red-500 hover:text-red-700 font-bold px-2";
    deleteBtn.textContent = "✕";
    deleteBtn.onclick = () => removeFile(index);

    const statusBadge = document.createElement("span");
    statusBadge.className = "text-xs font-semibold text-slate-400 status-badge pointer-events-none shrink-0 w-20 text-right";
    statusBadge.textContent = "En attente";
    statusBadge.id = `status-${index}`;

    li.appendChild(thumbContainer);
    li.appendChild(titleContainer);
    li.appendChild(statusBadge);
    li.appendChild(settingsBtn);
    li.appendChild(deleteBtn);

    li.addEventListener("dragstart", handleDragStart);
    li.addEventListener("dragover", handleDragOver);
    li.addEventListener("drop", handleDrop);
    li.addEventListener("dragenter", handleDragEnter);
    li.addEventListener("dragleave", handleDragLeave);
    fileList.appendChild(li);
  }
}

function removeFile(index) {
  filesToPrint.splice(index, 1);
  renderFileList();
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

function openFileSettings(index: number) {
  const item = filesToPrint[index];
  if (!item) return;
  currentSettingsIndex = index;
  fsModalTitle.textContent = `Paramètres : ${item.path.split(/[/\\]/).pop()}`;
  
  // Remplir avec les options spécifiques ou globales
  const currentGlobal = getCurrentOptions();
  fsOptCopies.value = item.options?.copies?.toString() || currentGlobal.copies.toString();
  fsOptColor.value = item.options?.color !== undefined ? item.options.color.toString() : currentGlobal.color.toString();
  fsOptDuplex.value = item.options?.duplex || currentGlobal.duplex;
  fsOptPageRange.value = item.options?.page_range || currentGlobal.page_range;

  fsModal.classList.remove("hidden");
  setTimeout(() => {
    fsModal.classList.remove("opacity-0");
    fsModal.querySelector("div")?.classList.remove("scale-95");
  }, 10);
}

function closeFileSettings() {
  fsModal.classList.add("opacity-0");
  fsModal.querySelector("div")?.classList.add("scale-95");
  setTimeout(() => fsModal.classList.add("hidden"), 300);
}

fsModalCloseBtn.addEventListener("click", closeFileSettings);

fsModalResetBtn.addEventListener("click", () => {
  if (currentSettingsIndex >= 0) {
    filesToPrint[currentSettingsIndex].options = null;
    renderFileList();
    closeFileSettings();
  }
});

fsModalSaveBtn.addEventListener("click", () => {
  if (currentSettingsIndex >= 0) {
    const copies = parseInt(fsOptCopies.value);
    const range = fsOptPageRange.value.trim();
    if (isNaN(copies) || copies < 1 || copies > 1000) {
      alert("Erreur: Le nombre de copies doit être entre 1 et 1000.");
      return;
    }
    if (range !== "" && !/^([0-9]+(-[0-9]+)?)(,[0-9]+(-[0-9]+)?)*$/.test(range)) {
      alert("Erreur: Le format de la plage de pages est invalide. (ex: 1-5,7)");
      return;
    }
    filesToPrint[currentSettingsIndex].options = {
      copies: copies,
      color: fsOptColor.value === "true",
      duplex: fsOptDuplex.value,
      page_range: range
    };
    renderFileList();
    closeFileSettings();
  }
});

function sortFilesAlphabetically() {
  filesToPrint.sort((a, b) => {
    const nameA = a.path.split(/[/\\]/).pop()?.toLowerCase() || "";
    const nameB = b.path.split(/[/\\]/).pop()?.toLowerCase() || "";
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
  if (!settingLogMode.checked) return; // Seulement si activé
  const date = new Date().toISOString();
  const logLine = `"${date}","${status}","${file}","${printer}"`;
  printLogs.push(logLine);
  
  // Save to CSV via backend
  invoke("append_log", { logLine }).catch(console.error);
}

exportLogsBtn.addEventListener("click", async () => {
  try {
    const destPath = await save({ filters: [{ name: "CSV", extensions: ["csv"] }], defaultPath: "print_logs.csv" });
    if (destPath) {
        let textContent = "Date,Statut,Fichier,Imprimante\n";
        for (const log of printLogs) {
            textContent += log + "\n";
        }
        await writeTextFile(destPath, textContent);
        alert("Logs exportés avec succès vers " + destPath);
    }
  } catch (error) {
    alert("Erreur lors de l'export: " + error);
  }
});

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
  const copies = parseInt(optCopies.value);
  if (isNaN(copies) || copies < 1 || copies > 1000) {
    throw new Error("Le nombre de copies doit être entre 1 et 1000.");
  }
  const range = optPageRange?.value.trim() || "";
  if (range !== "" && !/^([0-9]+(-[0-9]+)?)(,[0-9]+(-[0-9]+)?)*$/.test(range)) {
    throw new Error("Le format de la plage de pages est invalide. Utilisez un format comme 1-5,7.");
  }
  
  return {
    copies: copies,
    color: optColor.value === "true",
    duplex: optDuplex.value,
    paper_size: optPaper.value,
    orientation: optOrientation?.value || "portrait",
    paper_source: optPaperSource?.value || "auto",
    paper_type: optPaperType?.value || "plain",
    page_range: optPageRange?.value || "",
    page_filter: optPageFilter?.value || "all",
    scale: optScale?.value || "fit",
    reverse: false,
    compatibility_mode: settingCompatMode.checked,
    
    // Nouveautés Pro
    archive_success: (document.getElementById("setting-auto-archive") as HTMLInputElement)?.checked ? (document.getElementById("setting-archive-success") as HTMLInputElement)?.value : "",
    archive_error: (document.getElementById("setting-auto-archive") as HTMLInputElement)?.checked ? (document.getElementById("setting-archive-error") as HTMLInputElement)?.value : "",
    auto_rotate: (document.getElementById("setting-auto-rotate") as HTMLInputElement)?.checked ?? true,
    print_as_image: (document.getElementById("setting-print-as-image") as HTMLInputElement)?.checked ?? false,
    stapling: (document.getElementById("setting-stapling") as HTMLSelectElement)?.value || "none",
    punching: (document.getElementById("setting-punching") as HTMLSelectElement)?.value || "none",
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


let queueListenersSetup = false;

async function executePrintProcess() {
  const selectedPrinter = printerSelect.value;
  if (!selectedPrinter || filesToPrint.length === 0) return;

  const fileCount = filesToPrint.length;
  let options;
  try {
    options = getCurrentOptions();
  } catch (err: any) {
    alert(err.message);
    return;
  }

  const copies = options.copies;
  const confirmMsg = `Vous êtes sur le point d'imprimer ${fileCount} fichier(s) sur « ${selectedPrinter} ».\n\nContinuer ?`;
  if (!confirm(confirmMsg)) {
    return;
  }

  printBtn.disabled = true;
  cancelBtn.classList.remove("hidden");
  exportLogsBtn.classList.add("hidden");
  pauseQueueBtn.classList.remove("hidden");
  resumeQueueBtn.classList.add("hidden");
  
  printLogs = [];
  successPaths = [];

  const queueItems = filesToPrint.map((file, i) => ({
      id: i.toString(),
      file_path: file.path,
      printer: selectedPrinter,
      options: file.options ? { ...options, ...file.options } : options,
      status: "pending"
  }));

  showProgress(0, filesToPrint.length);
  
  if (!queueListenersSetup) {
      queueListenersSetup = true;
      listen("queue-progress", (event) => {
          const queue = event.payload;
          let completed = 0;
          let errors = 0;
          
          filesToPrint = queue.map((q) => ({ path: q.file_path, options: null }));
          renderFileList().then(() => {
              queue.forEach((q, i) => {
                  const badge = document.getElementById(`status-${i}`);
                  if (badge) {
                      if (q.status === "printing") {
                          badge.textContent = "Impression...";
                          badge.className = "text-xs font-semibold text-blue-500 status-badge shrink-0 w-20 text-right";
                          statusMessage.textContent = `Impression de ${q.file_path.split(/[\\/]/).pop()}...`;
                      } else if (q.status === "completed") {
                          badge.textContent = "Terminé";
                          badge.className = "text-xs font-semibold text-green-500 status-badge shrink-0 w-20 text-right";
                          completed++;
                      } else if (q.status === "error") {
                          badge.textContent = "Erreur";
                          badge.className = "text-xs font-semibold text-red-500 status-badge shrink-0 w-20 text-right";
                          errors++;
                      }
                  }
              });
              showProgress(completed + errors, queue.length);
          });
      });
      
      listen("queue-finished", async () => {
          printBtn.disabled = false;
          cancelBtn.classList.add("hidden");
          pauseQueueBtn.classList.add("hidden");
          resumeQueueBtn.classList.add("hidden");
          exportLogsBtn.classList.remove("hidden");
          
          statusMessage.textContent = "File d'attente terminée !";
          modalSuccessCount.textContent = "-";
          modalErrorCount.textContent = "-";
          printModal.classList.remove("hidden");
          setTimeout(() => {
            printModal.classList.remove("opacity-0");
            printModal.querySelector("div")?.classList.remove("scale-95");
          }, 50);
          
          loadAnalytics();
      });
  }

  await invoke("start_queue", { items: queueItems });
  statusMessage.textContent = "File d'attente envoyée au backend...";
}

pauseQueueBtn.addEventListener("click", () => {
    invoke("pause_queue");
    pauseQueueBtn.classList.add("hidden");
    resumeQueueBtn.classList.remove("hidden");
    statusMessage.textContent = "File d'attente en pause.";
});

resumeQueueBtn.addEventListener("click", () => {
    invoke("resume_queue");
    resumeQueueBtn.classList.add("hidden");
    pauseQueueBtn.classList.remove("hidden");
    statusMessage.textContent = "Reprise de l'impression...";
});


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
          await invoke("move_file", { source: filePath, isError: false });
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
          await invoke("move_file", { source: filePath, isError: true });
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
// ÉVÉNEMENTS UI ET PARAMÈTRES
// ============================================================

function loadSettings() {
  settingLogMode.checked = localStorage.getItem("logMode") === "true";
  settingCompatMode.checked = localStorage.getItem("compatMode") === "true";
}

settingLogMode.addEventListener("change", () => {
  localStorage.setItem("logMode", settingLogMode.checked.toString());
});

settingCompatMode.addEventListener("change", () => {
  localStorage.setItem("compatMode", settingCompatMode.checked.toString());
});

printerPropertiesBtn.addEventListener("click", async () => {
  if (!printerSelect.value) {
    alert("Veuillez d'abord sélectionner une imprimante.");
    return;
  }
  try {
    await invoke("open_printer_properties", { printerName: printerSelect.value });
  } catch(e) {
    alert("Erreur: " + e);
  }
});

settingsBtn.addEventListener("click", () => {
  settingsModal.classList.remove("hidden");
  setTimeout(() => {
    settingsModal.classList.remove("opacity-0");
    settingsModal.querySelector("div")?.classList.remove("scale-95");
  }, 10);
});

settingsCloseBtn.addEventListener("click", () => {
  settingsModal.classList.add("opacity-0");
  settingsModal.querySelector("div")?.classList.add("scale-95");
  setTimeout(() => settingsModal.classList.add("hidden"), 300);
});

settingsTabBtns.forEach(btn => {
  btn.addEventListener("click", (e) => {
    // Reset tabs
    settingsTabBtns.forEach(b => {
      b.classList.remove("active", "bg-blue-100", "text-blue-700", "dark:bg-indigo-900/40", "dark:text-indigo-300");
      b.classList.add("text-slate-600", "dark:text-slate-300");
    });
    settingsTabs.forEach(tab => {
      tab.classList.remove("block");
      tab.classList.add("hidden");
    });
    
    // Active clicked tab
    const targetBtn = e.currentTarget as HTMLButtonElement;
    targetBtn.classList.remove("text-slate-600", "dark:text-slate-300");
    targetBtn.classList.add("active", "bg-blue-100", "text-blue-700", "dark:bg-indigo-900/40", "dark:text-indigo-300");
    
    const targetId = targetBtn.getAttribute("data-target");
    if (targetId) {
      const targetTab = document.getElementById(targetId);
      if (targetTab) {
        targetTab.classList.remove("hidden");
        targetTab.classList.add("block");
      }
    }
  });
});

// ============================================================
// DRAG & DROP
// ============================================================

cancelBtn.addEventListener("click", () => {
    invoke("pause_queue");
    statusMessage.textContent = "File d'attente stoppée.";
    printBtn.disabled = false;
    cancelBtn.classList.add("hidden");
    pauseQueueBtn.classList.add("hidden");
    resumeQueueBtn.classList.add("hidden");
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
  loadSettings();
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
    const selected = await open({
      multiple: true,
      filters: [{
        name: 'Documents',
        extensions: ['pdf', 'png', 'jpg', 'jpeg', 'txt', 'docx']
      }]
    });
    
    if (selected && Array.isArray(selected) && selected.length > 0) {
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

// ============================================================
// TABLEAU DE BORD (ANALYTICS)
// ============================================================
let analyticsChart: any = null;

async function loadAnalytics() {
  try {
    const data = await invoke<any>("get_analytics");
    statTotalPages.textContent = data.total_pages.toString();
    statSuccess.textContent = data.total_success.toString();
    statErrors.textContent = data.total_errors.toString();

    const printers = Object.keys(data.printers);
    const usages = Object.values(data.printers);

    const ctx = document.getElementById('analyticsChart') as HTMLCanvasElement;
    if (analyticsChart) analyticsChart.destroy();
    
    const { default: Chart } = await import('chart.js/auto');
    
    analyticsChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: printers,
        datasets: [{
          label: 'Impressions réussies',
          data: usages,
          backgroundColor: '#3b82f6',
          borderRadius: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false }
        }
      }
    });
  } catch (err) {
    console.error("Erreur analytics:", err);
  }
}

dashboardBtn.addEventListener("click", () => {
  loadAnalytics();
  dashboardModal.classList.remove("hidden");
  setTimeout(() => {
    dashboardModal.classList.remove("opacity-0");
    dashboardModal.querySelector("div")?.classList.remove("scale-95");
  }, 10);
});

dashboardCloseBtn.addEventListener("click", () => {
  dashboardModal.classList.add("opacity-0");
  dashboardModal.querySelector("div")?.classList.add("scale-95");
  setTimeout(() => {
    dashboardModal.classList.add("hidden");
  }, 300);
});
