// Production CSS is part of the behavior under test because row height depends on it.
import "../index.css";

import {
  type EventId,
  ORCHESTRATION_WS_METHODS,
  type MessageId,
  type OrchestrationReadModel,
  type ProjectId,
  type ProjectScript,
  type ServerConfig,
  type ThreadId,
  type TurnId,
  type WsWelcomePayload,
  WS_CHANNELS,
  WS_METHODS,
} from "@t3tools/contracts";
import { RouterProvider, createMemoryHistory } from "@tanstack/react-router";
import { HttpResponse, http, ws } from "msw";
import { setupWorker } from "msw/browser";
import { page } from "vitest/browser";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";

import { useComposerDraftStore } from "../composerDraftStore";
import { getRouter } from "../router";
import { useStore } from "../store";
import { useTerminalStateStore } from "../terminalStateStore";
import { estimateTimelineMessageHeight } from "./timelineHeight";

const THREAD_ID = "thread-browser-test" as ThreadId;
const PROJECT_ID = "project-1" as ProjectId;
const NOW_ISO = "2026-03-04T12:00:00.000Z";
const BASE_TIME_MS = Date.parse(NOW_ISO);
const ATTACHMENT_SVG = "<svg xmlns='http://www.w3.org/2000/svg' width='120' height='300'></svg>";

interface WsRequestEnvelope {
  id: string;
  body: {
    _tag: string;
    [key: string]: unknown;
  };
}

interface TestFixture {
  snapshot: OrchestrationReadModel;
  serverConfig: ServerConfig;
  welcome: WsWelcomePayload;
  projectFiles?: Record<string, string>;
}

let fixture: TestFixture;
const wsRequests: WsRequestEnvelope["body"][] = [];
const wsLink = ws.link(/ws(s)?:\/\/.*/);
let nextPushSequence = 1;

interface ViewportSpec {
  name: string;
  width: number;
  height: number;
  textTolerancePx: number;
  attachmentTolerancePx: number;
}

const DEFAULT_VIEWPORT: ViewportSpec = {
  name: "desktop",
  width: 960,
  height: 1_100,
  textTolerancePx: 44,
  attachmentTolerancePx: 56,
};
const TEXT_VIEWPORT_MATRIX = [
  DEFAULT_VIEWPORT,
  {
    name: "tablet",
    width: 720,
    height: 1_024,
    textTolerancePx: 44,
    attachmentTolerancePx: 56,
  },
  {
    name: "mobile",
    width: 430,
    height: 932,
    textTolerancePx: 56,
    attachmentTolerancePx: 56,
  },
  {
    name: "narrow",
    width: 320,
    height: 700,
    textTolerancePx: 176,
    attachmentTolerancePx: 56,
  },
] as const satisfies readonly ViewportSpec[];
const MOBILE_VIEWPORT = TEXT_VIEWPORT_MATRIX[2];
const ATTACHMENT_VIEWPORT_MATRIX = [
  DEFAULT_VIEWPORT,
  {
    name: "mobile",
    width: 430,
    height: 932,
    textTolerancePx: 56,
    attachmentTolerancePx: 56,
  },
  {
    name: "narrow",
    width: 320,
    height: 700,
    textTolerancePx: 176,
    attachmentTolerancePx: 56,
  },
] as const satisfies readonly ViewportSpec[];

interface UserRowMeasurement {
  measuredRowHeightPx: number;
  timelineWidthMeasuredPx: number;
  renderedInVirtualizedRegion: boolean;
}

interface MountedChatView {
  cleanup: () => Promise<void>;
  measureUserRow: (targetMessageId: MessageId) => Promise<UserRowMeasurement>;
  setViewport: (viewport: ViewportSpec) => Promise<void>;
  pathname: () => string;
}

function isoAt(offsetSeconds: number): string {
  return new Date(BASE_TIME_MS + offsetSeconds * 1_000).toISOString();
}

function createBaseServerConfig(): ServerConfig {
  return {
    cwd: "/repo/project",
    keybindingsConfigPath: "/repo/project/.tether-keybindings.json",
    keybindings: [],
    issues: [],
    providers: [
      {
        provider: "codex",
        status: "ready",
        available: true,
        authStatus: "authenticated",
        checkedAt: NOW_ISO,
      },
    ],
    availableEditors: [],
  };
}

function createUserMessage(options: {
  id: MessageId;
  text: string;
  offsetSeconds: number;
  attachments?: Array<{
    type: "image";
    id: string;
    name: string;
    mimeType: string;
    sizeBytes: number;
  }>;
}) {
  return {
    id: options.id,
    role: "user" as const,
    text: options.text,
    ...(options.attachments ? { attachments: options.attachments } : {}),
    turnId: null,
    streaming: false,
    createdAt: isoAt(options.offsetSeconds),
    updatedAt: isoAt(options.offsetSeconds + 1),
  };
}

function createAssistantMessage(options: { id: MessageId; text: string; offsetSeconds: number }) {
  return {
    id: options.id,
    role: "assistant" as const,
    text: options.text,
    turnId: null,
    streaming: false,
    createdAt: isoAt(options.offsetSeconds),
    updatedAt: isoAt(options.offsetSeconds + 1),
  };
}

function createSnapshotForTargetUser(options: {
  targetMessageId: MessageId;
  targetText: string;
  targetAttachmentCount?: number;
}): OrchestrationReadModel {
  const messages: Array<OrchestrationReadModel["threads"][number]["messages"][number]> = [];

  for (let index = 0; index < 22; index += 1) {
    const isTarget = index === 3;
    const userId = `msg-user-${index}` as MessageId;
    const assistantId = `msg-assistant-${index}` as MessageId;
    const attachments =
      isTarget && (options.targetAttachmentCount ?? 0) > 0
        ? Array.from({ length: options.targetAttachmentCount ?? 0 }, (_, attachmentIndex) => ({
            type: "image" as const,
            id: `attachment-${attachmentIndex + 1}`,
            name: `attachment-${attachmentIndex + 1}.png`,
            mimeType: "image/png",
            sizeBytes: 128,
          }))
        : undefined;

    messages.push(
      createUserMessage({
        id: isTarget ? options.targetMessageId : userId,
        text: isTarget ? options.targetText : `filler user message ${index}`,
        offsetSeconds: messages.length * 3,
        ...(attachments ? { attachments } : {}),
      }),
    );
    messages.push(
      createAssistantMessage({
        id: assistantId,
        text: `assistant filler ${index}`,
        offsetSeconds: messages.length * 3,
      }),
    );
  }

  return {
    snapshotSequence: 1,
    projects: [
      {
        id: PROJECT_ID,
        title: "Project",
        workspaceRoot: "/repo/project",
        defaultModel: "gpt-5",
        scripts: [],
        createdAt: NOW_ISO,
        updatedAt: NOW_ISO,
        deletedAt: null,
      },
    ],
    threads: [
      {
        id: THREAD_ID,
        projectId: PROJECT_ID,
        title: "Browser test thread",
        model: "gpt-5",
        interactionMode: "default",
        runtimeMode: "full-access",
        branch: "main",
        worktreePath: null,
        latestTurn: null,
        lastAutoRenameUserMessageId: null,
        createdAt: NOW_ISO,
        updatedAt: NOW_ISO,
        deletedAt: null,
        messages,
        contextWindow: null,
        activities: [],
        proposedPlans: [],
        checkpoints: [],
        session: {
          threadId: THREAD_ID,
          status: "ready",
          providerName: "codex",
          runtimeMode: "full-access",
          activeTurnId: null,
          lastError: null,
          updatedAt: NOW_ISO,
        },
      },
    ],
    updatedAt: NOW_ISO,
  };
}

function buildFixture(snapshot: OrchestrationReadModel): TestFixture {
  return {
    snapshot,
    serverConfig: createBaseServerConfig(),
    welcome: {
      cwd: "/repo/project",
      projectName: "Project",
      bootstrapProjectId: PROJECT_ID,
      bootstrapThreadId: THREAD_ID,
    },
  };
}

function createDraftOnlySnapshot(): OrchestrationReadModel {
  const snapshot = createSnapshotForTargetUser({
    targetMessageId: "msg-user-draft-target" as MessageId,
    targetText: "draft thread",
  });
  return {
    ...snapshot,
    threads: [],
  };
}

function createRunningSnapshot(): OrchestrationReadModel {
  const snapshot = createSnapshotForTargetUser({
    targetMessageId: "msg-user-running-target" as MessageId,
    targetText: "running target",
  });
  const [thread] = snapshot.threads;
  if (!thread) {
    return snapshot;
  }

  return {
    ...snapshot,
    threads: [
      {
        ...thread,
        session: {
          threadId: THREAD_ID,
          status: "running",
          providerName: "codex",
          runtimeMode: "full-access",
          activeTurnId: "turn-running" as TurnId,
          lastError: null,
          updatedAt: NOW_ISO,
        },
      },
    ],
  };
}

function createSnapshotWithExecutingPlan(): OrchestrationReadModel {
  const snapshot = createSnapshotForTargetUser({
    targetMessageId: "msg-user-plan-target" as MessageId,
    targetText: "plan target",
  });
  const turnId = "turn-browser-plan-1" as TurnId;
  const thread = snapshot.threads[0];

  if (!thread?.session) {
    throw new Error("Expected browser test snapshot to include a thread session.");
  }
  return {
    ...snapshot,
    threads: [
      {
        ...thread,
        latestTurn: {
          turnId,
          state: "running",
          requestedAt: isoAt(120),
          startedAt: isoAt(121),
          completedAt: null,
          assistantMessageId: null,
        },
        activities: [
          {
            id: "event-plan-browser-1" as EventId,
            tone: "info",
            kind: "turn.plan.updated",
            summary: "Plan updated",
            payload: {
              explanation: "Implement a minimize control for the active plan card.",
              plan: [
                { step: "Inspect the active thread plan UI", status: "completed" },
                { step: "Add a minimize toggle", status: "inProgress" },
                { step: "Verify thread behavior in browser tests", status: "pending" },
              ],
            },
            turnId,
            sequence: 1,
            createdAt: isoAt(122),
          },
        ],
        session: {
          ...thread.session,
          status: "running",
          activeTurnId: turnId,
          updatedAt: isoAt(123),
        },
      },
    ],
  };
}

