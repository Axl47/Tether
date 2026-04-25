import * as Effect from "effect/Effect";
import * as Migrator from "effect/unstable/sql/Migrator";

import Migration0001 from "./Migrations/001_OrchestrationEvents.ts";
import Migration0002 from "./Migrations/002_OrchestrationCommandReceipts.ts";
import Migration0003 from "./Migrations/003_CheckpointDiffBlobs.ts";
import Migration0004 from "./Migrations/004_ProviderSessionRuntime.ts";
import Migration0005 from "./Migrations/005_Projections.ts";
import Migration0006 from "./Migrations/006_ProjectionThreadSessionRuntimeModeColumns.ts";
import Migration0007 from "./Migrations/007_ProjectionThreadMessageAttachments.ts";
import Migration0008 from "./Migrations/008_ProjectionThreadActivitySequence.ts";
import Migration0009 from "./Migrations/009_ProviderSessionRuntimeMode.ts";
import Migration0010 from "./Migrations/010_ProjectionThreadsRuntimeMode.ts";
import Migration0011 from "./Migrations/011_OrchestrationThreadCreatedRuntimeMode.ts";
import Migration0012 from "./Migrations/012_ProjectionThreadsInteractionMode.ts";
import Migration0013 from "./Migrations/013_ProjectionThreadProposedPlans.ts";
import Migration0014 from "./Migrations/014_ProjectionThreadContextWindow.ts";
import Migration0015 from "./Migrations/015_ProjectionThreadsAutorenameCache.ts";
import Migration0016 from "./Migrations/016_ClearLegacyCodexContextWindow.ts";
import Migration0017 from "./Migrations/017_ProjectionThreadProposedPlanImplementation.ts";
import Migration0018 from "./Migrations/018_ProjectionTurnsSourceProposedPlan.ts";
import Migration0019 from "./Migrations/016_CanonicalizeModelSelections.ts";
import Migration0020 from "./Migrations/017_ProjectionThreadsArchivedAt.ts";
import Migration0021 from "./Migrations/018_ProjectionThreadsArchivedAtIndex.ts";
import Migration0022 from "./Migrations/019_ProjectionSnapshotLookupIndexes.ts";
import Migration0023 from "./Migrations/020_AuthAccessManagement.ts";
import Migration0024 from "./Migrations/021_AuthSessionClientMetadata.ts";
import Migration0025 from "./Migrations/022_AuthSessionLastConnectedAt.ts";
import Migration0026 from "./Migrations/023_ProjectionThreadShellSummary.ts";
import Migration0027 from "./Migrations/024_BackfillProjectionThreadShellSummary.ts";
import Migration0028 from "./Migrations/025_CleanupInvalidProjectionPendingApprovals.ts";

export const migrationEntries = [
  [1, "OrchestrationEvents", Migration0001],
  [2, "OrchestrationCommandReceipts", Migration0002],
  [3, "CheckpointDiffBlobs", Migration0003],
  [4, "ProviderSessionRuntime", Migration0004],
  [5, "Projections", Migration0005],
  [6, "ProjectionThreadSessionRuntimeModeColumns", Migration0006],
  [7, "ProjectionThreadMessageAttachments", Migration0007],
  [8, "ProjectionThreadActivitySequence", Migration0008],
  [9, "ProviderSessionRuntimeMode", Migration0009],
  [10, "ProjectionThreadsRuntimeMode", Migration0010],
  [11, "OrchestrationThreadCreatedRuntimeMode", Migration0011],
  [12, "ProjectionThreadsInteractionMode", Migration0012],
  [13, "ProjectionThreadProposedPlans", Migration0013],
  [14, "ProjectionThreadContextWindow", Migration0014],
  [15, "ProjectionThreadsAutorenameCache", Migration0015],
  [16, "ClearLegacyCodexContextWindow", Migration0016],
  [17, "ProjectionThreadProposedPlanImplementation", Migration0017],
  [18, "ProjectionTurnsSourceProposedPlan", Migration0018],
  [19, "CanonicalizeModelSelections", Migration0019],
  [20, "ProjectionThreadsArchivedAt", Migration0020],
  [21, "ProjectionThreadsArchivedAtIndex", Migration0021],
  [22, "ProjectionSnapshotLookupIndexes", Migration0022],
  [23, "AuthAccessManagement", Migration0023],
  [24, "AuthSessionClientMetadata", Migration0024],
  [25, "AuthSessionLastConnectedAt", Migration0025],
  [26, "ProjectionThreadShellSummary", Migration0026],
  [27, "BackfillProjectionThreadShellSummary", Migration0027],
  [28, "CleanupInvalidProjectionPendingApprovals", Migration0028],
] as const;

export const makeMigrationLoader = (throughId?: number) =>
  Migrator.fromRecord(
    Object.fromEntries(
      migrationEntries
        .filter(([id]) => throughId === undefined || id <= throughId)
        .map(([id, name, migration]) => [`${id}_${name}`, migration]),
    ),
  );

const run = Migrator.make({});

export interface RunMigrationsOptions {
  readonly toMigrationInclusive?: number | undefined;
}

export const runMigrations = Effect.fn("runMigrations")(function* ({
  toMigrationInclusive,
}: RunMigrationsOptions = {}) {
  return yield* run({
    loader: makeMigrationLoader(toMigrationInclusive),
  });
});
