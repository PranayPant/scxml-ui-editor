import { memo, useCallback } from "react";
import { useEditorStore } from "@/store/useEditorStore";
import { EditableLabel } from "../EditableLabel";

interface EditableNodeTitleProps {
  nodeId: string;
  label: string;
  /** Optional prefix rendered before the editable text (e.g. parallel bars). */
  prefix?: React.ReactNode;
}

/**
 * Title row for a state node. When the node is selected for label editing
 * (double-clicked on the canvas, or activated via Enter/F2), it swaps to an
 * inline <input> that commits a state rename via the store.
 */
export const EditableNodeTitle = memo(function EditableNodeTitle({
  nodeId,
  label,
  prefix,
}: EditableNodeTitleProps) {
  const editingId = useEditorStore((s) => s.editingLabelId);
  const editingKind = useEditorStore((s) => s.editingLabelKind);
  const commitLabel = useEditorStore((s) => s.commitLabel);
  const setEditingLabel = useEditorStore((s) => s.setEditingLabel);

  const isEditing = editingKind === "node" && editingId === nodeId;

  const openEditor = useCallback(
    () => setEditingLabel(nodeId, "node"),
    [nodeId, setEditingLabel],
  );

  return (
    <span
      className={`state-node-title nodrag ${isEditing ? "state-node-title-editing" : ""}`}
    >
      {prefix}
      {isEditing ? (
        <EditableLabel
          value={label}
          placeholder="state id"
          inputClassName="node-title-input"
          onCommit={(v) => commitLabel(nodeId, "node", v)}
          onCancel={() => setEditingLabel(null, null)}
        />
      ) : (
        <button
          type="button"
          data-track="Rename State"
          className="state-node-title-text"
          title="Rename state (double-click or Enter)"
          onDoubleClick={(e) => {
            e.stopPropagation();
            openEditor();
          }}
          onClick={(e) => {
            e.stopPropagation();
            openEditor();
          }}
        >
          {label}
        </button>
      )}
    </span>
  );
});