function createSnapshotWithPendingUserInput(options?: {
  sessionStatus?: "ready" | "running";
}): OrchestrationReadModel {
  const snapshot = createSnapshotForTargetUser({
    targetMessageId: "msg-user-pending-input-target" as MessageId,
    targetText: "pending input target",
  });
  const thread = snapshot.threads[0];
  const sessionStatus = options?.sessionStatus ?? "ready";
  const turnId = "turn-browser-user-input-1" as TurnId;

  if (!thread?.session) {
    throw new Error("Expected browser test snapshot to include a thread session.");
  }

  return {
    ...snapshot,
    threads: [
      {
        ...thread,
        activities: [
          {
            id: "event-user-input-browser-1" as EventId,
            tone: "info",
            kind: "user-input.requested",
            summary: "User input requested",
            payload: {
              requestId: "req-user-input-browser-1",
              questions: [
                {
                  id: "hosting",
                  header: "Hosting",
                  question: "How should the Railway deployment be structured for this site?",
                  options: [
                    {
                      label: "Pure static (Recommended)",
                      description: "Export a static site with no Node runtime.",
                    },
                    {
                      label: "Static + explicit config",
                      description:
                        "Keep it static but define the Railway deployment config manually.",
                    },
                    {
                      label: "Small Node server",
                      description: "Serve through a small Node runtime.",
                    },
                  ],
                },
              ],
            },
            turnId: sessionStatus === "running" ? turnId : null,
            sequence: 1,
            createdAt: isoAt(122),
          },
        ],
        latestTurn:
          sessionStatus === "running"
            ? {
                turnId,
                state: "running",
                requestedAt: isoAt(120),
                startedAt: isoAt(121),
                completedAt: null,
                assistantMessageId: null,
              }
            : null,
        session: {
          ...thread.session,
          status: sessionStatus,
          activeTurnId: sessionStatus === "running" ? turnId : null,
          updatedAt: isoAt(123),
        },
      },
    ],
  };
}

function createSnapshotWithProjectScripts(scripts: ProjectScript[]): OrchestrationReadModel {
  const snapshot = createSnapshotForTargetUser({
    targetMessageId: "msg-user-project-script-target" as MessageId,
    targetText: "project script target",
  });
  const projects = snapshot.projects.slice();
  const projectIndex = projects.findIndex((project) => project.id === PROJECT_ID);
  if (projectIndex >= 0) {
    const project = projects[projectIndex];
    if (project) {
      projects[projectIndex] = {
        ...project,
        scripts,
      };
    }
  }
  return {
    ...snapshot,
    projects,
  };
}

function setThreadState(
  updater: (
    thread: OrchestrationReadModel["threads"][number],
  ) => OrchestrationReadModel["threads"][number],
): void {
  const thread = fixture.snapshot.threads.find((entry) => entry.id === THREAD_ID);
  if (!thread) {
    return;
  }
  const nextThread = updater(thread);
  fixture.snapshot = {
    ...fixture.snapshot,
    threads: fixture.snapshot.threads.map((entry) => (entry.id === THREAD_ID ? nextThread : entry)),
  };
  useStore.setState((state) => ({
    ...state,
    threads: state.threads.map((entry) =>
      entry.id === THREAD_ID
        ? ({
            ...entry,
            model: nextThread.model,
            runtimeMode: nextThread.runtimeMode,
            interactionMode: nextThread.interactionMode,
            updatedAt: nextThread.updatedAt,
            activities: [...nextThread.activities],
            session: nextThread.session
              ? {
                  provider: "codex",
                  status:
                    nextThread.session.status === "running"
                      ? "running"
                      : nextThread.session.status === "starting"
                        ? "connecting"
                        : "ready",
                  orchestrationStatus: nextThread.session.status,
                  activeTurnId: nextThread.session.activeTurnId ?? undefined,
                  createdAt: nextThread.createdAt,
                  updatedAt: nextThread.session.updatedAt,
                }
              : null,
          } satisfies typeof entry)
        : entry,
    ),
  }));
}

function dispatchCommand(request: WsRequestEnvelope["body"]): Record<string, unknown> | null {
  if (request._tag !== ORCHESTRATION_WS_METHODS.dispatchCommand) {
    return null;
  }
  const command = request.command;
  return command && typeof command === "object" ? (command as Record<string, unknown>) : null;
}

function dispatchCommandMessageText(request: WsRequestEnvelope["body"] | undefined): string | null {
  if (!request) {
    return null;
  }
  const command = dispatchCommand(request);
  const message = command?.message;
  if (!message || typeof message !== "object") {
    return null;
  }
  return typeof (message as Record<string, unknown>).text === "string"
    ? ((message as Record<string, unknown>).text as string)
    : null;
}

async function submitQueuedPrompt(prompt: string): Promise<void> {
  useComposerDraftStore.getState().setPrompt(THREAD_ID, prompt);
  await waitForLayout();
  const form = await waitForElement(
    () => document.querySelector("form"),
    "Unable to find composer form.",
  );
  form.dispatchEvent(
    new Event("submit", {
      bubbles: true,
      cancelable: true,
    }),
  );
  await waitForLayout();
}

function findButtonByLabel(label: string): HTMLButtonElement | null {
  return Array.from(document.querySelectorAll("button")).find(
    (button) => button.getAttribute("aria-label") === label,
  ) as HTMLButtonElement | null;
}

function findButtonsByText(text: string): HTMLButtonElement[] {
  return Array.from(document.querySelectorAll("button")).filter(
    (button): button is HTMLButtonElement =>
      button instanceof HTMLButtonElement && button.textContent?.trim() === text,
  );
}

function findQueuedMessageCardById(queuedMessageId: string): HTMLDivElement | null {
  return document.querySelector<HTMLDivElement>(
    `[data-testid="queued-message-card-${queuedMessageId}"]`,
  );
}

function findQueuedMessageHandleById(queuedMessageId: string): HTMLDivElement | null {
  return document.querySelector<HTMLDivElement>(
    `[data-testid="queued-message-handle-${queuedMessageId}"]`,
  );
}

async function dragQueuedMessageToTarget(
  sourceQueuedMessageId: string,
  targetQueuedMessageId: string,
): Promise<void> {
  const sourceHandle = await waitForElement(
    () => findQueuedMessageHandleById(sourceQueuedMessageId),
    "Unable to find queued message drag handle.",
  );
  const targetCard = await waitForElement(
    () => findQueuedMessageCardById(targetQueuedMessageId),
    "Unable to find queued message drop target.",
  );
  const dataTransfer = new DataTransfer();
  sourceHandle.dispatchEvent(
    new DragEvent("dragstart", {
      bubbles: true,
      cancelable: true,
      dataTransfer,
    }),
  );
  targetCard.dispatchEvent(
    new DragEvent("dragover", {
      bubbles: true,
      cancelable: true,
      dataTransfer,
    }),
  );
  targetCard.dispatchEvent(
    new DragEvent("drop", {
      bubbles: true,
      cancelable: true,
      dataTransfer,
    }),
  );
  sourceHandle.dispatchEvent(
    new DragEvent("dragend", {
      bubbles: true,
      cancelable: true,
      dataTransfer,
    }),
  );
  await waitForLayout();
}

function resolveWsRpc(request: WsRequestEnvelope["body"]): unknown {
  const tag = request._tag;
  if (tag === ORCHESTRATION_WS_METHODS.getSnapshot) {
    return fixture.snapshot;
  }
  if (tag === WS_METHODS.serverGetConfig) {
    return fixture.serverConfig;
  }
  if (tag === WS_METHODS.gitListBranches) {
    return {
      isRepo: true,
      branches: [
        {
          name: "main",
          current: true,
          isDefault: true,
          worktreePath: null,
        },
      ],
    };
  }
  if (tag === WS_METHODS.gitStatus) {
    return {
      branch: "main",
      hasWorkingTreeChanges: false,
      workingTree: {
        files: [],
        insertions: 0,
        deletions: 0,
      },
      hasUpstream: true,
      aheadCount: 0,
      behindCount: 0,
      pr: null,
    };
  }
  if (tag === WS_METHODS.projectsSearchEntries) {
    return {
      entries: [],
      truncated: false,
    };
  }
  if (tag === WS_METHODS.projectsReadFile) {
    const relativePath = typeof request.relativePath === "string" ? request.relativePath : "";
    return {
      relativePath,
      contents: fixture.projectFiles?.[relativePath] ?? "",
    };
  }
  if (tag === WS_METHODS.terminalOpen || tag === WS_METHODS.terminalRestart) {
    return {
      threadId: typeof request.threadId === "string" ? request.threadId : THREAD_ID,
      terminalId: typeof request.terminalId === "string" ? request.terminalId : "default",
      cwd: typeof request.cwd === "string" ? request.cwd : "/repo/project",
      status: "running",
      pid: null,
      history: "",
      exitCode: null,
      exitSignal: null,
      updatedAt: NOW_ISO,
    };
  }
  return {};
}

const worker = setupWorker(
  wsLink.addEventListener("connection", ({ client }) => {
    client.send(
      JSON.stringify({
        type: "push",
        sequence: nextPushSequence++,
        channel: WS_CHANNELS.serverWelcome,
        data: fixture.welcome,
      }),
    );
    client.addEventListener("message", (event) => {
      const rawData = event.data;
      if (typeof rawData !== "string") return;
      let request: WsRequestEnvelope;
      try {
        request = JSON.parse(rawData) as WsRequestEnvelope;
      } catch {
        return;
      }
      const method = request.body?._tag;
      if (typeof method !== "string") return;
      wsRequests.push(request.body);
      client.send(
        JSON.stringify({
          id: request.id,
          result: resolveWsRpc(request.body),
        }),
      );
    });
  }),
  http.get("*/attachments/:attachmentId", () =>
    HttpResponse.text(ATTACHMENT_SVG, {
      headers: {
        "Content-Type": "image/svg+xml",
      },
    }),
  ),
  http.get("*/api/project-favicon", () => new HttpResponse(null, { status: 204 })),
);

async function nextFrame(): Promise<void> {
  await new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });
}

async function waitForLayout(): Promise<void> {
  await nextFrame();
  await nextFrame();
  await nextFrame();
}

async function setViewport(viewport: ViewportSpec): Promise<void> {
  await page.viewport(viewport.width, viewport.height);
  await waitForLayout();
}

async function waitForProductionStyles(): Promise<void> {
  await vi.waitFor(
    () => {
      expect(
        getComputedStyle(document.documentElement).getPropertyValue("--background").trim(),
      ).not.toBe("");
      expect(getComputedStyle(document.body).marginTop).toBe("0px");
    },
    {
      timeout: 4_000,
      interval: 16,
    },
  );
}

async function waitForElement<T extends Element>(
  query: () => T | null,
  errorMessage: string,
): Promise<T> {
  let element: T | null = null;
  await vi.waitFor(
    () => {
      element = query();
      expect(element, errorMessage).toBeTruthy();
    },
    {
      timeout: 8_000,
      interval: 16,
    },
  );
  if (!element) {
    throw new Error(errorMessage);
  }
  return element;
}

async function waitForComposerEditor(): Promise<HTMLElement> {
  return waitForElement(
    () => document.querySelector<HTMLElement>('[contenteditable="true"]'),
    "Unable to find composer editor.",
  );
}

