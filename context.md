📋 PROMPT DE CADRAGE INITIAL

Contexte : Je souhaite développer un utilitaire open-source et gratuit d'impression de documents en masse (alternative à Bulk Printer). Je suis un développeur qui débute en Rust. Tu vas agir comme mon Tech Lead et copilote de programmation.

Pile technologique choisie :

Backend : Rust avec le framework Tauri (V2).

Frontend : HTML5, CSS (via Tailwind CDN pour rester léger sans configuration), et TypeScript/JavaScript natif.

Système cible : Windows (dans un premier temps).

Fonctionnement de l'application :

L'utilisateur glisse et dépose (Drag & Drop) un dossier ou un lot de fichiers (PDF, images, etc.) sur l'interface.

L'interface affiche la liste des fichiers en attente avec leur statut (Prêt, En cours, Imprimé, Erreur).

L'utilisateur sélectionne son imprimante cible (récupérée de manière dynamique par le système).

L'utilisateur clique sur "Lancer l'impression". Le backend Rust envoie silencieusement et de manière séquentielle les documents à l'imprimante.

Règles de développement que tu dois respecter :

Priorise la simplicité du code Rust. Gère les erreurs proprement à l'aide de Result et renvoie des messages clairs au frontend.

Écris le frontend de manière modulaire mais simple (un seul fichier HTML principal pour l'interface graphique).

Avant d'utiliser des APIs d'impression complexes, nous allons d'abord implémenter l'envoi de commandes silencieuses (via des utilitaires comme SumatraPDF en CLI ou des commandes de spool natif de Windows via Command::new).

Explique brièvement chaque morceau de code Rust que tu écris pour m'aider à monter en compétences sur la gestion de la mémoire (ownership et borrowing).

Es-tu prêt ? Si oui, commence par me donner la structure de code pour le backend Rust (src-tauri/src/lib.rs ou main.rs) pour déclarer une commande Tauri qui liste les imprimantes connectées au système Windows.