import type {
  EnvironmentId,
  MessageId,
  ModelSelection,
  OrchestrationCheckpointSummary,
  OrchestrationEvent,
  OrchestrationLatestTurn,
  OrchestrationMessage,
  OrchestrationProposedPlan,
  OrchestrationReadModel,
  OrchestrationShellSnapshot,
  OrchestrationShellStreamEvent,
  OrchestrationSession,
  OrchestrationSessionStatus,
  OrchestrationThread,
  OrchestrationThreadShell,
  OrchestrationThreadActivity,
  ProjectId,
  ScopedProjectRef,
  ScopedThreadRef,
} from "@t3tools/contracts";
import { DEFAULT_MODEL_BY_PROVIDER, ProviderKind } from "@t3tools/contracts";
import type { ThreadId, TurnId } from "@t3tools/contracts";
import { Schema } from "effect";
import { createModelSelection, resolveModelSlugForProvider } from "@t3tools/shared/model";
import { create } from "zustand";
import {
  type ChatMessage,
  type Project,
  type ProposedPlan,
  type SidebarThreadSummary,
  type Thread,
  type ThreadSession,
  type ThreadShell,
  type ThreadTurnState,
  type TurnDiffSummary,
} from "./types";
import { resolveEnvironmentHttpUrl } from "./environments/runtime";
import { sanitizeThreadErrorMessage } from "./rpc/transportError";
import { getThreadFromEnvironmentState } from "./threadDerivation";
import { inferProviderForThreadModel } from "./threadSelectionDefaults";

export interface EnvironmentState {
  projectIds: ProjectId[];
  projectById: Record<ProjectId, Project>;

  // ---------------------------------------------------------------------------
  // Thread bookkeeping — written by BOTH shell stream and detail stream.
  // Both streams ensure the thread is registered here; the bookkeeping is
  // additive (append-only IDs) so concurrent writes are safe.
  // ---------------------------------------------------------------------------
  threadIds: ThreadId[];
  threadIdsByProjectId: Record<ProjectId, ThreadId[]>;

  // ---------------------------------------------------------------------------
  // Thread shell / session / turn — written by BOTH shell stream and detail
  // stream.  The shell stream is the *authoritative* source (server pre-
  // computes these from the projection pipeline), but the detail stream also
  // writes them so the active thread has up-to-date state even if the shell
  // event hasn't arrived yet.  Structural equality checks in both write
  // functions prevent unnecessary React re-renders when both streams deliver
  // equivalent data.
  // ---------------------------------------------------------------------------
  threadShellById: Record<ThreadId, ThreadShell>;
  threadSessionById: Record<ThreadId, ThreadSession | null>;
  threadTurnStateById: Record<ThreadId, ThreadTurnState>;

  // ---------------------------------------------------------------------------
  // Thread detail content — written ONLY by the detail stream
  // (writeThreadState / syncServerThreadDetail).  The shell stream never
  // touches these.
  // ---------------------------------------------------------------------------
  messageIdsByThreadId: Record<ThreadId, MessageId[]>;
  messageByThreadId: Record<ThreadId, Record<MessageId, ChatMessage>>;
  activityIdsByThreadId: Record<ThreadId, string[]>;
  activityByThreadId: Record<ThreadId, Record<string, OrchestrationThreadActivity>>;
  proposedPlanIdsByThreadId: Record<ThreadId, string[]>;
  proposedPlanByThreadId: Record<ThreadId, Record<string, ProposedPlan>>;
  turnDiffIdsByThreadId: Record<ThreadId, TurnId[]>;
  turnDiffSummaryByThreadId: Record<ThreadId, Record<TurnId, TurnDiffSummary>>;

  // ---------------------------------------------------------------------------
  // Sidebar summary — written ONLY by the shell stream
  // (writeThreadShellState / mapThreadShell).  Pre-computed server-side with
  // fields like latestUserMessageAt, hasPendingApprovals, etc.  The detail
  // stream must NOT write here; the shell stream is the single source of
  // truth for sidebar data.
  // ---------------------------------------------------------------------------
  sidebarThreadSummaryById: Record<ThreadId, SidebarThreadSummary>;

  bootstrapComplete: boolean;
}

export interface AppState {
  activeEnvironmentId: EnvironmentId | null;
  environmentStateById: Record<string, EnvironmentState>;
  projects: Project[];
  threads: Thread[];
  threadsHydrated: boolean;
}

const initialEnvironmentState: EnvironmentState = {
  projectIds: [],
  projectById: {},
  threadIds: [],
  threadIdsByProjectId: {},
  threadShellById: {},
  threadSessionById: {},
  threadTurnStateById: {},
  messageIdsByThreadId: {},
  messageByThreadId: {},
  activityIdsByThreadId: {},
  activityByThreadId: {},
  proposedPlanIdsByThreadId: {},
  proposedPlanByThreadId: {},
  turnDiffIdsByThreadId: {},
  turnDiffSummaryByThreadId: {},
  sidebarThreadSummaryById: {},
  bootstrapComplete: false,
};

const initialState: AppState = {
  activeEnvironmentId: null,
  environmentStateById: {},
  projects: [],
  threads: [],
  threadsHydrated: false,
};

const MAX_THREAD_MESSAGES = 2_000;
const MAX_THREAD_CHECKPOINTS = 500;
const MAX_THREAD_PROPOSED_PLANS = 200;
const MAX_THREAD_ACTIVITIES = 500;
const EMPTY_THREAD_IDS: ThreadId[] = [];

