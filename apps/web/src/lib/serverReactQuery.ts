import { queryOptions } from "@tanstack/react-query";

import { ensureNativeApi } from "../nativeApi";
import { getServerConfig } from "../rpc/serverState";

export const serverQueryKeys = {
  all: ["server"] as const,
  config: () => ["server", "config"] as const,
};

export function serverConfigQueryOptions() {
  return queryOptions({
    queryKey: serverQueryKeys.config(),
    queryFn: async () => {
      const cached = getServerConfig();
      if (cached) {
        return cached;
      }
      return await ensureNativeApi().server.getConfig();
    },
    staleTime: Infinity,
  });
}
