---
created_at: 2026-03-20T18:01
updated_at: 2026-04-10T16:28
---
# Quick start

```bash
# Install dependencies
bun install

# Development (with hot reload)
bun run dev

# Desktop development
bun run dev:desktop

# Desktop development on an isolated port set
TETHER_DEV_INSTANCE=feature-xyz bun run dev:desktop

# Production
bun run build
bun run start

# Build a shareable macOS .dmg (arm64 by default)
bun run dist:desktop:dmg

# Or from any project directory after publishing:
npx t3
```