function arraysEqual<T>(left: readonly T[], right: readonly T[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function normalizeModelSelection<T extends { provider: ProviderKind; model: string }>(
  selection: T,
): T {
  return {
    ...selection,
    model: resolveModelSlugForProvider(selection.provider, selection.model),
  };
}

function resolveProjectDefaultModelSelection(input: {
  defaultModelSelection?: ModelSelection | null;
  defaultModel?: string | null | undefined;
}): ModelSelection | null {
  if (input.defaultModelSelection) {
    return normalizeModelSelection(input.defaultModelSelection);
  }
  const rawModel = input.defaultModel;
  if (typeof rawModel !== "string" || rawModel.length === 0) {
    return null;
  }
  const provider = inferProviderForThreadModel({
    model: rawModel,
    sessionProviderName: null,
  });
  return createModelSelection(provider, resolveModelSlugForProvider(provider, rawModel));
}

function resolveThreadModelSelection(input: {
  modelSelection?: ModelSelection;
  model?: string | null | undefined;
  sessionProviderName?: string | null | undefined;
}): ModelSelection {
  if (input.modelSelection) {
    return normalizeModelSelection(input.modelSelection);
  }
  const provider = inferProviderForThreadModel({
    model: input.model,
    sessionProviderName: input.sessionProviderName,
  });
  return createModelSelection(
    provider,
    resolveModelSlugForProvider(
      provider,
      input.model ?? DEFAULT_MODEL_BY_PROVIDER[provider] ?? DEFAULT_MODEL_BY_PROVIDER.codex,
    ),
  );
}

function mapProjectScripts(scripts: ReadonlyArray<Project["scripts"][number]>): Project["scripts"] {
  return scripts.map((script) => ({ ...script }));
}

function mapSession(session: OrchestrationSession): ThreadSession {
  return {
    provider: toLegacyProvider(session.providerName),
    status: toLegacySessionStatus(session.status),
    orchestrationStatus: session.status,
    activeTurnId: session.activeTurnId ?? undefined,
    createdAt: session.updatedAt,
    updatedAt: session.updatedAt,
    ...(session.lastError ? { lastError: session.lastError } : {}),
  };
}

function mapMessage(environmentId: EnvironmentId, message: OrchestrationMessage): ChatMessage {
  const attachments = message.attachments?.map((attachment) => ({
    type: "image" as const,
    id: attachment.id,
    name: attachment.name,
    mimeType: attachment.mimeType,
    sizeBytes: attachment.sizeBytes,
    previewUrl: resolveEnvironmentHttpUrl({
      environmentId,
      pathname: attachmentPreviewRoutePath(attachment.id),
    }),
  }));

  return {
    id: message.id,
    role: message.role,
    text: message.text,
    turnId: message.turnId,
    createdAt: message.createdAt,
    streaming: message.streaming,
    ...(message.streaming ? {} : { completedAt: message.updatedAt }),
    ...(attachments && attachments.length > 0 ? { attachments } : {}),
  };
}

function mapProposedPlan(proposedPlan: OrchestrationProposedPlan): ProposedPlan {
  return {
    id: proposedPlan.id,
    turnId: proposedPlan.turnId,
    planMarkdown: proposedPlan.planMarkdown,
    implementedAt: proposedPlan.implementedAt,
    implementationThreadId: proposedPlan.implementationThreadId,
    createdAt: proposedPlan.createdAt,
    updatedAt: proposedPlan.updatedAt,
  };
}

function mapTurnDiffSummary(checkpoint: OrchestrationCheckpointSummary): TurnDiffSummary {
  return {
    turnId: checkpoint.turnId,
    completedAt: checkpoint.completedAt,
    status: checkpoint.status,
    assistantMessageId: checkpoint.assistantMessageId ?? undefined,
    checkpointTurnCount: checkpoint.checkpointTurnCount,
    checkpointRef: checkpoint.checkpointRef,
    files: checkpoint.files.map((file) => ({ ...file })),
  };
}

function mapProject(
  project:
    | OrchestrationReadModel["projects"][number]
    | OrchestrationShellSnapshot["projects"][number],
  environmentId: EnvironmentId,
): Project {
  const defaultModelSelection = resolveProjectDefaultModelSelection(project);
  return {
    id: project.id,
    environmentId,
    name: project.title,
    cwd: project.workspaceRoot,
    repositoryIdentity: project.repositoryIdentity ?? null,
    defaultModelSelection,
    model: defaultModelSelection?.model ?? DEFAULT_MODEL_BY_PROVIDER.codex,
    defaultModel: defaultModelSelection?.model ?? DEFAULT_MODEL_BY_PROVIDER.codex,
    expanded: true,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    scripts: mapProjectScripts(project.scripts),
  };
}

function mapThread(thread: OrchestrationThread, environmentId: EnvironmentId): Thread {
  const modelSelection = resolveThreadModelSelection({
    modelSelection: thread.modelSelection,
    sessionProviderName: thread.session?.providerName ?? null,
  });
  return {
    id: thread.id,
    environmentId,
    codexThreadId: null,
    projectId: thread.projectId,
    title: thread.title,
    modelSelection,
    model: modelSelection.model,
    runtimeMode: thread.runtimeMode,
    interactionMode: thread.interactionMode,
    session: thread.session ? mapSession(thread.session) : null,
    messages: thread.messages.map((message) => mapMessage(environmentId, message)),
    proposedPlans: thread.proposedPlans.map(mapProposedPlan),
    error: sanitizeThreadErrorMessage(thread.session?.lastError),
    createdAt: thread.createdAt,
    archivedAt: thread.archivedAt,
    updatedAt: thread.updatedAt,
    latestTurn: thread.latestTurn,
    pendingSourceProposedPlan: thread.latestTurn?.sourceProposedPlan,
    lastVisitedAt: undefined,
    branch: thread.branch,
    worktreePath: thread.worktreePath,
    contextWindow: thread.contextWindow ?? null,
    lastAutoRenameUserMessageId: thread.lastAutoRenameUserMessageId ?? null,
    turnDiffSummaries: thread.checkpoints.map(mapTurnDiffSummary),
    activities: thread.activities.map((activity) => ({ ...activity })),
  };
}

function mapThreadShell(
  thread: OrchestrationThreadShell,
  environmentId: EnvironmentId,
): {
  shell: ThreadShell;
  session: ThreadSession | null;
  turnState: ThreadTurnState;
  summary: SidebarThreadSummary;
} {
  const modelSelection = resolveThreadModelSelection({
    modelSelection: thread.modelSelection,
    sessionProviderName: thread.session?.providerName ?? null,
  });
  const shell: ThreadShell = {
    id: thread.id,
    environmentId,
    codexThreadId: null,
    projectId: thread.projectId,
    title: thread.title,
    modelSelection,
    runtimeMode: thread.runtimeMode,
    interactionMode: thread.interactionMode,
    error: sanitizeThreadErrorMessage(thread.session?.lastError),
    createdAt: thread.createdAt,
    archivedAt: thread.archivedAt,
    updatedAt: thread.updatedAt,
    branch: thread.branch,
    worktreePath: thread.worktreePath,
  };
  const session = thread.session ? mapSession(thread.session) : null;
  const turnState: ThreadTurnState = {
    latestTurn: thread.latestTurn,
    pendingSourceProposedPlan: thread.latestTurn?.sourceProposedPlan,
  };
  const summary: SidebarThreadSummary = {
    id: thread.id,
    environmentId,
    projectId: thread.projectId,
    title: thread.title,
    interactionMode: thread.interactionMode,
    session,
    createdAt: thread.createdAt,
    archivedAt: thread.archivedAt,
    updatedAt: thread.updatedAt,
    latestTurn: thread.latestTurn,
    branch: thread.branch,
    worktreePath: thread.worktreePath,
    latestUserMessageAt: thread.latestUserMessageAt,
    hasPendingApprovals: thread.hasPendingApprovals,
    hasPendingUserInput: thread.hasPendingUserInput,
    hasActionableProposedPlan: thread.hasActionableProposedPlan,
  };
  return {
    shell,
    session,
    turnState,
    summary,
  };
}

function toThreadShell(thread: Thread): ThreadShell {
  const modelSelection =
    thread.modelSelection ??
    resolveThreadModelSelection({
      model: thread.model,
      sessionProviderName: thread.session?.provider ?? null,
    });
  return {
    id: thread.id,
    environmentId: thread.environmentId,
    codexThreadId: thread.codexThreadId,
    projectId: thread.projectId,
    title: thread.title,
    modelSelection,
    runtimeMode: thread.runtimeMode,
    interactionMode: thread.interactionMode,
    error: thread.error,
    createdAt: thread.createdAt,
    archivedAt: thread.archivedAt,
    updatedAt: thread.updatedAt,
    branch: thread.branch,
    worktreePath: thread.worktreePath,
  };
}

function toThreadTurnState(thread: Thread): ThreadTurnState {
  return {
    latestTurn: thread.latestTurn,
    ...(thread.pendingSourceProposedPlan
      ? { pendingSourceProposedPlan: thread.pendingSourceProposedPlan }
      : {}),
  };
}

function sourceProposedPlansEqual(
  left: OrchestrationLatestTurn["sourceProposedPlan"] | undefined,
  right: OrchestrationLatestTurn["sourceProposedPlan"] | undefined,
): boolean {
  if (left === right) return true;
  if (left === undefined || right === undefined) return false;
  return left.threadId === right.threadId && left.planId === right.planId;
}

function latestTurnsEqual(
  left: OrchestrationLatestTurn | null | undefined,
  right: OrchestrationLatestTurn | null | undefined,
): boolean {
  if (left === right) return true;
  if (left == null || right == null) return false;
  return (
    left.turnId === right.turnId &&
    left.state === right.state &&
    left.requestedAt === right.requestedAt &&
    left.startedAt === right.startedAt &&
    left.completedAt === right.completedAt &&
    left.assistantMessageId === right.assistantMessageId &&
    sourceProposedPlansEqual(left.sourceProposedPlan, right.sourceProposedPlan)
  );
}

function threadSessionsEqual(
  left: ThreadSession | null | undefined,
  right: ThreadSession | null | undefined,
): boolean {
  if (left === right) return true;
  if (left == null || right == null) return false;
  return (
    left.provider === right.provider &&
    left.status === right.status &&
    left.orchestrationStatus === right.orchestrationStatus &&
    left.activeTurnId === right.activeTurnId &&
    left.createdAt === right.createdAt &&
    left.updatedAt === right.updatedAt &&
    left.lastError === right.lastError
  );
}

function sidebarThreadSummariesEqual(
  left: SidebarThreadSummary | undefined,
  right: SidebarThreadSummary,
): boolean {
  return (
    left !== undefined &&
    left.id === right.id &&
    left.projectId === right.projectId &&
    left.title === right.title &&
    left.interactionMode === right.interactionMode &&
    threadSessionsEqual(left.session, right.session) &&
    left.createdAt === right.createdAt &&
    left.archivedAt === right.archivedAt &&
    left.updatedAt === right.updatedAt &&
    latestTurnsEqual(left.latestTurn, right.latestTurn) &&
    left.branch === right.branch &&
    left.worktreePath === right.worktreePath &&
    left.latestUserMessageAt === right.latestUserMessageAt &&
    left.hasPendingApprovals === right.hasPendingApprovals &&
    left.hasPendingUserInput === right.hasPendingUserInput &&
    left.hasActionableProposedPlan === right.hasActionableProposedPlan
  );
}

function threadShellsEqual(left: ThreadShell | undefined, right: ThreadShell): boolean {
  return (
    left !== undefined &&
    left.id === right.id &&
    left.environmentId === right.environmentId &&
    left.codexThreadId === right.codexThreadId &&
    left.projectId === right.projectId &&
    left.title === right.title &&
    left.modelSelection === right.modelSelection &&
    left.runtimeMode === right.runtimeMode &&
    left.interactionMode === right.interactionMode &&
    left.error === right.error &&
    left.createdAt === right.createdAt &&
    left.archivedAt === right.archivedAt &&
    left.updatedAt === right.updatedAt &&
    left.branch === right.branch &&
    left.worktreePath === right.worktreePath
  );
}

function threadTurnStatesEqual(left: ThreadTurnState | undefined, right: ThreadTurnState): boolean {
  return (
    left !== undefined &&
    latestTurnsEqual(left.latestTurn, right.latestTurn) &&
    sourceProposedPlansEqual(left.pendingSourceProposedPlan, right.pendingSourceProposedPlan)
  );
}

function appendId<T extends string>(ids: readonly T[], id: T): T[] {
  return ids.includes(id) ? [...ids] : [...ids, id];
}

function removeId<T extends string>(ids: readonly T[], id: T): T[] {
  return ids.filter((value) => value !== id);
}

function buildMessageSlice(thread: Thread): {
  ids: MessageId[];
  byId: Record<MessageId, ChatMessage>;
} {
  return {
    ids: thread.messages.map((message) => message.id),
    byId: Object.fromEntries(
      thread.messages.map((message) => [message.id, message] as const),
    ) as Record<MessageId, ChatMessage>,
  };
}

function buildActivitySlice(thread: Thread): {
  ids: string[];
  byId: Record<string, OrchestrationThreadActivity>;
} {
  return {
    ids: thread.activities.map((activity) => activity.id),
    byId: Object.fromEntries(
      thread.activities.map((activity) => [activity.id, activity] as const),
    ) as Record<string, OrchestrationThreadActivity>,
  };
}

function buildProposedPlanSlice(thread: Thread): {
  ids: string[];
  byId: Record<string, ProposedPlan>;
} {
  return {
    ids: thread.proposedPlans.map((plan) => plan.id),
    byId: Object.fromEntries(
      thread.proposedPlans.map((plan) => [plan.id, plan] as const),
    ) as Record<string, ProposedPlan>,
  };
}

function buildTurnDiffSlice(thread: Thread): {
  ids: TurnId[];
  byId: Record<TurnId, TurnDiffSummary>;
} {
  return {
    ids: thread.turnDiffSummaries.map((summary) => summary.turnId),
    byId: Object.fromEntries(
      thread.turnDiffSummaries.map((summary) => [summary.turnId, summary] as const),
    ) as Record<TurnId, TurnDiffSummary>,
  };
}

function getProjects(state: EnvironmentState): Project[] {
  return state.projectIds.flatMap((projectId) => {
    const project = state.projectById[projectId];
    return project ? [project] : [];
  });
}

function getThreads(state: EnvironmentState): Thread[] {
  return state.threadIds.flatMap((threadId) => {
    const thread = getThreadFromEnvironmentState(state, threadId);
    return thread ? [thread] : [];
  });
}

/**
 * Ensure a thread is registered in the bookkeeping indices (threadIds,
 * threadIdsByProjectId).  Shared by both the shell stream and detail stream
 * write paths — the bookkeeping is additive (append-only IDs) so concurrent
 * writes from both streams are safe.
 */
function ensureThreadRegistered(
  state: EnvironmentState,
  threadId: ThreadId,
  nextProjectId: ProjectId,
  previousProjectId: ProjectId | undefined,
): EnvironmentState {
  let nextState = state;

  if (!state.threadIds.includes(threadId)) {
    nextState = {
      ...nextState,
      threadIds: [...nextState.threadIds, threadId],
    };
  }

  if (previousProjectId !== nextProjectId) {
    let threadIdsByProjectId = nextState.threadIdsByProjectId;
    if (previousProjectId) {
      const previousIds = threadIdsByProjectId[previousProjectId] ?? EMPTY_THREAD_IDS;
      const nextIds = removeId(previousIds, threadId);
      if (nextIds.length === 0) {
        const { [previousProjectId]: _removed, ...rest } = threadIdsByProjectId;
        threadIdsByProjectId = rest as Record<ProjectId, ThreadId[]>;
      } else if (!arraysEqual(previousIds, nextIds)) {
        threadIdsByProjectId = {
          ...threadIdsByProjectId,
          [previousProjectId]: nextIds,
        };
      }
    }
    const projectThreadIds = threadIdsByProjectId[nextProjectId] ?? EMPTY_THREAD_IDS;
    const nextProjectThreadIds = appendId(projectThreadIds, threadId);
    if (!arraysEqual(projectThreadIds, nextProjectThreadIds)) {
      threadIdsByProjectId = {
        ...threadIdsByProjectId,
        [nextProjectId]: nextProjectThreadIds,
      };
    }
    if (threadIdsByProjectId !== nextState.threadIdsByProjectId) {
      nextState = {
        ...nextState,
        threadIdsByProjectId,
      };
    }
  }

  return nextState;
}

/**
 * Write thread state from the **detail stream** (per-thread subscription).
 *
 * Owns: messages, activities, proposed plans, turn diff summaries.
 * Also writes threadShellById / threadSessionById / threadTurnStateById so
 * the active thread has up-to-date state even if the shell stream event
 * hasn't arrived yet (both streams use structural equality checks to avoid
 * unnecessary re-renders when delivering equivalent data).
 * Does NOT write sidebarThreadSummaryById — that is shell-stream-only.
 */
function writeThreadState(
  state: EnvironmentState,
  nextThread: Thread,
  previousThread?: Thread,
): EnvironmentState {
  const nextShell = toThreadShell(nextThread);
  const nextTurnState = toThreadTurnState(nextThread);
  const previousShell = state.threadShellById[nextThread.id];
  const previousTurnState = state.threadTurnStateById[nextThread.id];

  let nextState = ensureThreadRegistered(
    state,
    nextThread.id,
    nextThread.projectId,
    previousThread?.projectId,
  );

  if (!threadShellsEqual(previousShell, nextShell)) {
    nextState = {
      ...nextState,
      threadShellById: {
        ...nextState.threadShellById,
        [nextThread.id]: nextShell,
      },
    };
  }

  if (!threadSessionsEqual(previousThread?.session ?? null, nextThread.session)) {
    nextState = {
      ...nextState,
      threadSessionById: {
        ...nextState.threadSessionById,
        [nextThread.id]: nextThread.session,
      },
    };
  }

  if (!threadTurnStatesEqual(previousTurnState, nextTurnState)) {
    nextState = {
      ...nextState,
      threadTurnStateById: {
        ...nextState.threadTurnStateById,
        [nextThread.id]: nextTurnState,
      },
    };
  }

  if (previousThread?.messages !== nextThread.messages) {
    const nextMessageSlice = buildMessageSlice(nextThread);
    nextState = {
      ...nextState,
      messageIdsByThreadId: {
        ...nextState.messageIdsByThreadId,
        [nextThread.id]: nextMessageSlice.ids,
      },
      messageByThreadId: {
        ...nextState.messageByThreadId,
        [nextThread.id]: nextMessageSlice.byId,
      },
    };
  }

  if (previousThread?.activities !== nextThread.activities) {
    const nextActivitySlice = buildActivitySlice(nextThread);
    nextState = {
      ...nextState,
      activityIdsByThreadId: {
        ...nextState.activityIdsByThreadId,
        [nextThread.id]: nextActivitySlice.ids,
      },
      activityByThreadId: {
        ...nextState.activityByThreadId,
        [nextThread.id]: nextActivitySlice.byId,
      },
    };
  }

  if (previousThread?.proposedPlans !== nextThread.proposedPlans) {
    const nextProposedPlanSlice = buildProposedPlanSlice(nextThread);
    nextState = {
      ...nextState,
      proposedPlanIdsByThreadId: {
        ...nextState.proposedPlanIdsByThreadId,
        [nextThread.id]: nextProposedPlanSlice.ids,
      },
      proposedPlanByThreadId: {
        ...nextState.proposedPlanByThreadId,
        [nextThread.id]: nextProposedPlanSlice.byId,
      },
    };
  }

  if (previousThread?.turnDiffSummaries !== nextThread.turnDiffSummaries) {
    const nextTurnDiffSlice = buildTurnDiffSlice(nextThread);
    nextState = {
      ...nextState,
      turnDiffIdsByThreadId: {
        ...nextState.turnDiffIdsByThreadId,
        [nextThread.id]: nextTurnDiffSlice.ids,
      },
      turnDiffSummaryByThreadId: {
        ...nextState.turnDiffSummaryByThreadId,
        [nextThread.id]: nextTurnDiffSlice.byId,
      },
    };
  }

  return nextState;
}

/**
 * Write thread state from the **shell stream** (all-threads subscription).
 *
 * Owns: sidebarThreadSummaryById (pre-computed server-side sidebar data).
 * Also writes threadShellById / threadSessionById / threadTurnStateById as
 * the authoritative source for these fields.  The detail stream may also
 * write them for the focused thread (see writeThreadState); structural
 * equality checks prevent unnecessary re-renders.
 * Does NOT write message/activity/proposedPlan/turnDiff content — that is
 * detail-stream-only.
 */
function writeThreadShellState(
  state: EnvironmentState,
  nextThread: {
    shell: ThreadShell;
    session: ThreadSession | null;
    turnState: ThreadTurnState;
    summary: SidebarThreadSummary;
  },
): EnvironmentState {
  const previousShell = state.threadShellById[nextThread.shell.id];

  let nextState = ensureThreadRegistered(
    state,
    nextThread.shell.id,
    nextThread.shell.projectId,
    previousShell?.projectId,
  );

  if (!threadShellsEqual(previousShell, nextThread.shell)) {
    nextState = {
      ...nextState,
      threadShellById: {
        ...nextState.threadShellById,
        [nextThread.shell.id]: nextThread.shell,
      },
    };
  }

  if (
    !threadSessionsEqual(state.threadSessionById[nextThread.shell.id] ?? null, nextThread.session)
  ) {
    nextState = {
      ...nextState,
      threadSessionById: {
        ...nextState.threadSessionById,
        [nextThread.shell.id]: nextThread.session,
      },
    };
  }

  if (
    !threadTurnStatesEqual(state.threadTurnStateById[nextThread.shell.id], nextThread.turnState)
  ) {
    nextState = {
      ...nextState,
      threadTurnStateById: {
        ...nextState.threadTurnStateById,
        [nextThread.shell.id]: nextThread.turnState,
      },
    };
  }

  if (
    !sidebarThreadSummariesEqual(
      state.sidebarThreadSummaryById[nextThread.shell.id],
      nextThread.summary,
    )
  ) {
    nextState = {
      ...nextState,
      sidebarThreadSummaryById: {
        ...nextState.sidebarThreadSummaryById,
        [nextThread.shell.id]: nextThread.summary,
      },
    };
  }

  return nextState;
}

function retainThreadScopedRecord<T>(
  record: Record<ThreadId, T>,
  nextThreadIds: ReadonlySet<ThreadId>,
): Record<ThreadId, T> {
  return Object.fromEntries(
    Object.entries(record).flatMap(([threadId, value]) =>
      nextThreadIds.has(threadId as ThreadId) ? [[threadId, value] as const] : [],
    ),
  ) as Record<ThreadId, T>;
}

function removeThreadState(state: EnvironmentState, threadId: ThreadId): EnvironmentState {
  const shell = state.threadShellById[threadId];
  if (!shell) {
    return state;
  }

  const nextThreadIds = removeId(state.threadIds, threadId);
  const currentProjectThreadIds = state.threadIdsByProjectId[shell.projectId] ?? EMPTY_THREAD_IDS;
  const nextProjectThreadIds = removeId(currentProjectThreadIds, threadId);
  const nextThreadIdsByProjectId =
    nextProjectThreadIds.length === 0
      ? (() => {
          const { [shell.projectId]: _removed, ...rest } = state.threadIdsByProjectId;
          return rest as Record<ProjectId, ThreadId[]>;
        })()
      : {
          ...state.threadIdsByProjectId,
          [shell.projectId]: nextProjectThreadIds,
        };

  const { [threadId]: _removedShell, ...threadShellById } = state.threadShellById;
  const { [threadId]: _removedSession, ...threadSessionById } = state.threadSessionById;
  const { [threadId]: _removedTurnState, ...threadTurnStateById } = state.threadTurnStateById;
  const { [threadId]: _removedMessageIds, ...messageIdsByThreadId } = state.messageIdsByThreadId;
  const { [threadId]: _removedMessages, ...messageByThreadId } = state.messageByThreadId;
  const { [threadId]: _removedActivityIds, ...activityIdsByThreadId } = state.activityIdsByThreadId;
  const { [threadId]: _removedActivities, ...activityByThreadId } = state.activityByThreadId;
  const { [threadId]: _removedPlanIds, ...proposedPlanIdsByThreadId } =
    state.proposedPlanIdsByThreadId;
  const { [threadId]: _removedPlans, ...proposedPlanByThreadId } = state.proposedPlanByThreadId;
  const { [threadId]: _removedTurnDiffIds, ...turnDiffIdsByThreadId } = state.turnDiffIdsByThreadId;
  const { [threadId]: _removedTurnDiffs, ...turnDiffSummaryByThreadId } =
    state.turnDiffSummaryByThreadId;
  const { [threadId]: _removedSidebarSummary, ...sidebarThreadSummaryById } =
    state.sidebarThreadSummaryById;

  return {
    ...state,
    threadIds: nextThreadIds,
    threadIdsByProjectId: nextThreadIdsByProjectId,
    threadShellById,
    threadSessionById,
    threadTurnStateById,
    messageIdsByThreadId,
    messageByThreadId,
    activityIdsByThreadId,
    activityByThreadId,
    proposedPlanIdsByThreadId,
    proposedPlanByThreadId,
    turnDiffIdsByThreadId,
    turnDiffSummaryByThreadId,
    sidebarThreadSummaryById,
  };
}

function checkpointStatusToLatestTurnState(status: "ready" | "missing" | "error") {
  if (status === "error") {
    return "error" as const;
  }
  if (status === "missing") {
    return "interrupted" as const;
  }
  return "completed" as const;
}

function compareActivities(
  left: Thread["activities"][number],
  right: Thread["activities"][number],
): number {
  if (left.sequence !== undefined && right.sequence !== undefined) {
    if (left.sequence !== right.sequence) {
      return left.sequence - right.sequence;
    }
  } else if (left.sequence !== undefined) {
    return 1;
  } else if (right.sequence !== undefined) {
    return -1;
  }

  return left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id);
}

function buildLatestTurn(params: {
  previous: Thread["latestTurn"];
  turnId: NonNullable<Thread["latestTurn"]>["turnId"];
  state: NonNullable<Thread["latestTurn"]>["state"];
  requestedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  assistantMessageId: NonNullable<Thread["latestTurn"]>["assistantMessageId"];
  sourceProposedPlan?: Thread["pendingSourceProposedPlan"];
}): NonNullable<Thread["latestTurn"]> {
  const resolvedPlan =
    params.previous?.turnId === params.turnId
      ? params.previous.sourceProposedPlan
      : params.sourceProposedPlan;
  return {
    turnId: params.turnId,
    state: params.state,
    requestedAt: params.requestedAt,
    startedAt: params.startedAt,
    completedAt: params.completedAt,
    assistantMessageId: params.assistantMessageId,
    ...(resolvedPlan ? { sourceProposedPlan: resolvedPlan } : {}),
  };
}

function rebindTurnDiffSummariesForAssistantMessage(
  turnDiffSummaries: ReadonlyArray<TurnDiffSummary>,
  turnId: TurnId,
  assistantMessageId: NonNullable<Thread["latestTurn"]>["assistantMessageId"],
): TurnDiffSummary[] {
  let changed = false;
  const nextSummaries = turnDiffSummaries.map((summary) => {
    if (summary.turnId !== turnId || summary.assistantMessageId === assistantMessageId) {
      return summary;
    }
    changed = true;
    return {
      ...summary,
      assistantMessageId: assistantMessageId ?? undefined,
    };
  });
  return changed ? nextSummaries : [...turnDiffSummaries];
}

function retainThreadMessagesAfterRevert(
  messages: ReadonlyArray<ChatMessage>,
  retainedTurnIds: ReadonlySet<string>,
  turnCount: number,
): ChatMessage[] {
  const retainedMessageIds = new Set<string>();
  for (const message of messages) {
    if (message.role === "system") {
      retainedMessageIds.add(message.id);
      continue;
    }
    if (
      message.turnId !== undefined &&
      message.turnId !== null &&
      retainedTurnIds.has(message.turnId)
    ) {
      retainedMessageIds.add(message.id);
    }
  }

  const retainedUserCount = messages.filter(
    (message) => message.role === "user" && retainedMessageIds.has(message.id),
  ).length;
  const missingUserCount = Math.max(0, turnCount - retainedUserCount);
  if (missingUserCount > 0) {
    const fallbackUserMessages = messages
      .filter(
        (message) =>
          message.role === "user" &&
          !retainedMessageIds.has(message.id) &&
          (message.turnId === undefined ||
            message.turnId === null ||
            retainedTurnIds.has(message.turnId)),
      )
      .toSorted(
        (left, right) =>
          left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id),
      )
      .slice(0, missingUserCount);
    for (const message of fallbackUserMessages) {
      retainedMessageIds.add(message.id);
    }
  }

  const retainedAssistantCount = messages.filter(
    (message) => message.role === "assistant" && retainedMessageIds.has(message.id),
  ).length;
  const missingAssistantCount = Math.max(0, turnCount - retainedAssistantCount);
  if (missingAssistantCount > 0) {
    const fallbackAssistantMessages = messages
      .filter(
        (message) =>
          message.role === "assistant" &&
          !retainedMessageIds.has(message.id) &&
          (message.turnId === undefined ||
            message.turnId === null ||
            retainedTurnIds.has(message.turnId)),
      )
      .toSorted(
        (left, right) =>
          left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id),
      )
      .slice(0, missingAssistantCount);
    for (const message of fallbackAssistantMessages) {
      retainedMessageIds.add(message.id);
    }
  }

  return messages.filter((message) => retainedMessageIds.has(message.id));
}

