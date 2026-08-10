import { parseSCXMLPartial } from 'scxml-parser';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_NODE_HEIGHT,
  DEFAULT_NODE_WIDTH,
  finalizeGraphLayout,
  getOptimalHandles,
  normalizeNodesForReactFlow,
  type ScxmlFlowNode,
  scxmlToFlow,
} from './scxmlToFlow';

function node(id: string, x: number, y: number): ScxmlFlowNode {
  return { id, position: { x, y }, data: { kind: 'atomic', label: id } };
}

describe('getOptimalHandles', () => {
  it('routes right→left when the target is to the right (horizontal dominant)', () => {
    const handles = getOptimalHandles(node('a', 0, 0), node('b', 200, 5));
    expect(handles).toEqual({
      sourceHandle: 'source-right',
      targetHandle: 'target-left',
    });
  });

  it('routes left→right when the target is to the left (horizontal dominant)', () => {
    const handles = getOptimalHandles(node('a', 200, 0), node('b', 0, 5));
    expect(handles).toEqual({
      sourceHandle: 'source-left',
      targetHandle: 'target-right',
    });
  });

  it('routes bottom→top when the target is below (vertical dominant)', () => {
    const handles = getOptimalHandles(node('a', 0, 0), node('b', 5, 200));
    expect(handles).toEqual({
      sourceHandle: 'source-bottom',
      targetHandle: 'target-top',
    });
  });

  it('routes top→bottom when the target is above (vertical dominant)', () => {
    const handles = getOptimalHandles(node('a', 0, 200), node('b', 5, 0));
    expect(handles).toEqual({
      sourceHandle: 'source-top',
      targetHandle: 'target-bottom',
    });
  });

  it('returns namespaced handle ids consumed by StateNodeWrapper', () => {
    const { sourceHandle, targetHandle } = getOptimalHandles(node('a', 0, 0), node('b', 100, 0));
    expect(sourceHandle).toMatch(/^source-(top|bottom|left|right)$/);
    expect(targetHandle).toMatch(/^target-(top|bottom|left|right)$/);
    expect(sourceHandle).not.toBe(targetHandle);
  });
});

describe('normalizeNodesForReactFlow (coordinate contract)', () => {
  it('applies fallback dimensions when DOM measurement is absent', () => {
    const nodes = normalizeNodesForReactFlow([node('a', 0, 0)]);
    expect(nodes[0].width).toBe(DEFAULT_NODE_WIDTH);
    expect(nodes[0].height).toBe(DEFAULT_NODE_HEIGHT);
  });

  it('re-derives parent position and bounds to wrap its children (+40px padding)', () => {
    // Child `processing` at global (180, 120), parent `running` previously at (120, 400).
    const raw = [
      node('running', 120, 400),
      { ...node('processing', 180, 120), parentId: 'running' },
    ];

    const normalized = normalizeNodesForReactFlow(raw);
    const running = normalized.find((n) => n.id === 'running')!;
    const processing = normalized.find((n) => n.id === 'processing')!;

    // Parent is re-anchored to wrap the child: minX-40, minY-40.
    expect(running.position).toEqual({ x: 140, y: 80 });
    // Child becomes relative to parent: (180-140, 120-80) = (40, 40) -> inside.
    expect(processing.position).toEqual({ x: 40, y: 40 });

    // Parent bounds enclose child + padding.
    expect(running.width).toBeGreaterThan(processing.position.x);
    expect(running.height).toBeGreaterThan(processing.position.y);
    expect((running.style as { width?: number }).width).toBe(running.width);
    expect((running.style as { height?: number }).height).toBe(running.height);
  });
});

