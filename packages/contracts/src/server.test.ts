import { assert, it } from "@effect/vitest";
import { Effect, Schema } from "effect";

import { ServerDesktopContext, ServerSetDesktopContextInput } from "./server";

const decodeDesktopContext = Schema.decodeUnknownEffect(ServerDesktopContext);
const decodeDesktopContextInput = Schema.decodeUnknownEffect(ServerSetDesktopContextInput);

it.effect("accepts server desktop context payloads", () =>
  Effect.gen(function* () {
    const parsed = yield* decodeDesktopContext({
      projectId: "project-1",
      projectTitle: "Nexus",
      workspaceRoot: "/tmp/nexus",
      threadId: "thread-1",
      threadTitle: "Route thread",
      updatedAt: "2026-03-21T00:00:00.000Z",
    });

    assert.strictEqual(parsed.projectId, "project-1");
    assert.strictEqual(parsed.threadId, "thread-1");
  }),
);

it.effect("accepts empty desktop context updates", () =>
  Effect.gen(function* () {
    const parsed = yield* decodeDesktopContextInput({
      projectId: null,
      projectTitle: null,
      workspaceRoot: null,
      threadId: null,
      threadTitle: null,
    });

    assert.strictEqual(parsed.projectId, null);
    assert.strictEqual(parsed.threadId, null);
  }),
);
