import type { NodeProps } from '@xyflow/react';
import { memo } from 'react';
import type { ScxmlFlowNode } from '@/bridge/scxmlToFlow';
import { StateNodeWrapper } from './StateNodeWrapper';

/**
 * Deep / shallow history pseudo-state. `data.scxmlType` distinguishes
 * "deep" vs "shallow"; renders as a circled "H".
 */
export const HistoryNode = memo(function HistoryNode({ data }: NodeProps<ScxmlFlowNode>) {
  const deep = data.scxmlType === 'deep';
  return (
    <StateNodeWrapper
      className="state-node state-node-history state-node-hover"
      title={deep ? 'Deep history' : 'Shallow history'}
    >
      <div className="history-circle">
        <span className="history-letter">H</span>
        {deep && <span className="history-asterisk">*</span>}
      </div>
    </StateNodeWrapper>
  );
});
