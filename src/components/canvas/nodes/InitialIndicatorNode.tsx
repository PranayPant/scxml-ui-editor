import { Handle, type NodeProps, Position } from '@xyflow/react';
import { memo } from 'react';
import type { ScxmlFlowNode } from '@/bridge/scxmlToFlow';

/**
 * The machine's initial-state indicator — a small solid "●" dot that links to
 * the SCXML entry state (`<scxml initial="...">`). It has only a single
 * `source-right` handle from which the entry transition is drawn (matching the
 * `source-right` → `target-left` edge that `scxmlToFlow` emits).
 */
export const InitialIndicatorNode = memo(function InitialIndicatorNode({
  data,
}: NodeProps<ScxmlFlowNode>) {
  return (
    <div className="initial-indicator" title={`Initial → ${data.label ?? '?'}`}>
      <Handle type="source" position={Position.Right} id="source-right" />
    </div>
  );
});
