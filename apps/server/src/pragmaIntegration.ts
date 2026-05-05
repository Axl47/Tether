import type {
  OrchestrationReadModel,
  ServerDesktopContext,
  ServerSetDesktopContextInput,
} from "@t3tools/contracts";
import { Effect, Stream } from "effect";
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/unstable/http";

import { ServerAuth } from "./auth/Services/ServerAuth.ts";
import { SessionCredentialService } from "./auth/Services/SessionCredentialService.ts";
import { respondToAuthError } from "./auth/http.ts";
import { DesktopContextStore } from "./desktopContextStore.ts";
import { OrchestrationEngineService } from "./orchestration/Services/OrchestrationEngine.ts";
import { ProjectionSnapshotQuery } from "./orchestration/Services/ProjectionSnapshotQuery.ts";

export const PRAGMA_INTEGRATION_WS_PATH = "/pragma";

interface PragmaRequest {
  readonly id: string;
  readonly tag: string;
  readonly payload: Record<string, unknown>;
}

interface PragmaProjectSnapshot {
  readonly id: string;
  readonly title: string;
  readonly workspaceRoot: string;
}

function parsePragmaRequest(raw: string | Uint8Array): PragmaRequest | null {
  if (typeof raw !== "string") {
    return null;
  }

  const parsed = JSON.parse(raw) as unknown;
  if (typeof parsed !== "object" || parsed === null) {
    return null;
  }

  const envelope = parsed as { id?: unknown; body?: unknown };
  if (typeof envelope.id !== "string") {
    return null;
  }

  if (typeof envelope.body !== "object" || envelope.body === null) {
    return null;
  }

  const body = envelope.body as Record<string, unknown>;
  const tag = body._tag;
  if (typeof tag !== "string") {
    return null;
  }

  return {
    id: envelope.id,
    tag,
    payload: body,
  };
}

function toPragmaSnapshot(readModel: OrchestrationReadModel): {
  readonly projects: ReadonlyArray<PragmaProjectSnapshot>;
} {
  return {
    projects: readModel.projects
      .filter((project) => project.deletedAt === null)
      .map((project) => ({
        id: project.id,
        title: project.title,
        workspaceRoot: project.workspaceRoot,
      })),
  };
}

const nullableString = (value: unknown): string | null =>
  typeof value === "string" && value.trim().length > 0 ? value : null;

function toSetDesktopContextInput(payload: Record<string, unknown>): ServerSetDesktopContextInput {
  return {
    projectId: nullableString(payload.projectId),
    projectTitle: nullableString(payload.projectTitle),
    workspaceRoot: nullableString(payload.workspaceRoot),
    threadId: nullableString(payload.threadId),
    threadTitle: nullableString(payload.threadTitle),
  } as ServerSetDesktopContextInput;
}

export const pragmaIntegrationRouteLayer = HttpRouter.add(
  "GET",
  PRAGMA_INTEGRATION_WS_PATH,
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const serverAuth = yield* ServerAuth;
    const sessions = yield* SessionCredentialService;
    const session = yield* serverAuth.authenticateWebSocketUpgrade(request);
    const socket = yield* Effect.orDie(request.upgrade);
    const writer = yield* socket.writer;
    const desktopContext = yield* DesktopContextStore;
    const orchestrationEngine = yield* OrchestrationEngineService;
    const projectionSnapshotQuery = yield* ProjectionSnapshotQuery;
    let sequence = 0;

    const sendJson = (payload: unknown) => writer(JSON.stringify(payload));
    const sendResult = (id: string, result: unknown) => sendJson({ id, result });
    const sendError = (id: string, message: string) =>
      sendJson({
        id,
        error: {
          message,
        },
      });
    const push = (channel: string, data: unknown) =>
      sendJson({
        type: "push",
        sequence: ++sequence,
        channel,
        data,
      });

    const handleRequest = (raw: string | Uint8Array) =>
      Effect.gen(function* () {
        const request = yield* Effect.try({
          try: () => parsePragmaRequest(raw),
          catch: () => null,
        });
        if (!request) {
          return;
        }

        switch (request.tag) {
          case "orchestration.getSnapshot": {
            const snapshot = yield* projectionSnapshotQuery.getSnapshot();
            yield* sendResult(request.id, toPragmaSnapshot(snapshot));
            return;
          }
          case "server.getDesktopContext": {
            yield* sendResult(request.id, yield* desktopContext.get);
            return;
          }
          case "server.setDesktopContext": {
            const updated = yield* desktopContext.set(toSetDesktopContextInput(request.payload));
            yield* sendResult(request.id, updated);
            return;
          }
          default:
            yield* sendError(request.id, `Unsupported Pragma RPC method: ${request.tag}`);
        }
      }).pipe(
        Effect.catch((error: unknown) =>
          Effect.gen(function* () {
            const request = yield* Effect.try({
              try: () => parsePragmaRequest(raw),
              catch: () => null,
            });
            if (!request) {
              return;
            }
            yield* sendError(
              request.id,
              error instanceof Error ? error.message : "Tether Pragma integration request failed.",
            );
          }),
        ),
      );

    yield* Effect.acquireUseRelease(
      sessions.markConnected(session.sessionId),
      () =>
        Effect.gen(function* () {
          yield* Effect.forkScoped(
            desktopContext.streamUpdates.pipe(
              Stream.runForEach((context: ServerDesktopContext) =>
                push("server.desktopContextUpdated", context),
              ),
            ),
          );
          yield* Effect.forkScoped(
            orchestrationEngine.streamDomainEvents.pipe(
              Stream.runForEach((event) => push("orchestration.domainEvent", event)),
            ),
          );
          yield* socket.runRaw(handleRequest);
        }),
      () => sessions.markDisconnected(session.sessionId),
    );

    return HttpServerResponse.empty();
  }).pipe(Effect.catchTag("AuthError", respondToAuthError)),
);
