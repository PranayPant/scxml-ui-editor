import { useCallback, useRef } from "react";
import { useEditorStore } from "@/store/useEditorStore";
import { useEngineStore } from "@/plugins/engine/useEngineStore";
import { useExecutionOverlay } from "@/plugins/engine/useExecutionOverlay";
import { syncSnapshotToCanvas } from "@/plugins/engine/useExecutionSync";
import type { InstanceSnapshot } from "scxml-http-browser-client";

/**
 * Floating execution controls overlaid on the canvas.
 *
 * ▶ Step  — starts execution (creates engine instance from current AST)
 * ■ Stop  — stops execution (tears down engine instance)
 * Status badge shows "Interactive" or "Done" when active.
 */
export function ExecutionControls() {
  const ast = useEditorStore((s) => s.ast);
  const rawXml = useEditorStore((s) => s.rawXml);

  const { connected, connecting, isLoading, startExecution, stopExecution } =
    useEngineStore();

  const { mode, loading: overlayLoading } = useExecutionOverlay();
  const isExecuting = mode === "interactive" || mode === "done";
  const isBusy = isLoading || overlayLoading;

  // Keep a ref to the previous snapshot so we can diff on each update.
  // We use subscribeWithSelector (selector form) to reliably get the
  // previous value from Zustand — vanilla subscribe(listener) only passes
  // the new state, not (state, prevState).
  const prevSnapshotRef = useRef<InstanceSnapshot | null>(null);

  const handleStep = useCallback(async () => {
    if (!ast || !rawXml) return;

    // Serialize the current AST as JSON for the engine
    const astJson = JSON.stringify(ast);

    // Subscribe to snapshot changes via subscribeWithSelector's selector
    // form: subscribe(selector, callback). The callback receives
    // (selectedValue, previousSelectedValue) so we get reliable diffs.
    const unsubSnap = useEngineStore.subscribe(
      (state) => state.instanceSnapshot,
      (snapshot, prevSnapshot) => {
        if (!snapshot) return;

        // On first call, prevSnapshot is the initial state's null.
        // Use the ref as fallback for the "previous snapshot" value.
        const prev = prevSnapshot ?? prevSnapshotRef.current;
        const edges = useEditorStore.getState().edges;
        syncSnapshotToCanvas(snapshot, prev, edges);
        prevSnapshotRef.current = snapshot;
      },
    );

    await startExecution(astJson);

    // Store unsubscriber for cleanup on stop
    (window as any).__engineUnsub = unsubSnap;
  }, [ast, rawXml, startExecution]);

  const handleStop = useCallback(async () => {
    // Unsubscribe from engine store
    (window as any).__engineUnsub?.();
    (window as any).__engineUnsub = undefined;
    prevSnapshotRef.current = null;

    await stopExecution();
    useExecutionOverlay.getState().stop();
  }, [stopExecution]);

  // Determine what to show
  let statusText: string | null = null;

  if (!connected) {
    statusText = connecting ? "Connecting…" : "Disconnected";
  } else if (isExecuting && isBusy) {
    statusText = mode === "interactive" ? "Interactive…" : "Done";
  } else if (isExecuting) {
    statusText = mode === "interactive" ? "Interactive" : "Done";
  } else {
    statusText = null;
  }

  return (
    <div className="execution-controls">
      {isExecuting ? (
        <button
          type="button"
          data-track="Stop"
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
          data-track="Step"
          className="execution-btn execution-btn-play"
          onClick={handleStep}
          disabled={!connected || !ast}
          title={
            connected ? "Step through transitions" : "Engine not connected"
          }
        >
          Step
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
