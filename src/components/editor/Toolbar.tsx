interface ToolbarProps {
  /** Re-run ELK.js auto-layout across the whole graph. */
  onAutoLayout: () => void;
  /** Maximize the code panel (collapse canvas). */
  onMaximizeCode: () => void;
  /** Maximize the canvas panel (collapse code). */
  onMaximizeCanvas: () => void;
  /** Reset the split to the default proportions. */
  onResetSplit: () => void;
  /** Export the current SCXML document as a file download. */
  onExport: () => void;
}

/**
 * Global action bar for the editor: export, auto-layout, and view-split
 * controls. Wired to the `EditorShell` via callbacks so the shell can drive
 * the `react-resizable-panels` imperative refs.
 */
export function Toolbar({
  onAutoLayout,
  onMaximizeCode,
  onMaximizeCanvas,
  onResetSplit,
  onExport,
}: ToolbarProps) {
  return (
    <div className="toolbar">
      <div className="toolbar-group">
        <button type="button" onClick={onExport}>
          Export
        </button>
        <button type="button" onClick={onAutoLayout}>
          Auto Layout
        </button>
      </div>

      <div className="toolbar-group toolbar-spacer" />

      <div className="toolbar-group">
        <button type="button" onClick={onMaximizeCode} title="Code only">
          Code
        </button>
        <button type="button" onClick={onResetSplit} title="Split view">
          Split
        </button>
        <button type="button" onClick={onMaximizeCanvas} title="Canvas only">
          Canvas
        </button>
      </div>
    </div>
  );
}