function retainThreadActivitiesAfterRevert(
  activities: ReadonlyArray<OrchestrationThreadActivity>,
  retainedTurnIds: ReadonlySet<string>,
): OrchestrationThreadActivity[] {
  return activities.filter(
    (activity) => activity.turnId === null || retainedTurnIds.has(activity.turnId),
  );
}

function retainThreadProposedPlansAfterRevert(
  proposedPlans: ReadonlyArray<ProposedPlan>,
  retainedTurnIds: ReadonlySet<string>,
): ProposedPlan[] {
  return proposedPlans.filter(
    (proposedPlan) => proposedPlan.turnId === null || retainedTurnIds.has(proposedPlan.turnId),
  );
}

function toLegacySessionStatus(
  status: OrchestrationSessionStatus,
): "connecting" | "ready" | "running" | "error" | "closed" {
  switch (status) {
    case "starting":
      return "connecting";
    case "running":
      return "running";
    case "error":
      return "error";
    case "ready":
    case "interrupted":
      return "ready";
    case "idle":
    case "stopped":
      return "closed";
  }
}

function toLegacyProvider(providerName: string | null): ProviderKind {
  if (Schema.is(ProviderKind)(providerName)) {
    return providerName;
  }
  return "codex";
}

function attachmentPreviewRoutePath(attachmentId: string): string {
  return `/attachments/${encodeURIComponent(attachmentId)}`;
}

