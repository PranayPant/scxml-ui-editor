import { parseSCXMLPartial, type SCXMLDocument, serializeSCXML } from 'scxml-parser';
import { create } from 'zustand';
import { collectStateNodes, writeLayout } from '@/bridge/metadataRegistry';
import { scxmlToFlow } from '@/bridge/scxmlToFlow';
import { sourceToMonacoRange } from '@/bridge/sourceMapper';
import { layoutScxmlGraph } from '@/layout/elkLayout';
import { type CodeState, createCodeSlice, type SourceRange } from './slices/codeSlice';
import { createGraphSlice, type GraphState } from './slices/graphSlice';
import { createSyncSlice, type SyncState } from './slices/syncSlice';

export interface EditorStore extends CodeState, GraphState, SyncState {
  /** The parsed SCXML AST (single source of truth for structure). */
  ast: SCXMLDocument | null;

  setAst: (ast: SCXMLDocument | null) => void;

  /** Seed the editor with an initial SCXML document (parse + render). */
  seedStore: (xml: string) => void;

  /** CODE -> AST -> CANVAS pipeline (user typed in Monaco). */
  updateCodeFromUser: (xml: string) => void;
  /** Apply an AST mutation then re-serialize AND re-render both views. */
  applyAstMutation: (mutationFn: (ast: SCXMLDocument) => void) => void;
  /** Two-way selection sync between views. */
  selectElement: (id: string | null, source: 'CODE' | 'CANVAS') => void;
  /** Highlight a source range in Monaco from a canvas selection. */
  selectSourceRange: (range: SourceRange | null) => void;
}

export const useEditorStore = create<EditorStore>()((set, get, api) => ({
  ...createCodeSlice(set, get, api),
  ...createGraphSlice(set, get, api),
  ...createSyncSlice(set, get, api),

  ast: null,

  setAst: (ast) => set({ ast }),

  seedStore: (xml) => {
    get().beginTransaction('CODE');
    set({ rawXml: xml });

    const result = parseSCXMLPartial(xml, { captureStringPositions: true });
    const livePreviewPaused = !result.recoverable;
    set({ ast: result.data });
    get().setParseErrors(result.errors, livePreviewPaused);

    const { nodes, edges, needsAutoLayout } = scxmlToFlow(result.data);
    get().setNodesAndEdges(nodes, edges);
    get().setSelectedNodeId(null);

    // Kick off an ELK pass once if any node lacks saved coordinates.
    if (needsAutoLayout) {
      void layoutScxmlGraph(nodes, edges).then((laid) => {
        get().applyAstMutation((doc) => {
          const nodeMap = new Map(laid.map((n) => [n.id, n] as const));
          for (const node of collectStateNodes(doc)) {
            const laidNode = nodeMap.get(node.id);
            if (!laidNode) continue;
            writeLayout(node, {
              x: laidNode.position.x,
              y: laidNode.position.y,
            });
          }
        });
      });
    }

    get().endTransaction();
  },

  // ------------------------------------------------------------------
  // CODE -> AST -> CANVAS
  // ------------------------------------------------------------------
  updateCodeFromUser: (xml) => {
    const { syncOrigin } = get();
    // Guard: ignore text pushed back from a CANVAS transaction.
    if (syncOrigin === 'CANVAS') return;

    get().beginTransaction('CODE');
    set({ rawXml: xml });

    const result = parseSCXMLPartial(xml, { captureStringPositions: true });
    const livePreviewPaused = !result.recoverable;

    set({ ast: result.data });
    get().setParseErrors(result.errors, livePreviewPaused);

    const { nodes, edges } = scxmlToFlow(result.data);
    // Patch canvas while preserving selection where still valid.
    const currentSel = get().selectedNodeId;
    get().setNodesAndEdges(nodes, edges);
    if (currentSel && !nodes.some((n) => n.id === currentSel)) {
      get().setSelectedNodeId(null);
    }

    get().endTransaction();
  },

  // ------------------------------------------------------------------
  // AST MUTATION -> reserialize + re-render both views
  // ------------------------------------------------------------------
  applyAstMutation: (mutationFn) => {
    const ast = get().ast;
    if (!ast) return;

    get().beginTransaction('CANVAS');
    const nextDoc = structuredClone(ast);
    mutationFn(nextDoc);

    const xml = serializeSCXML(nextDoc);
    set({ ast: nextDoc, rawXml: xml });

    const { nodes, edges } = scxmlToFlow(nextDoc);
    get().setNodesAndEdges(nodes, edges);

    get().endTransaction();
  },

  // ------------------------------------------------------------------
  // SELECTION SYNC
  // ------------------------------------------------------------------
  selectElement: (id, source) => {
    get().setSelectedNodeId(id);

    if (source === 'CANVAS' && id && get().ast) {
      const range = sourceToMonacoRange(get().ast, id);
      get().setActiveSourceRange(range);
    }
  },

  selectSourceRange: (range) => {
    get().setActiveSourceRange(range);
  },
}));
