import { describe, expect, it } from "vitest";
import { scopeThreadRef } from "@t3tools/client-runtime";
import { ThreadId } from "@t3tools/contracts";
import { DraftId } from "./composerDraftStore";

import {
  buildDraftThreadRouteParams,
  buildThreadRouteParams,
  resolveThreadRouteRef,
  resolveThreadRouteTarget,
} from "./threadRoutes";

describe("threadRoutes", () => {
  it("builds canonical thread route params from a scoped ref", () => {
    const ref = scopeThreadRef("env-1" as never, ThreadId.make("thread-1"));

    expect(buildThreadRouteParams(ref)).toEqual({
      environmentId: "env-1",
      threadId: "thread-1",
    });
  });

  it("resolves a scoped ref only when both params are present", () => {
    expect(
      resolveThreadRouteRef({
        environmentId: "env-1",
        threadId: "thread-1",
      }),
    ).toEqual({
      environmentId: "env-1",
      threadId: "thread-1",
    });

    expect(resolveThreadRouteRef({ environmentId: "env-1" })).toBeNull();
    expect(resolveThreadRouteRef({ threadId: "thread-1" })).toBeNull();
  });

  it("reuses the same scoped ref for identical route params", () => {
    const first = resolveThreadRouteRef({
      environmentId: "env-1",
      threadId: "thread-1",
    });
    const second = resolveThreadRouteRef({
      environmentId: "env-1",
      threadId: "thread-1",
    });

    expect(first).toBe(second);
  });

  it("builds canonical draft route params from a draft id", () => {
    expect(buildDraftThreadRouteParams(DraftId.make("draft-1"))).toEqual({
      draftId: "draft-1",
    });
  });

  it("resolves draft and server route targets", () => {
    expect(
      resolveThreadRouteTarget({
        environmentId: "env-1",
        threadId: "thread-1",
      }),
    ).toEqual({
      kind: "server",
      threadRef: {
        environmentId: "env-1",
        threadId: "thread-1",
      },
    });

    expect(
      resolveThreadRouteTarget({
        draftId: "draft-1",
      }),
    ).toEqual({
      kind: "draft",
      draftId: "draft-1",
    });
  });

  it("reuses the same route target for identical params", () => {
    const firstServerTarget = resolveThreadRouteTarget({
      environmentId: "env-1",
      threadId: "thread-1",
    });
    const secondServerTarget = resolveThreadRouteTarget({
      environmentId: "env-1",
      threadId: "thread-1",
    });
    const firstDraftTarget = resolveThreadRouteTarget({
      draftId: "draft-1",
    });
    const secondDraftTarget = resolveThreadRouteTarget({
      draftId: "draft-1",
    });

    expect(firstServerTarget).toBe(secondServerTarget);
    expect(firstDraftTarget).toBe(secondDraftTarget);
  });
});