function updateThreadState(
  state: EnvironmentState,
  threadId: ThreadId,
  updater: (thread: Thread) => Thread,
): EnvironmentState {
  const currentThread = getThreadFromEnvironmentState(state, threadId);
  if (!currentThread) {
    return state;
  }
  const nextThread = updater(currentThread);
  if (nextThread === currentThread) {
    return state;
  }
  return writeThreadState(state, nextThread, currentThread);
}

function buildProjectState(
  projects: ReadonlyArray<Project>,
): Pick<EnvironmentState, "projectIds" | "projectById"> {
  return {
    projectIds: projects.map((project) => project.id),
    projectById: Object.fromEntries(
      projects.map((project) => [project.id, project] as const),
    ) as Record<ProjectId, Project>,
  };
}

function getEnvironmentStateRecord(
  state: Pick<AppState, "environmentStateById">,
): Record<string, EnvironmentState> {
  return state.environmentStateById ?? {};
}

function resolveCompatibilityEnvironmentId(state: AppState): EnvironmentId | null {
  if (state.activeEnvironmentId) {
    return state.activeEnvironmentId;
  }
  const firstEnvironmentId = Object.keys(getEnvironmentStateRecord(state))[0];
  return (firstEnvironmentId as EnvironmentId | undefined) ?? null;
}

function withLegacyProjection(state: AppState): AppState {
  const environmentStateById = getEnvironmentStateRecord(state);
  const environmentId = resolveCompatibilityEnvironmentId({
    ...state,
    environmentStateById,
  });
  if (!environmentId) {
    return {
      ...state,
      activeEnvironmentId: state.activeEnvironmentId ?? null,
      environmentStateById,
      projects: state.projects ?? [],
      threads: state.threads ?? [],
      threadsHydrated: state.threadsHydrated ?? false,
    };
  }
  const environmentState = environmentStateById[environmentId] ?? initialEnvironmentState;
  return {
    ...state,
    activeEnvironmentId: state.activeEnvironmentId ?? environmentId,
    environmentStateById,
    projects: getProjects(environmentState),
    threads: getThreads(environmentState),
    threadsHydrated: environmentState.bootstrapComplete,
  };
}

function updateLegacyThread(
  threads: ReadonlyArray<Thread>,
  threadId: ThreadId,
  updater: (thread: Thread) => Thread,
): Thread[] {
  let changed = false;
  const nextThreads = threads.map((thread) => {
    if (thread.id !== threadId) {
      return thread;
    }
    const nextThread = updater(thread);
    if (nextThread !== thread) {
      changed = true;
    }
    return nextThread;
  });
  return changed ? nextThreads : [...threads];
}

