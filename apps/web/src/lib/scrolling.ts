export function canScrollElementForDelta(
  element: Pick<HTMLElement, "scrollHeight" | "clientHeight" | "scrollTop">,
  deltaY: number,
): boolean {
  const maxScrollTop = Math.max(element.scrollHeight - element.clientHeight, 0);
  if (maxScrollTop <= 0 || Math.abs(deltaY) < 0.5) {
    return false;
  }
  if (deltaY < 0) {
    return element.scrollTop > 0;
  }
  return element.scrollTop < maxScrollTop;
}
