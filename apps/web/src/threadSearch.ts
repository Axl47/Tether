import type { MessageId } from "@t3tools/contracts";

interface ThreadSearchMessageLike {
  id: MessageId;
  text: string;
}

export function normalizeThreadSearchText(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLocaleLowerCase();
}

export function findThreadSearchMatchMessageIds(
  messages: readonly ThreadSearchMessageLike[],
  query: string,
): MessageId[] {
  const normalizedQuery = normalizeThreadSearchText(query);
  if (normalizedQuery.length === 0) {
    return [];
  }

  return messages.flatMap((message) =>
    normalizeThreadSearchText(message.text).includes(normalizedQuery) ? [message.id] : [],
  );
}
