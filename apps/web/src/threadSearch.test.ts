import { describe, expect, it } from "vitest";

import type { MessageId } from "@t3tools/contracts";
import { findThreadSearchMatchMessageIds, normalizeThreadSearchText } from "./threadSearch";

describe("normalizeThreadSearchText", () => {
  it("trims, collapses whitespace, and lowercases", () => {
    expect(normalizeThreadSearchText("  Fix   Thread\tSearch  ")).toBe("fix thread search");
  });
});

describe("findThreadSearchMatchMessageIds", () => {
  it("returns message ids in timeline order for case-insensitive matches", () => {
    expect(
      findThreadSearchMatchMessageIds(
        [
          { id: "message-1" as MessageId, text: "First fix thread search result" },
          { id: "message-2" as MessageId, text: "Unrelated" },
          { id: "message-3" as MessageId, text: "Second FIX   thread  search result" },
        ],
        " fix thread search ",
      ),
    ).toEqual(["message-1", "message-3"]);
  });

  it("returns an empty list when the query is blank", () => {
    expect(
      findThreadSearchMatchMessageIds([{ id: "message-1" as MessageId, text: "Anything" }], "   "),
    ).toEqual([]);
  });
});
