/**
 * ClaudeCodeAdapter - Claude Code implementation of the generic provider adapter contract.
 *
 * This service owns Claude runtime/session semantics and emits canonical
 * provider runtime events. It does not perform cross-provider routing, shared
 * event fan-out, or checkpoint orchestration.
 *
 * Uses Effect `Context.Service` for dependency injection and returns the
 * shared provider-adapter error channel with `provider: "claudeAgent"` context.
 *
 * @module ClaudeCodeAdapter
 */
import { Context } from "effect";

import type { ProviderAdapterError } from "../Errors.ts";
import type { ProviderAdapterShape } from "./ProviderAdapter.ts";

/**
 * ClaudeCodeAdapterShape - Service API for the Claude Code provider adapter.
 */
export interface ClaudeCodeAdapterShape extends ProviderAdapterShape<ProviderAdapterError> {
  readonly provider: "claudeAgent";
}

/**
 * ClaudeCodeAdapter - Service tag for Claude Code provider adapter operations.
 */
export class ClaudeCodeAdapter extends Context.Service<ClaudeCodeAdapter, ClaudeCodeAdapterShape>()(
  "t3/provider/Services/ClaudeCodeAdapter",
) {}
