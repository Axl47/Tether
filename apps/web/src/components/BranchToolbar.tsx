import type { RuntimeMode, ThreadId } from "@t3tools/contracts";
import { FolderIcon, GitForkIcon } from "lucide-react";

import { useComposerDraftStore } from "../composerDraftStore";
import { useStore } from "../store";
import { EnvMode, resolveEffectiveEnvMode } from "./BranchToolbar.logic";
import { BranchToolbarBranchSelector } from "./BranchToolbarBranchSelector";
import RuntimeModeToggle from "./RuntimeModeToggle";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "./ui/select";

const envModeItems = [
  { value: "local", label: "Local" },
  { value: "worktree", label: "New worktree" },
] as const;

interface BranchToolbarProps {
  threadId: ThreadId;
  onEnvModeChange: (mode: EnvMode) => void;
  runtimeMode: RuntimeMode;
  onRuntimeModeChange: (mode: RuntimeMode) => void;
  envLocked: boolean;
  onCheckoutPullRequestRequest?: (reference: string) => void;
  onComposerFocusRequest?: () => void;
}

export default function BranchToolbar({
  threadId,
  onEnvModeChange,
  runtimeMode,
  onRuntimeModeChange,
  envLocked,
  onCheckoutPullRequestRequest,
  onComposerFocusRequest,
}: BranchToolbarProps) {
  const threads = useStore((store) => store.threads);
  const draftThread = useComposerDraftStore((store) => store.getDraftThread(threadId));

  const serverThread = threads.find((thread) => thread.id === threadId);
  const activeWorktreePath = serverThread?.worktreePath ?? draftThread?.worktreePath ?? null;
  const hasServerThread = serverThread !== undefined;
  const effectiveEnvMode = resolveEffectiveEnvMode({
    activeWorktreePath,
    hasServerThread,
    draftThreadEnvMode: draftThread?.envMode,
  });
  const activeEnvironmentId = serverThread?.environmentId ?? draftThread?.environmentId ?? null;

  if (!activeEnvironmentId) return null;

  return (
    <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-5 pb-3 pt-1">
      <div className="flex items-center gap-2">
        {envLocked || activeWorktreePath ? (
          <span className="inline-flex items-center gap-1 border border-transparent px-[calc(--spacing(3)-1px)] text-sm font-medium text-muted-foreground/70 sm:text-xs">
            {activeWorktreePath ? (
              <>
                <GitForkIcon className="size-3" />
                Worktree
              </>
            ) : (
              <>
                <FolderIcon className="size-3" />
                Local
              </>
            )}
          </span>
        ) : (
          <Select
            value={effectiveEnvMode}
            onValueChange={(value) => onEnvModeChange(value as EnvMode)}
            items={envModeItems}
          >
            <SelectTrigger
              variant="ghost"
              size="xs"
              className="font-medium text-muted-foreground/70 hover:text-foreground/80"
            >
              {effectiveEnvMode === "worktree" ? (
                <GitForkIcon className="size-3" />
              ) : (
                <FolderIcon className="size-3" />
              )}
              <SelectValue />
            </SelectTrigger>
            <SelectPopup>
              <SelectItem value="local">
                <span className="inline-flex items-center gap-1.5">
                  <FolderIcon className="size-3" />
                  Local
                </span>
              </SelectItem>
              <SelectItem value="worktree">
                <span className="inline-flex items-center gap-1.5">
                  <GitForkIcon className="size-3" />
                  New worktree
                </span>
              </SelectItem>
            </SelectPopup>
          </Select>
        )}
        <RuntimeModeToggle
          runtimeMode={runtimeMode}
          onChange={onRuntimeModeChange}
          size="xs"
          className="text-muted-foreground/70 hover:text-foreground/80"
        />
      </div>

      <BranchToolbarBranchSelector
        environmentId={activeEnvironmentId}
        threadId={threadId}
        envLocked={envLocked}
        {...(!hasServerThread ? { effectiveEnvModeOverride: effectiveEnvMode } : {})}
        {...(onCheckoutPullRequestRequest ? { onCheckoutPullRequestRequest } : {})}
        {...(onComposerFocusRequest ? { onComposerFocusRequest } : {})}
      />
    </div>
  );
}
