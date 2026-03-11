# First-Class Multi-Terminal Project Actions

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document must be maintained in accordance with `.docs/PLANS.md`.

## Purpose / Big Picture

Tether already renders multiple integrated terminal sessions inside a thread, but project actions still model a single command string. That mismatch causes actions like React Native Android launch flows to spill into external OS terminal windows because the underlying CLI opens its own second terminal. After this change, a single project action can launch multiple integrated terminal tabs, and the existing Obscura `npm run android` action can be translated into a Tether-managed Metro tab plus a Tether-managed Android build tab without the user reauthoring the action first.

## Progress

- [x] (2026-03-11 15:35Z) Inspected the existing script runner, terminal store, terminal RPC layer, and the Obscura `npm run android` command chain.
- [x] (2026-03-11 15:38Z) Added `ProjectScript.steps`, the bounded `projects.readFile` RPC contracts, and schema coverage in `packages/contracts`.
- [x] (2026-03-11 15:40Z) Added server-side `projects.readFile` routing with workspace-root checks, UTF-8 decoding, size limits, and WebSocket/server tests.
- [x] (2026-03-11 15:44Z) Extracted project-action normalization, serialization, launch planning, and React Native Android compatibility logic into `apps/web/src/lib/projectScriptExecution.ts`.
- [x] (2026-03-11 15:47Z) Updated the project-action editor to support ordered multi-step commands and refactored `ChatView` to launch multi-terminal actions from a precomputed plan.
- [x] (2026-03-11 15:49Z) Added targeted non-browser coverage in web, contracts, and server packages for serialization, compatibility expansion, projection round-trips, and the new RPC.
- [x] (2026-03-11 15:51Z) Ran `PATH="$HOME/.bun/bin:$PATH" ~/.bun/bin/bun typecheck` and `PATH="$HOME/.bun/bin:$PATH" ~/.bun/bin/bun -b lint`.

## Surprises & Discoveries

- Observation: Tether already supports multiple terminal groups and tab-like switching in the thread terminal drawer; the missing piece is action modeling and launch planning, not terminal rendering.
  Evidence: `apps/web/src/terminalStateStore.ts` and `apps/web/src/components/ThreadTerminalDrawer.tsx` already model `terminalGroups` and `activeTerminalGroupId`.
- Observation: The current Obscura `npm run android` action is only `react-native run-android`; the extra OS terminal comes from the React Native CLI itself.
  Evidence: `../Obscura/package.json` defines `"android": "react-native run-android"` and Tether only calls `terminal.open` once per action today in `apps/web/src/components/ChatView.tsx`.
- Observation: Final lint still reports one warning in `apps/server/src/provider/Layers/ProviderService.ts`, but it is pre-existing and unrelated to this feature branch.
  Evidence: `bun -b lint` reported only `eslint-plugin-unicorn(no-useless-spread)` at `apps/server/src/provider/Layers/ProviderService.ts:295`.

## Decision Log

- Decision: Keep the existing required `ProjectScript.command` field and add optional `steps`.
  Rationale: This preserves existing persisted scripts and keeps single-step actions backward compatible while allowing richer actions.
  Date/Author: 2026-03-11 / Codex
- Decision: Add a bounded `projects.readFile` RPC instead of overloading `searchEntries` or writing compatibility logic in the server.
  Rationale: The React Native compatibility layer needs trustworthy access to small config files such as `package.json`, and a bounded read API is safer and easier to test.
  Date/Author: 2026-03-11 / Codex
- Decision: Expand the React Native compatibility path only for validated `react-native start` plus `react-native run-android` pairs.
  Rationale: Narrow translation avoids incorrect guessing and keeps fallback behavior predictable for other script shapes.
  Date/Author: 2026-03-11 / Codex

## Outcomes & Retrospective

The feature landed end to end without a migration. Project actions can now persist ordered multi-step commands, the web runtime precomputes terminal launch plans and refuses partial launches at the terminal cap, and legacy Obscura-style `npm run android` actions expand into integrated Metro plus Android terminals through a narrow `package.json` compatibility path. Validation covered contract/server/web unit suites plus the required `lint` and `typecheck` commands; browser-only ChatView tests were added but not executed in this pass.

## Context and Orientation

`apps/web/src/components/ChatView.tsx` currently owns project action persistence and runtime launching. Its `runProjectScript` helper always opens or reuses exactly one integrated terminal session, then writes one command string. `apps/web/src/components/ProjectScriptsControl.tsx` only edits a single `command` string. The thread terminal UI already supports multiple groups of terminals in `apps/web/src/terminalStateStore.ts` and `apps/web/src/components/ThreadTerminalDrawer.tsx`.

