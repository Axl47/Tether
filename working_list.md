# Working List

## In Progress

No active implementation tasks.

## Pending

- [ ] Manual launch verification from the replay worktree.

## Done

- [x] Preflight current checkout and confirm clean `main`.
- [x] Create safety refs for current main and stale upstream.
- [x] Fetch live upstream into `refs/remotes/upstream-pingdotgg/live-main`.
- [x] Create sibling worktree at `/Users/axel/Desktop/Code_Projects/Personal/Tether-upstream-replay`.
- [x] Build replay ledger and create migration tracking files.
- [x] Replay repo identity and project instructions.
- [x] Replay Tether desktop/web branding onto upstream's current branding paths.
- [x] Confirm GPT-5.5 model support is already present in upstream.
- [x] Confirm git action completion toasts already include commit ids in upstream.
- [x] Confirm stale stop/interruption handling is already present in upstream provider/orchestration layers.
- [x] Replay local Tether discovery records using the new EnvironmentAuth/WebSocket ticket flow.
- [x] Run final verification commands: `vp check`, `vp run typecheck`, `vp run test`, and `git diff --check`.
- [x] Stage and commit the verified replay bundle.

## Blocked / Notes

- [!] The new upstream base uses pnpm/vp instead of Bun/Turbo. Verification will use upstream's `vp` scripts unless a replayed feature requires restoring Bun tooling.
- [!] The old custom `/pragma` WebSocket RPC route is deferred. Upstream now has a different auth and server API shape; the migrated branch preserves local discovery records but points them at the standard `/ws` route with a short-lived `wsTicket`.
- [!] Focused verification required local dependency installation because the replay worktree had no `node_modules` and `vp` was not globally installed.
- [!] `vp check` passes with nine unrelated existing React nested-component warnings in web/mobile files.
