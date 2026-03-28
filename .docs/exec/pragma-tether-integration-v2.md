# Pragma Tether Integration v2

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document follows [`.docs/PLANS.md`](/Users/axel/Desktop/Code_Projects/Personal/Tether/.docs/PLANS.md). Keep it current while implementing.

## Purpose / Big Picture

After this change, Pragma should connect to the currently running local Tether instance automatically in both `bun run dev` and `bun run dev:desktop`, without the user re-entering a websocket URL after restarts. When the user changes focus to a thread inside another Tether project, Pragma should switch to that project as well, driven by Tether’s existing desktop-context and snapshot websocket APIs.

## Progress

- [x] (2026-03-28 16:20 AST) Re-verified the current websocket/auth mismatch between Tether and Pragma against both codebases.
- [ ] Implement Tether local instance discovery publishing and tests.
- [ ] Implement Pragma auto-local discovery, reconnect re-resolution, and settings migration/UI.
- [ ] Add project-follow regression coverage.
- [ ] Run verification in both repos and record results.

## Surprises & Discoveries

- Observation: Tether’s websocket server accepts any upgrade path, so Pragma’s `/ws` suffix is not the real breakage.
  Evidence: `apps/server/src/wsServer.ts` only validates the auth token query parameter on upgrade and does not enforce a pathname.
- Observation: Desktop mode is the actual UX break because Electron generates a fresh loopback port and token every run, then only exposes that full URL to Tether’s own renderer through `TETHER_DESKTOP_WS_URL`.
  Evidence: `apps/desktop/src/main.ts` sets `backendWsUrl = ws://127.0.0.1:<random>/?token=<random>` and stores it in `process.env.TETHER_DESKTOP_WS_URL`.
- Observation: Pragma’s websocket client still sends the token as a Bearer header, but Tether only reads `?token=` from the websocket URL.
  Evidence: `../Pragma/Pragma/Services/TetherConnectionManager.swift` sets `Authorization: Bearer ...`, while `apps/server/src/wsServer.ts` reads `url.searchParams.get("token")`.

## Decision Log

- Decision: Keep Tether’s websocket RPC contract unchanged.
  Rationale: The route/thread desktop-context and snapshot contract is already the correct integration surface; the failure is discovery and reconnect UX.
  Date/Author: 2026-03-28 / Codex
- Decision: Publish local Tether instance records from the actual server process, not from Electron or the dev runner.
  Rationale: The server process knows the real resolved port and auth token in both `dev` and `dev:desktop`.
  Date/Author: 2026-03-28 / Codex
- Decision: Use a per-instance discovery directory under `~/.t3/tether/instances/` with heartbeat timestamps, and let Pragma pick the newest live record.
  Rationale: This supports both `dev` and `dev:desktop`, survives random desktop ports/tokens, and matches the chosen “latest wins” behavior without editing URLs.
  Date/Author: 2026-03-28 / Codex

## Outcomes & Retrospective

Implementation in progress. The intended result is that Pragma defaults to auto-discovering the active local Tether instance and only falls back to manual websocket settings when the user explicitly wants a custom or remote server.

## Context and Orientation

Tether’s server startup lives in `apps/server/src/main.ts`, and the websocket server implementation lives in `apps/server/src/wsServer.ts`. Desktop mode is launched by Electron from `apps/desktop/src/main.ts`, but the real websocket endpoint still belongs to the server child process. Pragma’s connection, reconnect, and follow-Tether behavior lives in `../Pragma/Pragma/Services/TetherConnectionManager.swift` and `../Pragma/Pragma/Store/PragmaStore.swift`. User-facing Tether connection settings live in `../Pragma/Pragma/Views/Settings/SettingsView.swift`.

The core rule for this implementation is: do not change the websocket RPC or push surface already used for desktop context. Instead, make local connection discovery and reconnect resolution reliable enough that Pragma can stay attached to the correct Tether instance while continuing to use `orchestration.getSnapshot`, `server.getDesktopContext`, `server.setDesktopContext`, `server.desktopContextUpdated`, and `orchestration.domainEvent`.

## Plan of Work

First, add a small Tether server utility that publishes a versioned local-instance JSON record into `~/.t3/tether/instances/<instanceId>.json`. The utility should compute a directly usable `wsUrl`, refresh `updatedAt` and `expiresAt` on a heartbeat, write atomically with restrictive permissions, and remove its own instance file on shutdown. Wire it into `apps/server/src/main.ts` so it starts only after the server is actually listening.

