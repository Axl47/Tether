import { describe, expect, it } from "vitest";

import type { MessageId } from "@t3tools/contracts";
import {
  buildThreadSearchOccurrenceId,
  countThreadSearchOccurrences,
  findThreadSearchMatchRanges,
  normalizeThreadSearchText,
  threadSearchMessageIdFromOccurrenceId,
} from "./threadSearch";

describe("normalizeThreadSearchText", () => {
  it("trims and lowercases", () => {
    expect(normalizeThreadSearchText("  Fix Thread Search  ")).toBe("fix thread search");
  });
});

describe("findThreadSearchMatchRanges", () => {
  it("returns case-insensitive non-overlapping ranges", () => {
    expect(
      findThreadSearchMatchRanges(
        "First fix thread search, second FIX thread search",
        "fix thread search",
      ),
    ).toEqual([
      { start: 6, end: 23 },
      { start: 32, end: 49 },
    ]);
  });

  it("returns an empty list when the query is blank", () => {
    expect(findThreadSearchMatchRanges("Anything", "   ")).toEqual([]);
  });
});

describe("countThreadSearchOccurrences", () => {
  it("counts occurrences in a message", () => {
    expect(countThreadSearchOccurrences("Fix it, then fix it again", "fix it")).toBe(2);
  });
});

describe("threadSearch occurrence ids", () => {
  it("builds and parses occurrence ids", () => {
    const occurrenceId = buildThreadSearchOccurrenceId("message-1" as MessageId, 2);
    expect(occurrenceId).toBe("message-1:2");
    expect(threadSearchMessageIdFromOccurrenceId(occurrenceId)).toBe("message-1");
  });
});