function mapLegacyProjectsFromReadModel(
  incoming: ReadonlyArray<
    OrchestrationReadModel["projects"][number] & {
      defaultModel?: string | null;
    }
  >,
  previous: ReadonlyArray<Project>,
): Project[] {
  const previousById = new Map(previous.map((project) => [project.id, project] as const));
  const previousByCwd = new Map(previous.map((project) => [project.cwd, project] as const));
  const previousOrderById = new Map(previous.map((project, index) => [project.id, index] as const));
  const previousOrderByCwd = new Map(
    previous.map((project, index) => [project.cwd, index] as const),
  );

  const mappedProjects = incoming.map((project) => {
    const existing = previousById.get(project.id) ?? previousByCwd.get(project.workspaceRoot);
    const defaultModelSelection = resolveProjectDefaultModelSelection(project);
    return {
      id: project.id,
      environmentId: existing?.environmentId ?? ("" as EnvironmentId),
      name: project.title,
      cwd: project.workspaceRoot,
      repositoryIdentity: project.repositoryIdentity ?? existing?.repositoryIdentity ?? null,
      defaultModelSelection,
      model: existing?.model ?? defaultModelSelection?.model ?? DEFAULT_MODEL_BY_PROVIDER.codex,
      defaultModel:
        defaultModelSelection?.model ??
        existing?.defaultModel ??
        existing?.model ??
        DEFAULT_MODEL_BY_PROVIDER.codex,
      expanded: existing?.expanded ?? true,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      scripts: mapProjectScripts(project.scripts),
    } satisfies Project;
  });

  return mappedProjects
    .map((project, incomingIndex) => ({
      project,
      incomingIndex,
      orderIndex:
        previousOrderById.get(project.id) ??
        previousOrderByCwd.get(project.cwd) ??
        previous.length + incomingIndex,
    }))
    .toSorted((left, right) => {
      const byOrder = left.orderIndex - right.orderIndex;
      if (byOrder !== 0) {
        return byOrder;
      }
      return left.incomingIndex - right.incomingIndex;
    })
    .map((entry) => entry.project);
}

function mapLegacyThreadsFromReadModel(
  incoming: ReadonlyArray<
    OrchestrationReadModel["threads"][number] & {
      model?: string | null;
    }
  >,
  previous: ReadonlyArray<Thread>,
): Thread[] {
  const previousById = new Map(previous.map((thread) => [thread.id, thread] as const));
  return incoming.map((thread) => {
    const existing = previousById.get(thread.id);
    const modelSelection = resolveThreadModelSelection({
      modelSelection: thread.modelSelection,
      model: thread.model,
      sessionProviderName: thread.session?.providerName ?? null,
    });
    return {
      id: thread.id,
      environmentId: existing?.environmentId ?? ("" as EnvironmentId),
      codexThreadId: null,
      projectId: thread.projectId,
      title: thread.title,
      modelSelection,
      model: modelSelection.model,
      runtimeMode: thread.runtimeMode,
      interactionMode: thread.interactionMode,
      session: thread.session ? mapSession(thread.session) : null,
      messages: thread.messages.map((message) =>
        mapMessage(existing?.environmentId ?? ("" as EnvironmentId), message),
      ),
      proposedPlans: thread.proposedPlans.map(mapProposedPlan),
      error: sanitizeThreadErrorMessage(thread.session?.lastError),
      createdAt: thread.createdAt,
      archivedAt: thread.archivedAt ?? null,
      updatedAt: thread.updatedAt,
      latestTurn: thread.latestTurn,
      pendingSourceProposedPlan: thread.latestTurn?.sourceProposedPlan,
      lastVisitedAt: existing?.lastVisitedAt,
      branch: thread.branch,
      worktreePath: thread.worktreePath,
      contextWindow: thread.contextWindow ?? null,
      lastAutoRenameUserMessageId: thread.lastAutoRenameUserMessageId ?? null,
      turnDiffSummaries: thread.checkpoints.map(mapTurnDiffSummary),
      activities: thread.activities.map((activity) => ({ ...activity })),
    } satisfies Thread;
  });
}

function getStoredEnvironmentState(
  state: AppState,
  environmentId: EnvironmentId,
): EnvironmentState {
  return getEnvironmentStateRecord(state)[environmentId] ?? initialEnvironmentState;
}

function commitEnvironmentState(
  state: AppState,
  environmentId: EnvironmentId,
  nextEnvironmentState: EnvironmentState,
): AppState {
  const currentEnvironmentState = getEnvironmentStateRecord(state)[environmentId];
  const environmentStateById =
    currentEnvironmentState === nextEnvironmentState
      ? getEnvironmentStateRecord(state)
      : {
          ...getEnvironmentStateRecord(state),
          [environmentId]: nextEnvironmentState,
        };

  if (environmentStateById === getEnvironmentStateRecord(state)) {
    return state;
  }

  return withLegacyProjection({
    ...state,
    environmentStateById,
  });
}

export function markThreadVisited(
  state: AppState,
  threadId: ThreadId,
  visitedAt?: string,
): AppState {
  const nextVisitedAt = visitedAt ?? new Date().toISOString();
  const nextThreads = updateLegacyThread(state.threads ?? [], threadId, (thread) => {
    const currentVisitedAt = thread.lastVisitedAt ? Date.parse(thread.lastVisitedAt) : Number.NaN;
    const requestedVisitedAt = Date.parse(nextVisitedAt);
    if (
      Number.isFinite(currentVisitedAt) &&
      Number.isFinite(requestedVisitedAt) &&
      currentVisitedAt >= requestedVisitedAt
    ) {
      return thread;
    }
    return {
      ...thread,
      lastVisitedAt: nextVisitedAt,
    };
  });
  return nextThreads === state.threads ? state : { ...state, threads: nextThreads };
}

export function markThreadUnread(
  state: AppState,
  threadId: ThreadId,
  latestTurnCompletedAt?: string | null,
): AppState {
  const thread = (state.threads ?? []).find((entry) => entry.id === threadId);
  const completedAt = latestTurnCompletedAt ?? thread?.latestTurn?.completedAt ?? null;
  if (!completedAt) {
    return state;
  }
  const completedAtMs = Date.parse(completedAt);
  if (Number.isNaN(completedAtMs)) {
    return state;
  }
  const unreadVisitedAt = new Date(completedAtMs - 1).toISOString();
  return markThreadVisited(state, threadId, unreadVisitedAt);
}

export function toggleProject(state: AppState, projectId: ProjectId): AppState {
  const nextProjects = (state.projects ?? []).map((project) =>
    project.id === projectId
      ? {
          ...project,
          expanded: !(project.expanded ?? true),
        }
      : project,
  );
  return nextProjects === state.projects ? state : { ...state, projects: nextProjects };
}

export function reorderProjects(
  state: AppState,
  draggedProjectId: ProjectId,
  targetProjectId: ProjectId,
): AppState {
  const projects = [...(state.projects ?? [])];
  const draggedIndex = projects.findIndex((project) => project.id === draggedProjectId);
  const targetIndex = projects.findIndex((project) => project.id === targetProjectId);
  if (draggedIndex < 0 || targetIndex < 0 || draggedIndex === targetIndex) {
    return state;
  }
  const [draggedProject] = projects.splice(draggedIndex, 1);
  if (!draggedProject) {
    return state;
  }
  const adjustedTargetIndex = projects.findIndex((project) => project.id === targetProjectId);
  projects.splice(adjustedTargetIndex + (draggedIndex < targetIndex ? 1 : 0), 0, draggedProject);
  return {
    ...state,
    projects,
  };
}

export function syncServerReadModel(state: AppState, readModel: OrchestrationReadModel): AppState {
  return {
    ...state,
    projects: mapLegacyProjectsFromReadModel(readModel.projects, state.projects ?? []),
    threads: mapLegacyThreadsFromReadModel(readModel.threads, state.threads ?? []),
    threadsHydrated: true,
  };
}

function syncEnvironmentShellSnapshot(
  state: EnvironmentState,
  snapshot: OrchestrationShellSnapshot,
  environmentId: EnvironmentId,
): EnvironmentState {
  const nextProjects = snapshot.projects.map((project) => mapProject(project, environmentId));
  const nextThreadIds = new Set(snapshot.threads.map((thread) => thread.id));
  let nextState: EnvironmentState = {
    ...state,
    ...buildProjectState(nextProjects),
    threadIds: [],
    threadIdsByProjectId: {},
    threadShellById: {},
    threadSessionById: {},
    threadTurnStateById: {},
    sidebarThreadSummaryById: {},
    messageIdsByThreadId: retainThreadScopedRecord(state.messageIdsByThreadId, nextThreadIds),
    messageByThreadId: retainThreadScopedRecord(state.messageByThreadId, nextThreadIds),
    activityIdsByThreadId: retainThreadScopedRecord(state.activityIdsByThreadId, nextThreadIds),
    activityByThreadId: retainThreadScopedRecord(state.activityByThreadId, nextThreadIds),
    proposedPlanIdsByThreadId: retainThreadScopedRecord(
      state.proposedPlanIdsByThreadId,
      nextThreadIds,
    ),
    proposedPlanByThreadId: retainThreadScopedRecord(state.proposedPlanByThreadId, nextThreadIds),
    turnDiffIdsByThreadId: retainThreadScopedRecord(state.turnDiffIdsByThreadId, nextThreadIds),
    turnDiffSummaryByThreadId: retainThreadScopedRecord(
      state.turnDiffSummaryByThreadId,
      nextThreadIds,
    ),
    bootstrapComplete: true,
  };

  for (const thread of snapshot.threads) {
    nextState = writeThreadShellState(nextState, mapThreadShell(thread, environmentId));
  }

  return nextState;
}

export function syncServerShellSnapshot(
  state: AppState,
  snapshot: OrchestrationShellSnapshot,
  environmentId: EnvironmentId,
): AppState {
  return commitEnvironmentState(
    state,
    environmentId,
    syncEnvironmentShellSnapshot(
      getStoredEnvironmentState(state, environmentId),
      snapshot,
      environmentId,
    ),
  );
}