Shared wire schemas live in `packages/contracts`. `packages/contracts/src/orchestration.ts` defines `ProjectScript`, and `packages/contracts/src/project.ts` defines project file-search and write RPC payloads. `packages/contracts/src/ws.ts` and `packages/contracts/src/ipc.ts` expose the RPC names and TypeScript surface consumed by the web app. On the server, `apps/server/src/wsServer.ts` is the WebSocket request router.

## Plan of Work

First, extend the contract surface. Add a `ProjectScriptStep` schema to `packages/contracts/src/orchestration.ts`, add optional `steps` to `ProjectScript`, and add a new bounded `projects.readFile` request/result schema in `packages/contracts/src/project.ts`. Then wire the new RPC through `packages/contracts/src/ws.ts`, `packages/contracts/src/ipc.ts`, `apps/web/src/wsNativeApi.ts`, and `apps/server/src/wsServer.ts`.

Second, extract project-action normalization and launch-planning logic from `apps/web/src/components/ChatView.tsx` into `apps/web/src/lib/projectScriptExecution.ts`. That module should normalize legacy scripts into step arrays, serialize edited step arrays back to persisted script objects, and build a full terminal launch plan before any terminal is opened. The launch planner must abort if the thread does not have enough free terminal slots to keep the steps isolated.

Third, update `apps/web/src/components/ProjectScriptsControl.tsx` so actions can be edited as one to four ordered commands. The first command remains required and represents the primary command. Later commands represent additional integrated terminal tabs. Saving must derive the top-level `command` field from step one and omit the `steps` field when there is only one command.

Fourth, refactor runtime launching in `apps/web/src/components/ChatView.tsx` to execute the precomputed launch plan. Add the React Native compatibility layer inside the shared execution helper so legacy single-command actions can expand to two steps after reading `package.json` through the new RPC.

Finally, add coverage across contracts, server, and web, then run lint and typecheck using the Bun invocations required by `AGENTS.md`.

## Concrete Steps

From the repository root:

    rtk proxy env PATH="$HOME/.bun/bin:$PATH" ~/.bun/bin/bun -b lint
    rtk proxy env PATH="$HOME/.bun/bin:$PATH" ~/.bun/bin/bun typecheck

Focused test commands may be used during development, but the final validation must include both commands above.

## Validation and Acceptance

Acceptance is behavioral:

1. A multi-step project action saved in the UI persists, reloads, and still shows the same ordered commands.
2. Running a two-step action opens two integrated terminal tabs/groups and writes one command to each.
3. If the terminal limit would be exceeded, the action fails before opening any new terminal.
4. In an Obscura-style React Native project, the legacy `npm run android` action produces a Metro tab and an Android build tab without opening an external OS terminal window.
5. Existing single-step project actions still run exactly once in one integrated terminal.

## Idempotence and Recovery

The schema change is additive and backward compatible. Re-running the implementation steps is safe because no migration modifies stored rows. If the compatibility layer mis-detects a project, the fallback path is the existing single-command behavior. If an individual test fails during development, rerun the focused test before retrying the full lint and typecheck pass.

## Artifacts and Notes

Current Obscura script shape:

    {
      "scripts": {
        "android": "react-native run-android",
        "start": "react-native start"
      }
    }

Current single-terminal launch behavior:

    await api.terminal.open(openTerminalInput);
    await api.terminal.write({
      threadId: activeThreadId,
      terminalId: targetTerminalId,
      data: `${script.command}\r`,
    });

## Interfaces and Dependencies

In `packages/contracts/src/orchestration.ts`, define:

    export const ProjectScriptStep = Schema.Struct({
      id: TrimmedNonEmptyString.check(Schema.isMaxLength(64)),
      command: TrimmedNonEmptyString,
    });

and extend `ProjectScript` with:

    steps: Schema.optional(Schema.Array(ProjectScriptStep).check(Schema.isBetween(2, 4)))

using an array-length check equivalent that preserves the v1 range of one to four total commands while omitting `steps` for single-command actions.

In `packages/contracts/src/project.ts`, define:

    export const ProjectReadFileInput = Schema.Struct({
      cwd: TrimmedNonEmptyString,
      relativePath: TrimmedNonEmptyString.check(Schema.isMaxLength(512)),
    });

    export const ProjectReadFileResult = Schema.Struct({
      relativePath: TrimmedNonEmptyString,
      contents: Schema.String,
    });

In `apps/web/src/lib/projectScriptExecution.ts`, define helpers that:

    projectScriptSteps(script: ProjectScript): ProjectScriptStep[]
    serializeProjectScript(input: { existing?: ProjectScript; name: string; icon: ProjectScriptIcon; runOnWorktreeCreate: boolean; steps: ProjectScriptStep[] }): ProjectScript
    buildProjectScriptLaunchPlan(...)

The launch-plan result must include the fully expanded step list and target terminal ids so `ChatView` can open and write terminals without making more placement decisions.

Change note: Updated after implementation to record the shipped contract/server/web changes, targeted test results, and the final lint/typecheck verification state.
