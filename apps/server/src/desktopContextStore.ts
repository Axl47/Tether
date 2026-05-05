import type { ServerDesktopContext, ServerSetDesktopContextInput } from "@t3tools/contracts";
import { Context, Effect, Layer, PubSub, Ref, Stream } from "effect";

export interface DesktopContextStoreShape {
  readonly get: Effect.Effect<ServerDesktopContext>;
  readonly set: (input: ServerSetDesktopContextInput) => Effect.Effect<ServerDesktopContext>;
  readonly streamUpdates: Stream.Stream<ServerDesktopContext>;
}

export class DesktopContextStore extends Context.Service<
  DesktopContextStore,
  DesktopContextStoreShape
>()("t3/server/DesktopContextStore") {}

interface DesktopContextSetResult {
  readonly context: ServerDesktopContext;
  readonly changed: boolean;
}

function emptyDesktopContext(): ServerDesktopContext {
  return {
    projectId: null,
    projectTitle: null,
    workspaceRoot: null,
    threadId: null,
    threadTitle: null,
    updatedAt: new Date().toISOString(),
  };
}

function sameEffectiveContext(
  left: ServerDesktopContext,
  right: ServerSetDesktopContextInput,
): boolean {
  return (
    left.projectId === right.projectId &&
    left.projectTitle === right.projectTitle &&
    left.workspaceRoot === right.workspaceRoot &&
    left.threadId === right.threadId &&
    left.threadTitle === right.threadTitle
  );
}

export const makeDesktopContextStore = Effect.gen(function* () {
  const currentRef = yield* Ref.make(emptyDesktopContext());
  const updatesPubSub = yield* PubSub.unbounded<ServerDesktopContext>();

  const get = Ref.get(currentRef);
  const set: DesktopContextStoreShape["set"] = (input) =>
    Effect.gen(function* () {
      const result = yield* Ref.modify(
        currentRef,
        (current): readonly [DesktopContextSetResult, ServerDesktopContext] => {
          if (sameEffectiveContext(current, input)) {
            return [{ context: current, changed: false }, current] as const;
          }

          const next: ServerDesktopContext = {
            ...input,
            updatedAt: new Date().toISOString(),
          };
          return [{ context: next, changed: true }, next] as const;
        },
      );

      if (result.changed) {
        yield* PubSub.publish(updatesPubSub, result.context);
      }

      return result.context;
    });

  return {
    get,
    set,
    streamUpdates: Stream.fromPubSub(updatesPubSub),
  } satisfies DesktopContextStoreShape;
});

export const DesktopContextStoreLive = Layer.effect(DesktopContextStore, makeDesktopContextStore);