export function syncServerThreadDetail(
  state: AppState,
  thread: OrchestrationThread,
  environmentId: EnvironmentId,
): AppState {
  const environmentState = getStoredEnvironmentState(state, environmentId);
  const previousThread = getThreadFromEnvironmentState(environmentState, thread.id);
  return commitEnvironmentState(
    state,
    environmentId,
    writeThreadState(environmentState, mapThread(thread, environmentId), previousThread),
  );
}

function applyEnvironmentOrchestrationEvent(
  state: EnvironmentState,
  event: OrchestrationEvent,
  environmentId: EnvironmentId,
): EnvironmentState {
  switch (event.type) {
    case "project.created": {
      const nextProject = mapProject(
        {
          id: event.payload.projectId,
          title: event.payload.title,
          workspaceRoot: event.payload.workspaceRoot,
          repositoryIdentity: event.payload.repositoryIdentity ?? null,
          defaultModelSelection: event.payload.defaultModelSelection,
          scripts: event.payload.scripts,
          createdAt: event.payload.createdAt,
          updatedAt: event.payload.updatedAt,
          deletedAt: null,
        },
        environmentId,
      );
      const existingProjectId =
        state.projectIds.find(
          (projectId) =>
            projectId === event.payload.projectId ||
            state.projectById[projectId]?.cwd === event.payload.workspaceRoot,
        ) ?? null;
      let projectById = state.projectById;
      let projectIds = state.projectIds;

      if (existingProjectId !== null && existingProjectId !== nextProject.id) {
        const { [existingProjectId]: _removedProject, ...restProjectById } = state.projectById;
        projectById = {
          ...restProjectById,
          [nextProject.id]: nextProject,
        };
        projectIds = state.projectIds.map((projectId) =>
          projectId === existingProjectId ? nextProject.id : projectId,
        );
      } else {
        projectById = {
          ...state.projectById,
          [nextProject.id]: nextProject,
        };
        projectIds =
          existingProjectId === null && !state.projectIds.includes(nextProject.id)
            ? [...state.projectIds, nextProject.id]
            : state.projectIds;
      }

      return {
        ...state,
        projectById,
        projectIds,
      };
    }

    case "project.meta-updated": {
      const project = state.projectById[event.payload.projectId];
      if (!project) {
        return state;
      }
      const nextProject: Project = {
        ...project,
        ...(event.payload.title !== undefined ? { name: event.payload.title } : {}),
        ...(event.payload.workspaceRoot !== undefined ? { cwd: event.payload.workspaceRoot } : {}),
        ...(event.payload.repositoryIdentity !== undefined
          ? { repositoryIdentity: event.payload.repositoryIdentity ?? null }
          : {}),
        ...(event.payload.defaultModelSelection !== undefined
          ? {
              defaultModelSelection: event.payload.defaultModelSelection
                ? normalizeModelSelection(event.payload.defaultModelSelection)
                : null,
            }
          : {}),
        ...(event.payload.scripts !== undefined
          ? { scripts: mapProjectScripts(event.payload.scripts) }
          : {}),
        updatedAt: event.payload.updatedAt,
      };
      return {
        ...state,
        projectById: {
          ...state.projectById,
          [event.payload.projectId]: nextProject,
        },
      };
    }

    case "project.deleted": {
      if (!state.projectById[event.payload.projectId]) {
        return state;
      }
      const { [event.payload.projectId]: _removedProject, ...projectById } = state.projectById;
      return {
        ...state,
        projectById,
        projectIds: removeId(state.projectIds, event.payload.projectId),
      };
    }

    case "thread.created": {
      const previousThread = getThreadFromEnvironmentState(state, event.payload.threadId);
      const nextThread = mapThread(
        {
          id: event.payload.threadId,
          projectId: event.payload.projectId,
          title: event.payload.title,
          modelSelection: event.payload.modelSelection,
          runtimeMode: event.payload.runtimeMode,
          interactionMode: event.payload.interactionMode,
          branch: event.payload.branch,
          worktreePath: event.payload.worktreePath,
          latestTurn: null,
          createdAt: event.payload.createdAt,
          updatedAt: event.payload.updatedAt,
          archivedAt: null,
          deletedAt: null,
          messages: [],
          lastAutoRenameUserMessageId: null,
          proposedPlans: [],
          contextWindow: null,
          activities: [],
          checkpoints: [],
          session: null,
        },
        environmentId,
      );
      return writeThreadState(state, nextThread, previousThread);
    }

    case "thread.deleted":
      return removeThreadState(state, event.payload.threadId);

    case "thread.archived":
      return updateThreadState(state, event.payload.threadId, (thread) => ({
        ...thread,
        archivedAt: event.payload.archivedAt,
        updatedAt: event.payload.updatedAt,
      }));

    case "thread.unarchived":
      return updateThreadState(state, event.payload.threadId, (thread) => ({
        ...thread,
        archivedAt: null,
        updatedAt: event.payload.updatedAt,
      }));

    case "thread.meta-updated":
      return updateThreadState(state, event.payload.threadId, (thread) => ({
        ...thread,
        ...(event.payload.title !== undefined ? { title: event.payload.title } : {}),
        ...(event.payload.modelSelection !== undefined
          ? { modelSelection: normalizeModelSelection(event.payload.modelSelection) }
          : {}),
        ...(event.payload.branch !== undefined ? { branch: event.payload.branch } : {}),
        ...(event.payload.worktreePath !== undefined
          ? { worktreePath: event.payload.worktreePath }
          : {}),
        updatedAt: event.payload.updatedAt,
      }));

    case "thread.runtime-mode-set":
      return updateThreadState(state, event.payload.threadId, (thread) => ({
        ...thread,
        runtimeMode: event.payload.runtimeMode,
        updatedAt: event.payload.updatedAt,
      }));

    case "thread.interaction-mode-set":
      return updateThreadState(state, event.payload.threadId, (thread) => ({
        ...thread,
        interactionMode: event.payload.interactionMode,
        updatedAt: event.payload.updatedAt,
      }));

    case "thread.turn-start-requested":
      return updateThreadState(state, event.payload.threadId, (thread) => ({
        ...thread,
        ...(event.payload.modelSelection !== undefined
          ? { modelSelection: normalizeModelSelection(event.payload.modelSelection) }
          : {}),
        runtimeMode: event.payload.runtimeMode,
        interactionMode: event.payload.interactionMode,
        pendingSourceProposedPlan: event.payload.sourceProposedPlan,
        updatedAt: event.occurredAt,
      }));

    case "thread.turn-interrupt-requested": {
      if (event.payload.turnId === undefined) {
        return state;
      }
      return updateThreadState(state, event.payload.threadId, (thread) => {
        const latestTurn = thread.latestTurn;
        if (latestTurn === null || latestTurn.turnId !== event.payload.turnId) {
          return thread;
        }
        return {
          ...thread,
          latestTurn: buildLatestTurn({
            previous: latestTurn,
            turnId: event.payload.turnId,
            state: "interrupted",
            requestedAt: latestTurn.requestedAt,
            startedAt: latestTurn.startedAt ?? event.payload.createdAt,
            completedAt: latestTurn.completedAt ?? event.payload.createdAt,
            assistantMessageId: latestTurn.assistantMessageId,
          }),
          updatedAt: event.occurredAt,
        };
      });
    }

    case "thread.message-sent":
      return updateThreadState(state, event.payload.threadId, (thread) => {
        const message = mapMessage(thread.environmentId, {
          id: event.payload.messageId,
          role: event.payload.role,
          text: event.payload.text,
          ...(event.payload.attachments !== undefined
            ? { attachments: event.payload.attachments }
            : {}),
          turnId: event.payload.turnId,
          streaming: event.payload.streaming,
          createdAt: event.payload.createdAt,
          updatedAt: event.payload.updatedAt,
        });
        const existingMessage = thread.messages.find((entry) => entry.id === message.id);
        const messages = existingMessage
          ? thread.messages.map((entry) =>
              entry.id !== message.id
                ? entry
                : {
                    ...entry,
                    text: message.streaming
                      ? `${entry.text}${message.text}`
                      : message.text.length > 0
                        ? message.text
                        : entry.text,
                    streaming: message.streaming,
                    ...(message.turnId !== undefined ? { turnId: message.turnId } : {}),
                    ...(message.streaming
                      ? entry.completedAt !== undefined
                        ? { completedAt: entry.completedAt }
                        : {}
                      : message.completedAt !== undefined
                        ? { completedAt: message.completedAt }
                        : {}),
                    ...(message.attachments !== undefined
                      ? { attachments: message.attachments }
                      : {}),
                  },
            )
          : [...thread.messages, message];
        const cappedMessages = messages.slice(-MAX_THREAD_MESSAGES);
        const turnDiffSummaries =
          event.payload.role === "assistant" && event.payload.turnId !== null
            ? rebindTurnDiffSummariesForAssistantMessage(
                thread.turnDiffSummaries,
                event.payload.turnId,
                event.payload.messageId,
              )
            : thread.turnDiffSummaries;
        const latestTurn: Thread["latestTurn"] =
          event.payload.role === "assistant" &&
          event.payload.turnId !== null &&
          (thread.latestTurn === null || thread.latestTurn.turnId === event.payload.turnId)
            ? buildLatestTurn({
                previous: thread.latestTurn,
                turnId: event.payload.turnId,
                state: event.payload.streaming
                  ? "running"
                  : thread.latestTurn?.state === "interrupted"
                    ? "interrupted"
                    : thread.latestTurn?.state === "error"
                      ? "error"
                      : "completed",
                requestedAt:
                  thread.latestTurn?.turnId === event.payload.turnId
                    ? thread.latestTurn.requestedAt
                    : event.payload.createdAt,
                startedAt:
                  thread.latestTurn?.turnId === event.payload.turnId
                    ? (thread.latestTurn.startedAt ?? event.payload.createdAt)
                    : event.payload.createdAt,
                sourceProposedPlan: thread.pendingSourceProposedPlan,
                completedAt: event.payload.streaming
                  ? thread.latestTurn?.turnId === event.payload.turnId
                    ? (thread.latestTurn.completedAt ?? null)
                    : null
                  : event.payload.updatedAt,
                assistantMessageId: event.payload.messageId,
              })
            : thread.latestTurn;
        return {
          ...thread,
          messages: cappedMessages,
          turnDiffSummaries,
          latestTurn,
          updatedAt: event.occurredAt,
        };
      });

    case "thread.session-set":
      return updateThreadState(state, event.payload.threadId, (thread) => ({
        ...thread,
        session: mapSession(event.payload.session),
        error: sanitizeThreadErrorMessage(event.payload.session.lastError),
        latestTurn:
          event.payload.session.status === "running" && event.payload.session.activeTurnId !== null
            ? buildLatestTurn({
                previous: thread.latestTurn,
                turnId: event.payload.session.activeTurnId,
                state: "running",
                requestedAt:
                  thread.latestTurn?.turnId === event.payload.session.activeTurnId
                    ? thread.latestTurn.requestedAt
                    : event.payload.session.updatedAt,
                startedAt:
                  thread.latestTurn?.turnId === event.payload.session.activeTurnId
                    ? (thread.latestTurn.startedAt ?? event.payload.session.updatedAt)
                    : event.payload.session.updatedAt,
                completedAt: null,
                assistantMessageId:
                  thread.latestTurn?.turnId === event.payload.session.activeTurnId
                    ? thread.latestTurn.assistantMessageId
                    : null,
                sourceProposedPlan: thread.pendingSourceProposedPlan,
              })
            : thread.latestTurn,
        updatedAt: event.occurredAt,
      }));

    case "thread.session-stop-requested":
      return updateThreadState(state, event.payload.threadId, (thread) =>
        thread.session === null
          ? thread
          : {
              ...thread,
              session: {
                ...thread.session,
                status: "closed",
                orchestrationStatus: "stopped",
                activeTurnId: undefined,
                updatedAt: event.payload.createdAt,
              },
              updatedAt: event.occurredAt,
            },
      );

    case "thread.proposed-plan-upserted":
      return updateThreadState(state, event.payload.threadId, (thread) => {
        const proposedPlan = mapProposedPlan(event.payload.proposedPlan);
        const proposedPlans = [
          ...thread.proposedPlans.filter((entry) => entry.id !== proposedPlan.id),
          proposedPlan,
        ]
          .toSorted(
            (left, right) =>
              left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id),
          )
          .slice(-MAX_THREAD_PROPOSED_PLANS);
        return {
          ...thread,
          proposedPlans,
          updatedAt: event.occurredAt,
        };
      });

    case "thread.turn-diff-completed":
      return updateThreadState(state, event.payload.threadId, (thread) => {
        const checkpoint = mapTurnDiffSummary({
          turnId: event.payload.turnId,
          checkpointTurnCount: event.payload.checkpointTurnCount,
          checkpointRef: event.payload.checkpointRef,
          status: event.payload.status,
          files: event.payload.files,
          assistantMessageId: event.payload.assistantMessageId,
          completedAt: event.payload.completedAt,
        });
        const existing = thread.turnDiffSummaries.find(
          (entry) => entry.turnId === checkpoint.turnId,
        );
        if (existing && existing.status !== "missing" && checkpoint.status === "missing") {
          return thread;
        }
        const turnDiffSummaries = [
          ...thread.turnDiffSummaries.filter((entry) => entry.turnId !== checkpoint.turnId),
          checkpoint,
        ]
          .toSorted(
            (left, right) =>
              (left.checkpointTurnCount ?? Number.MAX_SAFE_INTEGER) -
              (right.checkpointTurnCount ?? Number.MAX_SAFE_INTEGER),
          )
          .slice(-MAX_THREAD_CHECKPOINTS);
        const latestTurn =
          thread.latestTurn === null || thread.latestTurn.turnId === event.payload.turnId
            ? buildLatestTurn({
                previous: thread.latestTurn,
                turnId: event.payload.turnId,
                state: checkpointStatusToLatestTurnState(event.payload.status),
                requestedAt: thread.latestTurn?.requestedAt ?? event.payload.completedAt,
                startedAt: thread.latestTurn?.startedAt ?? event.payload.completedAt,
                completedAt: event.payload.completedAt,
                assistantMessageId: event.payload.assistantMessageId,
                sourceProposedPlan: thread.pendingSourceProposedPlan,
              })
            : thread.latestTurn;
        return {
          ...thread,
          turnDiffSummaries,
          latestTurn,
          updatedAt: event.occurredAt,
        };
      });

    case "thread.reverted":
      return updateThreadState(state, event.payload.threadId, (thread) => {
        const turnDiffSummaries = thread.turnDiffSummaries
          .filter(
            (entry) =>
              entry.checkpointTurnCount !== undefined &&
              entry.checkpointTurnCount <= event.payload.turnCount,
          )
          .toSorted(
            (left, right) =>
              (left.checkpointTurnCount ?? Number.MAX_SAFE_INTEGER) -
              (right.checkpointTurnCount ?? Number.MAX_SAFE_INTEGER),
          )
          .slice(-MAX_THREAD_CHECKPOINTS);
        const retainedTurnIds = new Set(turnDiffSummaries.map((entry) => entry.turnId));
        const messages = retainThreadMessagesAfterRevert(
          thread.messages,
          retainedTurnIds,
          event.payload.turnCount,
        ).slice(-MAX_THREAD_MESSAGES);
        const proposedPlans = retainThreadProposedPlansAfterRevert(
          thread.proposedPlans,
          retainedTurnIds,
        ).slice(-MAX_THREAD_PROPOSED_PLANS);
        const activities = retainThreadActivitiesAfterRevert(thread.activities, retainedTurnIds);
        const latestCheckpoint = turnDiffSummaries.at(-1) ?? null;

        return {
          ...thread,
          turnDiffSummaries,
          messages,
          proposedPlans,
          activities,
          pendingSourceProposedPlan: undefined,
          latestTurn:
            latestCheckpoint === null
              ? null
              : {
                  turnId: latestCheckpoint.turnId,
                  state: checkpointStatusToLatestTurnState(
                    (latestCheckpoint.status ?? "ready") as "ready" | "missing" | "error",
                  ),
                  requestedAt: latestCheckpoint.completedAt,
                  startedAt: latestCheckpoint.completedAt,
                  completedAt: latestCheckpoint.completedAt,
                  assistantMessageId: latestCheckpoint.assistantMessageId ?? null,
                },
          updatedAt: event.occurredAt,
        };
      });

    case "thread.activity-appended":
      return updateThreadState(state, event.payload.threadId, (thread) => {
        const activities = [
          ...thread.activities.filter((activity) => activity.id !== event.payload.activity.id),
          { ...event.payload.activity },
        ]
          .toSorted(compareActivities)
          .slice(-MAX_THREAD_ACTIVITIES);
        return {
          ...thread,
          activities,
          updatedAt: event.occurredAt,
        };
      });

    case "thread.approval-response-requested":
    case "thread.user-input-response-requested":
      return state;
  }

  return state;
}

