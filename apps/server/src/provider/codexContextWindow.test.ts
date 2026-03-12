import { describe, expect, it } from "vitest";

import { compactCodexContextWindow, normalizeCodexContextWindow } from "./codexContextWindow.ts";

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
      usedTokens: 30259,
      reportedTotalTokens: 126516,
      maxTokens: 258400,
      remainingTokens: 228141,
      usedPercent: 12,
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
      usedTokens: 41000,
      reportedTotalTokens: 119000,
      maxTokens: 258000,
      remainingTokens: 217000,
      usedPercent: 16,
    });
  });

  it("carries the last-turn token total when available", () => {
    expect(
      normalizeCodexContextWindow(
        {
          tokenUsage: {
            total: {
              totalTokens: 119000,
              inputTokens: 110000,
              cachedInputTokens: 60000,
              outputTokens: 9000,
            },
            last: {
              totalTokens: 8500,
              inputTokens: 8000,
              cachedInputTokens: 2000,
              outputTokens: 500,
              reasoningOutputTokens: 0,
            },
            modelContextWindow: 258000,
          },
        },
        "2026-03-07T00:00:00.000Z",
      ),
    ).toMatchObject({
      usedTokens: 41000,
      reportedTotalTokens: 119000,
      reportedLastTokens: 8500,
      maxTokens: 258000,
      remainingTokens: 217000,
      usedPercent: 16,
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
      usedTokens: 6431,
      reportedTotalTokens: 11347,
      reportedLastTokens: 11347,
      maxTokens: 258400,
      remainingTokens: 251969,
      usedPercent: 2,
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
      reportedTotalTokens: 100,
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
      reportedTotalTokens: 100,
      maxTokens: 258400,
      remainingTokens: 258300,
      usedPercent: 0,
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
      usedTokens: 40,
      reportedTotalTokens: 100,
      maxTokens: 258400,
      remainingTokens: 258360,
      usedPercent: 0,
      inputTokens: 80,
      cachedInputTokens: 20,
      outputTokens: 15,
      reasoningOutputTokens: 5,
      updatedAt: "2026-03-07T00:00:00.000Z",
    });
  });

  it("preserves oversized estimated occupancy and reported totals", () => {
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
      usedTokens: 0,
      reportedTotalTokens: 9_300_000,
      maxTokens: 258_000,
      remainingTokens: 258_000,
      usedPercent: 0,
      cachedInputTokens: 2_400_000,
    });
  });

  it("resets to a 15% baseline after compaction and grows from the compaction anchor", () => {
    const compacted = compactCodexContextWindow(
      {
        provider: "codex",
        usedTokens: 245_000,
        reportedTotalTokens: 300_000,
        maxTokens: 258_000,
        remainingTokens: 13_000,
        usedPercent: 95,
        inputTokens: 250_000,
        cachedInputTokens: 55_000,
        outputTokens: 50_000,
        updatedAt: "2026-03-07T00:00:00.000Z",
      },
      "2026-03-07T01:00:00.000Z",
    );

    expect(compacted).toMatchObject({
      usedTokens: 38_700,
      reportedTotalTokens: 300_000,
      compactionAnchorNonCachedTokens: 145_000,
      compactionAnchorUsedTokens: 38_700,
      remainingTokens: 219_300,
      usedPercent: 15,
      updatedAt: "2026-03-07T01:00:00.000Z",
    });

    expect(
      normalizeCodexContextWindow(
        {
          tokenUsage: {
            total: {
              totalTokens: 333_000,
              inputTokens: 275_000,
              cachedInputTokens: 58_000,
              outputTokens: 58_000,
            },
            modelContextWindow: 258_000,
          },
        },
        "2026-03-07T02:00:00.000Z",
        compacted,
      ),
    ).toMatchObject({
      usedTokens: 52_700,
      reportedTotalTokens: 333_000,
      compactionAnchorNonCachedTokens: 145_000,
      compactionAnchorUsedTokens: 38_700,
      remainingTokens: 205_300,
      usedPercent: 20,
    });
  });

  it("recovers a compaction anchor from legacy overflowing snapshots using the latest turn delta", () => {
    expect(
      normalizeCodexContextWindow(
        {
          tokenUsage: {
            total: {
              totalTokens: 26_400_000,
              inputTokens: 24_000_000,
              cachedInputTokens: 2_000_000,
              outputTokens: 250_000,
              reasoningOutputTokens: 50_000,
            },
            last: {
              totalTokens: 32_000,
              inputTokens: 29_000,
              cachedInputTokens: 2_000,
              outputTokens: 2_000,
              reasoningOutputTokens: 1_000,
            },
            modelContextWindow: 258_000,
          },
        },
        "2026-03-07T03:00:00.000Z",
        {
          provider: "codex",
          usedTokens: 258_000,
          reportedTotalTokens: 26_000_000,
          maxTokens: 258_000,
          remainingTokens: 0,
          usedPercent: 100,
          updatedAt: "2026-03-07T02:00:00.000Z",
        },
      ),
    ).toMatchObject({
      usedTokens: 62_700,
      reportedTotalTokens: 26_400_000,
      reportedLastTokens: 32_000,
      compactionAnchorNonCachedTokens: 21_676_000,
      compactionAnchorUsedTokens: 38_700,
      remainingTokens: 195_300,
      usedPercent: 24,
    });
  });

  it("recovers a compaction anchor from an overflowing update even when no prior anchor exists", () => {
    expect(
      normalizeCodexContextWindow(
        {
          tokenUsage: {
            total: {
              totalTokens: 26_400_000,
              inputTokens: 24_000_000,
              cachedInputTokens: 2_000_000,
              outputTokens: 250_000,
              reasoningOutputTokens: 50_000,
            },
            last: {
              totalTokens: 32_000,
              inputTokens: 29_000,
              cachedInputTokens: 2_000,
              outputTokens: 2_000,
              reasoningOutputTokens: 1_000,
            },
            modelContextWindow: 258_000,
          },
        },
        "2026-03-07T03:30:00.000Z",
      ),
    ).toMatchObject({
      usedTokens: 62_700,
      reportedTotalTokens: 26_400_000,
      reportedLastTokens: 32_000,
      compactionAnchorNonCachedTokens: 21_676_000,
      compactionAnchorUsedTokens: 38_700,
      remainingTokens: 195_300,
      usedPercent: 24,
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

  it("preserves derived values when usage exceeds the model limit", () => {
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
      reportedTotalTokens: 300000,
      maxTokens: 258400,
      remainingTokens: 0,
      usedPercent: 116,
    });
  });
});
