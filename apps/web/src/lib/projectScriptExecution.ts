import type { ProjectScript, ProjectScriptIcon, ProjectScriptStep } from "@t3tools/contracts";

import { DEFAULT_THREAD_TERMINAL_ID, MAX_THREAD_TERMINAL_COUNT } from "../types";

const SYNTHETIC_PRIMARY_STEP_ID = "step-1";
const LEGACY_REACT_NATIVE_START_COMMANDS = new Set([
  "react-native start",
  "npx react-native start",
]);

type ReactNativeAndroidLauncherKind =
  | "npm"
  | "yarn"
  | "pnpm"
  | "bun"
  | "react-native"
  | "npx-react-native";

interface ReactNativeAndroidLauncher {
  kind: ReactNativeAndroidLauncherKind;
  prefix: string;
  androidArgsSuffix: string;
}

export interface ProjectScriptDraftInput {
  id: string;
  name: string;
  icon: ProjectScriptIcon;
  runOnWorktreeCreate: boolean;
  steps: ProjectScriptStep[];
}

export interface ProjectScriptLaunchPlanTerminalState {
  terminalIds: string[];
  activeTerminalId: string;
  runningTerminalIds: string[];
}

export interface ProjectScriptLaunchPlanStep {
  step: ProjectScriptStep;
  terminalId: string;
  createNewTerminal: boolean;
}

export type ProjectScriptLaunchPlanResult =
  | {
      ok: true;
      expandedFromCompatibility: boolean;
      steps: ProjectScriptLaunchPlanStep[];
    }
  | {
      ok: false;
      reason: "terminal-limit";
      message: string;
    };

interface BuildProjectScriptLaunchPlanInput {
  script: ProjectScript;
  cwd: string;
  terminalState: ProjectScriptLaunchPlanTerminalState;
  preferNewTerminal?: boolean;
  maxTerminalCount?: number;
  readProjectFile?: (input: { cwd: string; relativePath: string }) => Promise<string>;
  createTerminalId?: () => string;
}

function trimStep(step: ProjectScriptStep): ProjectScriptStep {
  return {
    id: step.id.trim(),
    command: step.command.trim(),
  };
}

function fallbackStepId(index: number): string {
  return `step-${index + 1}`;
}

function boundedStepId(value: string): string {
  const trimmed = value.trim();
  return trimmed.length <= 64 ? trimmed : trimmed.slice(0, 64).trim() || SYNTHETIC_PRIMARY_STEP_ID;
}

function dedupeStepIds(steps: ProjectScriptStep[]): ProjectScriptStep[] {
  const seen = new Set<string>();
  return steps.map((step, index) => {
    const baseId = boundedStepId(step.id || fallbackStepId(index));
    let candidate = baseId;
    let suffix = 2;
    while (seen.has(candidate)) {
      const suffixText = `-${suffix}`;
      const prefix = baseId.slice(0, Math.max(1, 64 - suffixText.length));
      candidate = `${prefix}${suffixText}`;
      suffix += 1;
    }
    seen.add(candidate);
    return { ...step, id: candidate };
  });
}

function normalizePersistedSteps(steps: ProjectScriptStep[]): ProjectScriptStep[] {
  return dedupeStepIds(
    steps.map(trimStep).map((step, index) => ({
      id: step.id.length > 0 ? step.id : fallbackStepId(index),
      command: step.command,
    })),
  );
}

function isLegacySingleCommandScript(script: ProjectScript): boolean {
  return !script.steps || script.steps.length === 0;
}

