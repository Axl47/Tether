export interface InlineAssistantImage {
  readonly markup: string;
  readonly previewUrl: string;
  readonly name: string;
}

function svgMarkupToDataUrl(markup: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
}

function unwrapFencedSvg(text: string): string | null {
  const match = /^```svg\s*([\s\S]*?)\s*```$/i.exec(text);
  if (!match?.[1]) {
    return null;
  }
  return match[1].trim();
}

function isStandaloneSvgDocument(text: string): boolean {
  return /^<svg[\s\S]*<\/svg>$/i.test(text);
}

export function extractInlineAssistantImage(text: string | null | undefined): InlineAssistantImage | null {
  if (typeof text !== "string") {
    return null;
  }

  const trimmed = text.trim();
  if (!trimmed) {
    return null;
  }

  const svgMarkup = unwrapFencedSvg(trimmed) ?? trimmed;
  if (!isStandaloneSvgDocument(svgMarkup)) {
    return null;
  }

  return {
    markup: svgMarkup,
    previewUrl: svgMarkupToDataUrl(svgMarkup),
    name: "generated.svg",
  };
}
