import { Background, Controls, MiniMap } from '@xyflow/react';

/**
 * Standard React Flow canvas chrome: background grid, minimap, and the
 * zoom/fit-view control cluster.
 */
export function CanvasControls() {
  return (
    <>
      <Background gap={16} size={1} />
      <Controls position="bottom-left" />
      <MiniMap position="bottom-right" pannable zoomable nodeStrokeColor="#2563eb" />
    </>
  );
}