function parseReactNativeAndroidLauncher(command: string): ReactNativeAndroidLauncher | null {
  const trimmed = command.trim();
  const rtkPrefixMatch = /^(rtk(?:\s+proxy)?)\s+/.exec(trimmed);
  const prefix = rtkPrefixMatch ? `${rtkPrefixMatch[1]} ` : "";
  const candidate = rtkPrefixMatch ? trimmed.slice(rtkPrefixMatch[0].length).trim() : trimmed;

  const patterns: Array<{
    kind: ReactNativeAndroidLauncherKind;
    pattern: RegExp;
  }> = [
    { kind: "npm", pattern: /^npm run android(?<suffix>\s+.*)?$/ },
    { kind: "yarn", pattern: /^yarn android(?<suffix>\s+.*)?$/ },
    { kind: "pnpm", pattern: /^pnpm android(?<suffix>\s+.*)?$/ },
    { kind: "bun", pattern: /^bun run android(?<suffix>\s+.*)?$/ },
    {
      kind: "react-native",
      pattern: /^react-native run-android(?<suffix>\s+.*)?$/,
    },
    {
      kind: "npx-react-native",
      pattern: /^npx react-native run-android(?<suffix>\s+.*)?$/,
    },
  ];

  for (const { kind, pattern } of patterns) {
    const match = pattern.exec(candidate);
    if (!match) {
      continue;
    }
    return {
      kind,
      prefix,
      androidArgsSuffix: match.groups?.suffix?.trim()
        ? match[0].slice(match[0].indexOf(match.groups.suffix))
        : "",
    };
  }

  return null;
}

function appendReactNativeFlag(baseCommand: string, launcher: ReactNativeAndroidLauncher): string {
  const suffix = launcher.androidArgsSuffix;
  if (suffix.length === 0) {
    switch (launcher.kind) {
      case "npm":
      case "pnpm":
      case "bun":
        return `${baseCommand} -- --no-packager`;
      default:
        return `${baseCommand} --no-packager`;
    }
  }

  return `${baseCommand}${suffix} --no-packager`;
}

function buildCompatCommands(launcher: ReactNativeAndroidLauncher): {
  start: string;
  android: string;
} {
  switch (launcher.kind) {
    case "npm":
      return {
        start: `${launcher.prefix}npm run start`,
        android: appendReactNativeFlag(`${launcher.prefix}npm run android`, launcher),
      };
    case "yarn":
      return {
        start: `${launcher.prefix}yarn start`,
        android: appendReactNativeFlag(`${launcher.prefix}yarn android`, launcher),
      };
    case "pnpm":
      return {
        start: `${launcher.prefix}pnpm start`,
        android: appendReactNativeFlag(`${launcher.prefix}pnpm android`, launcher),
      };
    case "bun":
      return {
        start: `${launcher.prefix}bun run start`,
        android: appendReactNativeFlag(`${launcher.prefix}bun run android`, launcher),
      };
    case "react-native":
      return {
        start: `${launcher.prefix}react-native start`,
        android: appendReactNativeFlag(`${launcher.prefix}react-native run-android`, launcher),
      };
    case "npx-react-native":
      return {
        start: `${launcher.prefix}npx react-native start`,
        android: appendReactNativeFlag(`${launcher.prefix}npx react-native run-android`, launcher),
      };
  }
}

async function expandLegacyReactNativeAndroidScript(input: {
  script: ProjectScript;
  cwd: string;
  readProjectFile?: (input: { cwd: string; relativePath: string }) => Promise<string>;
}): Promise<{
  expandedFromCompatibility: boolean;
  steps: ProjectScriptStep[];
}> {
  if (!isLegacySingleCommandScript(input.script)) {
    return {
      expandedFromCompatibility: false,
      steps: projectScriptSteps(input.script),
    };
  }

  const command = input.script.command.trim();
  const launcher = parseReactNativeAndroidLauncher(command);
  if (!launcher || launcher.androidArgsSuffix.includes("--no-packager")) {
    return {
      expandedFromCompatibility: false,
      steps: projectScriptSteps(input.script),
    };
  }

  const compatSteps = [
    { id: "metro", command: buildCompatCommands(launcher).start },
    { id: "android", command: buildCompatCommands(launcher).android },
  ] satisfies ProjectScriptStep[];

  if (!input.readProjectFile) {
    return {
      expandedFromCompatibility: true,
      steps: compatSteps,
    };
  }

  try {
    const rawPackageJson = await input.readProjectFile({
      cwd: input.cwd,
      relativePath: "package.json",
    });
    const parsed = JSON.parse(rawPackageJson) as {
      scripts?: Record<string, unknown>;
    };
    const startCommand =
      typeof parsed.scripts?.start === "string" ? parsed.scripts.start.trim() : null;
    const androidCommand =
      typeof parsed.scripts?.android === "string" ? parsed.scripts.android.trim() : null;
    if (
      !startCommand ||
      !androidCommand ||
      !LEGACY_REACT_NATIVE_START_COMMANDS.has(startCommand) ||
      !["react-native run-android", "npx react-native run-android"].includes(androidCommand)
    ) {
      return {
        expandedFromCompatibility: false,
        steps: projectScriptSteps(input.script),
      };
    }
    return {
      expandedFromCompatibility: true,
      steps: compatSteps,
    };
  } catch {
    return {
      expandedFromCompatibility: true,
      steps: compatSteps,
    };
  }
}

