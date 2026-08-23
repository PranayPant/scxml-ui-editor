/**
 * Zustand store subscribe + diff logging.
 *
 * Imported as a side-effect from `src/main.tsx` to automatically log every
 * state change in the editor and engine stores at `debug` level.
 *
 * Why subscribe + diff instead of a telemetry middleware?
 * - Non-invasive: no changes to store slices or action signatures.
 * - Full coverage: captures *all* state changes, including those from
 *   framework internals or third-party middleware (e.g. `persist`).
 * - Document-size awareness: the full `scxmlRaw` string is excluded from
 *   the diff to avoid log noise; instead its character length is logged as
 *   a signal of document growth / shrinkage.
 */

import { logger } from "@/plugins/tracing/logger";
import { useEditorStore } from "./useEditorStore";
import { useEngineStore } from "@/plugins/engine/useEngineStore";

// ---------------------------------------------------------------------------
// Generic JSON diff helper — returns only the keys whose values changed
// ---------------------------------------------------------------------------
function changedKeys<T extends Record<string, unknown>>(
  prev: T,
  next: T,
  excludeKeys?: string[],
): { key: string; from: unknown; to: unknown }[] {
  const allKeys = new Set([...Object.keys(prev), ...Object.keys(next)]);
  const changes: { key: string; from: unknown; to: unknown }[] = [];

  for (const key of allKeys) {
    if (excludeKeys?.includes(key)) continue;
    if (prev[key] !== next[key]) {
      changes.push({ key, from: prev[key], to: next[key] });
    }
  }
  return changes;
}

// ---------------------------------------------------------------------------
// Editor store subscriber
// ---------------------------------------------------------------------------
let prevEditorState: Record<string, unknown> | null = null;

useEditorStore.subscribe((state) => {
  const next = state as unknown as Record<string, unknown>;
  const prev = prevEditorState;
  prevEditorState = { ...next };

  if (!prev) return; // skip initial snapshot

  const changes = changedKeys(prev, next, ["scxmlRaw", "rawXml"]);

  if (changes.length === 0) return;

  logger.debug("EditorStore changed", {
    store: "EditorStore",
    changedKeys: changes.map((c) => c.key),
    scxmlRawLen: (state as any).scxmlRaw?.length ?? 0,
  });
});

// ---------------------------------------------------------------------------
// Engine store subscriber
// ---------------------------------------------------------------------------
let prevEngineState: Record<string, unknown> | null = null;

useEngineStore.subscribe((state) => {
  const next = state as unknown as Record<string, unknown>;
  const prev = prevEngineState;
  prevEngineState = { ...next };

  if (!prev) return; // skip initial snapshot

  const changes = changedKeys(prev, next);

  if (changes.length === 0) return;

  logger.debug("EngineStore changed", {
    store: "EngineStore",
    changedKeys: changes.map((c) => c.key),
  });
});
