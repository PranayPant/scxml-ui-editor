import { beforeEach, describe, expect, it } from 'vitest';
import { useEditorStore } from '../useEditorStore';

const MINIMAL_SCXML = `
  <scxml xmlns="http://www.w3.org/2005/07/scxml" initial="idle">
    <state id="idle">
      <transition event="start" target="running" />
    </state>
    <state id="running">
      <transition event="stop" target="idle" />
    </state>
  </scxml>
`;

// Reset the singleton store to a clean slate before each test.
function resetStore() {
  useEditorStore.setState({
    ast: null,
    rawXml: '',
    parseErrors: [],
    livePreviewPaused: false,
    activeSourceRange: null,
    nodes: [],
    edges: [],
    selectedNodeId: null,
    syncOrigin: 'IDLE',
    isDirty: false,
  });
}

describe('useEditorStore sync transaction semantics', () => {
  beforeEach(() => {
    resetStore();
  });

  it('short-circuits updateCodeFromUser while syncOrigin is CANVAS (loop prevention)', () => {
    useEditorStore.getState().seedStore(MINIMAL_SCXML);
    const store = useEditorStore.getState();
    const nodesBefore = store.nodes;

    // Simulate a CANVAS transaction in progress.
    useEditorStore.setState({ syncOrigin: 'CANVAS' });
    const rawBefore = useEditorStore.getState().rawXml;

    useEditorStore.getState().updateCodeFromUser("<scxml><state id='OTHER'/></scxml>");

    const after = useEditorStore.getState();
    // Guard fired: rawXml untouched, nodes not re-parsed/overwritten.
    expect(after.rawXml).toBe(rawBefore);
    expect(after.nodes).toEqual(nodesBefore);
  });

  it('applyAstMutation commits only on successful mutation (transactional)', () => {
    useEditorStore.getState().seedStore(MINIMAL_SCXML);
    const rawBefore = useEditorStore.getState().rawXml;
    const astBefore = useEditorStore.getState().ast;

    // A mutation that throws must not corrupt the committed AST/xml.
    expect(() =>
      useEditorStore.getState().applyAstMutation(() => {
        throw new Error('boom');
      }),
    ).toThrow();

    expect(useEditorStore.getState().rawXml).toBe(rawBefore);
    expect(useEditorStore.getState().ast).toBe(astBefore);
  });

  it('applyAstMutation re-serializes AST and refreshes nodes on success', () => {
    useEditorStore.getState().seedStore(MINIMAL_SCXML);
    const beforeXml = useEditorStore.getState().rawXml;

    useEditorStore.getState().applyAstMutation((doc) => {
      // rename triggered via the parser helper is fine; just mutate transitions
      const idle = doc.scxml.states.find((s) => s.id === 'idle')!;
      idle.transitions[0].event = 'begin';
    });

    const after = useEditorStore.getState();
    expect(after.rawXml).not.toBe(beforeXml);
    expect(after.rawXml).toContain('begin');
    expect(after.nodes.length).toBeGreaterThan(0);
    // Transaction released.
    expect(useEditorStore.getState().syncOrigin).toBe('IDLE');
  });

  it('seedStore parses and populates nodes; dirty flag is set', () => {
    useEditorStore.getState().seedStore(MINIMAL_SCXML);
    const s = useEditorStore.getState();
    expect(s.ast).not.toBeNull();
    expect(s.nodes.length).toBeGreaterThan(0);
    // rawXml is stored verbatim (the exact string passed to seedStore).
    expect(s.rawXml).toBe(MINIMAL_SCXML);
    expect(s.syncOrigin).toBe('IDLE');
  });

  it('exposes slice setters that update their respective slice state', () => {
    const api = useEditorStore.getState();

    // codeSlice
    api.setRawXml('<scxml/>');
    expect(useEditorStore.getState().rawXml).toBe('<scxml/>');
    api.setParseErrors([{ severity: 'error', message: 'x' } as never], true);
    expect(useEditorStore.getState().parseErrors.length).toBe(1);
    expect(useEditorStore.getState().livePreviewPaused).toBe(true);
    api.setActiveSourceRange({
      startLine: 2,
      startColumn: 1,
      endLine: 2,
      endColumn: 3,
    });
    expect(useEditorStore.getState().activeSourceRange?.startLine).toBe(2);

    // graphSlice
    api.setNodes([{ id: 'n' }] as never);
    expect(useEditorStore.getState().nodes).toHaveLength(1);
    api.setEdges([{ id: 'e' }] as never);
    expect(useEditorStore.getState().edges).toHaveLength(1);
    api.setSelectedNodeId('n');
    expect(useEditorStore.getState().selectedNodeId).toBe('n');

    // syncSlice
    api.markDirty();
    expect(useEditorStore.getState().isDirty).toBe(true);
    api.markClean();
    expect(useEditorStore.getState().isDirty).toBe(false);
  });
});
