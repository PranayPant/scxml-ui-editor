import type { NodeProps } from "@xyflow/react";
import { memo } from "react";
import type { ScxmlFlowNode } from "@/bridge/scxmlToFlow";
import { EditableNodeTitle } from "./EditableNodeTitle";
import { StateNodeWrapper } from "./StateNodeWrapper";

/**
 * Atomic state card (solid border) plus the final state as a compact
 * bullseye-icon card. Both share the same handle wiring; the `data.kind ===
 * "final"` flag selects the final-state visual.
 */
export const AtomicStateNode = memo(function AtomicStateNode({
  id,
  data,
}: NodeProps<ScxmlFlowNode>) {
  const isFinal = data.kind === "final";
  return (
    <StateNodeWrapper
      nodeId={id}
      className={`state-node state-node-hover ${
        isFinal ? "state-node-final" : "state-node-atomic"
      }`}
    >
      {isFinal ? (
        <div className="state-node-final-body">
          <div className="state-final-icon">
            <div className="state-final-icon-core" />
          </div>
          <EditableNodeTitle nodeId={id} label={data.label} />
        </div>
      ) : (
        <div className="state-node-body">
          <div className="state-node-title-row">
            <EditableNodeTitle nodeId={id} label={data.label} />
          </div>
          {data.actions && (
            <div className="state-node-actions">
              {data.actions.onentry?.map((a) => (
                <div
                  key={`entry-${a}`}
                  className="state-action state-action-entry"
                >
                  <span className="state-action-kind">entry</span>
                  <span className="state-action-text">{a}</span>
                </div>
              ))}
              {data.actions.onexit?.map((a) => (
                <div
                  key={`exit-${a}`}
                  className="state-action state-action-exit"
                >
                  <span className="state-action-kind">exit</span>
                  <span className="state-action-text">{a}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </StateNodeWrapper>
  );
});
