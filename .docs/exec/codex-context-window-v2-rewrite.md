# Codex Context Window V2 Rewrite

## Summary

Replace the current mixed Codex context estimation system with a server-owned v2 model.
The server will own all Codex estimation logic, the web client will render only server-provided values,
and persisted legacy Codex snapshots will be cleared on upgrade so stale anchors and stale baselines do not survive.

## Implementation

1. Add a migration that clears persisted Codex `context_window_json` rows from `projection_threads`.
2. Extend `OrchestrationContextWindow` with explicit Codex v2 fields:
   - `estimationVersion: 2`
   - `estimationMode: "direct" | "anchored"`
   - `effectiveTokens`
   - `lastEffectiveTokens?`
   - `anchorEffectiveTokens?`
   - `anchorEstimatedTokens?`
   - `anchorSource?`
3. Rewrite `apps/server/src/provider/codexContextWindow.ts` so it only has:
   - `direct` mode: `usedTokens === effectiveTokens`
   - `anchored` mode: `usedTokens === anchorEstimatedTokens + max(0, effectiveTokens - anchorEffectiveTokens)`
4. Update explicit `thread.state.changed -> compacted` handling to create an anchored v2 baseline from the previous effective footprint.
5. Remove all Codex estimation heuristics from the web indicator and make it render the server-owned values only.
6. Add a read-model boundary guard so any Codex snapshot lacking `estimationVersion === 2` is dropped to `null`.
7. Add focused regression coverage for:
   - direct under-window usage
   - raw total overflow but effective under-window usage
   - first overflow with previous direct snapshot
   - first overflow with last-turn delta
   - first overflow with baseline fallback
   - explicit compaction
   - post-compaction growth
   - legacy snapshot reset and v1 invalidation

## Defaults

- Cached tokens do not count toward effective footprint.
- Output tokens do not count toward effective footprint.
- Reasoning tokens do not count toward effective footprint.
- Effective footprint is `max(0, input - cached - output - reasoning)`.
- Old Codex snapshots are cleared on upgrade.
- Codex chips are hidden until a fresh v2 token-usage update arrives.
