import crypto from "node:crypto";

export function createAtomicWriteTempPath(destinationPath: string): string {
  return `${destinationPath}.${process.pid}.${crypto.randomUUID()}.tmp`;
}