Next, add a Pragma-side local discovery service that scans the instance directory, ignores expired entries, and returns the newest live descriptor. Extend Pragma config with an explicit connection mode enum so new users default to auto-local discovery while existing manual websocket configurations continue to work unchanged.

Then, update Pragma’s connection manager and store so reconnect attempts in auto mode always re-resolve discovery rather than retrying a stale desktop URL. Manual mode should continue to work, but when a token exists it must be appended as `?token=` to the websocket URL because that is what the current Tether server expects.

Finally, add tests that prove the reconnect and follow-project behavior. The critical behavioral regression to guard is switching Pragma from a thread inside `Relay` to a thread in another Tether project without changing settings or restarting Pragma.

## Concrete Steps

Run these commands from `/Users/axel/Desktop/Code_Projects/Personal/Tether` or `/Users/axel/Desktop/Code_Projects/Personal/Pragma` as appropriate.

Tether verification:

    rtk proxy env PATH="$HOME/.bun/bin:$PATH" ~/.bun/bin/bun run test -- src/localTetherDiscovery.test.ts
    rtk proxy env PATH="$HOME/.bun/bin:$PATH" ~/.bun/bin/bun run test -- src/main.test.ts
    rtk proxy env PATH="$HOME/.bun/bin:$PATH" ~/.bun/bin/bun run test -- src/wsServer.test.ts
    rtk proxy env PATH="$HOME/.bun/bin:$PATH" ~/.bun/bin/bun run fmt
    rtk proxy env PATH="$HOME/.bun/bin:$PATH" ~/.bun/bin/bun -b lint
    rtk proxy env PATH="$HOME/.bun/bin:$PATH" ~/.bun/bin/bun typecheck

Pragma verification:

    rtk proxy swift test --filter TetherConnectionManagerTests
    rtk proxy swift test --filter LocalTetherDiscoveryTests
    rtk proxy swift test --filter PragmaStoreTetherFollowTests
    rtk proxy swift test

## Validation and Acceptance

Acceptance is behavioral:

1. With `bun run dev`, Pragma in auto-local mode connects without entering a URL, receives snapshot + desktop context, and follows the active Tether project when the focused thread changes.
2. With `bun run dev:desktop`, Pragma in auto-local mode connects without entering a URL or token, and after restarting desktop Tether it reconnects to the new random port/token automatically.
3. In manual mode, Pragma still accepts a custom websocket URL and optional token, and tokenized manual connections work because Pragma appends `?token=` to the URL.

## Idempotence and Recovery

Discovery publishing must be safe to restart repeatedly. Each Tether process writes its own instance file and removes it on shutdown. Stale files are tolerated by design because Pragma filters by `expiresAt`; best-effort pruning is only cleanup, not correctness. On the Pragma side, auto-discovery must tolerate the instance directory being absent, empty, or temporarily stale.

## Artifacts and Notes

Important proof points:

    - `apps/server/src/localTetherDiscovery.test.ts` proves Tether publishes correct local URLs for both auth and no-auth modes.
    - `../Pragma/PragmaTests/TetherConnectionManagerTests.swift` proves reconnect re-resolves discovery and manual token handling uses query auth.
    - `../Pragma/PragmaTests/PragmaStoreTetherFollowTests.swift` proves switching desktop context from `Relay` to another project changes the active Pragma binding.

## Interfaces and Dependencies

New Tether local discovery JSON shape:

    {
      version: 1,
      instanceId: string,
      pid: number,
      mode: "web" | "desktop",
      cwd: string,
      stateDir: string,
      host: string,
      port: number,
      wsUrl: string,
      startedAt: ISO timestamp,
      updatedAt: ISO timestamp,
      expiresAt: ISO timestamp
    }

New Pragma config enum:

    enum TetherConnectionMode: String, Codable, Hashable, Sendable {
      case autoLocal
      case manual
    }

Pragma matching order must remain:

    desktopContext.projectId
    desktopContext.workspaceRoot
    desktopContext.projectTitle

Revision note: created on 2026-03-28 to implement the auto-discovering Pragma/Tether integration v2 across both repos.
