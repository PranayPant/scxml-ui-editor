import type { Edge, Node } from '@xyflow/react';
import type { StateCreator } from 'zustand';

export interface GraphState {
  /** React Flow nodes for the canvas. */
  nodes: Node[];
  /** React Flow edges for the canvas. */
  edges: Edge[];
  /** Currently selected node id (from canvas or code). */
  selectedNodeId: string | null;

  setNodes: (nodes: Node[]) => void;
  setEdges: (edges: Edge[]) => void;
  setNodesAndEdges: (nodes: Node[], edges: Edge[]) => void;
  setSelectedNodeId: (id: string | null) => void;
}

export const createGraphSlice: StateCreator<GraphState, [], [], GraphState> = (set) => ({
  nodes: [],
  edges: [],
  selectedNodeId: null,

  setNodes: (nodes) => set({ nodes }),
  setEdges: (edges) => set({ edges }),
  setNodesAndEdges: (nodes, edges) => set({ nodes, edges }),
  setSelectedNodeId: (id) => set({ selectedNodeId: id }),
});
