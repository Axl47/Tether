import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    UPDATE projection_threads
    SET context_window_json = NULL
    WHERE context_window_json IS NOT NULL
      AND json_extract(context_window_json, '$.provider') = 'codex'
  `;
});
