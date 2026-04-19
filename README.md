---
created_at: 2026-03-20T18:01
updated_at: 2026-04-19T19:21Z
---
# Tether

Tether is a minimal GUI for coding agents that has grown into a more capable, reliability-first multi-provider workbench. It remains Codex-first, while this fork also carries broader provider work, stronger thread and session UX, better remote-browser ergonomics, and several Tether-specific product refinements.

> [!WARNING]
> You need [Codex CLI](https://github.com/openai/codex) installed and authorized for Tether to work. Other provider paths such as Claude Code, Gemini, Cursor ACP, or OpenCode may also require their own local installs and authentication depending on which paths you use.

## Why This Fork

The original project already had a strong backend and orchestration foundation. This fork pushes further on product and frontend behavior so the app holds up under heavier daily use:

- Better thread awareness for long-running, paused, resumed, and high-volume work
- Project-wide thread auto-rename and stronger sidebar management
- Queued follow-ups, thread-context navigation, and improved timeline UX
- Better mobile and remote-browser behavior across the same network
- Reliability-first behavior around persistence, orchestration, and recovery
- Multi-provider support without hard-coding one-off orchestration paths

## Installation

Install dependencies:

```bash
bun install
```

Run the full development stack:

```bash
bun run dev
```

Useful variants:

```bash
bun run dev:server
bun run dev:web
bun run dev:desktop
```

## Desktop App

Install the latest desktop build from GitHub Releases or your preferred package manager. Upstream T3 Code package examples still broadly apply:

```bash
winget install T3Tools.T3Code
brew install --cask t3-code
yay -S t3code-bin
```

## Quality Gates

Before treating work as complete in this repo, all of these should pass:

```bash
bun fmt
bun lint
bun typecheck
```

For tests, use:

```bash
bun run test
```

Do not use `bun test` in this repository.

## Repository Shape

- `apps/server`: WebSocket server and provider/session orchestration
- `apps/web`: React UI for threads, events, approvals, and session state
- `apps/desktop`: Desktop shell
- `packages/contracts`: shared schemas and TypeScript contracts
- `packages/shared`: shared runtime utilities

## Status

This fork is willing to make larger architectural changes when they improve correctness, recoverability, and long-term maintainability.

Observability guide: [docs/observability.md](./docs/observability.md)

## Contributing

Before local development, prepare the environment and install dependencies:

```bash
# Optional: only needed if you use mise for dev tool management.
mise install
bun install .
```

Read [CONTRIBUTING.md](./CONTRIBUTING.md) before opening an issue or PR.

Need support? Join the [Discord](https://discord.gg/jn4EGJjrvv).