async function waitForMessageScrollContainer(
  scope: ParentNode = document,
): Promise<HTMLDivElement> {
  return waitForElement(
    () =>
      scope.querySelector<HTMLDivElement>(
        "div.chat-messages-scroll.overflow-y-auto.overscroll-y-contain",
      ),
    "Unable to find ChatView message scroll container.",
  );
}

async function waitForComposerImagePickerButton(): Promise<HTMLButtonElement> {
  return waitForElement(
    () => document.querySelector<HTMLButtonElement>("[data-composer-image-picker='true']"),
    "Unable to find composer image picker button.",
  );
}

async function waitForComposerImageInput(): Promise<HTMLInputElement> {
  return waitForElement(
    () => document.querySelector<HTMLInputElement>("[data-composer-image-input='true']"),
    "Unable to find composer image input.",
  );
}

async function waitForEnabledSendButton(): Promise<HTMLButtonElement> {
  return waitForElement(
    () =>
      Array.from(document.querySelectorAll("button")).find(
        (button) =>
          button.getAttribute("aria-label") === "Send message" &&
          !(button as HTMLButtonElement).disabled,
      ) as HTMLButtonElement | null,
    "Unable to find enabled send button.",
  );
}

async function waitForStopButton(): Promise<HTMLButtonElement> {
  return waitForElement(
    () => document.querySelector<HTMLButtonElement>('button[aria-label="Stop generation"]'),
    "Unable to find stop generation button.",
  );
}

async function waitForInteractionModeButton(
  expectedLabel: "Chat" | "Plan",
): Promise<HTMLButtonElement> {
  return waitForElement(
    () =>
      Array.from(document.querySelectorAll("button")).find(
        (button) => button.textContent?.trim() === expectedLabel,
      ) as HTMLButtonElement | null,
    `Unable to find ${expectedLabel} interaction mode button.`,
  );
}

async function waitForInteractionModeToggle(mode: "chat" | "plan"): Promise<HTMLButtonElement> {
  return waitForElement(
    () => document.querySelector<HTMLButtonElement>(`button[data-interaction-mode="${mode}"]`),
    `Unable to find ${mode} interaction mode toggle.`,
  );
}

async function waitForPendingUserInputOption(label: string): Promise<HTMLButtonElement> {
  return waitForElement(
    () =>
      Array.from(document.querySelectorAll("button")).find(
        (button) => button.textContent?.trim() === label,
      ) as HTMLButtonElement | null,
    `Unable to find pending user input option "${label}".`,
  );
}

async function waitForPendingUserInputSubmitButton(): Promise<HTMLButtonElement> {
  return waitForElement(
    () =>
      Array.from(document.querySelectorAll("button")).find(
        (button) =>
          button.textContent?.trim() === "Submit answers" &&
          !(button as HTMLButtonElement).disabled,
      ) as HTMLButtonElement | null,
    "Unable to find enabled pending user input submit button.",
  );
}

function findDispatchedCommand(type: string): WsRequestEnvelope["body"] | undefined {
  return wsRequests.find((request) => {
    if (request._tag !== ORCHESTRATION_WS_METHODS.dispatchCommand) {
      return false;
    }
    const command =
      request.command && typeof request.command === "object"
        ? (request.command as Record<string, unknown>)
        : null;
    return command?.type === type;
  });
}

function elementOwnsCenterPoint(element: HTMLElement): boolean {
  return elementOwnsInteriorPoint(element, 0.5, 0.5);
}

function elementOwnsInteriorPoint(
  element: HTMLElement,
  horizontalRatio: number,
  verticalRatio: number,
): boolean {
  const rect = element.getBoundingClientRect();
  const pointX = rect.left + rect.width * horizontalRatio;
  const pointY = rect.top + rect.height * verticalRatio;
  const hit = document.elementFromPoint(pointX, pointY);
  return hit === element || (hit instanceof Node && element.contains(hit));
}

async function waitForThreadContextJumpButton(): Promise<HTMLButtonElement> {
  return waitForElement(
    () => document.querySelector<HTMLButtonElement>("[data-thread-context-jump='true']"),
    "Unable to find thread context jump button.",
  );
}

async function waitForThreadContextToggle(mode: "original" | "last"): Promise<HTMLButtonElement> {
  const ariaLabel =
    mode === "original" ? "Show original thread context" : "Show latest thread context";
  return waitForElement(
    () => document.querySelector<HTMLButtonElement>(`button[aria-label="${ariaLabel}"]`),
    `Unable to find ${mode} thread context toggle.`,
  );
}

async function waitForThreadFlagger(
  kind: "sent" | "final",
  messageId: MessageId,
): Promise<HTMLButtonElement> {
  return waitForElement(
    () =>
      document.querySelector<HTMLButtonElement>(
        `[data-thread-flagger-kind="${kind}"][data-thread-flagger-message-id="${messageId}"]`,
      ),
    `Unable to find ${kind} thread flagger for ${messageId}.`,
  );
}

async function waitForPlanModePanelToggle(): Promise<HTMLButtonElement> {
  return waitForElement(
    () => document.querySelector<HTMLButtonElement>("[data-plan-mode-panel-toggle='true']"),
    "Unable to find plan mode panel toggle.",
  );
}

function findMessageRow(messageId: MessageId): HTMLElement | null {
  return document.querySelector<HTMLElement>(
    `[data-message-id="${messageId}"][data-message-role="user"]`,
  );
}

function isMessageRowHighlighted(messageId: MessageId): boolean {
  const row = findMessageRow(messageId);
  if (!(row instanceof HTMLElement)) {
    return false;
  }
  return row.className.includes("bg-accent/25") && row.className.includes("ring-1");
}

async function openHeaderActionsMenu(): Promise<void> {
  const actionsButton = await waitForElement(
    () => document.querySelector<HTMLButtonElement>('button[aria-label="Actions"]'),
    "Unable to find header actions button.",
  );
  actionsButton.click();
  await waitForLayout();
}

async function waitForTextElement(text: string, errorMessage: string): Promise<HTMLElement> {
  return waitForElement(
    () =>
      Array.from(document.querySelectorAll<HTMLElement>("button,[role='menuitem']")).find(
        (element) => element.textContent?.trim() === text,
      ) ?? null,
    errorMessage,
  );
}

async function waitForImagesToLoad(scope: ParentNode): Promise<void> {
  const images = Array.from(scope.querySelectorAll("img"));
  if (images.length === 0) {
    return;
  }
  await Promise.all(
    images.map(
      (image) =>
        new Promise<void>((resolve) => {
          if (image.complete) {
            resolve();
            return;
          }
          image.addEventListener("load", () => resolve(), { once: true });
          image.addEventListener("error", () => resolve(), { once: true });
        }),
    ),
  );
  await waitForLayout();
}

async function measureUserRow(options: {
  host: HTMLElement;
  targetMessageId: MessageId;
}): Promise<UserRowMeasurement> {
  const { host, targetMessageId } = options;
  const rowSelector = `[data-message-id="${targetMessageId}"][data-message-role="user"]`;

  const scrollContainer = await waitForMessageScrollContainer(host);

  let row: HTMLElement | null = null;
  await vi.waitFor(
    async () => {
      scrollContainer.scrollTop = 0;
      scrollContainer.dispatchEvent(new Event("scroll"));
      await waitForLayout();
      row = host.querySelector<HTMLElement>(rowSelector);
      expect(row, "Unable to locate targeted user message row.").toBeTruthy();
    },
    {
      timeout: 8_000,
      interval: 16,
    },
  );

  await waitForImagesToLoad(row!);
  scrollContainer.scrollTop = 0;
  scrollContainer.dispatchEvent(new Event("scroll"));
  await nextFrame();

  const timelineRoot =
    row!.closest<HTMLElement>('[data-timeline-root="true"]') ??
    host.querySelector<HTMLElement>('[data-timeline-root="true"]');
  if (!(timelineRoot instanceof HTMLElement)) {
    throw new Error("Unable to locate timeline root container.");
  }

  let timelineWidthMeasuredPx = 0;
  let measuredRowHeightPx = 0;
  let renderedInVirtualizedRegion = false;
  await vi.waitFor(
    async () => {
      scrollContainer.scrollTop = 0;
      scrollContainer.dispatchEvent(new Event("scroll"));
      await nextFrame();
      const measuredRow = host.querySelector<HTMLElement>(rowSelector);
      expect(measuredRow, "Unable to measure targeted user row height.").toBeTruthy();
      timelineWidthMeasuredPx = timelineRoot.getBoundingClientRect().width;
      measuredRowHeightPx = measuredRow!.getBoundingClientRect().height;
      renderedInVirtualizedRegion = measuredRow!.closest("[data-index]") instanceof HTMLElement;
      expect(timelineWidthMeasuredPx, "Unable to measure timeline width.").toBeGreaterThan(0);
      expect(measuredRowHeightPx, "Unable to measure targeted user row height.").toBeGreaterThan(0);
    },
    {
      timeout: 4_000,
      interval: 16,
    },
  );

  return {
    measuredRowHeightPx,
    timelineWidthMeasuredPx,
    renderedInVirtualizedRegion,
  };
}

async function mountChatView(options: {
  viewport: ViewportSpec;
  snapshot: OrchestrationReadModel;
  configureFixture?: (fixture: TestFixture) => void;
  initialEntries?: string[];
}): Promise<MountedChatView> {
  fixture = buildFixture(options.snapshot);
  options.configureFixture?.(fixture);
  await setViewport(options.viewport);
  await waitForProductionStyles();

  const host = document.createElement("div");
  host.style.position = "fixed";
  host.style.inset = "0";
  host.style.width = "100vw";
  host.style.height = "100vh";
  host.style.display = "grid";
  host.style.overflow = "hidden";
  document.body.append(host);

  const router = getRouter(
    createMemoryHistory({
      initialEntries: options.initialEntries ?? [`/${THREAD_ID}`],
    }),
  );

  const screen = await render(<RouterProvider router={router} />, {
    container: host,
  });

  await waitForLayout();

  return {
    cleanup: async () => {
      await screen.unmount();
      host.remove();
    },
    measureUserRow: async (targetMessageId: MessageId) => measureUserRow({ host, targetMessageId }),
    setViewport: async (viewport: ViewportSpec) => {
      await setViewport(viewport);
      await waitForProductionStyles();
    },
    pathname: () => router.state.location.pathname,
  };
}

async function measureUserRowAtViewport(options: {
  snapshot: OrchestrationReadModel;
  targetMessageId: MessageId;
  viewport: ViewportSpec;
}): Promise<UserRowMeasurement> {
  const mounted = await mountChatView({
    viewport: options.viewport,
    snapshot: options.snapshot,
  });

  try {
    return await mounted.measureUserRow(options.targetMessageId);
  } finally {
    await mounted.cleanup();
  }
}

