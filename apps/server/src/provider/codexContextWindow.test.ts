import { describe, expect, it } from "vitest";

import { compactCodexContextWindow, normalizeCodexContextWindow } from "./codexContextWindow.ts";

describe("normalizeCodexContextWindow", () => {
  it("parses the observed Codex token-count shape into a direct v2 snapshot", () => {
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
      estimationVersion: 2,
      estimationMode: "direct",
      usedTokens: 30259,
      effectiveTokens: 30259,
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
      provider: "codex",
      estimationVersion: 2,
      estimationMode: "direct",
      usedTokens: 41000,
      effectiveTokens: 41000,
      reportedTotalTokens: 119000,
      maxTokens: 258000,
      remainingTokens: 217000,
      usedPercent: 16,
    });
  });

  it("carries the last-turn token total and effective footprint when available", () => {
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
      provider: "codex",
      estimationVersion: 2,
      estimationMode: "direct",
      usedTokens: 41000,
      effectiveTokens: 41000,
      reportedTotalTokens: 119000,
      reportedLastTokens: 8500,
      lastEffectiveTokens: 5500,
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
      estimationVersion: 2,
      estimationMode: "direct",
      usedTokens: 6431,
      effectiveTokens: 6431,
      reportedTotalTokens: 11347,
      reportedLastTokens: 11347,
      lastEffectiveTokens: 6431,
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
      estimationVersion: 2,
      estimationMode: "direct",
      usedTokens: 100,
      effectiveTokens: 100,
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
      estimationVersion: 2,
      estimationMode: "direct",
      usedTokens: 100,
      effectiveTokens: 100,
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
      estimationVersion: 2,
      estimationMode: "direct",
      usedTokens: 40,
      effectiveTokens: 40,
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

  it("keeps direct mode when raw totals overflow but the effective footprint is below the window", () => {
    expect(
      normalizeCodexContextWindow(
        {
          tokenUsage: {
            total: {
              totalTokens: 1_212_700,
              inputTokens: 1_200_000,
              cachedInputTokens: 1_100_000,
              outputTokens: 9_500,
              reasoningOutputTokens: 3_200,
            },
            modelContextWindow: 258_000,
          },
        },
        "2026-03-07T03:55:00.000Z",
        {
          provider: "codex",
          estimationVersion: 2,
          estimationMode: "anchored",
          usedTokens: 38_700,
          effectiveTokens: 300_000,
          reportedTotalTokens: 1_050_000,
          anchorEffectiveTokens: 300_000,
          anchorEstimatedTokens: 38_700,
          anchorSource: "overflow-baseline",
          maxTokens: 258_000,
          remainingTokens: 219_300,
          usedPercent: 15,
          inputTokens: 1_040_000,
          cachedInputTokens: 950_000,
          outputTokens: 7_000,
          reasoningOutputTokens: 2_000,
          updatedAt: "2026-03-07T03:45:00.000Z",
        },
      ),
    ).toMatchObject({
      provider: "codex",
      estimationVersion: 2,
      estimationMode: "direct",
      usedTokens: 87_300,
      effectiveTokens: 87_300,
      reportedTotalTokens: 1_212_700,
      maxTokens: 258_000,
      remainingTokens: 170_700,
      usedPercent: 34,
      inputTokens: 1_200_000,
      cachedInputTokens: 1_100_000,
      outputTokens: 9_500,
      reasoningOutputTokens: 3_200,
    });
  });

  it("keeps direct mode for oversized reported totals when the effective footprint is zero", () => {
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
      provider: "codex",
      estimationVersion: 2,
      estimationMode: "direct",
      usedTokens: 0,
      effectiveTokens: 0,
      reportedTotalTokens: 9_300_000,
      maxTokens: 258_000,
      remainingTokens: 258_000,
      usedPercent: 0,
      cachedInputTokens: 2_400_000,
    });
  });

  it("resets to a 15% baseline after explicit compaction and grows from the stored anchor", () => {
    const compacted = compactCodexContextWindow(
      {
        provider: "codex",
        estimationVersion: 2,
        estimationMode: "direct",
        usedTokens: 145_000,
        effectiveTokens: 145_000,
        reportedTotalTokens: 300_000,
        maxTokens: 258_000,
        remainingTokens: 113_000,
        usedPercent: 56,
        inputTokens: 250_000,
        cachedInputTokens: 55_000,
        outputTokens: 50_000,
        updatedAt: "2026-03-07T00:00:00.000Z",
      },
      "2026-03-07T01:00:00.000Z",
    );

    expect(compacted).toMatchObject({
      provider: "codex",
      estimationVersion: 2,
      estimationMode: "anchored",
      usedTokens: 38_700,
      effectiveTokens: 145_000,
      reportedTotalTokens: 300_000,
      anchorEffectiveTokens: 145_000,
      anchorEstimatedTokens: 38_700,
      anchorSource: "explicit-compaction",
      remainingTokens: 219_300,
      usedPercent: 15,
      updatedAt: "2026-03-07T01:00:00.000Z",
    });

    expect(
      normalizeCodexContextWindow(
        {
          tokenUsage: {
            total: {
              totalTokens: 330_000,
              inputTokens: 320_000,
              outputTokens: 20_000,
            },
            modelContextWindow: 258_000,
          },
        },
        "2026-03-07T02:00:00.000Z",
        compacted,
      ),
    ).toMatchObject({
      provider: "codex",
      estimationVersion: 2,
      estimationMode: "anchored",
      usedTokens: 193_700,
      effectiveTokens: 300_000,
      reportedTotalTokens: 330_000,
      anchorEffectiveTokens: 145_000,
      anchorEstimatedTokens: 38_700,
      anchorSource: "explicit-compaction",
      remainingTokens: 64_300,
      usedPercent: 75,
    });
  });

  it("creates the first overflow anchor from the previous direct snapshot when available", () => {
    expect(
      normalizeCodexContextWindow(
        {
          tokenUsage: {
            total: {
              totalTokens: 268_000,
              inputTokens: 268_000,
            },
            modelContextWindow: 258_000,
          },
        },
        "2026-03-07T03:00:00.000Z",
        {
          provider: "codex",
          estimationVersion: 2,
          estimationMode: "direct",
          usedTokens: 240_000,
          effectiveTokens: 240_000,
          reportedTotalTokens: 240_000,
          maxTokens: 258_000,
          remainingTokens: 18_000,
          usedPercent: 93,
          updatedAt: "2026-03-07T02:00:00.000Z",
        },
      ),
    ).toMatchObject({
      provider: "codex",
      estimationVersion: 2,
      estimationMode: "anchored",
      usedTokens: 66_700,
      effectiveTokens: 268_000,
      reportedTotalTokens: 268_000,
      anchorEffectiveTokens: 240_000,
      anchorEstimatedTokens: 38_700,
      anchorSource: "overflow-previous-direct",
      remainingTokens: 191_300,
      usedPercent: 26,
    });
  });

  it("creates the first overflow anchor from the latest turn delta when no prior direct snapshot exists", () => {
    expect(
      normalizeCodexContextWindow(
        {
          tokenUsage: {
            total: {
              totalTokens: 270_000,
              inputTokens: 270_000,
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
      provider: "codex",
      estimationVersion: 2,
      estimationMode: "anchored",
      usedTokens: 62_700,
      effectiveTokens: 270_000,
      reportedTotalTokens: 270_000,
      reportedLastTokens: 32_000,
      lastEffectiveTokens: 24_000,
      anchorEffectiveTokens: 246_000,
      anchorEstimatedTokens: 38_700,
      anchorSource: "overflow-last-delta",
      remainingTokens: 195_300,
      usedPercent: 24,
    });
  });

  it("falls back to a baseline anchor when Codex overflows without prior detail", () => {
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
      provider: "codex",
      estimationVersion: 2,
      estimationMode: "anchored",
      usedTokens: 38_760,
      effectiveTokens: 300000,
      reportedTotalTokens: 300000,
      maxTokens: 258400,
      anchorEffectiveTokens: 300000,
      anchorEstimatedTokens: 38_760,
      anchorSource: "overflow-baseline",
      remainingTokens: 219640,
      usedPercent: 15,
    });
  });

  it("keeps using an existing anchored snapshot while effective usage remains over the window", () => {
    expect(
      normalizeCodexContextWindow(
        {
          info: {
            total_token_usage: {
              total_tokens: 315_000,
            },
            model_context_window: 258_000,
          },
        },
        "2026-03-07T03:50:00.000Z",
        {
          provider: "codex",
          estimationVersion: 2,
          estimationMode: "anchored",
          usedTokens: 38_700,
          effectiveTokens: 300_000,
          reportedTotalTokens: 300_000,
          anchorEffectiveTokens: 300_000,
          anchorEstimatedTokens: 38_700,
          anchorSource: "overflow-baseline",
          maxTokens: 258_000,
          remainingTokens: 219_300,
          usedPercent: 15,
          updatedAt: "2026-03-07T03:40:00.000Z",
        },
      ),
    ).toMatchObject({
      provider: "codex",
      estimationVersion: 2,
      estimationMode: "anchored",
      usedTokens: 53_700,
      effectiveTokens: 315_000,
      reportedTotalTokens: 315_000,
      anchorEffectiveTokens: 300_000,
      anchorEstimatedTokens: 38_700,
      anchorSource: "overflow-baseline",
      remainingTokens: 204_300,
      usedPercent: 21,
    });
  });

  it("returns to direct mode when a later effective footprint drops back under the window", () => {
    expect(
      normalizeCodexContextWindow(
        {
          tokenUsage: {
            total: {
              totalTokens: 1_212_700,
              inputTokens: 1_200_000,
              cachedInputTokens: 1_100_000,
              outputTokens: 9_500,
              reasoningOutputTokens: 3_200,
            },
            modelContextWindow: 258_000,
          },
        },
        "2026-03-07T04:00:00.000Z",
        {
          provider: "codex",
          estimationVersion: 2,
          estimationMode: "anchored",
          usedTokens: 53_700,
          effectiveTokens: 315_000,
          reportedTotalTokens: 315_000,
          anchorEffectiveTokens: 300_000,
          anchorEstimatedTokens: 38_700,
          anchorSource: "overflow-baseline",
          maxTokens: 258_000,
          remainingTokens: 204_300,
          usedPercent: 21,
          updatedAt: "2026-03-07T03:50:00.000Z",
        },
      ),
    ).toMatchObject({
      provider: "codex",
      estimationVersion: 2,
      estimationMode: "direct",
      usedTokens: 87_300,
      effectiveTokens: 87_300,
      reportedTotalTokens: 1_212_700,
      remainingTokens: 170_700,
      usedPercent: 34,
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
});
