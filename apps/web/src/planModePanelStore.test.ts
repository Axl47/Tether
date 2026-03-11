import { ThreadId, TurnId } from "@t3tools/contracts";
import { beforeEach, describe, expect, it } from "vitest";

import { selectThreadPlanModePanelState, usePlanModePanelStore } from "./planModePanelStore";

const THREAD_ID = ThreadId.makeUnsafe("thread-1");
const OTHER_THREAD_ID = ThreadId.makeUnsafe("thread-2");
const TURN_ID = TurnId.makeUnsafe("turn-1");
const NEXT_TURN_ID = TurnId.makeUnsafe("turn-2");

describe("planModePanelStore", () => {
  beforeEach(() => {
    if (typeof localStorage !== "undefined") {
      localStorage.clear();
    }
    usePlanModePanelStore.setState({ panelStateByThreadId: {} });
  });

  it("returns an expanded default state for unknown threads", () => {
    expect(
      selectThreadPlanModePanelState(
        usePlanModePanelStore.getState().panelStateByThreadId,
        THREAD_ID,
      ),
    ).toEqual({
      isMinimized: false,
      activeTurnId: null,
    });
  });

  it("persists minimized state for the same active plan turn", () => {
    const store = usePlanModePanelStore.getState();

    store.syncActivePlanTurn(THREAD_ID, TURN_ID);
    store.setPlanPanelMinimized(THREAD_ID, true);
    store.syncActivePlanTurn(THREAD_ID, TURN_ID);

    expect(
      selectThreadPlanModePanelState(
        usePlanModePanelStore.getState().panelStateByThreadId,
        THREAD_ID,
      ),
    ).toEqual({
      isMinimized: true,
      activeTurnId: TURN_ID,
    });
  });

  it("re-expands the panel when a different turn becomes active", () => {
    const store = usePlanModePanelStore.getState();

    store.syncActivePlanTurn(THREAD_ID, TURN_ID);
    store.setPlanPanelMinimized(THREAD_ID, true);
    store.syncActivePlanTurn(THREAD_ID, NEXT_TURN_ID);

    expect(
      selectThreadPlanModePanelState(
        usePlanModePanelStore.getState().panelStateByThreadId,
        THREAD_ID,
      ),
    ).toEqual({
      isMinimized: false,
      activeTurnId: NEXT_TURN_ID,
    });
  });

  it("removes orphaned thread panel state entries", () => {
    const store = usePlanModePanelStore.getState();

    store.syncActivePlanTurn(THREAD_ID, TURN_ID);
    store.syncActivePlanTurn(OTHER_THREAD_ID, NEXT_TURN_ID);
    store.setPlanPanelMinimized(THREAD_ID, true);
    store.removeOrphanedPlanPanelStates(new Set([THREAD_ID]));

    expect(usePlanModePanelStore.getState().panelStateByThreadId).toEqual({
      [THREAD_ID]: {
        isMinimized: true,
        activeTurnId: TURN_ID,
      },
    });
  });
});
