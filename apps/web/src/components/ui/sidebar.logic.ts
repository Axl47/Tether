const LEGACY_SIDEBAR_COOKIE_NAME = "sidebar_state";

function parseSidebarOpenState(rawValue: string | null): boolean | null {
  if (rawValue === null) {
    return null;
  }

  const normalizedValue = rawValue.trim().toLowerCase();
  if (normalizedValue === "true") {
    return true;
  }
  if (normalizedValue === "false") {
    return false;
  }
  return null;
}

function readLegacySidebarCookie(cookieString: string): boolean | null {
  const cookiePrefix = `${LEGACY_SIDEBAR_COOKIE_NAME}=`;

  for (const segment of cookieString.split(";")) {
    const trimmedSegment = segment.trim();
    if (!trimmedSegment.startsWith(cookiePrefix)) {
      continue;
    }

    return parseSidebarOpenState(trimmedSegment.slice(cookiePrefix.length));
  }

  return null;
}

export function readPersistedSidebarOpenState(args: {
  cookieString: string;
  defaultOpen: boolean;
  storage: Pick<Storage, "getItem"> | null;
  storageKey: string | null;
}): boolean {
  const { cookieString, defaultOpen, storage, storageKey } = args;

  if (storageKey && storage) {
    try {
      const persistedValue = parseSidebarOpenState(storage.getItem(storageKey));
      if (persistedValue !== null) {
        return persistedValue;
      }
    } catch {
      // Ignore storage read failures and fall back to legacy/default state.
    }
  }

  return readLegacySidebarCookie(cookieString) ?? defaultOpen;
}

export function persistSidebarOpenState(args: {
  open: boolean;
  storage: Pick<Storage, "setItem"> | null;
  storageKey: string | null;
}): void {
  const { open, storage, storageKey } = args;
  if (!storageKey || !storage) {
    return;
  }

  try {
    storage.setItem(storageKey, String(open));
  } catch {
    // Ignore storage write failures to avoid breaking chat UX.
  }
}