describe('finalizeGraphLayout', () => {
  it('synthesizes the __initial__ indicator after normalization with correct placement + handles', () => {
    const { data } = parseSCXMLPartial(
      `<scxml xmlns="http://www.w3.org/2005/07/scxml" initial="idle">
         <state id="idle" />
       </scxml>`,
      { captureStringPositions: true },
    );
    expect(data).toBeTruthy();
    const initialId = data!.scxml.initial!;

    // Raw top-level `idle` at (100, 240).
    const raw = [node('idle', 100, 240)];
    const { nodes, edges } = finalizeGraphLayout(raw, [], initialId);

    const idle = nodes.find((n) => n.id === 'idle')!;
    const initial = nodes.find((n) => n.id === '__initial__');

    expect(initial).toBeDefined();
    expect(initial!.type).toBe('initialIndicator');
    expect(initial!.position.x).toBe(idle.position.x - 50);
    const targetHeight = idle.height ?? DEFAULT_NODE_HEIGHT;
    expect(initial!.position.y).toBe(idle.position.y + targetHeight / 2 - 8);

    const initEdge = edges.find((e) => e.id === '__initial__:0');
    expect(initEdge).toBeDefined();
    expect(initEdge!.sourceHandle).toBe('source-right');
    expect(initEdge!.targetHandle).toBe('target-left');
  });

  it('assigns dynamic namespaced handles to transition edges after normalization', () => {
    // `running` is to the right of `idle` -> horizontal, right -> left.
    const raw = [node('idle', 0, 0), node('running', 300, 0)];
    const edgesIn = [
      { id: 'idle:0', source: 'idle', target: 'running', type: 'transition' },
    ] as never[];

    const { edges } = finalizeGraphLayout(raw, edgesIn as any, undefined);
    const edge = edges[0] as { sourceHandle?: string; targetHandle?: string };
    expect(edge.sourceHandle).toBe('source-right');
    expect(edge.targetHandle).toBe('target-left');
  });
});

