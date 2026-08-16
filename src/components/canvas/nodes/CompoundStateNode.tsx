import type { NodeProps } from "@xyflow/react";
import { memo } from "react";
import type { ScxmlFlowNode } from "@/bridge/scxmlToFlow";
import { EditableNodeTitle } from "./EditableNodeTitle";
import { StateNodeWrapper } from "./StateNodeWrapper";

/**
 * Compound (nested) state. React Flow renders its sub-states as children via
 * the `parentId` relationship; this component supplies the boundary chrome
 * and title bar around the nested sub-flow.
 */
export const CompoundStateNode = memo(function CompoundStateNode({
  id,
  data,
}: NodeProps<ScxmlFlowNode>) {
  return (
    <StateNodeWrapper
      nodeId={id}
      className="state-node state-node-compound state-node-container state-node-hover"
    >
      <div className="state-node-title-row">
        <EditableNodeTitle nodeId={id} label={data.label} />
      </div>
      <div className="state-node-actions">
        {data.actions?.onentry?.map((a) => (
          <div key={`entry-${a}`} className="state-action state-action-entry">
            <span className="state-action-kind">entry</span>
            <span className="state-action-text">{a}</span>
          </div>
        ))}
        {data.actions?.onexit?.map((a) => (
          <div key={`exit-${a}`} className="state-action state-action-exit">
            <span className="state-action-kind">exit</span>
            <span className="state-action-text">{a}</span>
          </div>
        ))}
      </div>
      <div className="state-node-children" />
    </StateNodeWrapper>
  );
});
