# Estimate Codex Context Occupancy Across Compaction

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document follows [.docs/PLANS.md](/Users/axel/Desktop/Code_Projects/Personal/Tether/.docs/PLANS.md) and must be maintained in accordance with that file.

## Purpose / Big Picture

Codex currently reports cumulative token totals, not the exact live context retained after compaction. That makes the composer badge misleading: it can jump to the full model window even though the thread still works because Codex has compacted the conversation internally. After this change, Codex threads will show an estimated live context usage instead of a misleading cumulative total. The estimate will exclude cached tokens, reset to an assumed post-compaction baseline of 15% of the model window, and then grow again based on non-cached token growth after the compaction point.

The user-visible outcome is simple: when a Codex thread compacts, the badge should drop to a believable low percentage instead of staying pinned near the maximum. As the conversation continues, that percentage should grow again. The tooltip must explain that the value is an estimate and also show the raw reported totals from Codex for transparency.

## Progress

- [x] (2026-03-12 07:15Z) Verified the generated Codex schema only exposes cumulative `tokenUsage.total`, `tokenUsage.last`, and `modelContextWindow`, and that compaction events do not include a retained-context token count.
- [x] (2026-03-12 07:15Z) Chose the heuristic shape: exclude cached tokens from occupancy, persist a compaction anchor, reset estimated usage to 15% of the model window on compaction, and grow from there using non-cached token deltas.
- [x] (2026-03-12 07:28Z) Implemented Codex context-window normalization so it persists raw reported totals plus the compaction anchor needed to estimate live occupancy after compaction.
- [x] (2026-03-12 07:28Z) Replaced the compaction clear behavior with a heuristic reset when a Codex thread compacts and preserved the clear path as a fallback when no anchor exists.
- [x] (2026-03-12 07:28Z) Updated the composer indicator copy so Codex renders an estimated context meter with raw reported totals in the tooltip.
- [x] (2026-03-12 07:33Z) Added a legacy overflow recovery path: the next token-usage update can synthesize a compaction anchor from the latest turn delta, and the web UI applies a temporary fallback immediately when an old overflowing snapshot lacks that anchor.
- [x] (2026-03-12 07:33Z) Added and updated server, contract, and browser tests for estimate-before-compaction, estimate-after-compaction, and legacy-overflow recovery behavior.
- [x] (2026-03-12 07:33Z) Ran `rtk proxy env PATH="$HOME/.bun/bin:$PATH" ~/.bun/bin/bun fmt`, `rtk proxy env PATH="$HOME/.bun/bin:$PATH" ~/.bun/bin/bun -b lint`, and `rtk proxy env PATH="$HOME/.bun/bin:$PATH" ~/.bun/bin/bun typecheck`.

## Surprises & Discoveries

- Observation: the schema-backed `ContextCompactedNotification` and `ContextCompaction` item contain no token counters at all, so there is nothing authoritative to read after compaction.
  Evidence: `.schema/v2/ContextCompactedNotification.json` contains only `threadId` and `turnId`, and `.schema/EventMsg.json` defines `ContextCompaction` items with only `id` and `type`.

- Observation: the current ingestion path already has access to the latest projected thread state when runtime events arrive, so the compaction anchor can be derived in the server without introducing a second store.
  Evidence: `apps/server/src/orchestration/Layers/ProviderRuntimeIngestion.ts` reads the current thread from `orchestrationEngine.getReadModel()` before handling `thread.token-usage.updated` and `thread.state.changed`.

- Observation: threads that already had pre-patch overflowing Codex snapshots would continue showing the cumulative estimate until another token-usage event arrived, because those persisted snapshots lacked the compaction anchor fields.
  Evidence: the normalized Codex context-window shape only gained `reportedTotalTokens`, `compactionAnchorNonCachedTokens`, and `compactionAnchorUsedTokens` during this change; older persisted rows do not contain them.

## Decision Log

- Decision: keep the heuristic on the server and persist it through `contextWindow` instead of computing it only in the web client.
  Rationale: the server already sees provider events and current thread state, and persisting the anchor through the read model keeps the estimate stable across refreshes and reconnects.
  Date/Author: 2026-03-12 / Codex

- Decision: treat cached tokens as non-occupying for Codex estimates.
  Rationale: this matches the user’s stated Codex CLI guideline and prevents the estimate from saturating early due to cache reads that do not consume active context.
  Date/Author: 2026-03-12 / Codex

