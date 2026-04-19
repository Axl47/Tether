import type { NativeApi } from "@t3tools/contracts";

import { ensureLocalApi, readLocalApi } from "./localApi";

export function readNativeApi(): NativeApi | undefined {
  return readLocalApi() as NativeApi | undefined;
}

export function ensureNativeApi(): NativeApi {
  return ensureLocalApi() as NativeApi;
}
