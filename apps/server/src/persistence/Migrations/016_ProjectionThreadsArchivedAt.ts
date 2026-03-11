import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  const columns = (yield* sql`PRAGMA table_info(projection_threads)`) as unknown as ReadonlyArray<{
    readonly name: string;
  }>;
  const hasArchivedAtColumn = columns.some((column) => column.name === "archived_at");
  if (hasArchivedAtColumn) {
    return;
  }

  yield* sql`
    ALTER TABLE projection_threads
    ADD COLUMN archived_at TEXT
  `;
});
