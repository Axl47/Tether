import { Schema } from "effect";
import { TrimmedNonEmptyString } from "./baseSchemas.ts";
import type { ProviderKind } from "./orchestration.ts";

export const CODEX_REASONING_EFFORT_OPTIONS = ["xhigh", "high", "medium", "low"] as const;
export const CodexReasoningEffort = Schema.Literals(CODEX_REASONING_EFFORT_OPTIONS);
export type CodexReasoningEffort = typeof CodexReasoningEffort.Type;
export const CLAUDE_AGENT_EFFORT_OPTIONS = [
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
  "ultrathink",
] as const;
export const ClaudeAgentEffort = Schema.Literals(CLAUDE_AGENT_EFFORT_OPTIONS);
export type ClaudeAgentEffort = typeof ClaudeAgentEffort.Type;
export type ClaudeCodeEffort = ClaudeAgentEffort;
export const CURSOR_REASONING_OPTIONS = ["low", "medium", "high", "max", "xhigh"] as const;
export const CursorReasoningOption = Schema.Literals(CURSOR_REASONING_OPTIONS);
export type CursorReasoningOption = typeof CursorReasoningOption.Type;
export const GEMINI_THINKING_LEVEL_OPTIONS = ["high", "medium", "low"] as const;
export const GeminiThinkingLevel = Schema.Literals(GEMINI_THINKING_LEVEL_OPTIONS);
export type GeminiThinkingLevel = typeof GeminiThinkingLevel.Type;

export type ProviderReasoningEffort =
  | CodexReasoningEffort
  | ClaudeAgentEffort
  | CursorReasoningOption
  | GeminiThinkingLevel;

export const CodexModelOptions = Schema.Struct({
  reasoningEffort: Schema.optional(CodexReasoningEffort),
  fastMode: Schema.optional(Schema.Boolean),
});
export type CodexModelOptions = typeof CodexModelOptions.Type;

export const ClaudeModelOptions = Schema.Struct({
  thinking: Schema.optional(Schema.Boolean),
  effort: Schema.optional(ClaudeAgentEffort),
  fastMode: Schema.optional(Schema.Boolean),
  contextWindow: Schema.optional(Schema.String),
});
export type ClaudeModelOptions = typeof ClaudeModelOptions.Type;

export const CursorModelOptions = Schema.Struct({
  reasoning: Schema.optional(CursorReasoningOption),
  fastMode: Schema.optional(Schema.Boolean),
  thinking: Schema.optional(Schema.Boolean),
  contextWindow: Schema.optional(Schema.String),
});
export type CursorModelOptions = typeof CursorModelOptions.Type;
export const GeminiModelOptions = Schema.Struct({
  thinkingLevel: Schema.optional(GeminiThinkingLevel),
});
export type GeminiModelOptions = typeof GeminiModelOptions.Type;
export const OpenCodeModelOptions = Schema.Struct({
  variant: Schema.optional(TrimmedNonEmptyString),
  agent: Schema.optional(TrimmedNonEmptyString),
});
export type OpenCodeModelOptions = typeof OpenCodeModelOptions.Type;

export const ProviderModelOptions = Schema.Struct({
  codex: Schema.optional(CodexModelOptions),
  claudeAgent: Schema.optional(ClaudeModelOptions),
  cursor: Schema.optional(CursorModelOptions),
  gemini: Schema.optional(GeminiModelOptions),
  opencode: Schema.optional(OpenCodeModelOptions),
});
export type ProviderModelOptions = typeof ProviderModelOptions.Type;

export const EffortOption = Schema.Struct({
  value: TrimmedNonEmptyString,
  label: TrimmedNonEmptyString,
  isDefault: Schema.optional(Schema.Boolean),
});
export type EffortOption = typeof EffortOption.Type;

export const ContextWindowOption = Schema.Struct({
  value: TrimmedNonEmptyString,
  label: TrimmedNonEmptyString,
  isDefault: Schema.optional(Schema.Boolean),
});
export type ContextWindowOption = typeof ContextWindowOption.Type;

export const ModelCapabilities = Schema.Struct({
  reasoningEffortLevels: Schema.Array(EffortOption),
  supportsFastMode: Schema.Boolean,
  supportsThinkingToggle: Schema.Boolean,
  contextWindowOptions: Schema.Array(ContextWindowOption),
  promptInjectedEffortLevels: Schema.Array(TrimmedNonEmptyString),
  variantOptions: Schema.optional(Schema.Array(EffortOption)),
  agentOptions: Schema.optional(Schema.Array(EffortOption)),
});
export type ModelCapabilities = typeof ModelCapabilities.Type;

export const DEFAULT_MODEL_BY_PROVIDER: Record<ProviderKind, string> = {
  codex: "gpt-5.5",
  claudeAgent: "claude-sonnet-4-6",
  cursor: "auto",
  gemini: "gemini-2.5-pro",
  opencode: "openai/gpt-5",
};

