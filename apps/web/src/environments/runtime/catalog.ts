import { getKnownEnvironmentHttpBaseUrl } from "@t3tools/client-runtime";
import type {
  AuthSessionRole,
  EnvironmentId,
  ExecutionEnvironmentDescriptor,
  PersistedSavedEnvironmentRecord,
  ServerConfig,
} from "@t3tools/contracts";
import { create } from "zustand";

import { ensureLocalApi } from "../../localApi";
import { getPrimaryKnownEnvironment } from "../primary";

export interface SavedEnvironmentRecord {
  readonly environmentId: EnvironmentId;
  readonly label: string;
  readonly wsBaseUrl: string;
  readonly httpBaseUrl: string;
  readonly createdAt: string;
  readonly lastConnectedAt: string | null;
}

interface SavedEnvironmentRegistryState {
  readonly byId: Record<EnvironmentId, SavedEnvironmentRecord>;
}

interface SavedEnvironmentRegistryStore extends SavedEnvironmentRegistryState {
  readonly upsert: (record: SavedEnvironmentRecord) => void;
  readonly remove: (environmentId: EnvironmentId) => void;
  readonly markConnected: (environmentId: EnvironmentId, connectedAt: string) => void;
  readonly reset: () => void;
}

let savedEnvironmentRegistryHydrated = false;
let savedEnvironmentRegistryHydrationPromise: Promise<void> | null = null;

function toPersistedSavedEnvironmentRecord(
  record: SavedEnvironmentRecord,
): PersistedSavedEnvironmentRecord {
  return {
    environmentId: record.environmentId,
    label: record.label,
    httpBaseUrl: record.httpBaseUrl,
    wsBaseUrl: record.wsBaseUrl,
    createdAt: record.createdAt,
    lastConnectedAt: record.lastConnectedAt,
  };
}

function valuesOfSavedEnvironmentRegistry(
  byId: Record<EnvironmentId, SavedEnvironmentRecord>,
): ReadonlyArray<SavedEnvironmentRecord> {
  return Object.values(byId) as ReadonlyArray<SavedEnvironmentRecord>;
}

function areSavedEnvironmentRecordsEqual(
  left: SavedEnvironmentRecord | undefined,
  right: SavedEnvironmentRecord | undefined,
): boolean {
  if (left === right) {
    return true;
  }
  if (!left || !right) {
    return false;
  }

  return (
    left.environmentId === right.environmentId &&
    left.label === right.label &&
    left.wsBaseUrl === right.wsBaseUrl &&
    left.httpBaseUrl === right.httpBaseUrl &&
    left.createdAt === right.createdAt &&
    left.lastConnectedAt === right.lastConnectedAt
  );
}

function areSavedEnvironmentRegistryStatesEqual(
  left: Record<EnvironmentId, SavedEnvironmentRecord>,
  right: Record<EnvironmentId, SavedEnvironmentRecord>,
): boolean {
  const leftEntries = Object.entries(left);
  const rightEntries = Object.entries(right);
  if (leftEntries.length !== rightEntries.length) {
    return false;
  }

  for (const [environmentId, leftRecord] of leftEntries) {
    if (!areSavedEnvironmentRecordsEqual(leftRecord, right[environmentId as EnvironmentId])) {
      return false;
    }
  }

  return true;
}

function persistSavedEnvironmentRegistryState(
  byId: Record<EnvironmentId, SavedEnvironmentRecord>,
): void {
  try {
    void ensureLocalApi()
      .persistence.setSavedEnvironmentRegistry(
        valuesOfSavedEnvironmentRegistry(byId).map((record) =>
          toPersistedSavedEnvironmentRecord(record),
        ),
      )
      .catch((error) => {
        console.error("[SAVED_ENVIRONMENTS] persist failed", error);
      });
  } catch (error) {
    console.error("[SAVED_ENVIRONMENTS] persist failed", error);
  }
}

function replaceSavedEnvironmentRegistryState(
  records: ReadonlyArray<SavedEnvironmentRecord>,
): void {
  const currentById = useSavedEnvironmentRegistryStore.getState().byId;
  const hydratedById = Object.fromEntries(records.map((record) => [record.environmentId, record]));
  const nextById = {
    ...hydratedById,
    ...currentById,
  };
  if (areSavedEnvironmentRegistryStatesEqual(currentById, nextById)) {
    return;
  }
  useSavedEnvironmentRegistryStore.setState({
    byId: nextById,
  });
}

