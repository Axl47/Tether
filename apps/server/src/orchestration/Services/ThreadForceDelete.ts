import type {
  OrchestrationForceDeleteThreadInput,
  OrchestrationReadModel,
} from "@t3tools/contracts";
import { Schema, ServiceMap } from "effect";
import type { Effect } from "effect";

export class ThreadForceDeleteError extends Schema.TaggedErrorClass<ThreadForceDeleteError>()(
  "ThreadForceDeleteError",
  {
    message: Schema.String,
  },
) {}

export interface ThreadForceDeleteShape {
  readonly forceDeleteThread: (
    input: OrchestrationForceDeleteThreadInput,
  ) => Effect.Effect<OrchestrationReadModel, ThreadForceDeleteError>;
}

export class ThreadForceDelete extends ServiceMap.Service<
  ThreadForceDelete,
  ThreadForceDeleteShape
>()("t3/orchestration/Services/ThreadForceDelete") {}
