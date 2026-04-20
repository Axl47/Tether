import crypto from "node:crypto";
import { describe, expect, it, vi } from "vitest";

import { createAtomicWriteTempPath } from "./atomicFile.ts";

describe("createAtomicWriteTempPath", () => {
  it("creates distinct temp paths for repeated writes in the same process", () => {
    using randomUuidSpy = vi
      .spyOn(crypto, "randomUUID")
      .mockReturnValueOnce("11111111-1111-4111-8111-111111111111")
      .mockReturnValueOnce("22222222-2222-4222-8222-222222222222");

    const first = createAtomicWriteTempPath("/tmp/provider-cache.json");
    const second = createAtomicWriteTempPath("/tmp/provider-cache.json");

    expect(randomUuidSpy).toHaveBeenCalledTimes(2);
    expect(first).toBe(
      `/tmp/provider-cache.json.${process.pid}.11111111-1111-4111-8111-111111111111.tmp`,
    );
    expect(second).toBe(
      `/tmp/provider-cache.json.${process.pid}.22222222-2222-4222-8222-222222222222.tmp`,
    );
    expect(first).not.toBe(second);
  });
});