async function hydrateSavedEnvironmentRegistry(): Promise<void> {
  if (savedEnvironmentRegistryHydrated) {
    return;
  }
  if (savedEnvironmentRegistryHydrationPromise) {
    return savedEnvironmentRegistryHydrationPromise;
  }

  const nextHydration = (async () => {
    try {
      const persistedRecords = await ensureLocalApi().persistence.getSavedEnvironmentRegistry();
      replaceSavedEnvironmentRegistryState(persistedRecords);
    } catch (error) {
      console.error("[SAVED_ENVIRONMENTS] hydrate failed", error);
    } finally {
      savedEnvironmentRegistryHydrated = true;
    }
  })();

  const hydrationPromise = nextHydration.finally(() => {
    if (savedEnvironmentRegistryHydrationPromise === hydrationPromise) {
      savedEnvironmentRegistryHydrationPromise = null;
    }
  });
  savedEnvironmentRegistryHydrationPromise = hydrationPromise;

  return savedEnvironmentRegistryHydrationPromise;
}

export const useSavedEnvironmentRegistryStore = create<SavedEnvironmentRegistryStore>()((set) => ({
  byId: {},
  upsert: (record) =>
    set((state) => {
      const existing = state.byId[record.environmentId];
      if (areSavedEnvironmentRecordsEqual(existing, record)) {
        return state;
      }
      const byId = {
        ...state.byId,
        [record.environmentId]: record,
      };
      persistSavedEnvironmentRegistryState(byId);
      return { byId };
    }),
  remove: (environmentId) =>
    set((state) => {
      const { [environmentId]: _removed, ...remaining } = state.byId;
      persistSavedEnvironmentRegistryState(remaining);
      return {
        byId: remaining,
      };
    }),
  markConnected: (environmentId, connectedAt) =>
    set((state) => {
      const existing = state.byId[environmentId];
      if (!existing || existing.lastConnectedAt === connectedAt) {
        return state;
      }
      const byId = {
        ...state.byId,
        [environmentId]: {
          ...existing,
          lastConnectedAt: connectedAt,
        },
      };
      persistSavedEnvironmentRegistryState(byId);
      return { byId };
    }),
  reset: () => {
    persistSavedEnvironmentRegistryState({});
    set({
      byId: {},
    });
  },
}));

export function hasSavedEnvironmentRegistryHydrated(): boolean {
  return savedEnvironmentRegistryHydrated;
}

export function waitForSavedEnvironmentRegistryHydration(): Promise<void> {
  if (hasSavedEnvironmentRegistryHydrated()) {
    return Promise.resolve();
  }

  return hydrateSavedEnvironmentRegistry();
}

export function listSavedEnvironmentRecords(): ReadonlyArray<SavedEnvironmentRecord> {
  return Object.values(useSavedEnvironmentRegistryStore.getState().byId).toSorted((left, right) =>
    left.label.localeCompare(right.label),
  );
}

export function getSavedEnvironmentRecord(
  environmentId: EnvironmentId,
): SavedEnvironmentRecord | null {
  return useSavedEnvironmentRegistryStore.getState().byId[environmentId] ?? null;
}

export function getEnvironmentHttpBaseUrl(environmentId: EnvironmentId): string | null {
  const primaryEnvironment = getPrimaryKnownEnvironment();
  if (primaryEnvironment?.environmentId === environmentId) {
    return getKnownEnvironmentHttpBaseUrl(primaryEnvironment);
  }

  return getSavedEnvironmentRecord(environmentId)?.httpBaseUrl ?? null;
}

export function resolveEnvironmentHttpUrl(input: {
  readonly environmentId: EnvironmentId;
  readonly pathname: string;
  readonly searchParams?: Record<string, string>;
}): string {
  const httpBaseUrl = getEnvironmentHttpBaseUrl(input.environmentId);
  if (!httpBaseUrl) {
    throw new Error(`Unable to resolve HTTP base URL for environment ${input.environmentId}.`);
  }

  const url = new URL(httpBaseUrl);
  url.pathname = input.pathname;
  if (input.searchParams) {
    url.search = new URLSearchParams(input.searchParams).toString();
  }
  return url.toString();
}

export function resetSavedEnvironmentRegistryStoreForTests() {
  savedEnvironmentRegistryHydrated = false;
  savedEnvironmentRegistryHydrationPromise = null;
  useSavedEnvironmentRegistryStore.setState({ byId: {} });
}

export async function persistSavedEnvironmentRecord(record: SavedEnvironmentRecord): Promise<void> {
  const byId = {
    ...useSavedEnvironmentRegistryStore.getState().byId,
    [record.environmentId]: record,
  };

  await ensureLocalApi().persistence.setSavedEnvironmentRegistry(
    valuesOfSavedEnvironmentRegistry(byId).map((entry) => toPersistedSavedEnvironmentRecord(entry)),
  );
}

