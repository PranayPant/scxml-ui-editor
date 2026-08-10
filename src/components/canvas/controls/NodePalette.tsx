import { useCallback } from 'react';

interface PaletteItem {
  kind: 'atomic' | 'compound' | 'parallel' | 'final';
  label: string;
}

const ITEMS: PaletteItem[] = [
  { kind: 'atomic', label: 'State' },
  { kind: 'compound', label: 'Compound' },
  { kind: 'parallel', label: 'Parallel' },
  { kind: 'final', label: 'Final' },
];

/**
 * Drag-and-drop palette for creating new states. Dragging an item sets the
 * `application/scxml-node` dataTransfer payload; the canvas `onDrop` handler
 * reads it and adds a matching node (and persists it to the AST).
 */
export function NodePalette() {
  const onDragStart = useCallback((event: React.DragEvent, kind: PaletteItem['kind']) => {
    event.dataTransfer.setData('application/scxml-node', kind);
    event.dataTransfer.effectAllowed = 'move';
  }, []);

  return (
    <div className="node-palette">
      <div className="node-palette-title">New state</div>
      {ITEMS.map((item) => (
        <div
          key={item.kind}
          className="node-palette-item"
          draggable
          onDragStart={(e) => onDragStart(e, item.kind)}
        >
          {item.label}
        </div>
      ))}
    </div>
  );
}
