import { describe, expect, it } from "vitest";

import {
  deriveTimelineScrollbarMarkers,
  type TimelineScrollbarMarkerRow,
} from "./timelineScrollbarMarkers";

function messageRow(
  id: string,
  role: "user" | "assistant" | "system",
  streaming = false,
): TimelineScrollbarMarkerRow {
  return {
    kind: "message",
    message: {
      id,
      role,
      streaming,
    },
  };
}

describe("deriveTimelineScrollbarMarkers", () => {
  it("marks each sent message and the last settled assistant response before the next user turn", () => {
    const rows: TimelineScrollbarMarkerRow[] = [
      messageRow("user-1", "user"),
      messageRow("assistant-1a", "assistant"),
      messageRow("assistant-1b", "assistant"),
      messageRow("user-2", "user"),
      messageRow("assistant-2", "assistant"),
    ];

    expect(deriveTimelineScrollbarMarkers(rows)).toEqual([
      { kind: "sent", messageId: "user-1", rowIndex: 0 },
      { kind: "final", messageId: "assistant-1b", rowIndex: 2 },
      { kind: "sent", messageId: "user-2", rowIndex: 3 },
      { kind: "final", messageId: "assistant-2", rowIndex: 4 },
    ]);
  });

  it("ignores assistant messages before the first user message", () => {
    const rows: TimelineScrollbarMarkerRow[] = [
      messageRow("assistant-preface", "assistant"),
      messageRow("user-1", "user"),
      messageRow("assistant-1", "assistant"),
    ];

    expect(deriveTimelineScrollbarMarkers(rows)).toEqual([
      { kind: "sent", messageId: "user-1", rowIndex: 1 },
      { kind: "final", messageId: "assistant-1", rowIndex: 2 },
    ]);
  });

  it("skips streaming assistant rows until a settled final message exists", () => {
    const rows: TimelineScrollbarMarkerRow[] = [
      messageRow("user-1", "user"),
      messageRow("assistant-stream", "assistant", true),
      messageRow("assistant-final", "assistant"),
      messageRow("user-2", "user"),
      messageRow("assistant-2-stream", "assistant", true),
    ];

    expect(deriveTimelineScrollbarMarkers(rows)).toEqual([
      { kind: "sent", messageId: "user-1", rowIndex: 0 },
      { kind: "final", messageId: "assistant-final", rowIndex: 2 },
      { kind: "sent", messageId: "user-2", rowIndex: 3 },
    ]);
  });

  it("preserves row positions when non-message timeline rows are interleaved", () => {
    const rows: TimelineScrollbarMarkerRow[] = [
      messageRow("user-1", "user"),
      { kind: "proposed-plan" },
      messageRow("assistant-1", "assistant"),
      { kind: "work" },
      { kind: "working" },
      messageRow("user-2", "user"),
      messageRow("assistant-2", "assistant"),
    ];

    expect(deriveTimelineScrollbarMarkers(rows)).toEqual([
      { kind: "sent", messageId: "user-1", rowIndex: 0 },
      { kind: "final", messageId: "assistant-1", rowIndex: 2 },
      { kind: "sent", messageId: "user-2", rowIndex: 5 },
      { kind: "final", messageId: "assistant-2", rowIndex: 6 },
    ]);
  });
});
