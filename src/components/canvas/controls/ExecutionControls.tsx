import { useCallback } from "react";
import { useEditorStore } from "@/store/useEditorStore";
import { useEngineStore } from "@/plugins/engine/useEngineStore";
import { useExecutionOverlay } from "@/plugins/engine/useExecutionOverlay";
import { syncSnapshotToCanvas } from "@/plugins/engine/useExecutionSync";

/**
 * Floating execution controls overlaid on the canvas.
 *
 * ▶ Play  — starts execution (creates engine instance from current AST)
 * ■ Stop  — stops execution (tears down engine instance)
 * Status badge shows "Running" or "Done" when active.
 */
export function ExecutionControls() {
  const ast = useEditorStore((s) => s.ast);
  const rawXml = useEditorStore((s) => s.rawXml);

  const { connected, connecting, isLoading, startExecution, stopExecution } =
    useEngineStore();

  const { mode, loading: overlayLoading } = useExecutionOverlay();
  const isExecuting = mode === "running" || mode === "done";
  const isBusy = isLoading || overlayLoading;

  const handlePlay = useCallback(async () => {
    if (!ast || !rawXml) return;

    // Serialize the current AST as JSON for the engine
    const astJson = JSON.stringify(ast);

    // Subscribe to the engine store for snapshot changes
    const unsubscribe = useEngineStore.subscribe((state) => {
      const snapshot = state.instanceSnapshot;
      if (!snapshot) return;

      // Get current edges from the editor store
      const edges = useEditorStore.getState().edges;
      // prev snapshot will be captured by the second subscription
      syncSnapshotToCanvas(snapshot, null, edges);
    });

    await startExecution(astJson);

    // Subscribe to subsequent snapshot changes
    const unsubSnap = useEngineStore.subscribe((state, prevState) => {
      const snapshot = state.instanceSnapshot;
      const prevSnapshot = prevState.instanceSnapshot;
      if (!snapshot) return;

      const edges = useEditorStore.getState().edges;
      syncSnapshotToCanvas(snapshot, prevSnapshot, edges);
    });

    // Clean up initial subscription
    unsubscribe();

    // Store unsubscriber for cleanup on stop
    (window as any).__engineUnsub = unsubSnap;
  }, [ast, rawXml, startExecution]);

  const handleStop = useCallback(async () => {
    // Unsubscribe from engine store
    (window as any).__engineUnsub?.();
    (window as any).__engineUnsub = undefined;

    await stopExecution();
    useExecutionOverlay.getState().stop();
  }, [stopExecution]);

  // Determine what to show
  let statusText: string | null = null;

  if (!connected) {
    statusText = connecting ? "Connecting…" : "Disconnected";
  } else if (isExecuting && isBusy) {
    statusText = mode === "running" ? "Running…" : "Done";
  } else if (isExecuting) {
    statusText = mode === "running" ? "Running" : "Done";
  } else {
    statusText = null;
  }

  return (
    <div className="execution-controls">
      {isExecuting ? (
        <button
          type="button"
          className="execution-btn execution-btn-stop"
          onClick={handleStop}
          disabled={isBusy}
          title="Stop execution"
        >
          ■
        </button>
      ) : (
        <button
          type="button"
          className="execution-btn execution-btn-play"
          onClick={handlePlay}
          disabled={!connected || !ast}
          title={connected ? "Start execution" : "Engine not connected"}
        >
          ▶
        </button>
      )}

      {statusText && (
        <span className={`execution-status-badge execution-status-${mode}`}>
          {statusText}
        </span>
      )}
    </div>
  );
}