- Decision: use a fixed post-compaction reset of 15% of `modelContextWindow`.
  Rationale: the protocol provides no real post-compaction occupancy number. A fixed baseline is easy to reason about, predictable, and matches the user’s requested approximation.
  Date/Author: 2026-03-12 / Codex

- Decision: derive prompt footprint from `totalTokens - cachedInputTokens - outputTokens - reasoningOutputTokens`, not from the raw `inputTokens` field.
  Rationale: the user clarified that Codex `input` counts already include output and reasoning, so using raw input would overstate occupancy.
  Date/Author: 2026-03-12 / Codex

- Decision: stop clamping Codex estimated occupancy and percentage to the model window, but continue flooring `remainingTokens` at zero.
  Rationale: the user explicitly wanted to see the true estimated overage when the heuristic exceeds the model window, while the rest of the UI still benefits from a non-negative remaining-capacity field.
  Date/Author: 2026-03-12 / Codex

- Decision: add a temporary UI fallback and a server-side legacy recovery path for old overflowing snapshots that lack a compaction anchor.
  Rationale: without this, existing threads created before the heuristic shipped would continue displaying values such as `26m` until a future compaction event established a new anchor.
  Date/Author: 2026-03-12 / Codex

## Outcomes & Retrospective

Implemented. Codex context usage is now estimated from prompt footprint rather than cumulative provider totals, resets to a 15% baseline on compaction, and can recover older overflowing snapshots without waiting for a fresh compaction event. Existing stale pre-anchor snapshots now get an immediate display fallback in the web app when `reportedLastTokens` is available, and the next token-usage update persists a proper compaction anchor server-side.

## Context and Orientation

The relevant server normalization lives in `apps/server/src/provider/codexContextWindow.ts`. That module takes raw provider token-usage payloads and turns them into `OrchestrationContextWindow`, the shared structure defined in `packages/contracts/src/orchestration.ts`. The runtime ingestion layer in `apps/server/src/orchestration/Layers/ProviderRuntimeIngestion.ts` listens to provider events such as `thread.token-usage.updated` and `thread.state.changed`, normalizes the data, and dispatches internal orchestration commands that update the projected thread state. The thread read model is updated by the projector in `apps/server/src/orchestration/projector.ts` and then read by the web app.

In the web app, `apps/web/src/components/ContextWindowIndicator.tsx` renders the badge and tooltip shown in the composer. It consumes the normalized `contextWindow` from the active thread. Browser coverage for this area lives in `apps/web/src/components/ChatView.browser.tsx`. Server-side normalization and ingestion coverage live in `apps/server/src/provider/codexContextWindow.test.ts` and `apps/server/src/orchestration/Layers/ProviderRuntimeIngestion.test.ts`.

For this change, “raw reported total” means the provider’s cumulative `tokenUsage.total.totalTokens`. “Prompt footprint” means `totalTokens - cachedInputTokens - outputTokens - reasoningOutputTokens`. “Compaction anchor” means the prompt footprint at the moment a `compacted` state is observed, plus the heuristic baseline we reset to after that compaction.

## Plan of Work

First, extend `OrchestrationContextWindow` in `packages/contracts/src/orchestration.ts` with the extra Codex-only metadata needed to keep both the estimate and the raw reported totals. The minimum fields are the raw reported total and the compaction anchor values needed to resume counting after compaction. Keep these fields optional so Claude and any other providers can ignore them.

Next, revise `apps/server/src/provider/codexContextWindow.ts` so it computes two numbers from the provider payload: the raw reported total and the prompt footprint that excludes cached input, output, and reasoning tokens. Before any compaction anchor exists, the estimated `usedTokens` should equal that prompt footprint. When a previous Codex context window includes a compaction anchor, compute the prompt-footprint growth since that anchor and add it to the heuristic post-compaction baseline. Continue carrying the raw reported total, the last-turn total, and the bucket totals through the normalized object.

Then update `apps/server/src/orchestration/Layers/ProviderRuntimeIngestion.ts`. When Codex sends `thread.token-usage.updated`, pass the current thread context window into the normalizer so it can continue a post-compaction estimate. When Codex sends `thread.state.changed` with `state: "compacted"`, replace the old “clear to null” behavior with a heuristic reset derived from the current Codex context window. If there is no prior Codex window to anchor from, keep the existing clear behavior as a safe fallback.

After that, update `apps/web/src/components/ContextWindowIndicator.tsx` so Codex is presented as an estimate again. The badge should show an estimated percentage, and the tooltip should explicitly say that it is an estimate based on Codex reported totals and compaction heuristics. The tooltip must also show the raw reported total, the last-turn total when available, the model context window, and the cumulative bucket breakdown with wording that makes it clear those bucket totals are provider-reported totals rather than live occupancy. For old overflowing snapshots that do not yet have a compaction anchor, add a temporary display fallback that derives an estimate from the latest reported turn until the server writes back a recovered anchor.

