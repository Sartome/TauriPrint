import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

try {
  // 1. Lire tauri.conf.json
  const tauriConfPath = path.join(__dirname, 'src-tauri', 'tauri.conf.json');
  const tauriConf = JSON.parse(fs.readFileSync(tauriConfPath, 'utf8'));
  const version = tauriConf.version;

  if (!version) {
    console.error('Erreur: Aucun champ "version" trouvé dans tauri.conf.json');
    process.exit(1);
  }

  console.log(`[Version Sync] Synchronisation de la version ${version}...`);

  // 2. Mettre à jour package.json
  const pkgPath = path.join(__dirname, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  if (pkg.version !== version) {
    pkg.version = version;
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
    console.log(`[Version Sync] package.json mis à jour vers v${version}`);
  }

  // 3. Mettre à jour package-lock.json
  const pkgLockPath = path.join(__dirname, 'package-lock.json');
  if (fs.existsSync(pkgLockPath)) {
    const pkgLock = JSON.parse(fs.readFileSync(pkgLockPath, 'utf8'));
    let changed = false;
    if (pkgLock.version !== version) {
      pkgLock.version = version;
      changed = true;
    }
    if (pkgLock.packages && pkgLock.packages[''] && pkgLock.packages[''].version !== version) {
      pkgLock.packages[''].version = version;
      changed = true;
    }
    if (changed) {
      fs.writeFileSync(pkgLockPath, JSON.stringify(pkgLock, null, 2) + '\n');
      console.log(`[Version Sync] package-lock.json mis à jour vers v${version}`);
    }
  }

  // 4. Mettre à jour src-tauri/Cargo.toml
  const cargoPath = path.join(__dirname, 'src-tauri', 'Cargo.toml');
  if (fs.existsSync(cargoPath)) {
    let cargoContent = fs.readFileSync(cargoPath, 'utf8');
    // Regex pour cibler version = "x.y.z" sous [package]
    const packageSectionRegex = /\[package\][^]*?version\s*=\s*"([^"]+)"/;
    const match = cargoContent.match(packageSectionRegex);
    if (match && match[1] !== version) {
      const oldVersionLine = `version = "${match[1]}"`;
      const newVersionLine = `version = "${version}"`;
      
      const packageSection = match[0];
      const updatedPackageSection = packageSection.replace(oldVersionLine, newVersionLine);
      cargoContent = cargoContent.replace(packageSection, updatedPackageSection);
      
      fs.writeFileSync(cargoPath, cargoContent);
      console.log(`[Version Sync] src-tauri/Cargo.toml mis à jour vers v${version}`);
    }
  }

  console.log('[Version Sync] Terminé avec succès.');
} catch (e) {
  console.error('[Version Sync] Erreur lors de la synchronisation:', e);
  process.exit(1);
}
