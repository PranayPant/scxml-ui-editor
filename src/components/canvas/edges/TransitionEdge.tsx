import type { Edge } from '@xyflow/react';
import { BaseEdge, EdgeLabelRenderer, type EdgeProps, getSmoothStepPath } from '@xyflow/react';
import { memo } from 'react';
import { useEditorStore } from '@/store/useEditorStore';
import { EditableLabel } from '../EditableLabel';

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
 *
 * The badge is interactive: double-click (or click the "+" affordance when a
 * transition has no event) opens a small inline editor to set/rename the
 * transition's event label, committing back through the store's
 * `applyAstMutation`.
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

  const editingId = useEditorStore((s) => s.editingLabelId);
  const editingKind = useEditorStore((s) => s.editingLabelKind);
  const commitLabel = useEditorStore((s) => s.commitLabel);
  const setEditingLabel = useEditorStore((s) => s.setEditingLabel);

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
  const isEditing = editingKind === 'edge' && editingId === id;
  const eventText = data?.event ?? '';

  // Shift reciprocal-edge labels perpendicular to the path so back-and-forth
  // transitions (e.g. `idle` <-> `running`) don't render on top of each other.
  const offsetY = data?.isReciprocal ? -14 : 0;

  const openEditor = (e?: { stopPropagation?: () => void }) => {
    e?.stopPropagation?.();
    setEditingLabel(id, 'edge');
  };

  return (
    <>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} style={style} />
      <EdgeLabelRenderer>
        <div
          className={`transition-edge-label nodrag nopan ${hasLabel ? '' : 'transition-edge-label-empty'}`}
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY + offsetY}px)`,
            pointerEvents: 'all',
          }}
          data-edge-label-id={id}
          data-reciprocal={data?.isReciprocal ? 'true' : 'false'}
        >
          {isEditing ? (
            <EditableLabel
              value={eventText}
              placeholder="event name"
              inputClassName="edge-label-input"
              onCommit={(v) => commitLabel(id, 'edge', v)}
              onCancel={() => setEditingLabel(null, null)}
            />
          ) : (
            <button
              type="button"
              className="transition-edge-label-badge"
              title={hasLabel ? 'Edit label (click or double-click)' : 'Add a label (click)'}
              onDoubleClick={openEditor}
              onClick={openEditor}
            >
              {eventText && <span className="transition-edge-event">{eventText}</span>}
              {data?.cond && <span className="transition-edge-cond">[{data.cond}]</span>}
              {!hasLabel && <span className="transition-edge-add">+</span>}
            </button>
          )}
        </div>
      </EdgeLabelRenderer>
    </>
  );
});
