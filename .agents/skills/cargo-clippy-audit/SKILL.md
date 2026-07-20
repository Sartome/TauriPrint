---
name: cargo-clippy-audit
description: "Automated Rust code quality, linting, security, and performance audit workflow."
---

# Cargo Clippy & Security Audit Workflow

Use this skill when modifying or reviewing Rust code in `src-tauri`.

## Audit Checklist

1. **Run Clippy Linter**:
   ```powershell
   cargo clippy --all-targets --all-features -- -D warnings
   ```

2. **Format Rust Code**:
   ```powershell
   cargo fmt --check
   ```

3. **Safety & Error Handling**:
   - Ensure no unhandled `.unwrap()` calls in production Tauri command handlers.
   - Ensure error responses map to user-friendly messages or log entries.
