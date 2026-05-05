import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import { AuthSessionId } from "@t3tools/contracts";
import { DateTime, Effect, FileSystem, Layer, Stream } from "effect";
import { SessionCredentialService } from "./auth/Services/SessionCredentialService.ts";
import { ServerConfig, type ServerConfigShape } from "./config.ts";
import {
  LOCAL_TETHER_DISCOVERY_TTL_MS,
  buildLocalTetherWsUrl,
  publishLocalTetherDiscovery,
  resolveLocalTetherDiscoveryHost,
  type LocalTetherDiscoveryDescriptor,
} from "./localTetherDiscovery.ts";

const makeConfigLayer = (overrides: Partial<ServerConfigShape> = {}) =>
  (() => {
    const baseDir = mkdtempSync(join(tmpdir(), "tether-local-discovery-config-"));
    const stateDir = join(baseDir, "userdata");
    const logsDir = join(stateDir, "logs");
    const providerLogsDir = join(logsDir, "provider");

    return Layer.succeed(ServerConfig, {
      logLevel: "Error",
      traceMinLevel: "Info",
      traceTimingEnabled: true,
      traceBatchWindowMs: 200,
      traceMaxBytes: 10 * 1024 * 1024,
      traceMaxFiles: 10,
      otlpTracesUrl: undefined,
      otlpMetricsUrl: undefined,
      otlpExportIntervalMs: 10_000,
      otlpServiceName: "t3-server",
      mode: "web",
      port: 3773,
      host: undefined,
      cwd: "/tmp/tether",
      baseDir,
      stateDir,
      dbPath: join(stateDir, "state.sqlite"),
      keybindingsConfigPath: join(stateDir, "keybindings.json"),
      settingsPath: join(stateDir, "settings.json"),
      providerStatusCacheDir: join(baseDir, "caches"),
      worktreesDir: join(baseDir, "worktrees"),
      attachmentsDir: join(stateDir, "attachments"),
      logsDir,
      serverLogPath: join(logsDir, "server.log"),
      serverTracePath: join(logsDir, "server.trace.ndjson"),
      providerLogsDir,
      providerEventLogPath: join(providerLogsDir, "events.log"),
      terminalLogsDir: join(logsDir, "terminals"),
      anonymousIdPath: join(stateDir, "anonymous-id"),
      environmentIdPath: join(stateDir, "environment-id"),
      serverRuntimeStatePath: join(stateDir, "server-runtime.json"),
      secretsDir: join(stateDir, "secrets"),
      staticDir: undefined,
      devUrl: undefined,
      noBrowser: true,
      startupPresentation: "browser",
      desktopBootstrapToken: undefined,
      autoBootstrapProjectFromCwd: false,
      logWebSocketEvents: false,
      ...overrides,
    } satisfies ServerConfigShape);
  })();

const readDescriptor = (recordPath: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const raw = yield* fs.readFileString(recordPath);
    return JSON.parse(raw) as LocalTetherDiscoveryDescriptor;
  });

const sessionId = AuthSessionId.makeUnsafe("session-local-discovery");
const sessionExpiresAt = DateTime.makeUnsafe("2026-03-28T21:00:00.000Z");

const sessionCredentialLayer = Layer.succeed(SessionCredentialService, {
  cookieName: "tether.sid",
  issue: () =>
    Effect.succeed({
      sessionId,
      token: "session-token",
      method: "bearer-session-token",
      role: "client",
      client: {
        label: "Pragma local discovery",
        deviceType: "desktop",
      },
      expiresAt: sessionExpiresAt,
    }),
  verify: () =>
    Effect.succeed({
      sessionId,
      token: "session-token",
      method: "bearer-session-token",
      role: "client",
      subject: "pragma-local-discovery",
      client: {
        label: "Pragma local discovery",
        deviceType: "desktop",
      },
      expiresAt: sessionExpiresAt,
    }),
  issueWebSocketToken: () =>
    Effect.succeed({
      token: "ws-token",
      expiresAt: sessionExpiresAt,
    }),
  verifyWebSocketToken: () =>
    Effect.succeed({
      sessionId,
      token: "ws-token",
      method: "bearer-session-token",
      role: "client",
      subject: "pragma-local-discovery",
      client: {
        label: "Pragma local discovery",
        deviceType: "desktop",
      },
      expiresAt: sessionExpiresAt,
    }),
  listActive: () => Effect.succeed([]),
  streamChanges: Stream.empty,
  revoke: () => Effect.succeed(true),
  revokeAllExcept: () => Effect.succeed(0),
  markConnected: () => Effect.void,
  markDisconnected: () => Effect.void,
});

const localTetherDiscoveryTestLayer = Layer.mergeAll(NodeServices.layer, sessionCredentialLayer);

