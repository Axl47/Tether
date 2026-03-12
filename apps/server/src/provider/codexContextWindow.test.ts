import { describe, expect, it } from "vitest";

import { normalizeCodexContextWindow } from "./codexContextWindow.ts";

describe("normalizeCodexContextWindow", () => {
  it("parses the observed Codex token-count shape", () => {
    expect(
      normalizeCodexContextWindow(
        {
          info: {
            total_token_usage: {
              input_tokens: 124862,
              cached_input_tokens: 92672,
              output_tokens: 1654,
              reasoning_output_tokens: 277,
              total_tokens: 126516,
            },
            model_context_window: 258400,
          },
        },
        "2026-03-07T00:00:00.000Z",
      ),
    ).toEqual({
      provider: "codex",
      usedTokens: 126516,
      maxTokens: 258400,
      remainingTokens: 131884,
      usedPercent: 49,
      inputTokens: 124862,
      cachedInputTokens: 92672,
      outputTokens: 1654,
      reasoningOutputTokens: 277,
      updatedAt: "2026-03-07T00:00:00.000Z",
    });
  });

  it("accepts camelCase payload variants", () => {
    expect(
      normalizeCodexContextWindow(
        {
          totalTokenUsage: {
            totalTokens: 119000,
            inputTokens: 110000,
            cachedInputTokens: 60000,
            outputTokens: 9000,
          },
          modelContextWindow: 258000,
        },
        "2026-03-07T00:00:00.000Z",
      ),
    ).toMatchObject({
      usedTokens: 119000,
      maxTokens: 258000,
      remainingTokens: 139000,
      usedPercent: 46,
    });
  });

  it("parses the live thread token-usage payload shape from Codex notifications", () => {
    expect(
      normalizeCodexContextWindow(
        {
          threadId: "019cca93-40c0-7801-9c4e-818a6f7b8a49",
          turnId: "019cca93-40f6-7de3-985e-83e2c6fdf35d",
          tokenUsage: {
            total: {
              totalTokens: 11347,
              inputTokens: 11321,
              cachedInputTokens: 4864,
              outputTokens: 26,
              reasoningOutputTokens: 0,
            },
            last: {
              totalTokens: 11347,
              inputTokens: 11321,
              cachedInputTokens: 4864,
              outputTokens: 26,
              reasoningOutputTokens: 0,
            },
            modelContextWindow: 258400,
          },
        },
        "2026-03-07T00:00:00.000Z",
      ),
    ).toEqual({
      provider: "codex",
      usedTokens: 11347,
      maxTokens: 258400,
      remainingTokens: 247053,
      usedPercent: 4,
      inputTokens: 11321,
      cachedInputTokens: 4864,
      outputTokens: 26,
      reasoningOutputTokens: 0,
      updatedAt: "2026-03-07T00:00:00.000Z",
    });
  });

  it("accepts root-level snake_case token_usage totals objects", () => {
    expect(
      normalizeCodexContextWindow(
        {
          token_usage: {
            total_tokens: 100,
            model_context_window: 258400,
          },
        },
        "2026-03-07T00:00:00.000Z",
      ),
    ).toEqual({
      provider: "codex",
      usedTokens: 100,
      maxTokens: 258400,
      remainingTokens: 258300,
      usedPercent: 0,
      updatedAt: "2026-03-07T00:00:00.000Z",
    });
  });

  it("accepts root-level camelCase tokenUsage totals objects", () => {
    expect(
      normalizeCodexContextWindow(
        {
          tokenUsage: {
            totalTokens: 100,
            modelContextWindow: 258400,
          },
        },
        "2026-03-07T00:00:00.000Z",
      ),
    ).toEqual({
      provider: "codex",
      usedTokens: 100,
      maxTokens: 258400,
      remainingTokens: 258300,
      usedPercent: 0,
      updatedAt: "2026-03-07T00:00:00.000Z",
    });
  });

  it("excludes cached input tokens when totals include them", () => {
    expect(
      normalizeCodexContextWindow(
        {
          tokenUsage: {
            totalTokens: 115,
            inputTokens: 80,
            cachedInputTokens: 20,
            outputTokens: 15,
            modelContextWindow: 258400,
          },
        },
        "2026-03-07T00:00:00.000Z",
      ),
    ).toEqual({
      provider: "codex",
      usedTokens: 95,
      maxTokens: 258400,
      remainingTokens: 258305,
      usedPercent: 0,
      inputTokens: 80,
      cachedInputTokens: 20,
      outputTokens: 15,
      updatedAt: "2026-03-07T00:00:00.000Z",
    });
  });

  it("carries bucket fields from root-level totals objects", () => {
    expect(
      normalizeCodexContextWindow(
        {
          token_usage: {
            total_tokens: 100,
            input_tokens: 80,
            cached_input_tokens: 20,
            output_tokens: 15,
            reasoning_output_tokens: 5,
            model_context_window: 258400,
          },
        },
        "2026-03-07T00:00:00.000Z",
      ),
    ).toEqual({
      provider: "codex",
      usedTokens: 100,
      maxTokens: 258400,
      remainingTokens: 258300,
      usedPercent: 0,
      inputTokens: 80,
      cachedInputTokens: 20,
      outputTokens: 15,
      reasoningOutputTokens: 5,
      updatedAt: "2026-03-07T00:00:00.000Z",
    });
  });

  it("prefers the live context footprint over oversized cumulative totals", () => {
    expect(
      normalizeCodexContextWindow(
        {
          tokenUsage: {
            total: {
              totalTokens: 9_300_000,
              inputTokens: 248_000,
              cachedInputTokens: 2_400_000,
              outputTokens: 10_000,
            },
            modelContextWindow: 258_000,
          },
        },
        "2026-03-07T00:00:00.000Z",
      ),
    ).toMatchObject({
      usedTokens: 258_000,
      maxTokens: 258_000,
      remainingTokens: 0,
      usedPercent: 100,
      cachedInputTokens: 2_400_000,
    });
  });

  it("ignores malformed or incomplete payloads", () => {
    expect(normalizeCodexContextWindow({}, "2026-03-07T00:00:00.000Z")).toBeNull();
    expect(
      normalizeCodexContextWindow(
        { info: { total_token_usage: { total_tokens: 100 } } },
        "2026-03-07T00:00:00.000Z",
      ),
    ).toBeNull();
    expect(
      normalizeCodexContextWindow(
        { info: { total_token_usage: { total_tokens: -1 }, model_context_window: 258400 } },
        "2026-03-07T00:00:00.000Z",
      ),
    ).toBeNull();
  });

  it("clamps derived values when usage exceeds the model limit", () => {
    expect(
      normalizeCodexContextWindow(
        {
          info: {
            total_token_usage: {
              total_tokens: 300000,
            },
            model_context_window: 258400,
          },
        },
        "2026-03-07T00:00:00.000Z",
      ),
    ).toMatchObject({
      usedTokens: 300000,
      maxTokens: 258400,
      remainingTokens: 0,
      usedPercent: 100,
    });
  });
});
