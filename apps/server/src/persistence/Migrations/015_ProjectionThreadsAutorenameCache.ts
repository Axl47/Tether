import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  const columns = (yield* sql`PRAGMA table_info(projection_threads)`) as unknown as ReadonlyArray<{
    readonly name: string;
  }>;
  const hasAutorenameCacheColumn = columns.some(
    (column) => column.name === "last_autorename_user_message_id",
  );
  if (hasAutorenameCacheColumn) {
    return;
  }

  yield* sql`
    ALTER TABLE projection_threads
    ADD COLUMN last_autorename_user_message_id TEXT
  `;
});
