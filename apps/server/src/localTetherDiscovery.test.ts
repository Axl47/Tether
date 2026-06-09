import * as NodeHttpServer from "@effect/platform-node/NodeHttpServer";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { AuthAdministrativeScopes } from "@t3tools/contracts";
import { expect, it } from "@effect/vitest";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";

import * as EnvironmentAuth from "./auth/EnvironmentAuth.ts";
import * as ServerSecretStore from "./auth/ServerSecretStore.ts";
import { ServerConfig } from "./config.ts";
import {
  buildLocalTetherWsUrl,
  decodeLocalTetherDiscoveryDescriptorJson,
  publishLocalTetherDiscovery,
} from "./localTetherDiscovery.ts";
import { SqlitePersistenceMemory } from "./persistence/Layers/Sqlite.ts";

const makeTestLayer = () => {
  const serverConfigLayer = ServerConfig.layerTest(process.cwd(), {
    prefix: "tether-discovery-test-",
  });
  const authLayer = EnvironmentAuth.layer.pipe(
    Layer.provide(SqlitePersistenceMemory),
    Layer.provide(ServerSecretStore.layer),
    Layer.provide(serverConfigLayer),
  );

  return Layer.mergeAll(serverConfigLayer, authLayer).pipe(
    Layer.provideMerge(NodeHttpServer.layerTest),
  );
};

it.layer(NodeServices.layer)("localTetherDiscovery", (it) => {
  it("normalizes wildcard hosts and encodes websocket tickets", () => {
    const wsUrl = buildLocalTetherWsUrl({
      host: "0.0.0.0",
      port: 3773,
      path: "/ws",
      wsTicket: "ticket-1",
    });

    expect(wsUrl).toBe("ws://127.0.0.1:3773/ws?wsTicket=ticket-1");
  });

  it.effect("writes a scoped discovery record with a fresh websocket URL", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const discoveryDirectory = yield* fs.makeTempDirectoryScoped({
        prefix: "tether-discovery-record-",
      });
      const now = Effect.succeed(DateTime.makeUnsafe("2026-06-09T12:00:00.000Z"));

      const handle = yield* publishLocalTetherDiscovery({
        discoveryDirectory,
        heartbeatMs: 60_000,
        instanceId: "instance-1",
        now,
        pid: 4242,
        serverAddress: {
          host: "0.0.0.0",
          port: 4555,
        },
        ttlMs: 15_000,
      });

      const raw = yield* fs.readFileString(handle.recordPath);
      const descriptor = yield* decodeLocalTetherDiscoveryDescriptorJson(raw);

      expect(descriptor).toMatchObject({
        version: 1,
        instanceId: "instance-1",
        pid: 4242,
        mode: "web",
        host: "127.0.0.1",
        port: 4555,
        startedAt: "2026-06-09T12:00:00.000Z",
        updatedAt: "2026-06-09T12:00:00.000Z",
        expiresAt: "2026-06-09T12:00:15.000Z",
      });
      expect(descriptor.wsUrl).toContain("ws://127.0.0.1:4555/ws?wsTicket=");
    }).pipe(Effect.scoped, Effect.provide(makeTestLayer())),
  );

  it.effect("removes the discovery record and revokes the issued session on scope close", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const serverAuth = yield* EnvironmentAuth.EnvironmentAuth;
      const discoveryDirectory = yield* fs.makeTempDirectoryScoped({
        prefix: "tether-discovery-cleanup-",
      });

      let recordPath = "";
      yield* Effect.scoped(
        Effect.gen(function* () {
          const handle = yield* publishLocalTetherDiscovery({
            discoveryDirectory,
            heartbeatMs: 60_000,
            instanceId: "instance-cleanup",
            serverAddress: {
              port: 4555,
            },
          });
          recordPath = handle.recordPath;
          expect(yield* fs.exists(recordPath)).toBe(true);
          expect(
            (yield* serverAuth.listSessions()).some((session) =>
              session.scopes.includes(AuthAdministrativeScopes[0]),
            ),
          ).toBe(true);
        }),
      );

      expect(yield* fs.exists(recordPath)).toBe(false);
      expect(
        (yield* serverAuth.listSessions()).some(
          (session) => session.subject === "pragma-local-discovery",
        ),
      ).toBe(false);
    }).pipe(Effect.scoped, Effect.provide(makeTestLayer())),
  );
});
