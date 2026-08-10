import type { NodeProps } from '@xyflow/react';
import { memo } from 'react';
import type { ScxmlFlowNode } from '@/bridge/scxmlToFlow';
import { EditableNodeTitle } from './EditableNodeTitle';
import { StateNodeWrapper } from './StateNodeWrapper';

/**
 * Parallel state — renders with a distinct "=" style to signal concurrent
 * regions, while still hosting nested sub-states as React Flow children.
 */
export const ParallelNode = memo(function ParallelNode({ id, data }: NodeProps<ScxmlFlowNode>) {
  return (
    <StateNodeWrapper className="state-node state-node-parallel state-node-container state-node-hover">
      <div className="state-node-title-row">
        <EditableNodeTitle
          nodeId={id}
          label={data.label}
          prefix={<span className="parallel-bars">⫽</span>}
        />
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
