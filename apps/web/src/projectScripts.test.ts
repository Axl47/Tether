import { describe, expect, it } from "vitest";

import {
  commandForProjectScript,
  nextProjectScriptId,
  primaryProjectScript,
  projectScriptRuntimeEnv,
  projectScriptIdFromCommand,
  setupProjectScript,
} from "./projectScripts";
import {
  buildProjectScriptLaunchPlan,
  projectScriptSteps,
  serializeProjectScript,
} from "./lib/projectScriptExecution";

describe("projectScripts helpers", () => {
  it("builds and parses script run commands", () => {
    const command = commandForProjectScript("lint");
    expect(command).toBe("script.lint.run");
    expect(projectScriptIdFromCommand(command)).toBe("lint");
    expect(projectScriptIdFromCommand("terminal.toggle")).toBeNull();
  });

  it("slugifies and dedupes project script ids", () => {
    expect(nextProjectScriptId("Run Tests", [])).toBe("run-tests");
    expect(nextProjectScriptId("Run Tests", ["run-tests"])).toBe("run-tests-2");
    expect(nextProjectScriptId("!!!", [])).toBe("script");
  });

  it("resolves primary and setup scripts", () => {
    const scripts = [
      {
        id: "setup",
        name: "Setup",
        command: "bun install",
        icon: "configure" as const,
        runOnWorktreeCreate: true,
      },
      {
        id: "test",
        name: "Test",
        command: "bun test",
        icon: "test" as const,
        runOnWorktreeCreate: false,
      },
    ];

    expect(primaryProjectScript(scripts)?.id).toBe("test");
    expect(setupProjectScript(scripts)?.id).toBe("setup");
  });

  it("builds default runtime env for scripts", () => {
    const env = projectScriptRuntimeEnv({
      project: { cwd: "/repo" },
      worktreePath: "/repo/worktree-a",
    });

    expect(env).toMatchObject({
      TETHER_PROJECT_ROOT: "/repo",
      TETHER_WORKTREE_PATH: "/repo/worktree-a",
    });
  });

  it("allows overriding runtime env values", () => {
    const env = projectScriptRuntimeEnv({
      project: { cwd: "/repo" },
      extraEnv: {
        TETHER_PROJECT_ROOT: "/custom-root",
        CUSTOM_FLAG: "1",
      },
    });

    expect(env.TETHER_PROJECT_ROOT).toBe("/custom-root");
    expect(env.CUSTOM_FLAG).toBe("1");
    expect(env.TETHER_WORKTREE_PATH).toBeUndefined();
  });

  it("normalizes legacy project scripts into a single step", () => {
    expect(
      projectScriptSteps({
        id: "lint",
        name: "Lint",
        command: "bun run lint",
        icon: "lint",
        runOnWorktreeCreate: false,
      }),
    ).toEqual([{ id: "step-1", command: "bun run lint" }]);
  });

  it("serializes a single-step script without persisting steps", () => {
    expect(
      serializeProjectScript({
        id: "test",
        name: "Test",
        icon: "test",
        runOnWorktreeCreate: false,
        steps: [{ id: "step-1", command: "bun test" }],
      }),
    ).toEqual({
      id: "test",
      name: "Test",
      command: "bun test",
      icon: "test",
      runOnWorktreeCreate: false,
    });
  });

  it("serializes multi-step scripts with stable ordering and deduped ids", () => {
    expect(
      serializeProjectScript({
        id: "run-android",
        name: "Run Android",
        icon: "build",
        runOnWorktreeCreate: false,
        steps: [
          { id: "metro", command: "react-native start" },
          { id: "metro", command: "react-native run-android --no-packager" },
        ],
      }),
    ).toEqual({
      id: "run-android",
      name: "Run Android",
      command: "react-native start",
      icon: "build",
      runOnWorktreeCreate: false,
      steps: [
        { id: "metro", command: "react-native start" },
        { id: "metro-2", command: "react-native run-android --no-packager" },
      ],
    });
  });

  it("builds a two-terminal launch plan for an Obscura-style wrapped npm run android script", async () => {
    const plan = await buildProjectScriptLaunchPlan({
      script: {
        id: "run-android",
        name: "Run Android",
        command: "rtk proxy npm run android",
        icon: "build",
        runOnWorktreeCreate: false,
      },
      cwd: "/repo",
      terminalState: {
        terminalIds: ["default"],
        activeTerminalId: "default",
        runningTerminalIds: [],
      },
      readProjectFile: async () =>
        JSON.stringify({
          scripts: {
            start: "react-native start",
            android: "react-native run-android",
          },
        }),
      createTerminalId: (() => {
        let index = 0;
        return () => `terminal-${++index}`;
      })(),
    });

    expect(plan).toEqual({
      ok: true,
      expandedFromCompatibility: true,
      steps: [
        {
          step: { id: "metro", command: "rtk proxy npm run start" },
          terminalId: "default",
          createNewTerminal: false,
        },
        {
          step: {
            id: "android",
            command: "rtk proxy npm run android -- --no-packager",
          },
          terminalId: "terminal-1",
          createNewTerminal: true,
        },
      ],
    });
  });

  it("preserves android arguments while forcing --no-packager for wrapped npm scripts", async () => {
    const plan = await buildProjectScriptLaunchPlan({
      script: {
        id: "run-android",
        name: "Run Android",
        command: "rtk proxy npm run android -- --active-arch-only",
        icon: "build",
        runOnWorktreeCreate: false,
      },
      cwd: "/repo",
      terminalState: {
        terminalIds: ["default"],
        activeTerminalId: "default",
        runningTerminalIds: [],
      },
      readProjectFile: async () =>
        JSON.stringify({
          scripts: {
            start: "react-native start",
            android: "react-native run-android",
          },
        }),
      createTerminalId: () => "terminal-1",
    });

    expect(plan).toEqual({
      ok: true,
      expandedFromCompatibility: true,
      steps: [
        {
          step: { id: "metro", command: "rtk proxy npm run start" },
          terminalId: "default",
          createNewTerminal: false,
        },
        {
          step: {
            id: "android",
            command: "rtk proxy npm run android -- --active-arch-only --no-packager",
          },
          terminalId: "terminal-1",
          createNewTerminal: true,
        },
      ],
    });
  });

  it("still expands a recognized android launcher when package validation cannot be read", async () => {
    const plan = await buildProjectScriptLaunchPlan({
      script: {
        id: "run-android",
        name: "Run Android",
        command: "npm run android",
        icon: "build",
        runOnWorktreeCreate: false,
      },
      cwd: "/repo",
      terminalState: {
        terminalIds: ["default"],
        activeTerminalId: "default",
        runningTerminalIds: [],
      },
      readProjectFile: async () => {
        throw new Error("Unknown method: projects.readFile");
      },
      createTerminalId: () => "terminal-1",
    });

    expect(plan).toEqual({
      ok: true,
      expandedFromCompatibility: true,
      steps: [
        {
          step: { id: "metro", command: "npm run start" },
          terminalId: "default",
          createNewTerminal: false,
        },
        {
          step: { id: "android", command: "npm run android -- --no-packager" },
          terminalId: "terminal-1",
          createNewTerminal: true,
        },
      ],
    });
  });

  it("refuses to partially launch multi-step scripts when the terminal cap would be exceeded", async () => {
    const plan = await buildProjectScriptLaunchPlan({
      script: {
        id: "dev",
        name: "Dev",
        command: "bun run web",
        icon: "play",
        runOnWorktreeCreate: false,
        steps: [
          { id: "web", command: "bun run web" },
          { id: "api", command: "bun run api" },
        ],
      },
      cwd: "/repo",
      terminalState: {
        terminalIds: ["default", "terminal-2", "terminal-3", "terminal-4"],
        activeTerminalId: "default",
        runningTerminalIds: [],
      },
    });

    expect(plan).toEqual({
      ok: false,
      reason: "terminal-limit",
      message:
        "This action needs 2 terminal tabs, but the thread is limited to 4. Close another terminal and try again.",
    });
  });
});