it.layer(localTetherDiscoveryTestLayer)("localTetherDiscovery", (it) => {
  it.effect("publishes an unauthenticated websocket url for web mode", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const discoveryDirectory = yield* fs.makeTempDirectoryScoped({
        prefix: "tether-local-discovery-web-",
      });
      const handle = yield* publishLocalTetherDiscovery({
        discoveryDirectory,
        heartbeatMs: 25,
        ttlMs: 75,
        instanceId: "instance-web",
        pid: 4101,
        now: () => new Date("2026-03-28T20:00:00.000Z"),
      }).pipe(Effect.provide(makeConfigLayer()));

      const descriptor = yield* readDescriptor(handle.recordPath);
      const names = yield* fs.readDirectory(discoveryDirectory);

      assert.equal(descriptor.instanceId, "instance-web");
      assert.equal(descriptor.mode, "web");
      assert.equal(descriptor.host, "127.0.0.1");
      assert.equal(descriptor.port, 3773);
      assert.equal(descriptor.pid, 4101);
      assert.equal(descriptor.wsUrl, "ws://127.0.0.1:3773/pragma?wsToken=ws-token");
      assert.equal(descriptor.version, 1);
      assert.deepEqual(names.toSorted(), ["instance-web.json"]);
    }).pipe(Effect.scoped),
  );

  it.effect("publishes a token-bearing websocket url for desktop mode", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const discoveryDirectory = yield* fs.makeTempDirectoryScoped({
        prefix: "tether-local-discovery-desktop-",
      });
      const handle = yield* publishLocalTetherDiscovery({
        discoveryDirectory,
        instanceId: "instance-desktop",
        now: () => new Date("2026-03-28T20:00:00.000Z"),
      }).pipe(
        Effect.provide(
          makeConfigLayer({
            mode: "desktop",
            port: 56875,
            host: "127.0.0.1",
          }),
        ),
      );

      const descriptor = yield* readDescriptor(handle.recordPath);

      assert.equal(descriptor.mode, "desktop");
      assert.equal(descriptor.host, "127.0.0.1");
      assert.equal(descriptor.wsUrl, "ws://127.0.0.1:56875/pragma?wsToken=ws-token");
    }).pipe(Effect.scoped),
  );

  it.effect("refreshes updatedAt and expiresAt on heartbeat writes", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const discoveryDirectory = yield* fs.makeTempDirectoryScoped({
        prefix: "tether-local-discovery-refresh-",
      });
      let nowValue = new Date("2026-03-28T20:00:00.000Z");
      const handle = yield* publishLocalTetherDiscovery({
        discoveryDirectory,
        heartbeatMs: 20,
        ttlMs: 60,
        instanceId: "instance-refresh",
        now: () => nowValue,
      }).pipe(Effect.provide(makeConfigLayer()));

      const first = yield* readDescriptor(handle.recordPath);
      nowValue = new Date("2026-03-28T20:00:05.000Z");
      yield* Effect.promise(
        () => new Promise<void>((resolve) => globalThis.setTimeout(resolve, 35)),
      );
      const second = yield* readDescriptor(handle.recordPath);

      assert.equal(first.updatedAt, "2026-03-28T20:00:00.000Z");
      assert.equal(second.updatedAt, "2026-03-28T20:00:05.000Z");
      assert.equal(Date.parse(second.expiresAt) - Date.parse(second.updatedAt), 60);
    }).pipe(Effect.scoped),
  );

  it.effect("removes its own discovery record when the scope closes", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const discoveryDirectory = yield* fs.makeTempDirectoryScoped({
        prefix: "tether-local-discovery-cleanup-",
      });
      const recordPath = yield* Effect.scoped(
        publishLocalTetherDiscovery({
          discoveryDirectory,
          instanceId: "instance-cleanup",
          now: () => new Date("2026-03-28T20:00:00.000Z"),
        }).pipe(
          Effect.provide(makeConfigLayer()),
          Effect.map((handle) => handle.recordPath),
        ),
      );

      assert.isFalse(yield* fs.exists(recordPath));
    }),
  );

  it.effect("ignores malformed stale files while publishing a new descriptor", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const discoveryDirectory = yield* fs.makeTempDirectoryScoped({
        prefix: "tether-local-discovery-prune-",
      });
      const stalePath = `${discoveryDirectory}/stale.json`;
      yield* fs.writeFileString(stalePath, "{ not-json");
      const handle = yield* publishLocalTetherDiscovery({
        discoveryDirectory,
        instanceId: "instance-prune",
        now: () => new Date("2026-03-28T20:00:00.000Z"),
      }).pipe(Effect.provide(makeConfigLayer()));

      const descriptor = yield* readDescriptor(handle.recordPath);
      const names = yield* fs.readDirectory(discoveryDirectory);

      assert.equal(descriptor.instanceId, "instance-prune");
      assert.isTrue(names.includes("stale.json"));
      assert.isTrue(names.includes("instance-prune.json"));
    }).pipe(Effect.scoped),
  );

  it("normalizes local discovery hosts and websocket urls", () => {
    assert.equal(resolveLocalTetherDiscoveryHost(undefined), "127.0.0.1");
    assert.equal(resolveLocalTetherDiscoveryHost("0.0.0.0"), "127.0.0.1");
    assert.equal(resolveLocalTetherDiscoveryHost("100.88.10.4"), "100.88.10.4");
    assert.equal(
      buildLocalTetherWsUrl({
        host: "::1",
        port: 3773,
      }),
      "ws://[::1]:3773/",
    );
    assert.equal(LOCAL_TETHER_DISCOVERY_TTL_MS, 15_000);
  });
});
