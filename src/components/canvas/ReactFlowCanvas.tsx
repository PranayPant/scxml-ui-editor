import {
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type Edge,
  type EdgeChange,
  type EdgeTypes,
  type NodeChange,
  type NodeTypes,
  ReactFlow,
  useEdgesState,
  useNodesState,
} from '@xyflow/react';
import { useCallback, useEffect, useRef } from 'react';
import {
  addStateNode,
  connectStates,
  deleteEdge,
  deleteState,
  persistNodePosition,
} from '@/bridge/flowToScxml';
import { type ScxmlFlowNode, scxmlToFlow } from '@/bridge/scxmlToFlow';
import { useEditorStore } from '@/store/useEditorStore';
import { CanvasControls } from './controls/CanvasControls';
import { NodePalette } from './controls/NodePalette';
import { TransitionEdgeComponent } from './edges/TransitionEdge';
import { AtomicStateNode } from './nodes/AtomicStateNode';
import { CompoundStateNode } from './nodes/CompoundStateNode';
import { HistoryNode } from './nodes/HistoryNode';
import { InitialIndicatorNode } from './nodes/InitialIndicatorNode';
import { ParallelNode } from './nodes/ParallelNode';

const nodeTypes: NodeTypes = {
  atomic: AtomicStateNode,
  compound: CompoundStateNode,
  parallel: ParallelNode,
  history: HistoryNode,
  initialIndicator: InitialIndicatorNode,
};

const edgeTypes: EdgeTypes = {
  transition: TransitionEdgeComponent,
};

/** Stable signature of a nodes/edges snapshot to detect re-seeding. */
function snapshotKey(nodes: ScxmlFlowNode[], edges: any[]): string {
  return `${nodes.map((n) => `${n.id}:${n.position.x},${n.position.y}`).join('|')}|${edges
    .map((e) => e.id)
    .join('|')}`;
}

/**
 * Interactive React Flow canvas for the SCXML statechart.
 *
 * Handles drag, drop, connect, and delete — translating them into
 * `scxml-parser` AST mutations (see `flowToScxml.ts`) that are re-serialized
 * back into the Monaco buffer.
 */
