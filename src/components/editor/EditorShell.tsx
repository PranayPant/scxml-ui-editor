import { useMonaco } from "@monaco-editor/react";
import { useCallback, useEffect, useRef } from "react";
import {
  type ImperativePanelHandle,
  Panel,
  PanelGroup,
  PanelResizeHandle,
} from "react-resizable-panels";
import { collectStateNodes, writeLayout } from "@/bridge/metadataRegistry";
import { DEFAULT_SCXML } from "@/bridge/sampleDocument";
import { ReactFlowCanvas } from "@/components/canvas/ReactFlowCanvas";
import { EnginePanel, useEngineStore } from "@/plugins/engine";
import { layoutScxmlGraph } from "@/layout/elkLayout";
import { useEditorStore } from "@/store/useEditorStore";
import { MonacoEditor } from "./MonacoEditor";
import { Toolbar } from "./Toolbar";

/**
 * Root layout for the editor: a resizable split between the Monaco code
 * editor and the React Flow canvas (per spec §7), with a global `Toolbar`.
 */
export function EditorShell() {
  const codePanelRef = useRef<ImperativePanelHandle>(null);
  const canvasPanelRef = useRef<ImperativePanelHandle>(null);

  // Ensure the store is seeded with the sample document on first mount.
  const ast = useEditorStore((s) => s.ast);
  const seedStore = useEditorStore((s) => s.seedStore);

  // Monaco loader instance for export filename / helpers (unused directly).
  useMonaco();

  useEffect(() => {
    if (!ast) seedStore(DEFAULT_SCXML);
  }, [ast, seedStore]);

  const handleExport = useCallback(() => {
    const rawXml = useEditorStore.getState().rawXml;
    const blob = new Blob([rawXml], { type: "application/xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "statechart.scxml";
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  // Re-run ELK.js across the whole graph and persist coords back to <metadata>.
  const handleAutoLayout = useCallback(async () => {
    const store = useEditorStore.getState();
    const { nodes, edges } = store;

    if (nodes.length === 0) return;
    const laidOut = await layoutScxmlGraph(nodes, edges);

    // Persist new positions into the AST so they survive re-parses.
    store.applyAstMutation((doc) => {
      const nodeMap = new Map(laidOut.map((n) => [n.id, n] as const));
      for (const node of collectStateNodes(doc)) {
        const laid = nodeMap.get(node.id);
        if (!laid) continue;
        writeLayout(node, {
          x: laid.position.x,
          y: laid.position.y,
        });
      }
    });
  }, []);

  const maximizeCode = () => codePanelRef.current?.resize(100);
  const maximizeCanvas = () => canvasPanelRef.current?.resize(100);
  const resetSplit = () => {
    codePanelRef.current?.resize(40);
    canvasPanelRef.current?.resize(60);
  };

  const enginePanelOpen = useEngineStore((s) => s.panelOpen);
  const togglePanel = useEngineStore((s) => s.togglePanel);

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden">
      <Toolbar
        onAutoLayout={handleAutoLayout}
        onMaximizeCode={maximizeCode}
        onMaximizeCanvas={maximizeCanvas}
        onResetSplit={resetSplit}
        onExport={handleExport}
        onToggleEngine={togglePanel}
        enginePanelOpen={enginePanelOpen}
      />

      <PanelGroup
        direction="horizontal"
        autoSaveId="scxml-editor-split"
        className="flex-1"
      >
        <Panel
          ref={codePanelRef}
          defaultSize={40}
          minSize={15}
          collapsible
          className="relative"
        >
          <MonacoEditor />
        </Panel>

        <PanelResizeHandle className="flex w-2 cursor-col-resize items-center justify-center bg-neutral-200 transition-colors hover:bg-blue-500 active:bg-blue-600">
          <div className="h-8 w-1 rounded-full bg-neutral-400" />
        </PanelResizeHandle>

        <Panel
          ref={canvasPanelRef}
          defaultSize={60}
          minSize={20}
          collapsible
          className="relative"
        >
          <ReactFlowCanvas />
          {enginePanelOpen && <EnginePanel />}
        </Panel>
      </PanelGroup>
    </div>
  );
}
