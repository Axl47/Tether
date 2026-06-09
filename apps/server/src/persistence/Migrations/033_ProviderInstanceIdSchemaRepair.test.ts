import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { runMigrations } from "../Migrations.ts";
import * as NodeSqliteClient from "../NodeSqliteClient.ts";

const layer = it.layer(Layer.mergeAll(NodeSqliteClient.layerMemory()));

layer("033_ProviderInstanceIdSchemaRepair", (it) => {
  it.effect("repairs provider instance columns when migration history is ahead of schema", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;

      yield* runMigrations({ toMigrationInclusive: 26 });
      yield* sql`
        INSERT INTO effect_sql_migrations (migration_id, name)
        VALUES
          (27, 'ProviderSessionRuntimeInstanceId'),
          (28, 'ProjectionThreadSessionInstanceId'),
          (29, 'ProjectionThreadDetailOrderingIndexes'),
          (30, 'ProjectionThreadShellArchiveIndexes'),
          (31, 'AuthAuthorizationScopes'),
          (32, 'AuthPairingProofKeyThumbprint')
      `;

      yield* runMigrations({ toMigrationInclusive: 33 });

      const migrations = yield* sql<{
        readonly migration_id: number;
        readonly name: string;
      }>`
        SELECT migration_id, name
        FROM effect_sql_migrations
        WHERE migration_id = 33
      `;
      assert.deepStrictEqual(migrations, [
        {
          migration_id: 33,
          name: "ProviderInstanceIdSchemaRepair",
        },
      ]);

      const providerSessionColumns = yield* sql<{ readonly name: string }>`
        PRAGMA table_info(provider_session_runtime)
      `;
      assert.ok(providerSessionColumns.some((column) => column.name === "provider_instance_id"));

      const projectionThreadSessionColumns = yield* sql<{ readonly name: string }>`
        PRAGMA table_info(projection_thread_sessions)
      `;
      assert.ok(
        projectionThreadSessionColumns.some((column) => column.name === "provider_instance_id"),
      );

      const providerSessionIndexes = yield* sql<{ readonly name: string }>`
        PRAGMA index_list(provider_session_runtime)
      `;
      assert.ok(
        providerSessionIndexes.some(
          (index) => index.name === "idx_provider_session_runtime_instance",
        ),
      );

      const projectionThreadSessionIndexes = yield* sql<{ readonly name: string }>`
        PRAGMA index_list(projection_thread_sessions)
      `;
      assert.ok(
        projectionThreadSessionIndexes.some(
          (index) => index.name === "idx_projection_thread_sessions_instance",
        ),
      );
    }),
  );
});