export function projectScriptSteps(script: ProjectScript): ProjectScriptStep[] {
  if (script.steps && script.steps.length > 0) {
    return script.steps.map(trimStep);
  }
  return [
    {
      id: SYNTHETIC_PRIMARY_STEP_ID,
      command: script.command.trim(),
    },
  ];
}

export function serializeProjectScript(input: ProjectScriptDraftInput): ProjectScript {
  const normalizedSteps = normalizePersistedSteps(input.steps);
  const [primaryStep] = normalizedSteps;
  if (!primaryStep) {
    throw new Error("Project scripts require at least one step.");
  }
  return {
    id: input.id,
    name: input.name.trim(),
    command: primaryStep.command,
    icon: input.icon,
    runOnWorktreeCreate: input.runOnWorktreeCreate,
    ...(normalizedSteps.length > 1 ? { steps: normalizedSteps } : {}),
  };
}

export async function buildProjectScriptLaunchPlan(
  input: BuildProjectScriptLaunchPlanInput,
): Promise<ProjectScriptLaunchPlanResult> {
  const expanded = await expandLegacyReactNativeAndroidScript({
    script: input.script,
    cwd: input.cwd,
    ...(input.readProjectFile ? { readProjectFile: input.readProjectFile } : {}),
  });
  const steps = expanded.steps;
  const terminalIds =
    input.terminalState.terminalIds.length > 0
      ? input.terminalState.terminalIds
      : [DEFAULT_THREAD_TERMINAL_ID];
  const baseTerminalId =
    input.terminalState.activeTerminalId || terminalIds[0] || DEFAULT_THREAD_TERMINAL_ID;
  const isBaseTerminalBusy = input.terminalState.runningTerminalIds.includes(baseTerminalId);
  const createFirstTerminal = Boolean(input.preferNewTerminal) || isBaseTerminalBusy;
  const requiredNewTerminals = (createFirstTerminal ? 1 : 0) + Math.max(steps.length - 1, 0);
  const maxTerminalCount = input.maxTerminalCount ?? MAX_THREAD_TERMINAL_COUNT;

  if (terminalIds.length + requiredNewTerminals > maxTerminalCount) {
    return {
      ok: false,
      reason: "terminal-limit",
      message: `This action needs ${steps.length} terminal tab${steps.length === 1 ? "" : "s"}, but the thread is limited to ${maxTerminalCount}. Close another terminal and try again.`,
    };
  }

  const nextTerminalId = input.createTerminalId ?? (() => `terminal-${crypto.randomUUID()}`);
  const launchSteps: ProjectScriptLaunchPlanStep[] = steps.map((step, index) => {
    const createNewTerminal = index === 0 ? createFirstTerminal : true;
    return {
      step,
      terminalId: createNewTerminal ? nextTerminalId() : baseTerminalId,
      createNewTerminal,
    };
  });

  return {
    ok: true,
    expandedFromCompatibility: expanded.expandedFromCompatibility,
    steps: launchSteps,
  };
}
