# Tether

Tether is a minimal GUI for coding agents that has grown into a more capable, reliability-first multi-provider workbench. It is still Codex-first, but this fork also adds Claude Code and Gemini provider support, stronger thread/session UX, and better remote-browser ergonomics for everyday use across multiple machines.

> [!WARNING]
> You need [Codex CLI](https://github.com/openai/codex) installed and authorized for Tether to work. Claude Code and Gemini CLI are optional, and are only needed if you want to use those provider paths.

## Why This Fork

The original project already had a strong backend and orchestration foundation. This fork pushes further on the product and frontend experience so the app holds up under heavy daily use:

- Better thread awareness for long-running, paused, resumed, and high-volume work
- Project-wide thread auto-rename and stronger sidebar management
- Queued follow-ups, thread-context navigation, and improved timeline UX
- Better mobile and remote-browser behavior across the same network
- Reliability-first behavior around persistence, orchestration, and recovery
- Multi-provider support without hard-coding one-off orchestration paths

## What’s Different

1. Multi-provider support
   - Codex support through the existing app-server integration
   - Claude Code provider support
   - Gemini provider support
   - Provider-aware model and runtime handling across the server and web app
2. Thread and chat UX
   - Paused-thread visibility in the sidebar
   - Thread context jump support and context-window indicators
   - Project-wide thread auto-rename
   - Queued follow-ups, steering, and drag reordering
   - Better sidebar sorting, search, status visibility, and draft-thread handling
   - Better mobile behavior and higher-volume thread management
3. Reliability and tooling
   - Fixed write-only SQLite statement handling in persistence
   - Improved remote-host and multi-instance development workflows
   - Better support for using the app from browsers across your network

## Running Tether

Prerequisites:

- [Bun](https://bun.sh/)
- Codex CLI installed and authenticated
- Claude Code installed if you want to use the Claude provider path
- Gemini CLI installed if you want to use the Gemini provider path

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

## Contributing

Read [CONTRIBUTING.md](./CONTRIBUTING.md) before opening an issue or PR.

Need support? Join the [Discord](https://discord.gg/jn4EGJjrvv).