export async function readSavedEnvironmentBearerToken(
  environmentId: EnvironmentId,
): Promise<string | null> {
  return ensureLocalApi().persistence.getSavedEnvironmentSecret(environmentId);
}

export async function writeSavedEnvironmentBearerToken(
  environmentId: EnvironmentId,
  bearerToken: string,
): Promise<boolean> {
  return ensureLocalApi().persistence.setSavedEnvironmentSecret(environmentId, bearerToken);
}

export async function removeSavedEnvironmentBearerToken(
  environmentId: EnvironmentId,
): Promise<void> {
  await ensureLocalApi().persistence.removeSavedEnvironmentSecret(environmentId);
}

export type SavedEnvironmentConnectionState = "connecting" | "connected" | "disconnected" | "error";

export type SavedEnvironmentAuthState = "authenticated" | "requires-auth" | "unknown";

export interface SavedEnvironmentRuntimeState {
  readonly connectionState: SavedEnvironmentConnectionState;
  readonly authState: SavedEnvironmentAuthState;
  readonly lastError: string | null;
  readonly lastErrorAt: string | null;
  readonly role: AuthSessionRole | null;
  readonly descriptor: ExecutionEnvironmentDescriptor | null;
  readonly serverConfig: ServerConfig | null;
  readonly connectedAt: string | null;
  readonly disconnectedAt: string | null;
}

interface SavedEnvironmentRuntimeStoreState {
  readonly byId: Record<EnvironmentId, SavedEnvironmentRuntimeState>;
  readonly ensure: (environmentId: EnvironmentId) => void;
  readonly patch: (
    environmentId: EnvironmentId,
    patch: Partial<SavedEnvironmentRuntimeState>,
  ) => void;
  readonly clear: (environmentId: EnvironmentId) => void;
  readonly reset: () => void;
}

const DEFAULT_SAVED_ENVIRONMENT_RUNTIME_STATE: SavedEnvironmentRuntimeState = Object.freeze({
  connectionState: "disconnected",
  authState: "unknown",
  lastError: null,
  lastErrorAt: null,
  role: null,
  descriptor: null,
  serverConfig: null,
  connectedAt: null,
  disconnectedAt: null,
});

function createDefaultSavedEnvironmentRuntimeState(): SavedEnvironmentRuntimeState {
  return {
    ...DEFAULT_SAVED_ENVIRONMENT_RUNTIME_STATE,
  };
}

function areSavedEnvironmentRuntimeStatesEqual(
  left: SavedEnvironmentRuntimeState,
  right: SavedEnvironmentRuntimeState,
): boolean {
  return (
    left.connectionState === right.connectionState &&
    left.authState === right.authState &&
    left.lastError === right.lastError &&
    left.lastErrorAt === right.lastErrorAt &&
    left.role === right.role &&
    left.descriptor === right.descriptor &&
    left.serverConfig === right.serverConfig &&
    left.connectedAt === right.connectedAt &&
    left.disconnectedAt === right.disconnectedAt
  );
}

export const useSavedEnvironmentRuntimeStore = create<SavedEnvironmentRuntimeStoreState>()(
  (set) => ({
    byId: {},
    ensure: (environmentId) =>
      set((state) => {
        if (state.byId[environmentId]) {
          return state;
        }
        return {
          byId: {
            ...state.byId,
            [environmentId]: createDefaultSavedEnvironmentRuntimeState(),
          },
        };
      }),
    patch: (environmentId, patch) =>
      set((state) => {
        const currentEntry =
          state.byId[environmentId] ?? createDefaultSavedEnvironmentRuntimeState();
        const nextEntry = {
          ...currentEntry,
          ...patch,
        };
        if (areSavedEnvironmentRuntimeStatesEqual(currentEntry, nextEntry)) {
          return state;
        }
        return {
          byId: {
            ...state.byId,
            [environmentId]: nextEntry,
          },
        };
      }),
    clear: (environmentId) =>
      set((state) => {
        const { [environmentId]: _removed, ...remaining } = state.byId;
        return {
          byId: remaining,
        };
      }),
    reset: () =>
      set({
        byId: {},
      }),
  }),
);

export function getSavedEnvironmentRuntimeState(
  environmentId: EnvironmentId,
): SavedEnvironmentRuntimeState {
  return (
    useSavedEnvironmentRuntimeStore.getState().byId[environmentId] ??
    DEFAULT_SAVED_ENVIRONMENT_RUNTIME_STATE
  );
}

export function resetSavedEnvironmentRuntimeStoreForTests() {
  useSavedEnvironmentRuntimeStore.getState().reset();
}
