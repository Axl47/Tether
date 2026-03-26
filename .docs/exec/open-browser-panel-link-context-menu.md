# Add browser-panel link actions to chat and terminal context menus

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document follows [.docs/PLANS.md](/Users/axel/Desktop/Code_Projects/Personal/Tether/.docs/PLANS.md) and must be maintained in accordance with that file.

## Purpose / Big Picture

After this change, a desktop user can right-click an external `http` or `https` link in an assistant chat message or in terminal output and choose `Open in Browser Panel`. If a browser pane is already focused in the active split workspace, the URL should load there. Otherwise the app should create a new browser pane to the right of the current thread and load the URL there. Existing behavior must remain intact: normal chat link clicks still behave as before, and terminal URL activation still requires Cmd-click on macOS or Ctrl-click elsewhere.

## Progress

- [x] (2026-03-25 00:00Z) Reviewed the existing browser-pane implementation, split-view store, chat markdown renderer, terminal link provider, and context-menu API.
- [x] (2026-03-25 00:00Z) Implemented the shared browser-pane URL opener and wired chat and terminal context menus to it.
- [x] (2026-03-25 00:00Z) Added tests for the shared helper and kept the existing terminal and timeline tests passing.
- [x] (2026-03-25 00:00Z) Ran formatting, lint, typecheck, and targeted web-package tests.

## Surprises & Discoveries

- Observation: The browser panel feature already exists end to end in the renderer and desktop layers, including split-view persistence, runtime snapshots, screenshot capture, and command-palette entry points.
  Evidence: `apps/web/src/components/BrowserPane.tsx`, `apps/web/src/browserPaneRuntimeStore.ts`, `apps/web/src/splitViewStore.ts`, and `apps/desktop/src/browserPaneManager.ts`.

- Observation: Terminal links are provided by xterm link providers and already distinguish URL links from file-path links, which means right-click support can stay URL-only without adding a second parser.
  Evidence: `apps/web/src/terminal-links.ts` and `apps/web/src/components/ThreadTerminalDrawer.tsx`.

- Observation: The live chat screen does not consume `apps/web/src/components/chat/MessagesTimeline.tsx`; the runtime path is the local `MessagesTimeline` implementation inside `apps/web/src/components/ChatView.tsx`.
  Evidence: `apps/web/src/components/ChatView.tsx` renders its own local `MessagesTimeline` component.

- Observation: The required verification commands only run correctly through `rtk proxy` in this environment because `rtk` does not accept `bun` directly as a subcommand here.
  Evidence: `rtk bun fmt` failed with `unrecognized subcommand 'bun'`, while `rtk proxy ~/.bun/bin/bun fmt` succeeded.

## Decision Log

- Decision: Keep all browser-pane opening logic in a single helper under `apps/web/src/lib`.
  Rationale: Chat markdown and terminal output should not duplicate focused-pane lookup, split creation, URL persistence, navigation, or toast behavior.
  Date/Author: 2026-03-25 / Codex

- Decision: Scope chat support to call sites that know the current thread id.
  Rationale: Some markdown renderers in the app are not attached to a concrete thread, and the user request is specifically about chat and terminal surfaces.
  Date/Author: 2026-03-25 / Codex

- Decision: Reuse only the currently focused browser pane rather than scanning all browser panes in the workspace.
  Rationale: This matches the requested default and keeps the feature predictable.
  Date/Author: 2026-03-25 / Codex

## Outcomes & Retrospective

The feature now works on the actual desktop chat and terminal surfaces. Chat assistant links keep their normal left-click behavior, but right-clicking an external URL now offers `Open link externally`, `Open in Browser Panel`, and `Copy link`. Terminal URLs keep their existing Cmd/Ctrl activation path, and right-clicking a hovered URL opens the same menu without affecting file-path links.

The most important implementation detail was centralizing pane selection and creation in `apps/web/src/lib/openUrlInBrowserPane.ts`, because the desktop browser manager requires `ensurePane` before `navigate` for newly created panes. Tests were added for focused-pane reuse and new-pane creation, and the existing split-view and terminal tests remained green.

## Context and Orientation

The renderer-side split workspace state lives in `apps/web/src/splitViewStore.ts`. A split workspace contains thread leaves and browser leaves. `splitThreadWithBrowser` creates a new browser pane leaf beside a thread. `updateBrowserPanePersistedState` updates the persisted URL or target thread for a browser leaf.

The runtime browser-pane state lives in `apps/web/src/browserPaneRuntimeStore.ts`. It tracks browser snapshots and the `focusedPaneId`, which is the browser pane most recently focused by the desktop host.

Chat markdown rendering lives in `apps/web/src/components/ChatMarkdown.tsx`. Today, external links render as ordinary anchors and file links are intercepted and opened in the editor.

Terminal rendering lives in `apps/web/src/components/ThreadTerminalDrawer.tsx`. It creates an xterm terminal, parses links with `apps/web/src/terminal-links.ts`, and currently opens URLs externally only when the user Cmd-clicks or Ctrl-clicks.

Desktop context menus are exposed through the shared native API returned by `apps/web/src/nativeApi.ts`. Toasts are shown through `apps/web/src/components/ui/toast.tsx`.

## Plan of Work

First, add a shared helper in `apps/web/src/lib/openUrlInBrowserPane.ts`. The helper will accept a URL and thread id, read the active split workspace and focused browser pane, decide whether to reuse an existing focused pane or create a new browser pane with `splitThreadWithBrowser`, persist the URL into the split workspace, navigate the desktop browser pane through `api.browser.navigate`, and return whether the URL was opened in an existing pane or a newly created one.