function applyEnvironmentShellEvent(
  state: EnvironmentState,
  event: OrchestrationShellStreamEvent,
  environmentId: EnvironmentId,
): EnvironmentState {
  switch (event.kind) {
    case "project-upserted": {
      const nextProject = mapProject(event.project, environmentId);
      const existingProjectId =
        state.projectIds.find(
          (projectId) =>
            projectId === event.project.id ||
            state.projectById[projectId]?.cwd === event.project.workspaceRoot,
        ) ?? null;
      let projectById = state.projectById;
      let projectIds = state.projectIds;

      if (existingProjectId !== null && existingProjectId !== nextProject.id) {
        const { [existingProjectId]: _removedProject, ...restProjectById } = state.projectById;
        projectById = {
          ...restProjectById,
          [nextProject.id]: nextProject,
        };
        projectIds = state.projectIds.map((projectId) =>
          projectId === existingProjectId ? nextProject.id : projectId,
        );
      } else {
        projectById = {
          ...state.projectById,
          [nextProject.id]: nextProject,
        };
        projectIds =
          existingProjectId === null && !state.projectIds.includes(nextProject.id)
            ? [...state.projectIds, nextProject.id]
            : state.projectIds;
      }

      return {
        ...state,
        projectById,
        projectIds,
      };
    }
    case "project-removed": {
      if (!state.projectById[event.projectId]) {
        return state;
      }
      const { [event.projectId]: _removedProject, ...projectById } = state.projectById;
      return {
        ...state,
        projectById,
        projectIds: removeId(state.projectIds, event.projectId),
      };
    }
    case "thread-upserted":
      return writeThreadShellState(state, mapThreadShell(event.thread, environmentId));
    case "thread-removed":
      return removeThreadState(state, event.threadId);
  }
}

export function applyOrchestrationEvents(
  state: AppState,
  events: ReadonlyArray<OrchestrationEvent>,
  environmentId: EnvironmentId,
): AppState {
  if (events.length === 0) {
    return state;
  }
  const currentEnvironmentState = getStoredEnvironmentState(state, environmentId);
  const nextEnvironmentState = events.reduce(
    (nextState, event) => applyEnvironmentOrchestrationEvent(nextState, event, environmentId),
    currentEnvironmentState,
  );
  return commitEnvironmentState(state, environmentId, nextEnvironmentState);
}

function getEnvironmentEntries(
  state: AppState,
): ReadonlyArray<readonly [EnvironmentId, EnvironmentState]> {
  return Object.entries(state.environmentStateById) as unknown as ReadonlyArray<
    readonly [EnvironmentId, EnvironmentState]
  >;
}

export function selectEnvironmentState(
  state: AppState,
  environmentId: EnvironmentId | null | undefined,
): EnvironmentState {
  return environmentId ? getStoredEnvironmentState(state, environmentId) : initialEnvironmentState;
}

