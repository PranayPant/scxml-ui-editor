import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { InstanceSnapshot } from "scxml-http-browser-client";
import { useExecutionOverlay } from "../useExecutionOverlay";
import {
  computeFiredTransitions,
  syncSnapshotToCanvas,
} from "../useExecutionSync";

// Reset the overlay store between tests
function resetOverlay() {
  useExecutionOverlay.setState({
    mode: "idle",
    activeStateIds: [],
    previousStateIds: [],
    firedTransitionIds: [],
    loading: false,
  });
}

const MOCK_EDGES = [
  { id: "idle:running", source: "idle", target: "running" },
  { id: "running:finished", source: "running", target: "finished" },
  { id: "running:idle", source: "running", target: "idle" },
  { id: "__initial__:idle", source: "__initial__", target: "idle" },
];

function makeSnapshot(
  overrides: Partial<InstanceSnapshot> = {},
): InstanceSnapshot {
  return {
    instance_id: "test-instance",
    configuration: [],
    datamodel: null,
    done: false,
    execution_status: "running",
    active_states: [],
    ...overrides,
  };
}

describe("computeFiredTransitions", () => {
  it("returns edges whose source was in prev config and target entered new config", () => {
    const fired = computeFiredTransitions(["idle"], ["running"], MOCK_EDGES);
    expect(fired).toEqual(["idle:running"]);
  });

  it("returns multiple fired edges when multiple transitions fire", () => {
    const fired = computeFiredTransitions(
      ["idle", "running"],
      ["running", "finished"],
      MOCK_EDGES,
    );
    expect(fired).toContain("running:finished");
    // idle:running should NOT fire because running was already in prev config
    expect(fired).not.toContain("idle:running");
  });

  it("skips pseudo-edges (starting with __)", () => {
    const fired = computeFiredTransitions(
      ["__initial__"],
      ["idle"],
      MOCK_EDGES,
    );
    expect(fired).not.toContain("__initial__:idle");
  });

  it("returns empty array when no edges match", () => {
    const fired = computeFiredTransitions(["idle"], ["idle"], MOCK_EDGES);
    expect(fired).toEqual([]);
  });

  it("returns empty array when edge list is empty", () => {
    const fired = computeFiredTransitions(["idle"], ["running"], []);
    expect(fired).toEqual([]);
  });

  it("handles self-transitions (source stays in both configs)", () => {
    // An edge from idle -> idle (self-transition)
    const edges = [{ id: "idle:idle", source: "idle", target: "idle" }];
    const fired = computeFiredTransitions(["idle"], ["idle"], edges);
    // target is "idle" which is in entered (nextConfig but not new)
    // Actually entered = nextConfig - prevConfig = [], so no match
    expect(fired).toEqual([]);
  });

  it("handles compound state re-entry where target is newly entered", () => {
    // source "parent" was in prevConfig, target "child" is newly entered
    const edges = [{ id: "parent:child", source: "parent", target: "child" }];
    const fired = computeFiredTransitions(
      ["parent"],
      ["parent", "child"],
      edges,
    );
    // entered = ["child"] (in nextConfig but not prevConfig)
    // source "parent" in prevConfig ✓
    // target "child" in entered ✓
    expect(fired).toEqual(["parent:child"]);
  });
});

describe("syncSnapshotToCanvas", () => {
  beforeEach(() => {
    resetOverlay();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("calls enterInteractive on first snapshot (no prevSnapshot)", () => {
    const snapshot = makeSnapshot({ configuration: ["idle"] });

    syncSnapshotToCanvas(snapshot, null, MOCK_EDGES);

    const s = useExecutionOverlay.getState();
    expect(s.mode).toBe("interactive");
    expect(s.activeStateIds).toEqual(["idle"]);
  });

  it("calls stepComplete on subsequent snapshot (with prevSnapshot)", () => {
    // First snapshot (initial)
    const firstSnapshot = makeSnapshot({ configuration: ["idle"] });
    syncSnapshotToCanvas(firstSnapshot, null, MOCK_EDGES);

    // Second snapshot (transition idle -> running)
    const secondSnapshot = makeSnapshot({ configuration: ["running"] });
    syncSnapshotToCanvas(secondSnapshot, firstSnapshot, MOCK_EDGES);

    const s = useExecutionOverlay.getState();
    expect(s.mode).toBe("interactive");
    expect(s.activeStateIds).toEqual(["running"]);
    expect(s.previousStateIds).toEqual(["idle"]);
    expect(s.firedTransitionIds).toEqual(["idle:running"]);
  });

  it("handles configuration with multiple active states", () => {
    const firstSnapshot = makeSnapshot({
      configuration: ["parent", "child"],
    });
    syncSnapshotToCanvas(firstSnapshot, null, MOCK_EDGES);

    const s = useExecutionOverlay.getState();
    expect(s.mode).toBe("interactive");
    expect(s.activeStateIds).toEqual(["parent", "child"]);
  });

  it("handles empty configuration array", () => {
    const snapshot = makeSnapshot({ configuration: [] });
    syncSnapshotToCanvas(snapshot, null, MOCK_EDGES);

    const s = useExecutionOverlay.getState();
    expect(s.mode).toBe("interactive");
    expect(s.activeStateIds).toEqual([]);
  });

  it("handles transition that fires no matching edges", () => {
    const firstSnapshot = makeSnapshot({ configuration: ["idle"] });
    syncSnapshotToCanvas(firstSnapshot, null, MOCK_EDGES);

    // A config change that doesn't match any known edge
    const secondSnapshot = makeSnapshot({ configuration: ["unknown"] });
    syncSnapshotToCanvas(secondSnapshot, firstSnapshot, MOCK_EDGES);

    const s = useExecutionOverlay.getState();
    expect(s.firedTransitionIds).toEqual([]);
  });

  it("calls finish when snapshot.done is true", () => {
    const snapshot = makeSnapshot({
      configuration: ["finished"],
      done: true,
      execution_status: "done",
    });

    syncSnapshotToCanvas(snapshot, null, MOCK_EDGES);

    const s = useExecutionOverlay.getState();
    expect(s.mode).toBe("done");
    expect(s.activeStateIds).toEqual(["finished"]);
  });

  it("calls finish on subsequent snapshot when done (not just initial)", () => {
    const firstSnapshot = makeSnapshot({ configuration: ["running"] });
    syncSnapshotToCanvas(firstSnapshot, null, MOCK_EDGES);

    // Second snapshot where the statechart is done
    const doneSnapshot = makeSnapshot({
      configuration: ["finished"],
      done: true,
      execution_status: "done",
    });
    syncSnapshotToCanvas(doneSnapshot, firstSnapshot, MOCK_EDGES);

    const s = useExecutionOverlay.getState();
    expect(s.mode).toBe("done");
    expect(s.activeStateIds).toEqual(["finished"]);
  });
});
