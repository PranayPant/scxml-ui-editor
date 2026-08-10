import type { StateCreator } from 'zustand';
import { renameStateId, setTransitionLabel } from '@/bridge/flowToScxml';
import type { EditorStore } from '../useEditorStore';

/**
 * Which element is currently in "label edit" mode on the canvas, if any.
 * Nodes open to rename the state id; edges open to edit the transition event.
 */
export type EditingLabelKind = 'node' | 'edge';

export interface EditState {
  /** Stable id of the node/edge whose label is being edited (null = none). */
  editingLabelId: string | null;
  /** Whether the edited element is a node (state) or an edge (transition). */
  editingLabelKind: EditingLabelKind | null;

  setEditingLabel: (id: string | null, kind: EditingLabelKind | null) => void;
  /**
   * Commit a label edit back to the AST under a fresh transaction. Empty
   * values clear the corresponding field (a state id can't be empty, so it
   * is ignored there).
   */
  commitLabel: (id: string, kind: EditingLabelKind, value: string, cond?: string) => void;
}

export const createEditSlice: StateCreator<EditorStore, [], [], EditState> = (set, get) => ({
  editingLabelId: null,
  editingLabelKind: null,

  setEditingLabel: (id, kind) => set({ editingLabelId: id, editingLabelKind: kind }),

  commitLabel: (id, kind, value, cond) => {
    get().setEditingLabel(null, null);
    get().applyAstMutation((doc) => {
      if (kind === 'node') {
        const trimmed = value.trim();
        if (trimmed && trimmed !== id) renameStateId(doc, id, trimmed);
      } else {
        setTransitionLabel(doc, id, value, cond);
      }
    });
  },
});