export function selectProjectsForEnvironment(
  state: AppState,
  environmentId: EnvironmentId | null | undefined,
): Project[] {
  return getProjects(selectEnvironmentState(state, environmentId));
}

export function selectThreadsForEnvironment(
  state: AppState,
  environmentId: EnvironmentId | null | undefined,
): Thread[] {
  return getThreads(selectEnvironmentState(state, environmentId));
}

export function selectProjectsAcrossEnvironments(state: AppState): Project[] {
  return getEnvironmentEntries(state).flatMap(([, environmentState]) =>
    getProjects(environmentState),
  );
}

export function selectThreadsAcrossEnvironments(state: AppState): Thread[] {
  return getEnvironmentEntries(state).flatMap(([, environmentState]) =>
    getThreads(environmentState),
  );
}

/** Like `selectThreadsAcrossEnvironments` but returns stable `ThreadShell` references from the store (no derived data). */
export function selectThreadShellsAcrossEnvironments(state: AppState): ThreadShell[] {
  return getEnvironmentEntries(state).flatMap(([, environmentState]) =>
    environmentState.threadIds.flatMap((threadId) => {
      const shell = environmentState.threadShellById[threadId];
      return shell ? [shell] : [];
    }),
  );
}

export function selectSidebarThreadsAcrossEnvironments(state: AppState): SidebarThreadSummary[] {
  return getEnvironmentEntries(state).flatMap(([environmentId, environmentState]) =>
    environmentState.threadIds.flatMap((threadId) => {
      const thread = environmentState.sidebarThreadSummaryById[threadId];
      return thread && thread.environmentId === environmentId ? [thread] : [];
    }),
  );
}

export function selectSidebarThreadsForProjectRef(
  state: AppState,
  ref: ScopedProjectRef | null | undefined,
): SidebarThreadSummary[] {
  if (!ref) {
    return [];
  }

  const environmentState = selectEnvironmentState(state, ref.environmentId);
  const threadIds = environmentState.threadIdsByProjectId[ref.projectId] ?? EMPTY_THREAD_IDS;
  return threadIds.flatMap((threadId) => {
    const thread = environmentState.sidebarThreadSummaryById[threadId];
    return thread ? [thread] : [];
  });
}

export function selectSidebarThreadsForProjectRefs(
  state: AppState,
  refs: readonly ScopedProjectRef[],
): SidebarThreadSummary[] {
  if (refs.length === 0) return [];
  if (refs.length === 1) return selectSidebarThreadsForProjectRef(state, refs[0]);
  return refs.flatMap((ref) => selectSidebarThreadsForProjectRef(state, ref));
}

export function selectBootstrapCompleteForActiveEnvironment(state: AppState): boolean {
  return selectEnvironmentState(state, state.activeEnvironmentId).bootstrapComplete;
}

export function selectProjectByRef(
  state: AppState,
  ref: ScopedProjectRef | null | undefined,
): Project | undefined {
  return ref
    ? selectEnvironmentState(state, ref.environmentId).projectById[ref.projectId]
    : undefined;
}

export function selectThreadByRef(
  state: AppState,
  ref: ScopedThreadRef | null | undefined,
): Thread | undefined {
  return ref
    ? getThreadFromEnvironmentState(selectEnvironmentState(state, ref.environmentId), ref.threadId)
    : undefined;
}

export function selectThreadExistsByRef(
  state: AppState,
  ref: ScopedThreadRef | null | undefined,
): boolean {
  return ref
    ? selectEnvironmentState(state, ref.environmentId).threadShellById[ref.threadId] !== undefined
    : false;
}

export function selectSidebarThreadSummaryByRef(
  state: AppState,
  ref: ScopedThreadRef | null | undefined,
): SidebarThreadSummary | undefined {
  return ref
    ? selectEnvironmentState(state, ref.environmentId).sidebarThreadSummaryById[ref.threadId]
    : undefined;
}

export function selectThreadIdsByProjectRef(
  state: AppState,
  ref: ScopedProjectRef | null | undefined,
): ThreadId[] {
  return ref
    ? (selectEnvironmentState(state, ref.environmentId).threadIdsByProjectId[ref.projectId] ??
        EMPTY_THREAD_IDS)
    : EMPTY_THREAD_IDS;
}

export function setError(state: AppState, threadId: ThreadId, error: string | null): AppState {
  if (state.activeEnvironmentId === null) {
    return state;
  }

  const nextEnvironmentState = updateThreadState(
    getStoredEnvironmentState(state, state.activeEnvironmentId),
    threadId,
    (thread) => {
      if (thread.error === error) return thread;
      return { ...thread, error };
    },
  );
  return commitEnvironmentState(state, state.activeEnvironmentId, nextEnvironmentState);
}

export function applyOrchestrationEvent(
  state: AppState,
  event: OrchestrationEvent,
  environmentId: EnvironmentId,
): AppState {
  return commitEnvironmentState(
    state,
    environmentId,
    applyEnvironmentOrchestrationEvent(
      getStoredEnvironmentState(state, environmentId),
      event,
      environmentId,
    ),
  );
}

export function applyShellEvent(
  state: AppState,
  event: OrchestrationShellStreamEvent,
  environmentId: EnvironmentId,
): AppState {
  return commitEnvironmentState(
    state,
    environmentId,
    applyEnvironmentShellEvent(
      getStoredEnvironmentState(state, environmentId),
      event,
      environmentId,
    ),
  );
}

export function setActiveEnvironmentId(state: AppState, environmentId: EnvironmentId): AppState {
  if ((state.activeEnvironmentId ?? null) === environmentId) {
    return state;
  }

  return withLegacyProjection({
    ...state,
    activeEnvironmentId: environmentId,
  });
}

export function setThreadBranch(
  state: AppState,
  threadRef: ScopedThreadRef | ThreadId,
  branch: string | null,
  worktreePath: string | null,
): AppState {
  const resolvedThreadRef =
    typeof threadRef === "string"
      ? getEnvironmentEntries(withLegacyProjection(state)).find(([, environmentState]) =>
          environmentState.threadIds.includes(threadRef),
        )?.[0]
      : threadRef.environmentId;
  const nextThreadRef =
    typeof threadRef === "string"
      ? resolvedThreadRef
        ? ({
            environmentId: resolvedThreadRef,
            threadId: threadRef,
          } satisfies ScopedThreadRef)
        : null
      : threadRef;
  if (!nextThreadRef) {
    return state;
  }
  const nextEnvironmentState = updateThreadState(
    getStoredEnvironmentState(state, nextThreadRef.environmentId),
    nextThreadRef.threadId,
    (thread) => {
      if (thread.branch === branch && thread.worktreePath === worktreePath) return thread;
      const cwdChanged = thread.worktreePath !== worktreePath;
      return {
        ...thread,
        branch,
        worktreePath,
        ...(cwdChanged ? { session: null } : {}),
      };
    },
  );
  return commitEnvironmentState(state, nextThreadRef.environmentId, nextEnvironmentState);
}

interface AppStore extends AppState {
  setActiveEnvironmentId: (environmentId: EnvironmentId) => void;
  markThreadVisited: (threadId: ThreadId, visitedAt?: string) => void;
  markThreadUnread: (threadId: ThreadId, latestTurnCompletedAt?: string | null) => void;
  syncServerReadModel: (readModel: OrchestrationReadModel) => void;
  toggleProject: (projectId: ProjectId) => void;
  reorderProjects: (draggedProjectId: ProjectId, targetProjectId: ProjectId) => void;
  syncServerShellSnapshot: (
    snapshot: OrchestrationShellSnapshot,
    environmentId: EnvironmentId,
  ) => void;
  syncServerThreadDetail: (thread: OrchestrationThread, environmentId: EnvironmentId) => void;
  applyOrchestrationEvent: (event: OrchestrationEvent, environmentId: EnvironmentId) => void;
  applyOrchestrationEvents: (
    events: ReadonlyArray<OrchestrationEvent>,
    environmentId: EnvironmentId,
  ) => void;
  applyShellEvent: (event: OrchestrationShellStreamEvent, environmentId: EnvironmentId) => void;
  setError: (threadId: ThreadId, error: string | null) => void;
  setThreadBranch: (
    threadRef: ScopedThreadRef | ThreadId,
    branch: string | null,
    worktreePath: string | null,
  ) => void;
}

export const useStore = create<AppStore>((set) => ({
  ...initialState,
  setActiveEnvironmentId: (environmentId) =>
    set((state) => setActiveEnvironmentId(state, environmentId)),
  markThreadVisited: (threadId, visitedAt) =>
    set((state) => markThreadVisited(state, threadId, visitedAt)),
  markThreadUnread: (threadId, latestTurnCompletedAt) =>
    set((state) => markThreadUnread(state, threadId, latestTurnCompletedAt)),
  syncServerReadModel: (readModel) => set((state) => syncServerReadModel(state, readModel)),
  toggleProject: (projectId) => set((state) => toggleProject(state, projectId)),
  reorderProjects: (draggedProjectId, targetProjectId) =>
    set((state) => reorderProjects(state, draggedProjectId, targetProjectId)),
  syncServerShellSnapshot: (snapshot, environmentId) =>
    set((state) => syncServerShellSnapshot(state, snapshot, environmentId)),
  syncServerThreadDetail: (thread, environmentId) =>
    set((state) => syncServerThreadDetail(state, thread, environmentId)),
  applyOrchestrationEvent: (event, environmentId) =>
    set((state) => applyOrchestrationEvent(state, event, environmentId)),
  applyOrchestrationEvents: (events, environmentId) =>
    set((state) => applyOrchestrationEvents(state, events, environmentId)),
  applyShellEvent: (event, environmentId) =>
    set((state) => applyShellEvent(state, event, environmentId)),
  setError: (threadId, error) => set((state) => setError(state, threadId, error)),
  setThreadBranch: (threadRef, branch, worktreePath) =>
    set((state) => setThreadBranch(state, threadRef, branch, worktreePath)),
}));
