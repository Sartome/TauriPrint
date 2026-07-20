# Workspace Rules for TauriPrint

## 1. Tauri & Rust Architecture
- **Non-blocking IPC**: All long-running backend tasks (file parsing, spooling, printer monitoring) MUST run asynchronously using `tokio::spawn` or worker threads. Never block Tauri's main loop.
- **Robust Error Handling**: Tauri command handlers must return `Result<T, String>` or custom serialized error types. Avoid using `.unwrap()` in production code paths.
- **Data Integrity**: Validate all inputs at the trust boundary (IPC calls, file paths, config parameters).

## 2. Desktop UI & UX
- Maintain modern, responsive desktop UI layouts with clear visual hierarchy, accessible contrast, and smooth state updates.
- Keep UI components decoupled and reusable.

## 3. Code Quality & Hygiene
- Run linting (`cargo clippy`, `cargo fmt`) before finalizing code changes.
- Delete unused code, boring over clever, smallest clean diff wins.
