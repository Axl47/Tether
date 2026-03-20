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

/**
 * Database migration loader.
 *
 * Keeps every schema change in the order it was introduced so fresh databases
 * and upgraded databases converge on the same projection tables.
 */
const loader = Migrator.fromRecord({
  "1_OrchestrationEvents": Migration0001,
  "2_OrchestrationCommandReceipts": Migration0002,
  "3_CheckpointDiffBlobs": Migration0003,
  "4_ProviderSessionRuntime": Migration0004,
  "5_Projections": Migration0005,
  "6_ProjectionThreadSessionRuntimeModeColumns": Migration0006,
  "7_ProjectionThreadMessageAttachments": Migration0007,
  "8_ProjectionThreadActivitySequence": Migration0008,
  "9_ProviderSessionRuntimeMode": Migration0009,
  "10_ProjectionThreadsRuntimeMode": Migration0010,
  "11_OrchestrationThreadCreatedRuntimeMode": Migration0011,
  "12_ProjectionThreadsInteractionMode": Migration0012,
  "13_ProjectionThreadProposedPlans": Migration0013,
  "14_ProjectionThreadContextWindow": Migration0014,
  "15_ProjectionThreadsAutorenameCache": Migration0015,
  "16_ClearLegacyCodexContextWindow": Migration0016,
  "17_ProjectionThreadProposedPlanImplementation": Migration0017,
  "18_ProjectionTurnsSourceProposedPlan": Migration0018,
});

/**
 * Run all pending migrations.
 */
export const runMigrations = Migrator.make({})({ loader });
