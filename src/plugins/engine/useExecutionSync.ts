/**
 * Pub/sub bridge between the engine store and the canvas execution overlay.
 *
 * When the engine returns a new snapshot, this module computes the delta
 * (which states entered/exited, which transitions fired) and publishes it
 * to the canvas overlay store.
 */

import type { InstanceSnapshot } from "scxml-http-browser-client";
import type { Edge } from "@xyflow/react";
import { useExecutionOverlay } from "./useExecutionOverlay";

/**
 * Compute which transitions fired by comparing the previous and next
 * configuration arrays against the available edges.
 *
 * An edge is considered "fired" when its source was in the previous
 * configuration and its target is in the new configuration.
 */
export function computeFiredTransitions(
  prevConfig: string[],
  nextConfig: string[],
  edges: Pick<Edge, "id" | "source" | "target">[],
): string[] {
  const entered = new Set(nextConfig.filter((id) => !prevConfig.includes(id)));
  return edges
    .filter((e) => {
      // Skip pseudo-edges (initial indicators)
      if (e.id.startsWith("__")) return false;
      const targetMatches = e.target && entered.has(e.target);
      const sourceMatches = e.source && prevConfig.includes(e.source);
      // Also match if the source was in the previous config (even if source
      // is still active — self-transitions, or compound state re-entry)
      return targetMatches && sourceMatches;
    })
    .map((e) => e.id);
}

/**
 * Synchronize an engine snapshot to the canvas overlay.
 * Call this whenever the engine store's instanceSnapshot changes.
 */
export function syncSnapshotToCanvas(
  snapshot: InstanceSnapshot,
  prevSnapshot: InstanceSnapshot | null,
  edges: Pick<Edge, "id" | "source" | "target">[],
): void {
  const overlay = useExecutionOverlay.getState();
  const prevConfig = prevSnapshot?.configuration ?? [];
  const nextConfig = snapshot.configuration;
  const isInitial = !prevSnapshot;

  // If the statechart has finished executing, transition to "done" mode.
  if (snapshot.done) {
    overlay.finish(nextConfig);
    return;
  }

  if (isInitial) {
    // First snapshot — enter running mode
    overlay.enterInteractive(nextConfig);
  } else {
    // Subsequent snapshot — compute fired transitions
    const firedEdges = computeFiredTransitions(prevConfig, nextConfig, edges);
    overlay.stepComplete(prevConfig, nextConfig, firedEdges);
  }
}
