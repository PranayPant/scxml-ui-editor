/**
 * Execution overlay state for the SCXML canvas.
 *
 * Tracks which states are active, which transitions just fired, and the
 * overall execution mode. Lives alongside the core graph store — the canvas
 * renderer reads from both to apply execution-aware styling.
 */

import { create } from "zustand";

export type ExecutionMode = "idle" | "running" | "done";

export interface ExecutionOverlayState {
  /** Current execution mode. */
  mode: ExecutionMode;

  /** IDs of states that are currently active (from engine snapshot). */
  activeStateIds: string[];

  /** IDs of states that were active in the previous step (for exit animation). */
  previousStateIds: string[];

  /** IDs of transitions that just fired (for flash animation). */
  firedTransitionIds: string[];

  /** Whether an API request is in flight. */
  loading: boolean;

  // Actions
  enterRunning: (stateIds: string[]) => void;
  stepComplete: (
    prevStateIds: string[],
    nextStateIds: string[],
    firedEdges: string[],
  ) => void;
  stop: () => void;
  clearFlash: () => void;
  setLoading: (loading: boolean) => void;
}

export const useExecutionOverlay = create<ExecutionOverlayState>()((set) => ({
  mode: "idle",
  activeStateIds: [],
  previousStateIds: [],
  firedTransitionIds: [],
  loading: false,

  enterRunning: (stateIds) => {
    set({
      mode: "running",
      activeStateIds: stateIds,
      previousStateIds: [],
      firedTransitionIds: [],
    });
  },

  stepComplete: (prevStateIds, nextStateIds, firedEdges) => {
    set({
      activeStateIds: nextStateIds,
      previousStateIds: prevStateIds,
      firedTransitionIds: firedEdges,
    });

    // Auto-clear the flash after 800ms
    if (firedEdges.length > 0) {
      setTimeout(() => {
        useExecutionOverlay.getState().clearFlash();
      }, 800);
    }
  },

  stop: () => {
    set({
      mode: "idle",
      activeStateIds: [],
      previousStateIds: [],
      firedTransitionIds: [],
      loading: false,
    });
  },

  clearFlash: () => {
    set({ firedTransitionIds: [] });
  },

  setLoading: (loading) => {
    set({ loading });
  },
}));