export function ReactFlowCanvas() {
  const ast = useEditorStore((s) => s.ast);
  const livePreviewPaused = useEditorStore((s) => s.livePreviewPaused);
  const selectElement = useEditorStore((s) => s.selectElement);
  const applyAstMutation = useEditorStore((s) => s.applyAstMutation);
  const setEditingLabel = useEditorStore((s) => s.setEditingLabel);

  const [nodes, setNodes] = useNodesState<ScxmlFlowNode>([]);
  const [edges, setEdges] = useEdgesState<Edge>([]);

  // Keep a ref in sync with the latest nodes so drag-stop (which fires after
  // a local state update) can resolve ancestor global positions reliably.
  const nodesRef = useRef<ScxmlFlowNode[]>(nodes);
  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  // ------------------------------------------------ re-seed from AST/code
  const lastSnapshot = useRef<string>('');
  useEffect(() => {
    if (!ast) return;
    const { nodes: flowNodes, edges: flowEdges } = scxmlToFlow(ast);
    const key = snapshotKey(flowNodes as ScxmlFlowNode[], flowEdges);
    if (key === lastSnapshot.current) return;
    lastSnapshot.current = key;
    setNodes(flowNodes as ScxmlFlowNode[]);
    setEdges(flowEdges);
  }, [ast, setNodes, setEdges]);

  // ------------------------------------------------ local churn handlers
  const handleNodesChange = useCallback(
    (changes: NodeChange<ScxmlFlowNode>[]) => {
      setNodes((nds) => applyNodeChanges(changes, nds));
    },
    [setNodes],
  );

  const handleEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      setEdges((eds) => applyEdgeChanges(changes, eds));
    },
    [setEdges],
  );

  // ------------------------------------------------ drag -> persist coords
  const handleNodeDragStop = useCallback(
    (_event: unknown, node: ScxmlFlowNode) => {
      const currentNodes = nodesRef.current;
      applyAstMutation((doc) => {
        persistNodePosition(doc, currentNodes, node.id, node.position.x, node.position.y);
      });
    },
    [applyAstMutation],
  );

  // ------------------------------------------------ connect -> addTransition
  const handleConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;
      let newEdgeId: string | null = null;
      applyAstMutation((doc) => {
        const t = connectStates(doc, connection.source!, connection.target!);
        if (t?.id) newEdgeId = t.id;
      });
      // Open the label editor immediately so the user can attach an event
      // name to a freshly-created (currently unlabeled) transition.
      if (newEdgeId) setEditingLabel(newEdgeId, 'edge');
    },
    [applyAstMutation, setEditingLabel],
  );

  // ------------------------------------------------ delete -> removeState/edge
  const handleDelete = useCallback(
    (params: { nodes: ScxmlFlowNode[]; edges: any[] }) => {
      // Skip pseudo-nodes (e.g. the `__initial__` indicator) — they aren't
      // real SCXML states and deleting them would orphan the entry marker.
      const realNodes = params.nodes.filter((n) => !n.id.startsWith('__'));
      if (realNodes.length === 0 && params.edges.length === 0) return;
      applyAstMutation((doc) => {
        for (const edge of params.edges) {
          if (!edge.id.startsWith('__')) deleteEdge(doc, edge.id);
        }
        for (const node of realNodes) deleteState(doc, node.id);
      });
    },
    [applyAstMutation],
  );

  // ------------------------------------------------ selection sync
  const handleNodeClick = useCallback(
    (_event: unknown, node: ScxmlFlowNode) => {
      selectElement(node.id, 'CANVAS');
    },
    [selectElement],
  );

  const handlePaneClick = useCallback(() => {
    selectElement(null, 'CANVAS');
  }, [selectElement]);

  // ------------------------------------------------ label editing (rename)
  const handleNodeDoubleClick = useCallback(
    (_event: unknown, node: ScxmlFlowNode) => {
      // Pseudo-nodes (initial indicator, history) can't be renamed.
      if (node.id.startsWith('__')) return;
      setEditingLabel(node.id, 'node');
    },
    [setEditingLabel],
  );

  const handleEdgeDoubleClick = useCallback(
    (_event: unknown, edge: Edge) => {
      if (edge.id.startsWith('__')) return;
      setEditingLabel(edge.id, 'edge');
    },
    [setEditingLabel],
  );

  // ------------------------------------------------ drop from palette
  const addNewState = useCallback(
    (kind: 'atomic' | 'compound' | 'parallel' | 'final', x: number, y: number) => {
      const id = `${kind}_${Date.now().toString(36)}`;
      // Persist an initial layout via a synthetic mutation; addStateNode models
      // all kinds as <state> in the AST, then we record the drop coordinates.
      applyAstMutation((doc) => {
        const targetNode = addStateNode(doc, id, kind);
        if (targetNode) persistNodePosition(doc, nodesRef.current, id, x, y);
      });
    },
    [applyAstMutation],
  );

  const dropTargetRef = useRef<HTMLDivElement>(null);
  const handleDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const kind = event.dataTransfer.getData('application/scxml-node') as
        | 'atomic'
        | 'compound'
        | 'parallel'
        | 'final'
        | '';
      if (!kind) return;
      const flow = dropTargetRef.current;
      const bounds = flow?.getBoundingClientRect();
      if (!bounds) return;
      const position = {
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top,
      };
      addNewState(kind, position.x, position.y);
    },
    [addNewState],
  );

  return (
    <div className="relative h-full w-full">
      <ReactFlow
        ref={dropTargetRef}
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={handleNodesChange}
        onEdgesChange={handleEdgesChange}
        onConnect={handleConnect}
        onNodeDragStop={handleNodeDragStop}
        onDelete={handleDelete}
        onNodeClick={handleNodeClick}
        onNodeDoubleClick={handleNodeDoubleClick}
        onEdgeDoubleClick={handleEdgeDoubleClick}
        onPaneClick={handlePaneClick}
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        fitView
        nodesConnectable
        deleteKeyCode={['Backspace', 'Delete']}
        proOptions={{ hideAttribution: true }}
      >
        <NodePalette />
        <CanvasControls />
      </ReactFlow>

      {livePreviewPaused && (
        <div className="preview-banner">Live preview paused — syntax error in the XML</div>
      )}
    </div>
  );
}
