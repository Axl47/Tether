# Working List

## Pending

## In Progress
- [~] Repoint PR `#7` to use `codex/pr-7-conflict-test-repaired` as its base branch after pushing the latest upstream-history merge

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
- [x] Confirm that the repaired branch still appears behind upstream because it is based on local `main` rather than the authored `pingdotgg/main` line
- [x] Create an authorship-corrected branch that merges the authored `pingdotgg/main` line into the repaired branch without changing the validated tree
- [x] Move `codex/pr-7-conflict-test-repaired` to the authorship-corrected merge commit
- [x] Re-run `bun fmt`, `bun -b lint`, and `bun typecheck` on the official repaired branch
- [x] Push the authorship-corrected repaired branch to `origin`
- [x] Fetch the real latest `pingdotgg/t3code:main` tip and merge it into the repaired branch history
- [x] Re-run `bun fmt`, `bun -b lint`, and `bun typecheck` after recording the latest upstream ancestry
