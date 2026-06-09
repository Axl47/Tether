import crypto from "node:crypto";
import os from "node:os";
import { fromJsonStringPretty } from "@t3tools/shared/schemaJson";
import { AuthAdministrativeScopes } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import { HttpServer } from "effect/unstable/http";

import { EnvironmentAuth } from "./auth/EnvironmentAuth.ts";
import { RuntimeMode, ServerConfig, type ServerConfigShape } from "./config.ts";

export interface LocalTetherDiscoveryDescriptor {
  readonly version: 1;
  readonly instanceId: string;
  readonly pid: number;
  readonly mode: RuntimeMode;
  readonly cwd: string;
  readonly stateDir: string;
  readonly host: string;
  readonly port: number;
  readonly wsUrl: string;
  readonly startedAt: string;
  readonly updatedAt: string;
  readonly expiresAt: string;
}

export interface LocalTetherDiscoveryHandle {
  readonly instanceId: string;
  readonly recordPath: string;
}

export interface PublishLocalTetherDiscoveryOptions {
  readonly discoveryDirectory?: string;
  readonly heartbeatMs?: number;
  readonly ttlMs?: number;
  readonly instanceId?: string;
  readonly pid?: number;
  readonly now?: Effect.Effect<DateTime.Utc>;
  readonly serverAddress?: {
    readonly host?: string | undefined;
    readonly port: number;
  };
}

export const LOCAL_TETHER_DISCOVERY_VERSION = 1 as const;
export const LOCAL_TETHER_DISCOVERY_HEARTBEAT_MS = 5_000;
export const LOCAL_TETHER_DISCOVERY_TTL_MS = 15_000;
export const LOCAL_TETHER_DISCOVERY_WS_PATH = "/ws";

export const LocalTetherDiscoveryDescriptor = Schema.Struct({
  version: Schema.Literal(LOCAL_TETHER_DISCOVERY_VERSION),
  instanceId: Schema.String,
  pid: Schema.Int,
  mode: RuntimeMode,
  cwd: Schema.String,
  stateDir: Schema.String,
  host: Schema.String,
  port: Schema.Int,
  wsUrl: Schema.String,
  startedAt: Schema.String,
  updatedAt: Schema.String,
  expiresAt: Schema.String,
});

const LocalTetherDiscoveryDescriptorJson = fromJsonStringPretty(LocalTetherDiscoveryDescriptor);
const encodeLocalTetherDiscoveryDescriptorJson = Schema.encodeEffect(
  LocalTetherDiscoveryDescriptorJson,
);
export const decodeLocalTetherDiscoveryDescriptorJson = Schema.decodeUnknownEffect(
  LocalTetherDiscoveryDescriptorJson,
);

export function resolveLocalTetherDiscoveryDirectory(): string {
  return `${os.homedir()}/.t3/tether/instances`;
}

export function resolveLocalTetherDiscoveryHost(host: string | undefined): string {
  if (!host || host === "0.0.0.0" || host === "::" || host === "[::]") {
    return "127.0.0.1";
  }
  return host;
}

function formatHostForUrl(host: string): string {
  return host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
}

export function buildLocalTetherWsUrl(input: {
  readonly host: string | undefined;
  readonly port: number;
  readonly path?: string;
  readonly wsTicket?: string;
}): string {
  const host = resolveLocalTetherDiscoveryHost(input.host);
  const url = new URL(`ws://${formatHostForUrl(host)}:${input.port}${input.path ?? "/"}`);
  if (input.wsTicket) {
    url.searchParams.set("wsTicket", input.wsTicket);
  }
  return url.toString();
}

const resolveServerAddress = (options: PublishLocalTetherDiscoveryOptions) =>
  Effect.gen(function* () {
    if (options.serverAddress) {
      return options.serverAddress;
    }

    const server = yield* HttpServer.HttpServer;
    const config = yield* ServerConfig;
    const address = server.address;
    if (typeof address !== "string" && "port" in address) {
      return {
        host: config.host,
        port: address.port,
      };
    }

    return {
      host: config.host,
      port: config.port,
    };
  });

const buildLocalTetherDiscoveryDescriptor = (input: {
  readonly config: ServerConfigShape;
  readonly instanceId: string;
  readonly pid: number;
  readonly startedAt: string;
  readonly now: DateTime.Utc;
  readonly ttlMs: number;
  readonly host: string | undefined;
  readonly port: number;
  readonly wsTicket: string;
}): LocalTetherDiscoveryDescriptor => {
  const host = resolveLocalTetherDiscoveryHost(input.host);
  const updatedAt = DateTime.formatIso(input.now);
  const expiresAt = DateTime.formatIso(DateTime.add(input.now, { milliseconds: input.ttlMs }));
  return {
    version: LOCAL_TETHER_DISCOVERY_VERSION,
    instanceId: input.instanceId,
    pid: input.pid,
    mode: input.config.mode,
    cwd: input.config.cwd,
    stateDir: input.config.stateDir,
    host,
    port: input.port,
    wsUrl: buildLocalTetherWsUrl({
      host,
      port: input.port,
      path: LOCAL_TETHER_DISCOVERY_WS_PATH,
      wsTicket: input.wsTicket,
    }),
    startedAt: input.startedAt,
    updatedAt,
    expiresAt,
  };
};