export const DEFAULT_MODEL = DEFAULT_MODEL_BY_PROVIDER.codex;

/** Per-provider text generation model defaults. */
export const DEFAULT_GIT_TEXT_GENERATION_MODEL_BY_PROVIDER: Record<ProviderKind, string> = {
  codex: "gpt-5.4-mini",
  claudeAgent: "claude-haiku-4-5",
  cursor: "composer-2",
  gemini: "gemini-2.5-flash",
  opencode: "openai/gpt-5",
};
export const DEFAULT_GIT_TEXT_GENERATION_MODEL =
  DEFAULT_GIT_TEXT_GENERATION_MODEL_BY_PROVIDER.codex;

export const MODEL_SLUG_ALIASES_BY_PROVIDER: Record<ProviderKind, Record<string, string>> = {
  codex: {
    "gpt-5-codex": "gpt-5.5",
    "5.5": "gpt-5.5",
    "5.4": "gpt-5.4",
    "5.3": "gpt-5.3-codex",
    "gpt-5.3": "gpt-5.3-codex",
    "5.3-spark": "gpt-5.3-codex-spark",
    "gpt-5.3-spark": "gpt-5.3-codex-spark",
  },
  claudeAgent: {
    opus: "claude-opus-4-7",
    "opus-4.7": "claude-opus-4-7",
    "claude-opus-4.7": "claude-opus-4-7",
    "opus-4.6": "claude-opus-4-6",
    "claude-opus-4.6": "claude-opus-4-6",
    "claude-opus-4-6-20251117": "claude-opus-4-6",
    sonnet: "claude-sonnet-4-6",
    "sonnet-4.6": "claude-sonnet-4-6",
    "claude-sonnet-4.6": "claude-sonnet-4-6",
    "claude-sonnet-4-6-20251117": "claude-sonnet-4-6",
    haiku: "claude-haiku-4-5",
    "haiku-4.5": "claude-haiku-4-5",
    "claude-haiku-4.5": "claude-haiku-4-5",
    "claude-haiku-4-5-20251001": "claude-haiku-4-5",
  },
  cursor: {
    composer: "composer-2",
    "composer-1.5": "composer-1.5",
    "composer-1": "composer-1.5",
    "opus-4.6-thinking": "claude-opus-4-6",
    "opus-4.6": "claude-opus-4-6",
    "sonnet-4.6-thinking": "claude-sonnet-4-6",
    "sonnet-4.6": "claude-sonnet-4-6",
    "opus-4.5-thinking": "claude-opus-4-5",
    "opus-4.5": "claude-opus-4-5",
  },
  gemini: {
    pro: "gemini-2.5-pro",
    flash: "gemini-2.5-flash",
    "2.5-pro": "gemini-2.5-pro",
    "2.5-flash": "gemini-2.5-flash",
    "2.5-flash-lite": "gemini-2.5-flash-lite",
    "2.5-flash-image": "gemini-2.5-flash-image",
    lite: "gemini-2.5-flash-lite",
    "flash-image": "gemini-2.5-flash-image",
    "nano banana": "gemini-2.5-flash-image",
    "nano-banana": "gemini-2.5-flash-image",
    nanobanana: "gemini-2.5-flash-image",
    "3-pro": "gemini-3-pro-preview",
    "3-pro-image": "gemini-3-pro-preview",
    "nano banana 2": "gemini-3-pro-preview",
    "nano-banana-2": "gemini-3-pro-preview",
    nanobanana2: "gemini-3-pro-preview",
    "nano banana pro": "gemini-3-pro-preview",
    "nano-banana-pro": "gemini-3-pro-preview",
    "nanobanana-pro": "gemini-3-pro-preview",
    "gemini-3-pro-image-preview": "gemini-3-pro-preview",
    "3.1-pro": "gemini-3.1-pro-preview",
    "3-flash": "gemini-3-flash-preview",
  },
  opencode: {},
};

export const REASONING_EFFORT_OPTIONS_BY_PROVIDER: Record<ProviderKind, readonly string[]> = {
  codex: CODEX_REASONING_EFFORT_OPTIONS,
  claudeAgent: CLAUDE_AGENT_EFFORT_OPTIONS,
  cursor: CURSOR_REASONING_OPTIONS,
  gemini: GEMINI_THINKING_LEVEL_OPTIONS,
  opencode: [],
};

export const DEFAULT_REASONING_EFFORT_BY_PROVIDER: Record<
  ProviderKind,
  ProviderReasoningEffort | null
> = {
  codex: "high",
  claudeAgent: "high",
  cursor: "medium",
  gemini: "medium",
  opencode: null,
};

// ── Provider display names ────────────────────────────────────────────

export const PROVIDER_DISPLAY_NAMES: Record<ProviderKind, string> = {
  codex: "Codex",
  claudeAgent: "Claude",
  cursor: "Cursor",
  gemini: "Gemini",
  opencode: "OpenCode",
};
