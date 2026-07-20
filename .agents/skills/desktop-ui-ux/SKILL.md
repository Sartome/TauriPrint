---
name: desktop-ui-ux
description: "Guidelines and design patterns for building modern, responsive desktop interfaces for Tauri desktop applications."
---

# Desktop UI/UX Guidelines

Use this skill when building or updating user interfaces for Tauri desktop applications.

## Key Principles

1. **Native Desktop Feel**:
   - High contrast, dark/light theme support, frameless window support, and custom titlebar controls if needed.
   - Clean typography using system UI fonts.

2. **Responsive Layout**:
   - Ensure UI adapts seamlessly when window dimensions change.
   - Use flexbox/grid containers with scrollable main content regions so navigation remains visible.

3. **Status & Feedback**:
   - Display actionable status indicators for async operations (e.g., print queue status, hot folder monitoring).
   - Use micro-animations or subtle loading states for backend `invoke` calls.
