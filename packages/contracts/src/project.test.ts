import { Schema } from "effect";
import { describe, expect, it } from "vitest";

import {
  ProjectReadFileInput,
  ProjectReadFileResult,
  ProjectWriteFileInput,
} from "./project";

function decodes<S extends Schema.Top>(schema: S, input: unknown): boolean {
  try {
    Schema.decodeUnknownSync(schema as never)(input);
    return true;
  } catch {
    return false;
  }
}

describe("ProjectReadFileInput", () => {
  it("accepts a relative file path", () => {
    expect(
      decodes(ProjectReadFileInput, {
        cwd: "/tmp/project",
        relativePath: "package.json",
      }),
    ).toBe(true);
  });
});

describe("ProjectReadFileResult", () => {
  it("accepts bounded text contents", () => {
    expect(
      decodes(ProjectReadFileResult, {
        relativePath: "package.json",
        contents: '{"name":"demo"}\n',
      }),
    ).toBe(true);
  });
});

describe("ProjectWriteFileInput", () => {
  it("continues to accept workspace writes", () => {
    expect(
      decodes(ProjectWriteFileInput, {
        cwd: "/tmp/project",
        relativePath: "notes/plan.md",
        contents: "# Plan\n",
      }),
    ).toBe(true);
  });
});