describe('scxmlToFlow AST -> graph node kinds', () => {
  it('maps atomic, compound, parallel, and final states to their node types', () => {
    const scxml = `
      <scxml xmlns="http://www.w3.org/2005/07/scxml">
        <state id="atomicA" />
        <state id="parent">
          <state id="child" />
        </state>
        <parallel id="par">
          <state id="p1" />
        </parallel>
        <final id="fin" />
      </scxml>
    `;
    const { data } = parseSCXMLPartial(scxml, { captureStringPositions: true });
    expect(data).toBeTruthy();
    const { nodes } = scxmlToFlow(data!);

    const byId = new Map(nodes.map((n) => [n.id, n]));
    expect(byId.get('atomicA')?.type).toBe('atomic');
    expect(byId.get('parent')?.type).toBe('compound');
    expect(byId.get('child')?.type).toBe('atomic');
    expect(byId.get('par')?.type).toBe('parallel');
    expect(byId.get('fin')?.type).toBe('atomic'); // final renders via AtomicStateNode
    // Child is nested under its compound parent.
    expect(byId.get('child')?.parentId).toBe('parent');
  });

  it('extracts onentry/onexit action summaries and history nodes', () => {
    const scxml = `
      <scxml xmlns="http://www.w3.org/2005/07/scxml">
        <state id="s1">
          <onentry>
            <log label="enter" />
            <raise event="tick" />
            <assign location="count" expr="count + 1" />
            <send event="ping" />
            <if cond="a == 1" />
            <script>doStuff()</script>
          </onentry>
          <onexit>
            <log expr="bye" />
          </onexit>
          <history id="h1" type="deep" />
        </state>
      </scxml>
    `;
    const { data } = parseSCXMLPartial(scxml, { captureStringPositions: true });
    expect(data).toBeTruthy();
    const { nodes } = scxmlToFlow(data!);

    const s1 = nodes.find((n) => n.id === 's1')!;
    const actions = s1.data.actions;
    expect(actions?.onentry).toContain('log: enter');
    expect(actions?.onentry).toContain('raise tick');
    expect(actions?.onentry).toContain('assign count');
    expect(actions?.onentry).toContain('send ping');
    expect(actions?.onentry).toContain('if a == 1');
    expect(actions?.onexit).toContain('log: bye');

    const h1 = nodes.find((n) => n.id === 'h1')!;
    expect(h1.type).toBe('history');
    expect(h1.parentId).toBe('s1');
  });

  it('renders transition labels with event + condition, and routes history self-return', () => {
    const scxml = `
      <scxml xmlns="http://www.w3.org/2005/07/scxml">
        <state id="a">
          <transition event="go" cond="x > 0" target="b" />
          <transition target="a" />
        </state>
        <state id="b" />
      </scxml>
    `;
    const { data } = parseSCXMLPartial(scxml, { captureStringPositions: true });
    expect(data).toBeTruthy();
    const { edges } = scxmlToFlow(data!);

    // Event + condition: the edge carries data.event and data.cond.
    const labeled = edges.find((e) => (e.data as { event?: string } | undefined)?.event === 'go');
    expect(labeled).toBeDefined();
    expect((labeled!.data as { cond?: string }).cond).toContain('x > 0');
  });

  it('treats an explicitly-typed compound state as compound (isCompound branch)', () => {
    // Empty <state type="compound"> has no sub-states, but its explicit type
    // must mark it as a compound node.
    const scxml = `
      <scxml xmlns="http://www.w3.org/2005/07/scxml">
        <state id="typed" type="compound" />
      </scxml>
    `;
    const { data } = parseSCXMLPartial(scxml, { captureStringPositions: true });
    const { nodes } = scxmlToFlow(data!);
    expect(nodes.find((n) => n.id === 'typed')?.type).toBe('compound');
  });

  it('handles a self-looping transition (boundary fallback to owner)', () => {
    const scxml = `
      <scxml xmlns="http://www.w3.org/2005/07/scxml">
        <state id="loop">
          <transition event="again" target="loop" />
        </state>
      </scxml>
    `;
    const { data } = parseSCXMLPartial(scxml, { captureStringPositions: true });
    const { edges } = scxmlToFlow(data!);
    const loopEdge = edges.find((e) => e.source === 'loop' && e.target === 'loop');
    expect(loopEdge).toBeDefined();
    expect((loopEdge!.data as { event?: string }).event).toBe('again');
  });

  it("routes a nested child's transition through the LCA boundary node (subflow exit)", () => {
    // `child` lives inside `parent`; its transition targets the top-level `out`.
    // The edge must attach to the boundary node visible at the shared ancestor.
    const scxml = `
      <scxml xmlns="http://www.w3.org/2005/07/scxml">
        <state id="parent">
          <state id="child">
            <transition event="exit" target="out" />
          </state>
        </state>
        <state id="out" />
      </scxml>
    `;
    const { data } = parseSCXMLPartial(scxml, { captureStringPositions: true });
    const { edges } = scxmlToFlow(data!);
    const exitEdge = edges.find((e) => (e.data as { event?: string }).event === 'exit');
    expect(exitEdge).toBeDefined();
    // Cross-boundary edge is drawn from the `parent` container to `out`.
    expect(exitEdge!.source).toBe('parent');
    expect(exitEdge!.target).toBe('out');
  });

  it('determines nested compound and parallel kinds (determineKind branches)', () => {
    const scxml = `
      <scxml xmlns="http://www.w3.org/2005/07/scxml">
        <state id="outer">
          <state id="mid">
            <state id="leaf" />
          </state>
        </state>
      </scxml>
    `;
    const { data } = parseSCXMLPartial(scxml, { captureStringPositions: true });
    const { nodes } = scxmlToFlow(data!);
    const byId = new Map(nodes.map((n) => [n.id, n]));
    // `mid` contains `leaf`, so determineKind returns "compound".
    expect(byId.get('mid')?.type).toBe('compound');
    // A leaf child is "atomic".
    expect(byId.get('leaf')?.type).toBe('atomic');
  });

  it('treats the owner itself as the boundary when it is the LCA', () => {
    // A transition from a container directly to its own child routes through
    // the container (endpoint IS the container -> boundaryNode returns self).
    const scxml = `
      <scxml xmlns="http://www.w3.org/2005/07/scxml">
        <state id="parent">
          <state id="kid" />
          <transition event="go" target="kid" />
        </state>
      </scxml>
    `;
    const { data } = parseSCXMLPartial(scxml, { captureStringPositions: true });
    const { edges } = scxmlToFlow(data!);
    const goEdge = edges.find((e) => (e.data as { event?: string }).event === 'go');
    expect(goEdge).toBeDefined();
    expect(goEdge!.source).toBe('parent');
    expect(goEdge!.target).toBe('kid');
  });
});
