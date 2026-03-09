# Working List

## Pending
- [ ] Finalize the merge commit or hand off the staged merge state

## In Progress
- [~] Review the final git state for unrelated local changes before closing out the branch

## Done
- [x] Confirm the worktree is clean and create `codex/merge-upstream-pingdotgg-main` from local `main`
- [x] Fetch `https://github.com/pingdotgg/t3code.git` into `refs/remotes/upstream-pingdotgg/main` and compare divergence against local `main`
- [x] Inspect `pr-1` and decide not to use it as the integration base because its work is already upstream or superseded
- [x] Merge `refs/remotes/upstream-pingdotgg/main` into `codex/merge-upstream-pingdotgg-main` and capture the exact conflict set
- [x] Resolve merge conflicts while preserving the `Tether` rename and intended local behavior
- [x] Run `PATH="$HOME/.bun/bin:$PATH" ~/.bun/bin/bun -b lint`
- [x] Run `PATH="$HOME/.bun/bin:$PATH" ~/.bun/bin/bun typecheck`
