const isWildcardHost = (host: string): boolean =>
  host === "0.0.0.0" || host === "::" || host === "[::]";

const resolveRuntimeHost = (): string => {
  const hostname = window.location.hostname.trim();
  return hostname.length > 0 ? hostname : "localhost";
};

function resolveConfiguredWsUrlCandidate(): string {
  const bridgeUrl = window.desktopBridge?.getWsUrl?.();
  if (typeof bridgeUrl === "string" && bridgeUrl.length > 0) {
    return bridgeUrl;
  }

  const envWsUrl = import.meta.env.VITE_WS_URL as string | undefined;
  if (typeof envWsUrl === "string" && envWsUrl.length > 0) {
    return envWsUrl;
  }

  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  return `${protocol}://${window.location.hostname}:${window.location.port}`;
}

export function resolveConfiguredWsUrl(): string {
  if (typeof window === "undefined") {
    return "";
  }

  const wsCandidate = resolveConfiguredWsUrlCandidate();
  try {
    const parsed = new URL(wsCandidate);
    if (!isWildcardHost(parsed.hostname)) {
      return wsCandidate;
    }
    parsed.hostname = resolveRuntimeHost();
    return parsed.toString();
  } catch {
    return wsCandidate;
  }
}

export function resolveServerHttpOriginFromWsUrl(wsUrl: string): string {
  try {
    const parsed = new URL(wsUrl);
    parsed.protocol =
      parsed.protocol === "wss:" ? "https:" : parsed.protocol === "ws:" ? "http:" : parsed.protocol;
    return parsed.origin;
  } catch {
    return wsUrl.replace(/^wss:/, "https:").replace(/^ws:/, "http:");
  }
}