Finally, update the focused tests. The provider normalization tests must cover cached-token exclusion, compaction-anchor resets, and post-compaction growth. The ingestion tests must cover a compaction event turning an existing Codex window into a reset estimate instead of null. The browser tests must assert the new badge and tooltip language. Re-run formatting, lint, typecheck, and the focused tests as evidence.

## Concrete Steps

From the repository root:

    rtk proxy env PATH="$HOME/.bun/bin:$PATH" ~/.bun/bin/bun fmt
    rtk proxy env PATH="$HOME/.bun/bin:$PATH" ~/.bun/bin/bun -b lint
    rtk proxy env PATH="$HOME/.bun/bin:$PATH" ~/.bun/bin/bun typecheck

Focused tests while iterating:

    cd /Users/axel/Desktop/Code_Projects/Personal/Tether/apps/server
    rtk proxy env PATH="$HOME/.bun/bin:$PATH" ~/.bun/bin/bun run test -- src/provider/codexContextWindow.test.ts src/orchestration/Layers/ProviderRuntimeIngestion.test.ts

    cd /Users/axel/Desktop/Code_Projects/Personal/Tether/apps/web
    rtk proxy env PATH="$HOME/.bun/bin:$PATH" ~/.bun/bin/bun run test -- src/components/ContextWindowIndicator.test.tsx
    rtk proxy env PATH="$HOME/.bun/bin:$PATH" ~/.bun/bin/bun run test:browser -- ChatView.browser.tsx -t "shows a context-window badge and tooltip when the active codex thread has usage data|estimates codex context usage from a compaction baseline"

Expected evidence after implementation:

    server tests: pass with cases proving cached tokens are excluded and compaction resets to a 15% baseline
    browser tests: pass with Codex tooltip copy describing an estimate and raw reported totals
    lint/typecheck: all packages succeed

## Validation and Acceptance

Open a Codex-backed thread in the web app and watch the composer badge as the conversation grows. Before compaction, the estimate should rise based on prompt footprint rather than raw cumulative totals. After a compaction event, the badge should drop to roughly 15% used instead of staying pinned near the model limit. Continue the thread and confirm the estimate rises again from that lower baseline.

In the tooltip, confirm that the language describes an estimate, not an exact measurement. Confirm that cached tokens are still visible in the reported totals breakdown but do not inflate the estimated occupancy. If a raw reported total grows into the millions, the estimate may also exceed the model window once the heuristic says it has overflowed; the UI should show that overage rather than clamping it to `258k` or `100%`.

## Idempotence and Recovery

These changes are safe to re-run because they only affect schema fields, runtime normalization, and UI rendering. If a partial implementation causes the Codex estimate to misbehave, the fastest safe recovery path is to rerun the focused tests above, inspect `apps/server/src/provider/codexContextWindow.ts`, and compare the current `usedTokens` calculation against the persisted anchor fields. No destructive migrations are required because the thread projection already stores `contextWindow` as JSON.

## Artifacts and Notes

Schema evidence that drives the workaround:

    ThreadTokenUsageUpdatedNotification exposes only `tokenUsage.last`, `tokenUsage.total`, and `modelContextWindow`.
    ContextCompactedNotification exposes only `threadId` and `turnId`.
    ContextCompaction items expose only `id` and `type`.

Heuristic formula implemented:

    effectiveReportedTotal = max(0, reportedTotalTokens - cachedInputTokens - outputTokens - reasoningOutputTokens)
    effectiveReportedLastTotal = max(0, reportedLastTokens - lastCachedInputTokens - lastOutputTokens - lastReasoningOutputTokens)
    postCompactionBase = round(modelContextWindow * 0.15)
    estimatedUsedBeforeCompaction = effectiveReportedTotal
    estimatedUsedAfterCompaction = postCompactionBase + max(0, effectiveReportedTotal - compactionAnchorNonCachedTokens)
    legacyFallbackBeforeAnchor = postCompactionBase + effectiveReportedLastTotal

Revision note: created this plan after confirming the Codex schema does not expose a real post-compaction live-context token count, so a persistent heuristic is required.
Revision note: updated after implementation to reflect the prompt-footprint formula, unclamped Codex overage display, and the legacy-overflow recovery path for pre-anchor snapshots.
