import { useCallback, useMemo } from "react";
import { type ProviderKind } from "@t3tools/contracts";
import {
  DEFAULT_TIMESTAMP_FORMAT,
  type TimestampFormat,
  type UnifiedSettings,
} from "@t3tools/contracts/settings";
import { DEFAULT_MODEL_BY_PROVIDER } from "@t3tools/contracts";
import {
  getDefaultModel,
  normalizeModelSlug,
  resolveModelSlugForProvider,
} from "@t3tools/shared/model";

import { useSettings, useUpdateSettings } from "./hooks/useSettings";

export { DEFAULT_TIMESTAMP_FORMAT, type TimestampFormat };

export interface AppModelOption {
  slug: string;
  name: string;
  isCustom: boolean;
}

type LegacySettingsCompat = UnifiedSettings & {
  codexBinaryPath: string;
  codexHomePath: string;
  customCodexModels: string[];
  customClaudeModels: string[];
  customCursorModels: string[];
  customGeminiModels: string[];
  customOpenCodeModels: string[];
  sidebarThreadSort: "activity" | "created" | "status" | "name";
};

function normalizeCustomModelSlugs(
  models: Iterable<string | null | undefined>,
  provider: ProviderKind,
): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const candidate of models) {
    const normalized = normalizeModelSlug(candidate, provider);
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

export function getCustomModelsForProvider(
  settings: Pick<
    LegacySettingsCompat,
    | "customCodexModels"
    | "customClaudeModels"
    | "customCursorModels"
    | "customGeminiModels"
    | "customOpenCodeModels"
  >,
  provider: ProviderKind,
): readonly string[] {
  switch (provider) {
    case "claudeAgent":
      return settings.customClaudeModels;
    case "cursor":
      return settings.customCursorModels;
    case "gemini":
      return settings.customGeminiModels;
    case "opencode":
      return settings.customOpenCodeModels;
    case "codex":
    default:
      return settings.customCodexModels;
  }
}

export function getAppModelOptions(
  provider: ProviderKind,
  customModels: readonly string[],
  selectedModel?: string | null,
): AppModelOption[] {
  const seen = new Set<string>();
  const options: AppModelOption[] = [];
  const baseModel = DEFAULT_MODEL_BY_PROVIDER[provider] ?? getDefaultModel(provider);
  options.push({ slug: baseModel, name: baseModel, isCustom: false });
  seen.add(baseModel);

  for (const slug of normalizeCustomModelSlugs(customModels, provider)) {
    if (seen.has(slug)) {
      continue;
    }
    seen.add(slug);
    options.push({ slug, name: slug, isCustom: true });
  }

  const normalizedSelectedModel = normalizeModelSlug(selectedModel, provider);
  if (normalizedSelectedModel && !seen.has(normalizedSelectedModel)) {
    options.push({
      slug: normalizedSelectedModel,
      name: normalizedSelectedModel,
      isCustom: true,
    });
  }

  return options;
}

export function resolveAppModelSelection(
  provider: ProviderKind,
  customModels: readonly string[],
  selectedModel: string | null | undefined,
): string {
  const normalizedSelectedModel = resolveModelSlugForProvider(provider, selectedModel);
  const options = getAppModelOptions(provider, customModels, normalizedSelectedModel);
  return (
    options.find((option) => option.slug === normalizedSelectedModel)?.slug ??
    DEFAULT_MODEL_BY_PROVIDER[provider] ??
    getDefaultModel(provider)
  );
}

function toLegacySettingsCompat(settings: UnifiedSettings): LegacySettingsCompat {
  return {
    ...settings,
    codexBinaryPath: settings.providers.codex.binaryPath,
    codexHomePath: settings.providers.codex.homePath,
    customCodexModels: [...settings.providers.codex.customModels],
    customClaudeModels: [...settings.providers.claudeAgent.customModels],
    customCursorModels: [...settings.providers.cursor.customModels],
    customGeminiModels: [],
    customOpenCodeModels: [...settings.providers.opencode.customModels],
    sidebarThreadSort: settings.sidebarThreadSortOrder === "created_at" ? "created" : "activity",
  };
}

export function useAppSettings() {
  const settings = useSettings();
  const { updateSettings: updateUnifiedSettings, resetSettings } = useUpdateSettings();
  const compatSettings = useMemo(() => toLegacySettingsCompat(settings), [settings]);

  const updateSettings = useCallback(
    (patch: Partial<LegacySettingsCompat>) => {
      const nextPatch: {
        enableAssistantStreaming?: UnifiedSettings["enableAssistantStreaming"];
        defaultThreadEnvMode?: UnifiedSettings["defaultThreadEnvMode"];
        confirmThreadDelete?: UnifiedSettings["confirmThreadDelete"];
        confirmThreadArchive?: UnifiedSettings["confirmThreadArchive"];
        timestampFormat?: UnifiedSettings["timestampFormat"];
        sidebarThreadSortOrder?: UnifiedSettings["sidebarThreadSortOrder"];
        providers?: UnifiedSettings["providers"];
      } = {};

      if (patch.enableAssistantStreaming !== undefined) {
        nextPatch.enableAssistantStreaming = patch.enableAssistantStreaming;
      }
      if (patch.defaultThreadEnvMode !== undefined) {
        nextPatch.defaultThreadEnvMode = patch.defaultThreadEnvMode;
      }
      if (patch.confirmThreadDelete !== undefined) {
        nextPatch.confirmThreadDelete = patch.confirmThreadDelete;
      }
      if (patch.confirmThreadArchive !== undefined) {
        nextPatch.confirmThreadArchive = patch.confirmThreadArchive;
      }
      if (patch.timestampFormat !== undefined) {
        nextPatch.timestampFormat = patch.timestampFormat;
      }
      if (patch.sidebarThreadSort !== undefined) {
        nextPatch.sidebarThreadSortOrder =
          patch.sidebarThreadSort === "created" ? "created_at" : "updated_at";
      }

      const providerPatch: Record<
        string,
        UnifiedSettings["providers"][keyof UnifiedSettings["providers"]]
      > = {};
      const mergeProvider = (
        provider: keyof UnifiedSettings["providers"],
        partial: Partial<UnifiedSettings["providers"][typeof provider]>,
      ) => {
        providerPatch[provider] = {
          ...settings.providers[provider],
          ...partial,
        };
      };

      if (patch.codexBinaryPath !== undefined || patch.codexHomePath !== undefined) {
        mergeProvider("codex", {
          ...(patch.codexBinaryPath !== undefined ? { binaryPath: patch.codexBinaryPath } : {}),
          ...(patch.codexHomePath !== undefined ? { homePath: patch.codexHomePath } : {}),
        });
      }
      if (patch.customCodexModels !== undefined) {
        mergeProvider("codex", { customModels: [...patch.customCodexModels] });
      }
      if (patch.customClaudeModels !== undefined) {
        mergeProvider("claudeAgent", { customModels: [...patch.customClaudeModels] });
      }
      if (patch.customCursorModels !== undefined) {
        mergeProvider("cursor", { customModels: [...patch.customCursorModels] });
      }
      if (patch.customOpenCodeModels !== undefined) {
        mergeProvider("opencode", { customModels: [...patch.customOpenCodeModels] });
      }

      if (Object.keys(providerPatch).length > 0) {
        nextPatch.providers = {
          ...settings.providers,
          ...(providerPatch as Partial<UnifiedSettings["providers"]>),
        };
      }

      updateUnifiedSettings(nextPatch);
    },
    [settings.providers, updateUnifiedSettings],
  );

  return {
    settings: compatSettings,
    updateSettings,
    resetSettings,
  } as const;
}