Second, update `apps/web/src/components/ChatMarkdown.tsx` so it optionally accepts a `threadId`. When rendering a non-file external `http(s)` link in desktop mode, attach a custom `onContextMenu` handler that opens a native menu with `Open link externally`, `Open in Browser Panel`, and `Copy link`. Leave file-link handling and normal left-click behavior unchanged. Update `apps/web/src/components/chat/MessagesTimeline.tsx` to pass the active thread id when rendering assistant message markdown.

Third, update `apps/web/src/components/ThreadTerminalDrawer.tsx` to track the currently hovered URL link from the existing xterm link provider, add a right-click listener on the terminal mount element, and show the same menu only when the hovered link is a URL. Cmd/Ctrl activation should remain untouched, and file-path links should continue using the existing editor-opening logic without any browser-pane context-menu action.

Fourth, add focused tests around the new helper and any extracted terminal-link utility logic that can be tested without spinning up Electron. Then run formatting, lint, typecheck, and a targeted web-package test pass.

## Concrete Steps

Run all commands from `/Users/axel/Desktop/Code_Projects/Personal/Tether`.

1. Create the shared helper and wire it into the chat and terminal components.
2. Update or add tests under `apps/web/src`.
3. Run:

   rtk proxy ~/.bun/bin/bun fmt
   rtk proxy zsh -lc 'PATH="$HOME/.bun/bin:$PATH" ~/.bun/bin/bun -b lint'
   rtk proxy zsh -lc 'PATH="$HOME/.bun/bin:$PATH" ~/.bun/bin/bun typecheck'
   rtk proxy zsh -lc 'cd /Users/axel/Desktop/Code_Projects/Personal/Tether/apps/web && PATH="$HOME/.bun/bin:$PATH" ~/.bun/bin/bun run test src/lib/openUrlInBrowserPane.test.ts src/splitViewStore.test.ts src/components/ThreadTerminalDrawer.test.ts src/components/chat/MessagesTimeline.test.tsx'

Expected verification is that all four commands exit successfully with no formatting issues, no lint warnings, no type errors, and all targeted Vitest files passing.

## Validation and Acceptance

Run the app in desktop mode and verify the following behavior manually.

Right-click an external assistant-message link. The context menu should contain `Open link externally`, `Open in Browser Panel`, and `Copy link`.

Choose `Open in Browser Panel` while a browser pane is already focused in the active workspace. The same pane should navigate to the new URL and a success toast should indicate that the focused browser pane was used.

Close browser panes or move focus away so no browser pane is focused, then right-click the same kind of link again and choose `Open in Browser Panel`. A new browser pane should appear to the right of the current thread and load the URL. A success toast should indicate that a new browser pane was created.

Cmd-click or Ctrl-click a terminal URL. It should continue to open externally and should not create a browser pane.

Right-click a terminal URL. The menu should show the same three actions. Right-click a terminal file path instead. The browser-pane action should not appear and path opening behavior should remain unchanged.

On a non-desktop web session, chat links should keep the default browser context menu and no custom browser-pane menu should appear.

## Idempotence and Recovery

The shared helper is additive and safe to call repeatedly. If browser navigation fails, the helper should not mutate unrelated state beyond any just-created pane, and it should surface an error so the caller can show a failure toast. Re-running formatting, lint, typecheck, and the targeted tests is safe. If a UI change causes a bad context menu experience, the recovery path is to remove the new event handler while keeping the shared helper and tests in place for later reuse.

## Artifacts and Notes

The most important artifact is the manual validation flow described above because the feature depends on desktop context menus and browser-pane focus state.

Verification transcript excerpts:

    $ rtk proxy ~/.bun/bin/bun fmt
    Finished in 787ms on 588 files using 8 threads.

    $ rtk proxy zsh -lc 'PATH="$HOME/.bun/bin:$PATH" ~/.bun/bin/bun -b lint'
    Found 0 warnings and 0 errors.

    $ rtk proxy zsh -lc 'PATH="$HOME/.bun/bin:$PATH" ~/.bun/bin/bun typecheck'
    Tasks: 7 successful, 7 total

    $ rtk proxy zsh -lc 'cd .../apps/web && PATH="$HOME/.bun/bin:$PATH" ~/.bun/bin/bun run test ...'
    Test Files 4 passed (4)
    Tests 14 passed (14)

## Interfaces and Dependencies

In `apps/web/src/lib/openUrlInBrowserPane.ts`, define a function with this shape:

    export async function openUrlInBrowserPane(input: {
      url: string;
      threadId: ThreadId;
    }): Promise<{ kind: "reused-existing-pane" | "created-new-pane"; paneId: string }>

It should use `readNativeApi`, `useSplitViewStore.getState()`, `useBrowserPaneRuntimeStore.getState()`, and `findBrowserLeafByPaneId`.

`apps/web/src/components/ChatMarkdown.tsx` must accept:

    interface ChatMarkdownProps {
      text: string;
      cwd: string | undefined;
      isStreaming?: boolean;
      threadId?: ThreadId;
    }

The terminal context-menu logic may either stay inline in `ThreadTerminalDrawer.tsx` or be partially extracted into a small helper if that makes testing easier, but the URL parsing must continue to rely on `extractTerminalLinks` so chat and terminal do not diverge on what counts as a URL.

Revision note: created this ExecPlan at implementation start because the change spans shared state, two UI surfaces, desktop-only behavior, and verification requirements.

Revision note: updated after implementation to document that the runtime chat timeline lives in `apps/web/src/components/ChatView.tsx`, to record the `ensurePane` requirement for new panes, and to capture the exact working `rtk proxy` verification commands.
