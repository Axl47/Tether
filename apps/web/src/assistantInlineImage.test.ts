import { describe, expect, it } from "vitest";

import { extractInlineAssistantImage } from "./assistantInlineImage";

describe("extractInlineAssistantImage", () => {
  it("detects raw standalone SVG documents", () => {
    expect(
      extractInlineAssistantImage('<svg xmlns="http://www.w3.org/2000/svg"><rect width="4" height="4"/></svg>'),
    ).toEqual(
      expect.objectContaining({
        name: "generated.svg",
        markup: '<svg xmlns="http://www.w3.org/2000/svg"><rect width="4" height="4"/></svg>',
      }),
    );
  });

  it("detects fenced SVG code blocks", () => {
    expect(
      extractInlineAssistantImage(
        '```svg\n<svg xmlns="http://www.w3.org/2000/svg"><circle r="2" cx="2" cy="2"/></svg>\n```',
      ),
    ).toEqual(
      expect.objectContaining({
        markup: '<svg xmlns="http://www.w3.org/2000/svg"><circle r="2" cx="2" cy="2"/></svg>',
      }),
    );
  });

  it("ignores mixed text responses", () => {
    expect(
      extractInlineAssistantImage(
        'Here is your image:\n```svg\n<svg xmlns="http://www.w3.org/2000/svg"></svg>\n```',
      ),
    ).toBeNull();
  });
});