describe("ChatView timeline estimator parity (full app)", () => {
  beforeAll(async () => {
    fixture = buildFixture(
      createSnapshotForTargetUser({
        targetMessageId: "msg-user-bootstrap" as MessageId,
        targetText: "bootstrap",
      }),
    );
    await worker.start({
      onUnhandledRequest: "bypass",
      quiet: true,
      serviceWorker: {
        url: "/mockServiceWorker.js",
      },
    });
  });

  afterAll(async () => {
    await worker.stop();
  });

  beforeEach(async () => {
    await setViewport(DEFAULT_VIEWPORT);
    localStorage.clear();
    document.body.innerHTML = "";
    nextPushSequence = 1;
    wsRequests.length = 0;
    useComposerDraftStore.setState({
      draftsByThreadId: {},
      queuedMessagesByThreadId: {},
      draftThreadsByThreadId: {},
      projectDraftThreadIdByProjectId: {},
    });
    useStore.setState({
      projects: [],
      threads: [],
      threadsHydrated: false,
    });
    useTerminalStateStore.setState({ terminalStateByThreadId: {} });
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it.each(TEXT_VIEWPORT_MATRIX)(
    "keeps long user message estimate close at the $name viewport",
    async (viewport) => {
      const userText = "x".repeat(3_200);
      const targetMessageId = `msg-user-target-long-${viewport.name}` as MessageId;
      const mounted = await mountChatView({
        viewport,
        snapshot: createSnapshotForTargetUser({
          targetMessageId,
          targetText: userText,
        }),
      });

      try {
        const { measuredRowHeightPx, timelineWidthMeasuredPx, renderedInVirtualizedRegion } =
          await mounted.measureUserRow(targetMessageId);

        expect(renderedInVirtualizedRegion).toBe(true);

        const estimatedHeightPx = estimateTimelineMessageHeight(
          { role: "user", text: userText, attachments: [] },
          { timelineWidthPx: timelineWidthMeasuredPx },
        );

        expect(Math.abs(measuredRowHeightPx - estimatedHeightPx)).toBeLessThanOrEqual(
          viewport.textTolerancePx,
        );
      } finally {
        await mounted.cleanup();
      }
    },
  );

  it("tracks wrapping parity while resizing an existing ChatView across the viewport matrix", async () => {
    const userText = "x".repeat(3_200);
    const targetMessageId = "msg-user-target-resize" as MessageId;
    const mounted = await mountChatView({
      viewport: TEXT_VIEWPORT_MATRIX[0],
      snapshot: createSnapshotForTargetUser({
        targetMessageId,
        targetText: userText,
      }),
    });

    try {
      const measurements: Array<
        UserRowMeasurement & {
          viewport: ViewportSpec;
          estimatedHeightPx: number;
        }
      > = [];

      for (const viewport of TEXT_VIEWPORT_MATRIX) {
        await mounted.setViewport(viewport);
        const measurement = await mounted.measureUserRow(targetMessageId);
        const estimatedHeightPx = estimateTimelineMessageHeight(
          { role: "user", text: userText, attachments: [] },
          { timelineWidthPx: measurement.timelineWidthMeasuredPx },
        );

        expect(measurement.renderedInVirtualizedRegion).toBe(true);
        expect(Math.abs(measurement.measuredRowHeightPx - estimatedHeightPx)).toBeLessThanOrEqual(
          viewport.textTolerancePx,
        );
        measurements.push({ ...measurement, viewport, estimatedHeightPx });
      }

      expect(
        new Set(measurements.map((measurement) => Math.round(measurement.timelineWidthMeasuredPx)))
          .size,
      ).toBeGreaterThanOrEqual(3);

      const byMeasuredWidth = measurements.toSorted(
        (left, right) => left.timelineWidthMeasuredPx - right.timelineWidthMeasuredPx,
      );
      const narrowest = byMeasuredWidth[0]!;
      const widest = byMeasuredWidth.at(-1)!;
      expect(narrowest.timelineWidthMeasuredPx).toBeLessThan(widest.timelineWidthMeasuredPx);
      expect(narrowest.measuredRowHeightPx).toBeGreaterThan(widest.measuredRowHeightPx);
      expect(narrowest.estimatedHeightPx).toBeGreaterThan(widest.estimatedHeightPx);
    } finally {
      await mounted.cleanup();
    }
  });

  it("tracks additional rendered wrapping when ChatView width narrows between desktop and mobile viewports", async () => {
    const userText = "x".repeat(2_400);
    const targetMessageId = "msg-user-target-wrap" as MessageId;
    const snapshot = createSnapshotForTargetUser({
      targetMessageId,
      targetText: userText,
    });
    const desktopMeasurement = await measureUserRowAtViewport({
      viewport: TEXT_VIEWPORT_MATRIX[0],
      snapshot,
      targetMessageId,
    });
    const mobileMeasurement = await measureUserRowAtViewport({
      viewport: TEXT_VIEWPORT_MATRIX[2],
      snapshot,
      targetMessageId,
    });

    const estimatedDesktopPx = estimateTimelineMessageHeight(
      { role: "user", text: userText, attachments: [] },
      { timelineWidthPx: desktopMeasurement.timelineWidthMeasuredPx },
    );
    const estimatedMobilePx = estimateTimelineMessageHeight(
      { role: "user", text: userText, attachments: [] },
      { timelineWidthPx: mobileMeasurement.timelineWidthMeasuredPx },
    );

    const measuredDeltaPx =
      mobileMeasurement.measuredRowHeightPx - desktopMeasurement.measuredRowHeightPx;
    const estimatedDeltaPx = estimatedMobilePx - estimatedDesktopPx;
    expect(measuredDeltaPx).toBeGreaterThan(0);
    expect(estimatedDeltaPx).toBeGreaterThan(0);
    const ratio = estimatedDeltaPx / measuredDeltaPx;
    expect(ratio).toBeGreaterThan(0.65);
    expect(ratio).toBeLessThan(1.35);
  });

  it.each(ATTACHMENT_VIEWPORT_MATRIX)(
    "keeps user attachment estimate close at the $name viewport",
    async (viewport) => {
      const targetMessageId = `msg-user-target-attachments-${viewport.name}` as MessageId;
      const userText = "message with image attachments";
      const mounted = await mountChatView({
        viewport,
        snapshot: createSnapshotForTargetUser({
          targetMessageId,
          targetText: userText,
          targetAttachmentCount: 3,
        }),
      });

      try {
        const { measuredRowHeightPx, timelineWidthMeasuredPx, renderedInVirtualizedRegion } =
          await mounted.measureUserRow(targetMessageId);

        expect(renderedInVirtualizedRegion).toBe(true);

        const estimatedHeightPx = estimateTimelineMessageHeight(
          {
            role: "user",
            text: userText,
            attachments: [{ id: "attachment-1" }, { id: "attachment-2" }, { id: "attachment-3" }],
          },
          { timelineWidthPx: timelineWidthMeasuredPx },
        );

        expect(Math.abs(measuredRowHeightPx - estimatedHeightPx)).toBeLessThanOrEqual(
          viewport.attachmentTolerancePx,
        );
      } finally {
        await mounted.cleanup();
      }
    },
  );

  it("renders a pinned thread context jump target and scrolls back to it", async () => {
    const snapshot = createSnapshotForTargetUser({
      targetMessageId: "msg-user-target-context-jump" as MessageId,
      targetText: "context jump target",
    });
    const mounted = await mountChatView({
      viewport: DEFAULT_VIEWPORT,
      snapshot,
    });

    try {
      const contextJumpButton = await waitForThreadContextJumpButton();

      expect(contextJumpButton.textContent).toContain("filler user message 0");

      contextJumpButton.click();

      await vi.waitFor(
        () => {
          expect(isMessageRowHighlighted("msg-user-0" as MessageId)).toBe(true);
        },
        { timeout: 8_000, interval: 16 },
      );
    } finally {
      await mounted.cleanup();
    }
  });

  it("renders thread flaggers and jumps to the selected message", async () => {
    const snapshot = createSnapshotForTargetUser({
      targetMessageId: "msg-user-target-flagger" as MessageId,
      targetText: "flagger target",
    });
    const mounted = await mountChatView({
      viewport: DEFAULT_VIEWPORT,
      snapshot,
    });

    try {
      await vi.waitFor(
        () => {
          expect(
            document.querySelectorAll("[data-thread-flagger-kind='sent']").length,
          ).toBeGreaterThanOrEqual(22);
          expect(
            document.querySelectorAll("[data-thread-flagger-kind='final']").length,
          ).toBeGreaterThanOrEqual(22);
        },
        { timeout: 8_000, interval: 16 },
      );

      const firstSentFlagger = await waitForThreadFlagger("sent", "msg-user-0" as MessageId);
      firstSentFlagger.click();

      await vi.waitFor(
        () => {
          expect(isMessageRowHighlighted("msg-user-0" as MessageId)).toBe(true);
          expect(findMessageRow("msg-user-0" as MessageId)).toBeTruthy();
        },
        { timeout: 8_000, interval: 16 },
      );
    } finally {
      await mounted.cleanup();
    }
  });

  it("uses the latest user message for last thread context", async () => {
    const mounted = await mountChatView({
      viewport: DEFAULT_VIEWPORT,
      snapshot: createSnapshotForTargetUser({
        targetMessageId: "msg-user-target-context-last" as MessageId,
        targetText: "context jump target",
      }),
    });

    try {
      const latestContextToggle = await waitForThreadContextToggle("last");
      const contextJumpButton = await waitForThreadContextJumpButton();

      latestContextToggle.click();

      await vi.waitFor(
        () => {
          expect(contextJumpButton.textContent).toContain("filler user message 21");
          expect(contextJumpButton.textContent).not.toContain("assistant filler 21");
        },
        { timeout: 8_000, interval: 16 },
      );
    } finally {
      await mounted.cleanup();
    }
  });

  it("does not retrigger a prior context jump when switching thread context modes", async () => {
    const mounted = await mountChatView({
      viewport: DEFAULT_VIEWPORT,
      snapshot: createSnapshotForTargetUser({
        targetMessageId: "msg-user-target-context-toggle-jump" as MessageId,
        targetText: "context jump target",
      }),
    });

    try {
      const contextJumpButton = await waitForThreadContextJumpButton();
      const latestContextToggle = await waitForThreadContextToggle("last");

      contextJumpButton.click();

      await vi.waitFor(
        () => {
          expect(isMessageRowHighlighted("msg-user-0" as MessageId)).toBe(true);
        },
        { timeout: 8_000, interval: 16 },
      );

      latestContextToggle.click();

      await vi.waitFor(
        () => {
          expect(contextJumpButton.textContent).toContain("filler user message 21");
        },
        { timeout: 8_000, interval: 16 },
      );

      for (let index = 0; index < 6; index += 1) {
        await waitForLayout();
        expect(isMessageRowHighlighted("msg-user-21" as MessageId)).toBe(false);
      }
    } finally {
      await mounted.cleanup();
    }
  });

  it("opens the project cwd for draft threads without a worktree path", async () => {
    useComposerDraftStore.setState({
      draftThreadsByThreadId: {
        [THREAD_ID]: {
          projectId: PROJECT_ID,
          createdAt: NOW_ISO,
          runtimeMode: "full-access",
          interactionMode: "default",
          branch: null,
          worktreePath: null,
          envMode: "local",
        },
      },
      projectDraftThreadIdByProjectId: {
        [PROJECT_ID]: THREAD_ID,
      },
    });

    const mounted = await mountChatView({
      viewport: DEFAULT_VIEWPORT,
      snapshot: createDraftOnlySnapshot(),
      configureFixture: (nextFixture) => {
        nextFixture.serverConfig = {
          ...nextFixture.serverConfig,
          availableEditors: ["vscode"],
        };
      },
    });

    try {
      await openHeaderActionsMenu();
      const openInMenuItem = await waitForTextElement(
        "Open in...",
        "Unable to find Open in... menu item.",
      );
      openInMenuItem.click();
      await waitForLayout();
      const vscodeMenuItem = await waitForTextElement(
        "VS Code",
        "Unable to find VS Code menu item.",
      );
      vscodeMenuItem.click();

      await vi.waitFor(
        () => {
          const openRequest = wsRequests.find(
            (request) => request._tag === WS_METHODS.shellOpenInEditor,
          );
          expect(openRequest).toMatchObject({
            _tag: WS_METHODS.shellOpenInEditor,
            cwd: "/repo/project",
            editor: "vscode",
          });
        },
        { timeout: 8_000, interval: 16 },
      );
    } finally {
      await mounted.cleanup();
    }
  });

  it("runs explicit multi-step project actions in separate integrated terminals", async () => {
    const mounted = await mountChatView({
      viewport: DEFAULT_VIEWPORT,
      snapshot: createSnapshotWithProjectScripts([
        {
          id: "run-android",
          name: "Run Android",
          command: "react-native start",
          icon: "build",
          runOnWorktreeCreate: false,
          steps: [
            { id: "metro", command: "react-native start" },
            {
              id: "android",
              command: "react-native run-android --no-packager",
            },
          ],
        },
      ]),
    });

    try {
      wsRequests.length = 0;
      const runButton = await waitForElement(
        () => findButtonsByText("Run Android")[0] ?? null,
        "Unable to find Run Android button.",
      );
      runButton.click();

      await vi.waitFor(
        () => {
          const terminalWrites = wsRequests.filter(
            (request) => request._tag === WS_METHODS.terminalWrite,
          );
          expect(terminalWrites).toEqual(
            expect.arrayContaining([
              expect.objectContaining({ data: "react-native start\r" }),
              expect.objectContaining({
                data: "react-native run-android --no-packager\r",
              }),
            ]),
          );
        },
        { timeout: 8_000, interval: 16 },
      );
    } finally {
      await mounted.cleanup();
    }
  });

  it("keeps single-step project actions as a single integrated terminal command", async () => {
    const mounted = await mountChatView({
      viewport: DEFAULT_VIEWPORT,
      snapshot: createSnapshotWithProjectScripts([
        {
          id: "lint",
          name: "Lint",
          command: "bun run lint",
          icon: "lint",
          runOnWorktreeCreate: false,
        },
      ]),
    });

    try {
      wsRequests.length = 0;
      const runButton = await waitForElement(
        () => findButtonsByText("Lint")[0] ?? null,
        "Unable to find Lint button.",
      );
      runButton.click();

      await vi.waitFor(
        () => {
          const terminalWrites = wsRequests.filter(
            (request) => request._tag === WS_METHODS.terminalWrite,
          );
          expect(terminalWrites).toHaveLength(1);
          expect(terminalWrites[0]).toMatchObject({ data: "bun run lint\r" });
          expect(wsRequests.some((request) => request._tag === WS_METHODS.projectsReadFile)).toBe(
            false,
          );
        },
        { timeout: 8_000, interval: 16 },
      );
    } finally {
      await mounted.cleanup();
    }
  });

  it("does not partially launch a multi-step project action when the terminal cap is exhausted", async () => {
    const mounted = await mountChatView({
      viewport: DEFAULT_VIEWPORT,
      snapshot: createSnapshotWithProjectScripts([
        {
          id: "dev",
          name: "Dev",
          command: "bun run web",
          icon: "play",
          runOnWorktreeCreate: false,
          steps: [
            { id: "web", command: "bun run web" },
            { id: "api", command: "bun run api" },
          ],
        },
      ]),
    });

    try {
      useTerminalStateStore.setState({
        terminalStateByThreadId: {
          [THREAD_ID]: {
            terminalOpen: false,
            terminalHeight: 320,
            terminalIds: ["terminal-1", "terminal-2", "terminal-3", "terminal-4"],
            runningTerminalIds: [],
            activeTerminalId: "terminal-4",
            terminalGroups: [
              { id: "group-terminal-1", terminalIds: ["terminal-1"] },
              { id: "group-terminal-2", terminalIds: ["terminal-2"] },
              { id: "group-terminal-3", terminalIds: ["terminal-3"] },
              { id: "group-terminal-4", terminalIds: ["terminal-4"] },
            ],
            activeTerminalGroupId: "group-terminal-4",
          },
        },
      });
      wsRequests.length = 0;

      const runButton = await waitForElement(
        () => findButtonsByText("Dev")[0] ?? null,
        "Unable to find Dev button.",
      );
      runButton.click();

      await vi.waitFor(
        () => {
          expect(
            wsRequests.some(
              (request) =>
                request._tag === WS_METHODS.terminalOpen ||
                request._tag === WS_METHODS.terminalWrite,
            ),
          ).toBe(false);
          expect(document.body.textContent).toContain(
            "This action needs 2 terminal tabs, but the thread is limited to 4. Close another terminal and try again.",
          );
        },
        { timeout: 8_000, interval: 16 },
      );
    } finally {
      await mounted.cleanup();
    }
  });

  it("renders distinct interaction mode icons on mobile", async () => {
    const mounted = await mountChatView({
      viewport: MOBILE_VIEWPORT,
      snapshot: createSnapshotForTargetUser({
        targetMessageId: "msg-user-target-mobile-toggle" as MessageId,
        targetText: "mobile toggle target",
      }),
    });

    try {
      const chatModeButton = await waitForInteractionModeButton("Chat");
      expect(chatModeButton.dataset.interactionMode).toBe("chat");
      expect(chatModeButton.querySelector("[data-interaction-mode-icon='chat']")).toBeTruthy();

      chatModeButton.click();

      await vi.waitFor(
        async () => {
          const planModeButton = await waitForInteractionModeToggle("plan");
          expect(planModeButton.textContent?.trim()).toBe("Plan");
          expect(planModeButton.querySelector("[data-interaction-mode-icon='plan']")).toBeTruthy();
        },
        { timeout: 8_000, interval: 16 },
      );
    } finally {
      await mounted.cleanup();
    }
  });

  it("expands legacy npm run android actions into Metro plus Android integrated terminals", async () => {
    const mounted = await mountChatView({
      viewport: DEFAULT_VIEWPORT,
      snapshot: createSnapshotWithProjectScripts([
        {
          id: "run-android",
          name: "Run Android",
          command: "rtk proxy npm run android",
          icon: "build",
          runOnWorktreeCreate: false,
        },
      ]),
      configureFixture: (nextFixture) => {
        nextFixture.projectFiles = {
          "package.json": JSON.stringify({
            scripts: {
              start: "react-native start",
              android: "react-native run-android",
            },
          }),
        };
      },
    });

    try {
      wsRequests.length = 0;
      const runButton = await waitForElement(
        () => findButtonsByText("Run Android")[0] ?? null,
        "Unable to find Run Android button.",
      );
      runButton.click();

      await vi.waitFor(
        () => {
          expect(wsRequests.some((request) => request._tag === WS_METHODS.projectsReadFile)).toBe(
            true,
          );
          const terminalWrites = wsRequests.filter(
            (request) => request._tag === WS_METHODS.terminalWrite,
          );
          expect(terminalWrites).toEqual(
            expect.arrayContaining([
              expect.objectContaining({ data: "rtk proxy npm run start\r" }),
              expect.objectContaining({
                data: "rtk proxy npm run android -- --no-packager\r",
              }),
            ]),
          );
        },
        { timeout: 8_000, interval: 16 },
      );
    } finally {
      await mounted.cleanup();
    }
  });

  it("supports multi-image upload from the mobile composer toolbar button", async () => {
    const mounted = await mountChatView({
      viewport: MOBILE_VIEWPORT,
      snapshot: createSnapshotForTargetUser({
        targetMessageId: "msg-user-target-mobile-upload" as MessageId,
        targetText: "mobile upload target",
      }),
    });

    try {
      const uploadButton = await waitForComposerImagePickerButton();
      const imageInput = await waitForComposerImageInput();

      expect(uploadButton.getAttribute("aria-label")).toBe("Upload images");
      expect(imageInput.accept).toBe("image/*");
      expect(imageInput.multiple).toBe(true);

      const transfer = new DataTransfer();
      transfer.items.add(new File(["first"], "first.png", { type: "image/png" }));
      transfer.items.add(new File(["second"], "second.png", { type: "image/png" }));

      Object.defineProperty(imageInput, "files", {
        configurable: true,
        value: transfer.files,
      });
      imageInput.dispatchEvent(new Event("change", { bubbles: true }));

      await vi.waitFor(
        () => {
          expect(document.querySelectorAll("[data-composer-image-chip='true']").length).toBe(2);
        },
        { timeout: 8_000, interval: 16 },
      );
    } finally {
      await mounted.cleanup();
    }
  });

  it("keeps focus off the mobile composer editor after image upload", async () => {
    const mounted = await mountChatView({
      viewport: MOBILE_VIEWPORT,
      snapshot: createSnapshotForTargetUser({
        targetMessageId: "msg-user-target-mobile-upload-focus" as MessageId,
        targetText: "mobile upload focus target",
      }),
    });

    try {
      const uploadButton = await waitForComposerImagePickerButton();
      const imageInput = await waitForComposerImageInput();

      uploadButton.focus();
      expect(document.activeElement).toBe(uploadButton);

      const transfer = new DataTransfer();
      transfer.items.add(new File(["first"], "first.png", { type: "image/png" }));

      Object.defineProperty(imageInput, "files", {
        configurable: true,
        value: transfer.files,
      });
      imageInput.dispatchEvent(new Event("change", { bubbles: true }));

      await vi.waitFor(
        () => {
          expect(document.querySelectorAll("[data-composer-image-chip='true']").length).toBe(1);
          expect(document.activeElement).toBe(uploadButton);
        },
        { timeout: 8_000, interval: 16 },
      );
    } finally {
      await mounted.cleanup();
    }
  });

  it("pins the composer editor direction to ltr", async () => {
    const mounted = await mountChatView({
      viewport: MOBILE_VIEWPORT,
      snapshot: createSnapshotForTargetUser({
        targetMessageId: "msg-user-target-mobile-editor-dir" as MessageId,
        targetText: "mobile editor dir target",
      }),
    });

    try {
      const composerEditor = await waitForComposerEditor();
      expect(getComputedStyle(composerEditor).direction).toBe("ltr");
    } finally {
      await mounted.cleanup();
    }
  });

  it("inserts a newline instead of sending when Enter is pressed in the mobile composer", async () => {
    useComposerDraftStore.getState().setPrompt(THREAD_ID, "Mobile draft");

    const mounted = await mountChatView({
      viewport: MOBILE_VIEWPORT,
      snapshot: createSnapshotForTargetUser({
        targetMessageId: "msg-user-target-mobile-enter" as MessageId,
        targetText: "mobile enter target",
      }),
    });

    try {
      const composerEditor = await waitForComposerEditor();
      await waitForEnabledSendButton();
      composerEditor.focus();
      composerEditor.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          bubbles: true,
          cancelable: true,
        }),
      );

      await vi.waitFor(
        () => {
          const prompt = useComposerDraftStore.getState().draftsByThreadId[THREAD_ID]?.prompt ?? "";
          expect(prompt).toContain("\n");
          expect(prompt.replaceAll("\n", "")).toBe("Mobile draft");
        },
        { timeout: 8_000, interval: 16 },
      );

      await waitForLayout();
      expect(
        wsRequests.find(
          (request) =>
            request._tag === ORCHESTRATION_WS_METHODS.dispatchCommand &&
            request.type === "thread.turn.start",
        ),
      ).toBeUndefined();
    } finally {
      await mounted.cleanup();
    }
  });

  it("keeps the composer editable while a turn is running", async () => {
    const mounted = await mountChatView({
      viewport: DEFAULT_VIEWPORT,
      snapshot: createSnapshotWithExecutingPlan(),
    });

    try {
      const composerEditor = await waitForComposerEditor();
      const stopButton = await waitForStopButton();

      expect(stopButton.getAttribute("aria-label")).toBe("Stop generation");
      expect(composerEditor.getAttribute("contenteditable")).toBe("true");
    } finally {
      await mounted.cleanup();
    }
  });

  it("queues a follow-up when Enter is pressed during a running turn", async () => {
    useComposerDraftStore.getState().setPrompt(THREAD_ID, "Draft while running");

    const mounted = await mountChatView({
      viewport: DEFAULT_VIEWPORT,
      snapshot: createSnapshotWithExecutingPlan(),
    });

    try {
      const composerEditor = await waitForComposerEditor();
      await waitForStopButton();
      composerEditor.focus();
      composerEditor.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          bubbles: true,
          cancelable: true,
        }),
      );

      await vi.waitFor(
        () => {
          expect(
            useComposerDraftStore
              .getState()
              .queuedMessagesByThreadId[THREAD_ID]?.map((entry) => entry.prompt),
          ).toEqual(["Draft while running"]);
        },
        { timeout: 8_000, interval: 16 },
      );

      await waitForLayout();
      expect(
        wsRequests.find(
          (request) =>
            request._tag === ORCHESTRATION_WS_METHODS.dispatchCommand &&
            request.type === "thread.turn.start",
        ),
      ).toBeUndefined();
      expect(useComposerDraftStore.getState().draftsByThreadId[THREAD_ID]?.prompt ?? "").toBe("");
    } finally {
      await mounted.cleanup();
    }
  });

  it("allows changing the selected pending user input option", async () => {
    const mounted = await mountChatView({
      viewport: DEFAULT_VIEWPORT,
      snapshot: createSnapshotWithPendingUserInput(),
    });

    try {
      const recommendedOption = await waitForPendingUserInputOption("Pure static (Recommended)");
      const explicitConfigOption = await waitForPendingUserInputOption("Static + explicit config");

      expect(recommendedOption.dataset.slot).toBe("button");
      expect(elementOwnsCenterPoint(recommendedOption)).toBe(true);
      expect(elementOwnsCenterPoint(explicitConfigOption)).toBe(true);
      expect(elementOwnsInteriorPoint(recommendedOption, 0.5, 0.85)).toBe(true);
      expect(elementOwnsInteriorPoint(explicitConfigOption, 0.5, 0.85)).toBe(true);

      recommendedOption.click();

      await vi.waitFor(
        () => {
          expect(recommendedOption.className).toContain("bg-primary");
          expect(explicitConfigOption.className).not.toContain("bg-primary");
          expect(document.activeElement).toBe(recommendedOption);
        },
        { timeout: 8_000, interval: 16 },
      );

      explicitConfigOption.click();

      await vi.waitFor(
        () => {
          expect(explicitConfigOption.className).toContain("bg-primary");
          expect(recommendedOption.className).not.toContain("bg-primary");
          expect(document.activeElement).toBe(explicitConfigOption);
        },
        { timeout: 8_000, interval: 16 },
      );
    } finally {
      await mounted.cleanup();
    }
  });

  it("shows the pending user input description tooltip for the full option chip", async () => {
    const mounted = await mountChatView({
      viewport: DEFAULT_VIEWPORT,
      snapshot: createSnapshotWithPendingUserInput(),
    });

    try {
      const recommendedOption = await waitForPendingUserInputOption("Pure static (Recommended)");

      expect(elementOwnsInteriorPoint(recommendedOption, 0.5, 0.85)).toBe(true);

      recommendedOption.focus();

      await vi.waitFor(
        () => {
          expect(document.body.textContent).toContain("Export a static site with no Node runtime.");
        },
        { timeout: 8_000, interval: 16 },
      );
    } finally {
      await mounted.cleanup();
    }
  });

  it("submits pending user input from the composer button while the thread is still running", async () => {
    const mounted = await mountChatView({
      viewport: DEFAULT_VIEWPORT,
      snapshot: createSnapshotWithPendingUserInput({ sessionStatus: "running" }),
    });

    try {
      const recommendedOption = await waitForPendingUserInputOption("Pure static (Recommended)");
      recommendedOption.click();

      const submitButton = await waitForPendingUserInputSubmitButton();
      submitButton.click();

      await vi.waitFor(
        () => {
          const submitRequest = findDispatchedCommand("thread.user-input.respond");
          expect(submitRequest).toMatchObject({
            _tag: ORCHESTRATION_WS_METHODS.dispatchCommand,
            command: {
              type: "thread.user-input.respond",
              threadId: THREAD_ID,
              requestId: "req-user-input-browser-1",
              answers: {
                hosting: "Pure static (Recommended)",
              },
            },
          });
        },
        { timeout: 8_000, interval: 16 },
      );
    } finally {
      await mounted.cleanup();
    }
  });

  it("submits pending user input with Enter while the thread is still running", async () => {
    const mounted = await mountChatView({
      viewport: DEFAULT_VIEWPORT,
      snapshot: createSnapshotWithPendingUserInput({ sessionStatus: "running" }),
    });

    try {
      const recommendedOption = await waitForPendingUserInputOption("Pure static (Recommended)");
      recommendedOption.click();

      const composerEditor = await waitForComposerEditor();
      composerEditor.focus();
      composerEditor.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          bubbles: true,
          cancelable: true,
        }),
      );

      await vi.waitFor(
        () => {
          const submitRequest = findDispatchedCommand("thread.user-input.respond");
          expect(submitRequest).toMatchObject({
            _tag: ORCHESTRATION_WS_METHODS.dispatchCommand,
            command: {
              type: "thread.user-input.respond",
              threadId: THREAD_ID,
              requestId: "req-user-input-browser-1",
              answers: {
                hosting: "Pure static (Recommended)",
              },
            },
          });
        },
        { timeout: 8_000, interval: 16 },
      );
    } finally {
      await mounted.cleanup();
    }
  });

  it("toggles plan mode with Shift+Tab only while the composer is focused", async () => {
    const mounted = await mountChatView({
      viewport: DEFAULT_VIEWPORT,
      snapshot: createSnapshotForTargetUser({
        targetMessageId: "msg-user-target-hotkey" as MessageId,
        targetText: "hotkey target",
      }),
    });

    try {
      const initialModeButton = await waitForInteractionModeButton("Chat");
      expect(initialModeButton.title).toContain("enter plan mode");

      window.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Tab",
          shiftKey: true,
          bubbles: true,
          cancelable: true,
        }),
      );
      await waitForLayout();

      expect((await waitForInteractionModeButton("Chat")).title).toContain("enter plan mode");

      const composerEditor = await waitForComposerEditor();
      composerEditor.focus();
      composerEditor.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Tab",
          shiftKey: true,
          bubbles: true,
          cancelable: true,
        }),
      );

      await vi.waitFor(
        async () => {
          expect((await waitForInteractionModeButton("Plan")).title).toContain(
            "return to normal chat mode",
          );
        },
        { timeout: 8_000, interval: 16 },
      );

      composerEditor.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Tab",
          shiftKey: true,
          bubbles: true,
          cancelable: true,
        }),
      );

      await vi.waitFor(
        async () => {
          expect((await waitForInteractionModeButton("Chat")).title).toContain("enter plan mode");
        },
        { timeout: 8_000, interval: 16 },
      );
    } finally {
      await mounted.cleanup();
    }
  });

  it("disables browser scroll anchoring on the desktop message scroller", async () => {
    const mounted = await mountChatView({
      viewport: DEFAULT_VIEWPORT,
      snapshot: createRunningSnapshot(),
    });

    try {
      const scrollContainer = await waitForMessageScrollContainer();
      expect(getComputedStyle(scrollContainer).overflowAnchor).toBe("none");
    } finally {
      await mounted.cleanup();
    }
  });

  it("keeps the message scroller above the composer footer", async () => {
    const mounted = await mountChatView({
      viewport: DEFAULT_VIEWPORT,
      snapshot: createRunningSnapshot(),
    });

    try {
      const scrollContainer = await waitForMessageScrollContainer();
      const composerForm = await waitForElement(
        () => document.querySelector<HTMLFormElement>("[data-chat-composer-form='true']"),
        "Unable to find composer form.",
      );

      await vi.waitFor(
        () => {
          const scrollRect = scrollContainer.getBoundingClientRect();
          const composerRect = composerForm.getBoundingClientRect();
          expect(scrollRect.height).toBeGreaterThan(0);
          expect(scrollRect.bottom).toBeLessThanOrEqual(composerRect.top + 2);
        },
        { timeout: 8_000, interval: 16 },
      );
    } finally {
      await mounted.cleanup();
    }
  });

  it("keeps a draft thread selected until snapshot promotion catches up", async () => {
    useComposerDraftStore.getState().setProjectDraftThreadId(PROJECT_ID, THREAD_ID, {
      createdAt: NOW_ISO,
      envMode: "local",
      runtimeMode: "full-access",
      interactionMode: "default",
    });

    const mounted = await mountChatView({
      viewport: DEFAULT_VIEWPORT,
      snapshot: createDraftOnlySnapshot(),
    });

    try {
      await submitQueuedPrompt("Promote this draft");

      await vi.waitFor(
        () => {
          expect(
            wsRequests.some((request) => dispatchCommand(request)?.type === "thread.create"),
          ).toBe(true);
          expect(
            wsRequests.some((request) => dispatchCommand(request)?.type === "thread.turn.start"),
          ).toBe(true);
        },
        { timeout: 8_000, interval: 16 },
      );

      await new Promise((resolve) => window.setTimeout(resolve, 80));
      await waitForLayout();

      expect(useComposerDraftStore.getState().getDraftThread(THREAD_ID)).not.toBeNull();
      expect(mounted.pathname()).toBe(`/${THREAD_ID}`);
    } finally {
      await mounted.cleanup();
    }
  });

  it("queues a follow-up while the thread is running and auto-dispatches it after the thread becomes idle", async () => {
    const mounted = await mountChatView({
      viewport: DEFAULT_VIEWPORT,
      snapshot: createRunningSnapshot(),
    });

    try {
      await submitQueuedPrompt("Queue this follow-up");

      expect(
        useComposerDraftStore
          .getState()
          .queuedMessagesByThreadId[THREAD_ID]?.map((entry) => entry.prompt),
      ).toEqual(["Queue this follow-up"]);
      expect(document.body.textContent).toContain("Queue this follow-up");
      expect(
        wsRequests.some((request) => dispatchCommand(request)?.type === "thread.turn.start"),
      ).toBe(false);

      setThreadState((thread) => ({
        ...thread,
        updatedAt: isoAt(90),
        activities: [],
        session: {
          threadId: THREAD_ID,
          status: "ready",
          providerName: "codex",
          runtimeMode: "full-access",
          activeTurnId: null,
          lastError: null,
          updatedAt: isoAt(90),
        },
      }));

      await vi.waitFor(
        () => {
          const startRequest = wsRequests.find(
            (request) => dispatchCommand(request)?.type === "thread.turn.start",
          );
          expect(dispatchCommandMessageText(startRequest)).toBe("Queue this follow-up");
        },
        { timeout: 8_000, interval: 16 },
      );
    } finally {
      await mounted.cleanup();
    }
  });

  it("minimizes and restores the active plan card in the thread view", async () => {
    const mounted = await mountChatView({
      viewport: DEFAULT_VIEWPORT,
      snapshot: createSnapshotWithExecutingPlan(),
    });

    try {
      await vi.waitFor(
        () => {
          expect(document.querySelector("[data-plan-mode-panel-body='true']")).toBeTruthy();
          expect(document.body.textContent).toContain("Add a minimize toggle");
        },
        { timeout: 8_000, interval: 16 },
      );

      const toggle = await waitForPlanModePanelToggle();
      expect(toggle.textContent?.trim()).toContain("Minimize");
      toggle.click();

      await vi.waitFor(
        () => {
          expect(document.querySelector("[data-plan-mode-panel-body='true']")).toBeNull();
          expect(document.body.textContent).not.toContain("Add a minimize toggle");
          expect(document.body.textContent).toContain("3 steps, 1 in progress, 1 done, 1 pending");
        },
        { timeout: 8_000, interval: 16 },
      );

      const expandToggle = await waitForPlanModePanelToggle();
      expect(expandToggle.textContent?.trim()).toContain("Expand");
      expandToggle.click();

      await vi.waitFor(
        () => {
          expect(document.querySelector("[data-plan-mode-panel-body='true']")).toBeTruthy();
          expect(document.body.textContent).toContain("Add a minimize toggle");
        },
        { timeout: 8_000, interval: 16 },
      );
    } finally {
      await mounted.cleanup();
    }
  });

  it("dispatches queued follow-ups one turn at a time across separate idle cycles", async () => {
    const mounted = await mountChatView({
      viewport: DEFAULT_VIEWPORT,
      snapshot: createRunningSnapshot(),
    });

    try {
      await submitQueuedPrompt("First queued follow-up");
      await submitQueuedPrompt("Second queued follow-up");

      setThreadState((thread) => ({
        ...thread,
        updatedAt: isoAt(95),
        activities: [],
        session: {
          threadId: THREAD_ID,
          status: "ready",
          providerName: "codex",
          runtimeMode: "full-access",
          activeTurnId: null,
          lastError: null,
          updatedAt: isoAt(95),
        },
      }));

      await vi.waitFor(
        () => {
          const startRequests = wsRequests.filter(
            (request) => dispatchCommand(request)?.type === "thread.turn.start",
          );
          expect(startRequests).toHaveLength(1);
          expect(dispatchCommandMessageText(startRequests[0])).toBe("First queued follow-up");
        },
        { timeout: 8_000, interval: 16 },
      );

      await new Promise((resolve) => window.setTimeout(resolve, 120));

      expect(
        wsRequests.filter((request) => dispatchCommand(request)?.type === "thread.turn.start"),
      ).toHaveLength(1);

      setThreadState((thread) => ({
        ...thread,
        updatedAt: isoAt(96),
        activities: [],
        session: {
          threadId: THREAD_ID,
          status: "running",
          providerName: "codex",
          runtimeMode: "full-access",
          activeTurnId: "turn-running-second-cycle" as never,
          lastError: null,
          updatedAt: isoAt(96),
        },
      }));

      await waitForLayout();

      setThreadState((thread) => ({
        ...thread,
        updatedAt: isoAt(97),
        activities: [],
        session: {
          threadId: THREAD_ID,
          status: "ready",
          providerName: "codex",
          runtimeMode: "full-access",
          activeTurnId: null,
          lastError: null,
          updatedAt: isoAt(97),
        },
      }));

      await vi.waitFor(
        () => {
          const startRequests = wsRequests.filter(
            (request) => dispatchCommand(request)?.type === "thread.turn.start",
          );
          expect(startRequests).toHaveLength(2);
          expect(dispatchCommandMessageText(startRequests[1])).toBe("Second queued follow-up");
        },
        { timeout: 8_000, interval: 16 },
      );
    } finally {
      await mounted.cleanup();
    }
  });

  it("floats the thread cards above the message scroller", async () => {
    const mounted = await mountChatView({
      viewport: DEFAULT_VIEWPORT,
      snapshot: createSnapshotWithExecutingPlan(),
    });

    try {
      const floatingCards = await waitForElement(
        () => document.querySelector<HTMLElement>("[data-thread-floating-cards='true']"),
        "Unable to find floating thread cards container.",
      );
      const scrollContainer = await waitForElement(
        () => document.querySelector<HTMLDivElement>("div.overflow-y-auto.overscroll-y-contain"),
        "Unable to find ChatView message scroll container.",
      );

      await vi.waitFor(
        () => {
          expect(floatingCards.getBoundingClientRect().height).toBeGreaterThan(0);
          expect(scrollContainer.style.paddingTop).toMatch(/\d+px/);
          expect(scrollContainer.style.scrollPaddingTop).toMatch(/\d+px/);
        },
        { timeout: 8_000, interval: 16 },
      );
    } finally {
      await mounted.cleanup();
    }
  });

  it("keeps the thread in a working state while a queued send is handing off to the server", async () => {
    const mounted = await mountChatView({
      viewport: DEFAULT_VIEWPORT,
      snapshot: createRunningSnapshot(),
    });

    try {
      await submitQueuedPrompt("Queued handoff");

      setThreadState((thread) => ({
        ...thread,
        updatedAt: isoAt(98),
        activities: [],
        session: {
          threadId: THREAD_ID,
          status: "ready",
          providerName: "codex",
          runtimeMode: "full-access",
          activeTurnId: null,
          lastError: null,
          updatedAt: isoAt(98),
        },
      }));

      await vi.waitFor(
        () => {
          const startRequest = wsRequests.find(
            (request) => dispatchCommand(request)?.type === "thread.turn.start",
          );
          expect(dispatchCommandMessageText(startRequest)).toBe("Queued handoff");
        },
        { timeout: 8_000, interval: 16 },
      );

      await vi.waitFor(
        () => {
          expect(document.body.textContent).toContain("Codex is working");
          expect(document.body.textContent).toContain("Preparing response");
        },
        { timeout: 8_000, interval: 16 },
      );
    } finally {
      await mounted.cleanup();
    }
  });

  it("does not auto-dispatch queued follow-ups while an approval is pending", async () => {
    const mounted = await mountChatView({
      viewport: DEFAULT_VIEWPORT,
      snapshot: createRunningSnapshot(),
    });

    try {
      await submitQueuedPrompt("Wait behind approval");

      setThreadState((thread) => ({
        ...thread,
        updatedAt: isoAt(120),
        activities: [
          {
            id: "activity-approval-1",
            turnId: null,
            tone: "approval",
            kind: "approval.requested",
            summary: "Approval requested",
            createdAt: isoAt(119),
            payload: {
              requestId: "req-approval-1",
              requestType: "command_execution_approval",
            },
          } as never,
        ],
        session: {
          threadId: THREAD_ID,
          status: "ready",
          providerName: "codex",
          runtimeMode: "full-access",
          activeTurnId: null,
          lastError: null,
          updatedAt: isoAt(120),
        },
      }));

      await waitForLayout();
      await new Promise((resolve) => window.setTimeout(resolve, 120));

      expect(
        wsRequests.some((request) => {
          const command = dispatchCommand(request);
          if (command?.type !== "thread.turn.start") {
            return false;
          }
          const message = command.message;
          return (
            !!message &&
            typeof message === "object" &&
            (message as Record<string, unknown>).text === "Wait behind approval"
          );
        }),
      ).toBe(false);
    } finally {
      await mounted.cleanup();
    }
  });

  it("steers a queued message by interrupting the run and sending the promoted item next", async () => {
    const mounted = await mountChatView({
      viewport: DEFAULT_VIEWPORT,
      snapshot: createRunningSnapshot(),
    });

    try {
      await submitQueuedPrompt("First queued");
      await submitQueuedPrompt("Second queued");

      const steerButtons = findButtonsByText("Steer");
      expect(steerButtons).toHaveLength(2);
      steerButtons[1]?.click();

      await vi.waitFor(
        () => {
          const interruptRequest = wsRequests.find(
            (request) => dispatchCommand(request)?.type === "thread.turn.interrupt",
          );
          expect(interruptRequest).toBeTruthy();
        },
        { timeout: 8_000, interval: 16 },
      );

      expect(
        useComposerDraftStore
          .getState()
          .queuedMessagesByThreadId[THREAD_ID]?.map((entry) => entry.prompt),
      ).toEqual(["Second queued", "First queued"]);

      setThreadState((thread) => ({
        ...thread,
        updatedAt: isoAt(150),
        activities: [],
        session: {
          threadId: THREAD_ID,
          status: "ready",
          providerName: "codex",
          runtimeMode: "full-access",
          activeTurnId: null,
          lastError: null,
          updatedAt: isoAt(150),
        },
      }));

      await vi.waitFor(
        () => {
          const startRequest = wsRequests.find((request) => {
            const command = dispatchCommand(request);
            if (command?.type !== "thread.turn.start") {
              return false;
            }
            const message = command.message;
            return (
              !!message &&
              typeof message === "object" &&
              (message as Record<string, unknown>).text === "Second queued"
            );
          });
          expect(startRequest).toBeTruthy();
        },
        { timeout: 8_000, interval: 16 },
      );
    } finally {
      await mounted.cleanup();
    }
  });

  it("shows a context-window badge and tooltip when the active codex thread has usage data", async () => {
    const mounted = await mountChatView({
      viewport: DEFAULT_VIEWPORT,
      snapshot: (() => {
        const snapshot = createSnapshotForTargetUser({
          targetMessageId: "msg-user-context-window" as MessageId,
          targetText: "context target",
        });
        const [thread] = snapshot.threads;
        if (!thread) {
          return snapshot;
        }
        return {
          ...snapshot,
          threads: [
            {
              ...thread,
              contextWindow: {
                provider: "codex" as const,
                usedTokens: 44_680,
                reportedTotalTokens: 119000,
                reportedLastTokens: 8500,
                maxTokens: 258000,
                remainingTokens: 0,
                usedPercent: 100,
                inputTokens: 110000,
                cachedInputTokens: 65000,
                outputTokens: 9000,
                reasoningOutputTokens: 320,
                updatedAt: NOW_ISO,
              },
            },
          ],
        };
      })(),
    });

    try {
      const badge = await waitForElement(
        () =>
          Array.from(document.querySelectorAll("button")).find(
            (button) => button.getAttribute("aria-label") === "Estimated context window usage",
          ) as HTMLButtonElement | null,
        "Unable to find context-window badge.",
      );
      expect(badge.textContent?.trim()).toBe("14%");

      badge.focus();

      await vi.waitFor(
        () => {
          expect(document.body.textContent).toContain("Estimated context window");
          expect(document.body.textContent).toContain("14% used (86% left)");
          expect(document.body.textContent).toContain("Estimated usage: 35.7k / 258k tokens");
          expect(document.body.textContent).toContain(
            "Derived from the current Codex totals with cached, output, and reasoning tokens removed.",
          );
          expect(document.body.textContent).toContain("Reported total: 119k tokens");
          expect(document.body.textContent).toContain("Reported last turn: 8.5k tokens");
          expect(document.body.textContent).toContain("Model context window: 258k tokens");
          expect(document.body.textContent).toContain(
            "Reported totals: Input 110k, cached 65k, output 9k, reasoning 320",
          );
        },
        { timeout: 8_000, interval: 16 },
      );
    } finally {
      await mounted.cleanup();
    }
  });

  it("estimates codex context usage from a compaction baseline", async () => {
    const mounted = await mountChatView({
      viewport: DEFAULT_VIEWPORT,
      snapshot: (() => {
        const snapshot = createSnapshotForTargetUser({
          targetMessageId: "msg-user-context-window-overflow" as MessageId,
          targetText: "context overflow target",
        });
        const [thread] = snapshot.threads;
        if (!thread) {
          return snapshot;
        }
        return {
          ...snapshot,
          threads: [
            {
              ...thread,
              contextWindow: {
                provider: "codex" as const,
                usedTokens: 68_700,
                reportedTotalTokens: 9_300_000,
                reportedLastTokens: 12_800,
                compactionAnchorNonCachedTokens: 6_681_000,
                compactionAnchorUsedTokens: 38_700,
                maxTokens: 258_000,
                remainingTokens: 189_300,
                usedPercent: 27,
                inputTokens: 9_120_000,
                cachedInputTokens: 2_400_000,
                outputTokens: 180_000,
                reasoningOutputTokens: 9_000,
                updatedAt: NOW_ISO,
              },
            },
          ],
        };
      })(),
    });

    try {
      const badge = await waitForElement(
        () =>
          Array.from(document.querySelectorAll("button")).find(
            (button) => button.getAttribute("aria-label") === "Estimated context window usage",
          ) as HTMLButtonElement | null,
        "Unable to find context-window badge.",
      );
      expect(badge.textContent?.trim()).toBe("27%");

      badge.focus();

      await vi.waitFor(
        () => {
          expect(document.body.textContent).toContain("Estimated context window");
          expect(document.body.textContent).toContain("27% used (73% left)");
          expect(document.body.textContent).toContain("Estimated usage: 68.7k / 258k tokens");
          expect(document.body.textContent).toContain(
            "Estimated from a 15% post-compaction reset plus new non-cached token growth.",
          );
          expect(document.body.textContent).toContain("Reported total: 9.3m tokens");
          expect(document.body.textContent).toContain("Reported last turn: 12.8k tokens");
          expect(document.body.textContent).toContain("Model context window: 258k tokens");
          expect(document.body.textContent).toContain(
            "Reported totals: Input 9.1m, cached 2.4m, output 180k, reasoning 9k",
          );
        },
        { timeout: 8_000, interval: 16 },
      );
    } finally {
      await mounted.cleanup();
    }
  });

  it("recovers codex display from a legacy snapshot clamped at 100%", async () => {
    const mounted = await mountChatView({
      viewport: DEFAULT_VIEWPORT,
      snapshot: (() => {
        const snapshot = createSnapshotForTargetUser({
          targetMessageId: "msg-user-context-window-clamped" as MessageId,
          targetText: "context clamped target",
        });
        const [thread] = snapshot.threads;
        if (!thread) {
          return snapshot;
        }
        return {
          ...snapshot,
          threads: [
            {
              ...thread,
              contextWindow: {
                provider: "codex" as const,
                usedTokens: 258_000,
                reportedTotalTokens: 258_000,
                reportedLastTokens: 18_000,
                reportedLastEffectiveTokens: 11_000,
                maxTokens: 258_000,
                remainingTokens: 0,
                usedPercent: 100,
                updatedAt: NOW_ISO,
              },
            },
          ],
        };
      })(),
    });

    try {
      const badge = await waitForElement(
        () =>
          Array.from(document.querySelectorAll("button")).find(
            (button) => button.getAttribute("aria-label") === "Estimated context window usage",
          ) as HTMLButtonElement | null,
        "Unable to find context-window badge.",
      );
      expect(badge.textContent?.trim()).toBe("19%");

      badge.focus();

      await vi.waitFor(
        () => {
          expect(document.body.textContent).toContain("Estimated context window");
          expect(document.body.textContent).toContain("19% used (81% left)");
          expect(document.body.textContent).toContain("Estimated usage: 49.7k / 258k tokens");
          expect(document.body.textContent).toContain(
            "Approximated from the latest reported turn while waiting for a refreshed compaction anchor.",
          );
          expect(document.body.textContent).toContain("Reported total: 258k tokens");
          expect(document.body.textContent).toContain("Reported last turn: 18k tokens");
          expect(document.body.textContent).toContain("Estimated last-turn footprint: 11k tokens");
        },
        { timeout: 8_000, interval: 16 },
      );
    } finally {
      await mounted.cleanup();
    }
  });

  it("moves queued content back into the composer for editing and supports deleting queued items", async () => {
    const mounted = await mountChatView({
      viewport: DEFAULT_VIEWPORT,
      snapshot: createRunningSnapshot(),
    });

    try {
      await submitQueuedPrompt("Queued for edit");
      useComposerDraftStore.getState().setPrompt(THREAD_ID, "Current composer");
      await waitForLayout();

      const editButton = await waitForElement(
        () => findButtonByLabel("Edit queued message"),
        "Unable to find queued edit button.",
      );
      editButton.click();
      await waitForLayout();

      expect(useComposerDraftStore.getState().draftsByThreadId[THREAD_ID]?.prompt).toBe(
        "Queued for edit",
      );
      expect(
        useComposerDraftStore.getState().queuedMessagesByThreadId[THREAD_ID]?.[0]?.prompt,
      ).toBe("Current composer");

      const deleteButton = await waitForElement(
        () => findButtonByLabel("Delete queued message"),
        "Unable to find queued delete button.",
      );
      deleteButton.click();
      await waitForLayout();

      expect(useComposerDraftStore.getState().queuedMessagesByThreadId[THREAD_ID]).toBeUndefined();
    } finally {
      await mounted.cleanup();
    }
  });

  it("reorders queued messages through drag and drop", async () => {
    const mounted = await mountChatView({
      viewport: DEFAULT_VIEWPORT,
      snapshot: createRunningSnapshot(),
    });

    try {
      await submitQueuedPrompt("First queued");
      await submitQueuedPrompt("Second queued");
      await submitQueuedPrompt("Third queued");

      const initialQueue =
        useComposerDraftStore.getState().queuedMessagesByThreadId[THREAD_ID] ?? [];
      expect(initialQueue.map((entry) => entry.prompt)).toEqual([
        "First queued",
        "Second queued",
        "Third queued",
      ]);

      const sourceQueuedMessageId = initialQueue[2]?.id;
      const targetQueuedMessageId = initialQueue[0]?.id;
      expect(sourceQueuedMessageId).toBeTruthy();
      expect(targetQueuedMessageId).toBeTruthy();

      await dragQueuedMessageToTarget(sourceQueuedMessageId!, targetQueuedMessageId!);

      expect(
        useComposerDraftStore
          .getState()
          .queuedMessagesByThreadId[THREAD_ID]?.map((entry) => entry.prompt),
      ).toEqual(["Third queued", "First queued", "Second queued"]);

      const queuedCards = Array.from(
        document.querySelectorAll<HTMLDivElement>("[data-testid^='queued-message-card-']"),
      );
      expect(queuedCards[0]?.textContent).toContain("Third queued");
    } finally {
      await mounted.cleanup();
    }
  });

  it("hides the context-window badge when the active thread has no usage snapshot", async () => {
    const mounted = await mountChatView({
      viewport: DEFAULT_VIEWPORT,
      snapshot: createSnapshotForTargetUser({
        targetMessageId: "msg-user-no-context-window" as MessageId,
        targetText: "no context target",
      }),
    });

    try {
      await waitForLayout();
      const badge = Array.from(document.querySelectorAll("button")).find(
        (button) => button.getAttribute("aria-label") === "Context window usage",
      );
      expect(badge).toBeUndefined();
    } finally {
      await mounted.cleanup();
    }
  });
});
