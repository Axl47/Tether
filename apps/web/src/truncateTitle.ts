const MAX_TITLE_LENGTH = 80;

export function truncateTitle(value: string): string {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (normalized.length <= MAX_TITLE_LENGTH) {
    return normalized;
  }
  return `${normalized.slice(0, MAX_TITLE_LENGTH - 1).trimEnd()}\u2026`;
}
