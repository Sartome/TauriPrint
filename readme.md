<div align="center">
  <img src="RustPrinter/public/TauriPrint.png" alt="TauriPrint Logo" width="128" />
  <h1>TauriPrint (Bulk Printer)</h1>
</div>

L'alternative libre, rapide et sans limites pour l'impression de documents en masse.

📖 À propos du projet

TauriPrint est né d'une frustration simple : la plupart des utilitaires d'impression par lots (Bulk Printers) adoptent des modèles économiques agressifs (Bait-and-Switch) en bloquant l'utilisateur après 3 impressions pour le forcer à acheter une licence "Pro".

Ce projet est la réponse open-source à ce problème.

Construit avec Tauri et Rust, TauriPrint est un utilitaire de bureau ultra-léger qui permet de glisser-déposer des dizaines de fichiers et de les envoyer silencieusement vers votre imprimante de manière séquentielle, sans jamais ouvrir la moindre application tierce.

✨ Fonctionnalités principales

🚀 Impression silencieuse : Envoi direct au spooler d'impression Windows. Aucun pop-up, aucune fenêtre qui s'ouvre.

🆓 100% Gratuit & Illimité : Aucune restriction artificielle sur le nombre de documents à imprimer.

🪶 Poids Plume : Grâce au moteur Rust, l'application consomme un minimum de RAM et de CPU.

🎯 Interface Intuitive : Glissez, déposez, sélectionnez l'imprimante, et cliquez sur Imprimer.

🔍 Suivi en temps réel : Visualisez l'état d'impression de chaque document (En attente, Impression, Terminé, Erreur).

🛠️ Pile Technologique

Ce projet utilise une architecture moderne hybride offrant les performances du bas niveau et l'esthétique du Web :

Core (Backend) : Rust 🦀

Framework Desktop : Tauri V2 🛸

Interface (Frontend) : HTML5, CSS3 (Tailwind CSS) & TypeScript ⚡

🚀 Installation & Développement local

Vous souhaitez compiler l'application vous-même ou contribuer au projet ? Voici comment préparer votre environnement.

Prérequis

Rustup (Compilateur Rust et Cargo)

Node.js (Gestionnaire de paquets NPM)

Les outils de build Windows pour Tauri (Visual Studio C++ Build Tools).

Cloner et lancer le projet

# 1. Cloner le dépôt
git clone [https://github.com/SartomeTauriPrint]
cd TauriPrint/rustprinter

# 2. Installer les dépendances frontend
npm install

# 3. Lancer l'application en mode développement
npm run tauri dev


Lors du premier lancement, le compilateur Rust téléchargera et compilera les paquets (crates). Cette étape peut prendre quelques minutes.

Compiler pour la production

Pour générer un exécutable .exe final et optimisé :

npm run tauri build


L'exécutable se trouvera dans le dossier src-tauri/target/release/.

🤝 Contribuer

Les contributions sont grandement appréciées ! Que ce soit pour corriger un bug, ajouter une fonctionnalité ou améliorer l'interface :

Forkez le projet.

Créez votre branche de fonctionnalité (git checkout -b feature/IncroyableFonctionnalite).

Commitez vos changements (git commit -m 'Ajout d'une IncroyableFonctionnalite').

Poussez vers la branche (git push origin feature/IncroyableFonctionnalite).

Ouvrez une Pull Request.

📄 Licence

Distribué sous la licence MIT. Voir le fichier LICENSE pour plus d'informations.