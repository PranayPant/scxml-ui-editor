import { Handle, Position } from '@xyflow/react';
import type { ReactNode } from 'react';

interface Props {
  children: ReactNode;
  className?: string;
  /** Optional native tooltip forwarded to the wrapping div. */
  title?: string;
}

/**
 * Universal handle wrapper for state nodes.
 *
 * Mounts the full namespaced 8-handle interface (4 sides × source + target) so
 * every node kind — atomic, compound, parallel, and history — can anchor edges
 * from any direction. Edge handle ids (`source-*` / `target-*`) emitted by
 * `scxmlToFlow.getOptimalHandles` are guaranteed to exist here, preventing
 * React Flow error #008 for both inner states and LCA boundary containers.
 *
 * Handles are hidden by default and revealed on node hover via `group-hover`
 * (see `src/index.css`), keeping the DOM footprint low while remaining
 * interactive on hover.
 */
export function StateNodeWrapper({ children, className = '', title }: Props) {
  return (
    <div className={`group relative ${className}`} title={title}>
      {/* Target handles (incoming edges) */}
      <Handle
        id="target-top"
        type="target"
        position={Position.Top}
        className="!bg-blue-500 opacity-0 group-hover:opacity-100"
      />
      <Handle
        id="target-bottom"
        type="target"
        position={Position.Bottom}
        className="!bg-blue-500 opacity-0 group-hover:opacity-100"
      />
      <Handle
        id="target-left"
        type="target"
        position={Position.Left}
        className="!bg-blue-500 opacity-0 group-hover:opacity-100"
      />
      <Handle
        id="target-right"
        type="target"
        position={Position.Right}
        className="!bg-blue-500 opacity-0 group-hover:opacity-100"
      />

      {/* Source handles (outgoing edges) */}
      <Handle
        id="source-top"
        type="source"
        position={Position.Top}
        className="!bg-blue-500 opacity-0 group-hover:opacity-100"
      />
      <Handle
        id="source-bottom"
        type="source"
        position={Position.Bottom}
        className="!bg-blue-500 opacity-0 group-hover:opacity-100"
      />
      <Handle
        id="source-left"
        type="source"
        position={Position.Left}
        className="!bg-blue-500 opacity-0 group-hover:opacity-100"
      />
      <Handle
        id="source-right"
        type="source"
        position={Position.Right}
        className="!bg-blue-500 opacity-0 group-hover:opacity-100"
      />

      {children}
    </div>
  );
}
