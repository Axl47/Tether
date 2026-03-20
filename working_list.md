# Working List

## Pending

- [ ] Import original cloud branch history if a bundle or patch series becomes available
- [ ] Push or hand off the repaired branch once the user confirms the preferred publish step

## In Progress

## Done

- [x] Inspect the current snapshot branch, merge ancestry, and validation status
- [x] Confirm that local `main` is the correct canonical base for the repair
- [x] Create a recovery-specific working checklist
- [x] Create safety refs for `main` and `pr-7-conflict-test`
- [x] Create the fresh repair branch `codex/pr-7-conflict-test-repaired` from `main`
- [x] Search local reflogs and dangling objects and confirm the original cloud stack is not recoverable from this checkout alone
- [x] Reconstruct `pr-7-conflict-test` on top of `main` as a reviewable commit series
- [x] Fix the queued-message composer regression and re-run focused validation
- [x] Run browser chat coverage for the replayed browser-only chat flows
