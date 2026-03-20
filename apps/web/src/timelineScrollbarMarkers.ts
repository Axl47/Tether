export interface TimelineScrollbarMarkerRow {
  kind: "message" | "proposed-plan" | "work" | "working";
  message?: {
    id: string;
    role: "user" | "assistant" | "system";
    streaming: boolean;
  };
}

export interface TimelineScrollbarMarker {
  kind: "sent" | "final";
  messageId: string;
  rowIndex: number;
}

export function deriveTimelineScrollbarMarkers(
  rows: ReadonlyArray<TimelineScrollbarMarkerRow>,
): TimelineScrollbarMarker[] {
  const markers: TimelineScrollbarMarker[] = [];
  let seenUserMessage = false;
  let pendingFinalMarker: TimelineScrollbarMarker | null = null;

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    if (!row || row.kind !== "message" || !row.message) {
      continue;
    }

    if (row.message.role === "user") {
      if (pendingFinalMarker) {
        markers.push(pendingFinalMarker);
        pendingFinalMarker = null;
      }
      markers.push({
        kind: "sent",
        messageId: row.message.id,
        rowIndex: index,
      });
      seenUserMessage = true;
      continue;
    }

    if (row.message.role !== "assistant" || row.message.streaming || !seenUserMessage) {
      continue;
    }

    pendingFinalMarker = {
      kind: "final",
      messageId: row.message.id,
      rowIndex: index,
    };
  }

  if (pendingFinalMarker) {
    markers.push(pendingFinalMarker);
  }

  return markers;
}
