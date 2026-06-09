#!/usr/bin/env node

import { accessSync, constants } from "node:fs";
import { delimiter, join } from "node:path";
import { spawnSync } from "node:child_process";

const [, , scriptPath, ...scriptArgs] = process.argv;

if (!scriptPath) {
  console.error("Usage: node scripts/run-ts.mjs <script.ts> [...args]");
  process.exit(1);
}

function canExecute(filePath) {
  try {
    accessSync(filePath, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function findOnPath(binaryName) {
  const pathEnv = process.env.PATH ?? "";
  for (const directory of pathEnv.split(delimiter)) {
    if (!directory) continue;
    const candidate = join(directory, binaryName);
    if (canExecute(candidate)) {
      return candidate;
    }
  }
  return null;
}

function findBun() {
  const fromPath = findOnPath("bun");
  if (fromPath) {
    return fromPath;
  }

  const candidates = [
    process.env.BUN_INSTALL ? join(process.env.BUN_INSTALL, "bin", "bun") : null,
    process.env.HOME ? join(process.env.HOME, ".bun", "bin", "bun") : null,
  ];

  return candidates.find((candidate) => candidate !== null && canExecute(candidate)) ?? null;
}

function nodeCanRunTypeScript() {
  const [major = "0", minor = "0"] = process.versions.node.split(".");
  const majorVersion = Number(major);
  const minorVersion = Number(minor);
  return majorVersion > 24 || (majorVersion === 24 && minorVersion >= 13);
}

function run(command, args) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    env: process.env,
  });

  if (result.error) {
    throw result.error;
  }

  if (typeof result.signal === "string") {
    process.kill(process.pid, result.signal);
    return;
  }

  process.exit(result.status ?? 1);
}

if (nodeCanRunTypeScript()) {
  run(process.execPath, [scriptPath, ...scriptArgs]);
}

const bun = findBun();
if (bun) {
  run(bun, [scriptPath, ...scriptArgs]);
}

console.error(
  `Cannot execute ${scriptPath}: Node ${process.versions.node} cannot run TypeScript files directly and Bun was not found on PATH or at ~/.bun/bin/bun.`,
);
console.error("Install/use Node 24.13+ or install Bun, then retry the command.");
process.exit(1);
