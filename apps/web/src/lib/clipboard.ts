function fallbackCopyTextToClipboard(text: string): boolean {
  if (typeof document === "undefined" || document.body == null) {
    return false;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.setAttribute("aria-hidden", "true");
  textarea.style.position = "fixed";
  textarea.style.top = "0";
  textarea.style.left = "0";
  textarea.style.opacity = "0";
  textarea.style.pointerEvents = "none";

  const activeElement = document.activeElement;
  document.body.append(textarea);
  textarea.focus();
  textarea.select();
  textarea.setSelectionRange(0, text.length);

  try {
    return (
      (document as Document & { execCommand?: (command: string) => boolean }).execCommand?.(
        "copy",
      ) === true
    );
  } finally {
    textarea.remove();
    if (
      activeElement != null &&
      typeof activeElement === "object" &&
      "focus" in activeElement &&
      typeof activeElement.focus === "function"
    ) {
      activeElement.focus();
    }
  }
}

export async function copyTextToClipboard(text: string): Promise<void> {
  if (typeof navigator !== "undefined" && typeof navigator.clipboard?.writeText === "function") {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Fall back to legacy copy APIs when permissions or browser support block Clipboard API writes.
    }
  }

  if (fallbackCopyTextToClipboard(text)) {
    return;
  }

  throw new Error("Clipboard write failed.");
}
