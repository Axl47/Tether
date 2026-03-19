import type { MessageId } from "@t3tools/contracts";

export interface ThreadSearchMatchRange {
  start: number;
  end: number;
}

export function normalizeThreadSearchText(value: string): string {
  return value.trim().toLocaleLowerCase();
}

export function findThreadSearchMatchRanges(text: string, query: string): ThreadSearchMatchRange[] {
  const normalizedQuery = normalizeThreadSearchText(query);
  if (normalizedQuery.length === 0) {
    return [];
  }

  const normalizedText = text.toLocaleLowerCase();
  const ranges: ThreadSearchMatchRange[] = [];
  let fromIndex = 0;

  while (fromIndex < normalizedText.length) {
    const matchIndex = normalizedText.indexOf(normalizedQuery, fromIndex);
    if (matchIndex < 0) {
      break;
    }
    ranges.push({
      start: matchIndex,
      end: matchIndex + normalizedQuery.length,
    });
    fromIndex = matchIndex + normalizedQuery.length;
  }

  return ranges;
}

export function countThreadSearchOccurrences(text: string, query: string): number {
  return findThreadSearchMatchRanges(text, query).length;
}

export function buildThreadSearchOccurrenceId(
  messageId: MessageId,
  occurrenceIndex: number,
): string {
  return `${messageId}:${occurrenceIndex}`;
}

export function threadSearchMessageIdFromOccurrenceId(occurrenceId: string): MessageId | null {
  const separatorIndex = occurrenceId.lastIndexOf(":");
  if (separatorIndex <= 0) {
    return null;
  }
  return occurrenceId.slice(0, separatorIndex) as MessageId;
}