const writeDiscoveryDescriptorAtomically = (input: {
  readonly descriptor: LocalTetherDiscoveryDescriptor;
  readonly destinationPath: string;
}) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const encoded = yield* encodeLocalTetherDiscoveryDescriptorJson(input.descriptor);
    const tempPath = `${input.destinationPath}.${process.pid}.tmp`;
    yield* fs.writeFileString(tempPath, encoded);
    if (process.platform !== "win32") {
      yield* fs.chmod(tempPath, 0o600);
    }
    yield* fs.rename(tempPath, input.destinationPath);
  });

const pruneExpiredDiscoveryFiles = (input: {
  readonly discoveryDirectory: string;
  readonly now: DateTime.Utc;
}) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const names = yield* fs
      .readDirectory(input.discoveryDirectory)
      .pipe(Effect.orElseSucceed(() => [] as ReadonlyArray<string>));
    for (const name of names) {
      if (!name.endsWith(".json")) continue;

      const candidatePath = path.join(input.discoveryDirectory, name);
      const raw = yield* fs.readFileString(candidatePath).pipe(Effect.orElseSucceed(() => null));
      if (!raw) continue;

      const descriptor = yield* decodeLocalTetherDiscoveryDescriptorJson(raw).pipe(Effect.option);
      const expiresAt = descriptor.pipe(Option.flatMap((value) => DateTime.make(value.expiresAt)));
      if (Option.isNone(expiresAt) || DateTime.isGreaterThan(expiresAt.value, input.now)) {
        continue;
      }

      yield* fs.remove(candidatePath).pipe(Effect.orElseSucceed(() => undefined));
    }
  });

export const publishLocalTetherDiscovery = (options: PublishLocalTetherDiscoveryOptions = {}) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const config = yield* ServerConfig;
    const serverAuth = yield* EnvironmentAuth;
    const now = options.now ?? DateTime.now;
    const heartbeatMs = options.heartbeatMs ?? LOCAL_TETHER_DISCOVERY_HEARTBEAT_MS;
    const ttlMs = options.ttlMs ?? LOCAL_TETHER_DISCOVERY_TTL_MS;
    const instanceId = options.instanceId ?? crypto.randomUUID();
    const discoveryDirectory =
      options.discoveryDirectory ?? path.resolve(resolveLocalTetherDiscoveryDirectory());
    const recordPath = path.join(discoveryDirectory, `${instanceId}.json`);
    const pid = options.pid ?? process.pid;
    const session = yield* serverAuth.issueSession({
      subject: "pragma-local-discovery",
      scopes: AuthAdministrativeScopes,
      label: "Pragma local discovery",
    });
    const startedAt = DateTime.formatIso(yield* now);

    yield* fs.makeDirectory(discoveryDirectory, { recursive: true });
    if (process.platform !== "win32") {
      yield* fs.chmod(discoveryDirectory, 0o700).pipe(Effect.orElseSucceed(() => undefined));
    }

    yield* pruneExpiredDiscoveryFiles({
      discoveryDirectory,
      now: yield* now,
    }).pipe(Effect.orElseSucceed(() => undefined));

    const writeCurrentDescriptor = () =>
      Effect.gen(function* () {
        const serverAddress = yield* resolveServerAddress(options);
        const websocketTicket = yield* serverAuth.issueWebSocketTicket(session);
        const currentTime = yield* now;
        yield* writeDiscoveryDescriptorAtomically({
          descriptor: buildLocalTetherDiscoveryDescriptor({
            config,
            instanceId,
            pid,
            startedAt,
            now: currentTime,
            ttlMs,
            host: serverAddress.host,
            port: serverAddress.port,
            wsTicket: websocketTicket.ticket,
          }),
          destinationPath: recordPath,
        });
      });

    yield* writeCurrentDescriptor();

    yield* Effect.forkScoped(
      Effect.forever(
        Effect.sleep(Duration.millis(heartbeatMs)).pipe(
          Effect.flatMap(() => writeCurrentDescriptor()),
        ),
      ),
    );

    yield* Effect.addFinalizer(() =>
      Effect.all(
        [
          fs.remove(recordPath).pipe(Effect.orElseSucceed(() => undefined)),
          serverAuth.revokeSession(session.sessionId).pipe(Effect.orElseSucceed(() => false)),
        ],
        { discard: true },
      ),
    );

    return {
      instanceId,
      recordPath,
    } satisfies LocalTetherDiscoveryHandle;
  });
