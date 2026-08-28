---
name: Imported TypeScript workflow startup
description: Imported projects may have workflows that use interactive package installation instead of local dependencies.
---

Use the project's installed executable for an imported TypeScript workflow rather than an interactive package runner install prompt.

**Why:** A workflow that pauses at an install confirmation never opens the preview port, even when dependencies are already installed in the workspace.

**How to apply:** When the package is declared locally, configure the workflow to invoke its binary from node_modules/.bin and keep the existing server command and port.