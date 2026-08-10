import type { Edge } from '@xyflow/react';
import { BaseEdge, EdgeLabelRenderer, type EdgeProps, getSmoothStepPath } from '@xyflow/react';
import { memo } from 'react';

export interface TransitionEdgeData extends Record<string, unknown> {
  event?: string;
  cond?: string;
  /** True when a reverse transition exists between the same two states. */
  isReciprocal?: boolean;
}

export type TransitionEdge = Edge<TransitionEdgeData>;

/**
 * Custom edge rendering incoming <transition> entries: an orthogonal
 * (smooth-step) path with the event and optional condition rendered as a
 * floating, absolutely-positioned badge pinned to the path midpoint via
 * `EdgeLabelRenderer`.
 */
export const TransitionEdgeComponent = memo(function TransitionEdgeComponent(
  props: EdgeProps<TransitionEdge>,
) {
  const {
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    data,
    markerEnd,
    style,
  } = props;

  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 8,
  });

  const hasLabel = Boolean(data?.event || data?.cond);

  // Shift reciprocal-edge labels perpendicular to the path so back-and-forth
  // transitions (e.g. `idle` <-> `running`) don't render on top of each other.
  const offsetY = data?.isReciprocal ? -14 : 0;

  return (
    <>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} style={style} />
      {hasLabel && (
        <EdgeLabelRenderer>
          <div
            className="transition-edge-label nodrag nopan"
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY + offsetY}px)`,
              pointerEvents: 'all',
            }}
            data-edge-label-id={id}
            data-reciprocal={data?.isReciprocal ? 'true' : 'false'}
          >
            {data?.event && <span className="transition-edge-event">{data.event}</span>}
            {data?.cond && <span className="transition-edge-cond">[{data.cond}]</span>}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
});
