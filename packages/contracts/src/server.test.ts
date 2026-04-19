import { Schema } from "effect";
import { describe, expect, it } from "vitest";

import { ServerDesktopContext, ServerProvider, ServerSetDesktopContextInput } from "./server.ts";

const decodeServerProvider = Schema.decodeUnknownSync(ServerProvider);
const decodeDesktopContext = Schema.decodeUnknownSync(ServerDesktopContext);
const decodeDesktopContextInput = Schema.decodeUnknownSync(ServerSetDesktopContextInput);

describe("ServerProvider", () => {
  it("defaults capability arrays when decoding legacy snapshots", () => {
    const parsed = decodeServerProvider({
      provider: "codex",
      enabled: true,
      installed: true,
      version: "1.0.0",
      status: "ready",
      auth: {
        status: "authenticated",
      },
      checkedAt: "2026-04-10T00:00:00.000Z",
      models: [],
    });

    expect(parsed.slashCommands).toEqual([]);
    expect(parsed.skills).toEqual([]);
  });
});

describe("ServerDesktopContext", () => {
  it("accepts server desktop context payloads", () => {
    const parsed = decodeDesktopContext({
      projectId: "project-1",
      projectTitle: "Nexus",
      workspaceRoot: "/tmp/nexus",
      threadId: "thread-1",
      threadTitle: "Route thread",
      updatedAt: "2026-03-21T00:00:00.000Z",
    });

    expect(parsed.projectId).toBe("project-1");
    expect(parsed.threadId).toBe("thread-1");
  });

  it("accepts empty desktop context updates", () => {
    const parsed = decodeDesktopContextInput({
      projectId: null,
      projectTitle: null,
      workspaceRoot: null,
      threadId: null,
      threadTitle: null,
    });

    expect(parsed.projectId).toBeNull();
    expect(parsed.threadId).toBeNull();
  });
});
