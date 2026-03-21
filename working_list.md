# Working List

## Pending

- [ ] Manually verify the rewritten browser pane paints visibly inside the desktop workspace

## In Progress

- [~] Final review sweep for remaining browser-pane risks after green validation

## Done

- [x] Refresh the working checklist for this investigation
- [x] Trace the current desktop/browser-pane regression set from source and dev logs
- [x] Review the browser-pane render lifecycle and parent view hierarchy
- [x] Rebuild the desktop browser composition tree around a dedicated overlay stage
- [x] Replace per-pane DOM bounds polling with a central browser pane layout coordinator
- [x] Add desktop/browser verification coverage for the rewritten compositor
- [x] Fix Bun-backed dev/build/test scripts so the desktop/browser workflow runs on this machine
- [x] Patch the Electron teardown race that could snapshot a pane after destruction
- [x] Run `bun fmt`, `bun -b lint`, `bun typecheck`, focused browser/split tests, desktop tests, and the browser smoke test
- [x] Do a final browser-pane code review sweep after green validation
