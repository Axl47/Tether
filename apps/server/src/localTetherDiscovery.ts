import crypto from "node:crypto";
import os from "node:os";
import { Effect, FileSystem, Path } from "effect";
import { ServerConfig, type RuntimeMode, type ServerConfigShape } from "./config";

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
  readonly now?: () => Date;
}

export const LOCAL_TETHER_DISCOVERY_VERSION = 1 as const;
export const LOCAL_TETHER_DISCOVERY_HEARTBEAT_MS = 5_000;
export const LOCAL_TETHER_DISCOVERY_TTL_MS = 15_000;

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
  readonly authToken: string | undefined;
}): string {
  const host = resolveLocalTetherDiscoveryHost(input.host);
  const url = new URL(`ws://${formatHostForUrl(host)}:${input.port}/`);
  if (input.authToken) {
    url.searchParams.set("token", input.authToken);
  }
  return url.toString();
}

function buildLocalTetherDiscoveryDescriptor(input: {
  readonly config: ServerConfigShape;
  readonly instanceId: string;
  readonly pid: number;
  readonly startedAt: string;
  readonly now: Date;
  readonly ttlMs: number;
}): LocalTetherDiscoveryDescriptor {
  const host = resolveLocalTetherDiscoveryHost(input.config.host);
  const updatedAt = input.now.toISOString();
  const expiresAt = new Date(input.now.getTime() + input.ttlMs).toISOString();
  return {
    version: LOCAL_TETHER_DISCOVERY_VERSION,
    instanceId: input.instanceId,
    pid: input.pid,
    mode: input.config.mode,
    cwd: input.config.cwd,
    stateDir: input.config.stateDir,
    host,
    port: input.config.port,
    wsUrl: buildLocalTetherWsUrl({
      host,
      port: input.config.port,
      authToken: input.config.authToken,
    }),
    startedAt: input.startedAt,
    updatedAt,
    expiresAt,
  };
}

const writeDiscoveryDescriptorAtomically = (input: {
  readonly descriptor: LocalTetherDiscoveryDescriptor;
  readonly destinationPath: string;
}) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const encoded = JSON.stringify(input.descriptor, null, 2);
    const tempPath = `${input.destinationPath}.${process.pid}.tmp`;
    yield* fs.writeFileString(tempPath, encoded);
    if (process.platform !== "win32") {
      yield* fs.chmod(tempPath, 0o600);
    }
    yield* fs.rename(tempPath, input.destinationPath);
  });

const pruneExpiredDiscoveryFiles = (input: {
  readonly discoveryDirectory: string;
  readonly now: Date;
}) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const names = yield* fs
      .readDirectory(input.discoveryDirectory)
      .pipe(Effect.orElseSucceed(() => [] as ReadonlyArray<string>));
    for (const name of names) {
      if (!name.endsWith(".json")) {
        continue;
      }
      const candidatePath = path.join(input.discoveryDirectory, name);
      const raw = yield* fs.readFileString(candidatePath).pipe(Effect.orElseSucceed(() => null));
      if (!raw) {
        continue;
      }
      const parsed = Effect.try({
        try: () => JSON.parse(raw) as { expiresAt?: unknown },
        catch: () => null,
      });
      const descriptor = yield* parsed;
      const expiresAt =
        descriptor && typeof descriptor.expiresAt === "string"
          ? Date.parse(descriptor.expiresAt)
          : Number.NaN;
      if (Number.isNaN(expiresAt) || expiresAt > input.now.getTime()) {
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
    const now = options.now ?? (() => new Date());
    const heartbeatMs = options.heartbeatMs ?? LOCAL_TETHER_DISCOVERY_HEARTBEAT_MS;
    const ttlMs = options.ttlMs ?? LOCAL_TETHER_DISCOVERY_TTL_MS;
    const instanceId = options.instanceId ?? crypto.randomUUID();
    const discoveryDirectory =
      options.discoveryDirectory ?? path.resolve(resolveLocalTetherDiscoveryDirectory());
    const recordPath = path.join(discoveryDirectory, `${instanceId}.json`);
    const startedAt = now().toISOString();
    const pid = options.pid ?? process.pid;

    yield* fs.makeDirectory(discoveryDirectory, { recursive: true });
    if (process.platform !== "win32") {
      yield* fs.chmod(discoveryDirectory, 0o700).pipe(Effect.orElseSucceed(() => undefined));
    }

    yield* pruneExpiredDiscoveryFiles({
      discoveryDirectory,
      now: now(),
    }).pipe(Effect.orElseSucceed(() => undefined));

    const writeCurrentDescriptor = () =>
      writeDiscoveryDescriptorAtomically({
        descriptor: buildLocalTetherDiscoveryDescriptor({
          config,
          instanceId,
          pid,
          startedAt,
          now: now(),
          ttlMs,
        }),
        destinationPath: recordPath,
      });

    yield* writeCurrentDescriptor();

    yield* Effect.forkScoped(
      Effect.forever(
        Effect.promise(
          () => new Promise<void>((resolve) => globalThis.setTimeout(resolve, heartbeatMs)),
        ).pipe(Effect.flatMap(() => writeCurrentDescriptor())),
      ),
    );

    yield* Effect.addFinalizer(() =>
      fs.remove(recordPath).pipe(Effect.orElseSucceed(() => undefined)),
    );

    return {
      instanceId,
      recordPath,
    } satisfies LocalTetherDiscoveryHandle;
  });
