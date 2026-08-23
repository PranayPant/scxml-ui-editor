import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useExecutionOverlay } from "../useExecutionOverlay";

const IDLE = {
  mode: "idle" as const,
  activeStateIds: [] as string[],
  previousStateIds: [] as string[],
  firedTransitionIds: [] as string[],
  loading: false,
};

function resetStore() {
  useExecutionOverlay.setState(IDLE);
}

describe("useExecutionOverlay", () => {
  beforeEach(() => {
    resetStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("initial state", () => {
    it("starts in idle mode with empty arrays", () => {
      const s = useExecutionOverlay.getState();
      expect(s.mode).toBe("idle");
      expect(s.activeStateIds).toEqual([]);
      expect(s.previousStateIds).toEqual([]);
      expect(s.firedTransitionIds).toEqual([]);
      expect(s.loading).toBe(false);
    });
  });

  describe("enterInteractive", () => {
    it("sets mode to interactive and stores active state IDs", () => {
      useExecutionOverlay.getState().enterInteractive(["idle", "running"]);
      const s = useExecutionOverlay.getState();
      expect(s.mode).toBe("interactive");
      expect(s.activeStateIds).toEqual(["idle", "running"]);
    });

    it("clears previous state IDs and fired transitions", () => {
      // Simulate some prior state
      useExecutionOverlay.setState({
        previousStateIds: ["old"],
        firedTransitionIds: ["e1"],
      });

      useExecutionOverlay.getState().enterInteractive(["idle"]);
      const s = useExecutionOverlay.getState();
      expect(s.previousStateIds).toEqual([]);
      expect(s.firedTransitionIds).toEqual([]);
    });
  });

  describe("stepComplete", () => {
    it("updates active and previous state IDs and sets fired transitions", () => {
      useExecutionOverlay.getState().enterInteractive(["idle"]);
      useExecutionOverlay
        .getState()
        .stepComplete(["idle"], ["running"], ["edge:0"]);

      const s = useExecutionOverlay.getState();
      expect(s.activeStateIds).toEqual(["running"]);
      expect(s.previousStateIds).toEqual(["idle"]);
      expect(s.firedTransitionIds).toEqual(["edge:0"]);
    });

    it("auto-clears fired transitions after 800ms", () => {
      useExecutionOverlay
        .getState()
        .stepComplete(["idle"], ["running"], ["edge:0"]);
      expect(useExecutionOverlay.getState().firedTransitionIds).toEqual([
        "edge:0",
      ]);

      vi.advanceTimersByTime(800);
      expect(useExecutionOverlay.getState().firedTransitionIds).toEqual([]);
    });

    it("does not schedule a timer when no fired edges", () => {
      useExecutionOverlay.getState().stepComplete(["idle"], ["idle"], []);

      const clearFlash = vi.spyOn(useExecutionOverlay.getState(), "clearFlash");
      vi.advanceTimersByTime(800);
      expect(clearFlash).not.toHaveBeenCalled();
    });
  });

  describe("finish", () => {
    it("sets mode to done and stores final state IDs", () => {
      useExecutionOverlay.getState().finish(["finished", "completed"]);
      const s = useExecutionOverlay.getState();
      expect(s.mode).toBe("done");
      expect(s.activeStateIds).toEqual(["finished", "completed"]);
      expect(s.previousStateIds).toEqual([]);
      expect(s.firedTransitionIds).toEqual([]);
      expect(s.loading).toBe(false);
    });
  });

  describe("stop", () => {
    it("resets all state to idle defaults", () => {
      useExecutionOverlay.getState().enterInteractive(["running"]);
      useExecutionOverlay.setState({ loading: true });

      useExecutionOverlay.getState().stop();

      const s = useExecutionOverlay.getState();
      expect(s.mode).toBe("idle");
      expect(s.activeStateIds).toEqual([]);
      expect(s.previousStateIds).toEqual([]);
      expect(s.firedTransitionIds).toEqual([]);
      expect(s.loading).toBe(false);
    });
  });

  describe("clearFlash", () => {
    it("clears fired transition IDs", () => {
      useExecutionOverlay.setState({ firedTransitionIds: ["e1", "e2"] });
      useExecutionOverlay.getState().clearFlash();
      expect(useExecutionOverlay.getState().firedTransitionIds).toEqual([]);
    });
  });

  describe("setLoading", () => {
    it("sets the loading flag", () => {
      useExecutionOverlay.getState().setLoading(true);
      expect(useExecutionOverlay.getState().loading).toBe(true);

      useExecutionOverlay.getState().setLoading(false);
      expect(useExecutionOverlay.getState().loading).toBe(false);
    });
  });
});
