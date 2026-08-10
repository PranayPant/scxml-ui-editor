import type { Node } from '@xyflow/react';
import type { SCXMLDocument, Transition } from 'scxml-parser';
import { parseSCXMLPartial } from 'scxml-parser';
import { describe, expect, it } from 'vitest';
import {
  addStateNode,
  connectStates,
  deleteEdge,
  deleteState,
  persistNodePosition,
  renameStateId,
} from './flowToScxml';
import { collectStateNodes, readLayout } from './metadataRegistry';

/** Find a state-like node and narrow to a transition-owning shape. */
function stateWithTransitions(doc: SCXMLDocument, id: string): { transitions: Transition[] } {
  const node = collectStateNodes(doc).find((n) => n.id === id);
  if (!node) throw new Error(`state ${id} not found`);
  if (!('transitions' in node)) throw new Error(`state ${id} has no transitions`);
  return node;
}

const BASE = `
  <scxml xmlns="http://www.w3.org/2005/07/scxml" initial="idle">
    <state id="idle">
      <transition event="start" target="running">
        <metadata><transitionId value="idle:0" /></metadata>
      </transition>
    </state>
    <state id="running">
      <state id="processing" />
      <transition event="cancel" target="idle">
        <metadata><transitionId value="running:0" /></metadata>
      </transition>
    </state>
    <final id="finished" />
  </scxml>
`;

describe('flowToScxml mutation isolation', () => {
  it('connectStates adds a transition without disturbing unrelated nodes', () => {
    const { data } = parseSCXMLPartial(BASE, { captureStringPositions: true });
    expect(data).toBeTruthy();
    const doc = data!;

    const idle = stateWithTransitions(doc, 'idle');
    const beforeCount = idle.transitions.length;
    const t = connectStates(doc, 'idle', 'finished', 'reset');

    expect(t).not.toBeNull();
    expect(idle.transitions.length).toBe(beforeCount + 1);
    expect(idle.transitions[idle.transitions.length - 1].event).toBe('reset');
    // Unrelated nodes untouched.
    expect(collectStateNodes(doc).some((n) => n.id === 'processing')).toBe(true);
  });

  it('connectStates on a non-first owner computes a stable transition id', () => {
    const { data } = parseSCXMLPartial(BASE, { captureStringPositions: true });
    const doc = data!;
    // `running` is a later transition owner (after `idle`), so findTransitionIndex
    // iterates past the non-matching owner (covering the continue branch).
    const t = connectStates(doc, 'running', 'finished', 'stop');
    expect(t).not.toBeNull();
    const running = stateWithTransitions(doc, 'running');
    expect(running.transitions[running.transitions.length - 1].event).toBe('stop');
  });

  it('deleteState removes a state and cascades/cleans', () => {
    const { data } = parseSCXMLPartial(BASE, { captureStringPositions: true });
    const doc = data!;
    deleteState(doc, 'running');
    expect(collectStateNodes(doc).some((n) => n.id === 'running')).toBe(false);
    expect(collectStateNodes(doc).some((n) => n.id === 'processing')).toBe(false);
  });

  it('deleteEdge removes a transition by its stable id', () => {
    const { data } = parseSCXMLPartial(BASE, { captureStringPositions: true });
    const doc = data!;
    const idle = stateWithTransitions(doc, 'idle');
    const before = idle.transitions.length;
    deleteEdge(doc, 'idle:0');
    expect(idle.transitions.length).toBe(before - 1);
  });

  it('renameStateId cascades to transition targets', () => {
    const { data } = parseSCXMLPartial(BASE, { captureStringPositions: true });
    const doc = data!;
    renameStateId(doc, 'running', 'executing');
    expect(collectStateNodes(doc).some((n) => n.id === 'executing')).toBe(true);
    // idle:start now targets executing.
    const idle = stateWithTransitions(doc, 'idle');
    expect(idle.transitions.some((t) => t.target === 'executing')).toBe(true);
  });
});

describe('persistNodePosition (relative -> global coordinate write-back)', () => {
  it('writes global coords = child relative + ancestor chain for a nested child', () => {
    const scxml = `
      <scxml xmlns="http://www.w3.org/2005/07/scxml">
        <state id="running">
          <metadata><ui:layout x="100" y="200" width="200" height="120" /></metadata>
          <state id="processing">
            <metadata><ui:layout x="50" y="60" width="140" height="60" /></metadata>
          </state>
        </state>
      </scxml>
    `;
    const { data } = parseSCXMLPartial(scxml, { captureStringPositions: true });
    const doc = data!;

    // React Flow node list: child relative pos (10, 20), parent global (100, 200).
    const nodes: Node[] = [
      { id: 'running', position: { x: 100, y: 200 }, data: {} },
      {
        id: 'processing',
        position: { x: 10, y: 20 },
        parentId: 'running',
        data: {},
      },
    ];

    persistNodePosition(doc, nodes, 'processing', 10, 20);

    const processing = collectStateNodes(doc).find((n) => n.id === 'processing')!;
    const layout = readLayout(processing);
    // Global = parent(100,200) + relative(10,20) => (110, 220).
    expect(layout).not.toBeNull();
    expect(layout!.x).toBe(110);
    expect(layout!.y).toBe(220);
  });

  it("persistNodePosition is a no-op when the target state doesn't exist", () => {
    const { data } = parseSCXMLPartial(BASE, { captureStringPositions: true });
    const doc = data!;
    expect(() => persistNodePosition(doc, [], 'does-not-exist', 5, 5)).not.toThrow();
  });

  it('persistNodePosition handles a top-level node (no ancestor chain)', () => {
    const { data } = parseSCXMLPartial(BASE, { captureStringPositions: true });
    const doc = data!;
    // `idle` has no parent -> global == relative.
    persistNodePosition(doc, [{ id: 'idle', position: { x: 7, y: 9 }, data: {} }], 'idle', 7, 9);
    const idle = collectStateNodes(doc).find((n) => n.id === 'idle')!;
    const layout = readLayout(idle);
    expect(layout!.x).toBe(7);
    expect(layout!.y).toBe(9);
  });

  it('connectStates returns null for an impossible connection', () => {
    const { data } = parseSCXMLPartial(BASE, { captureStringPositions: true });
    const doc = data!;
    // Missing source/target -> addTransition throws -> null.
    expect(connectStates(doc, 'ghost', 'also-ghost', 'x')).toBeNull();
  });

  it('addStateNode creates atomic and compound-rooted nodes', () => {
    const { data } = parseSCXMLPartial(BASE, { captureStringPositions: true });
    const doc = data!;
    const atomic = addStateNode(doc, 'newAtomic', 'atomic');
    expect(atomic?.id).toBe('newAtomic');
    const compound = addStateNode(doc, 'newCompound', 'compound');
    expect(compound?.id).toBe('newCompound');
    // Compound containers get empty child arrays.
    const c = compound as {
      states: unknown[];
      parallels: unknown[];
      finals: unknown[];
    };
    expect(c.states).toEqual([]);
    expect(c.parallels).toEqual([]);
    expect(c.finals).toEqual([]);
  });

  it('persistNodePosition with an existing ui:layout preserves width/height', () => {
    const scxml = `
      <scxml xmlns="http://www.w3.org/2005/07/scxml">
        <state id="a">
          <metadata><ui:layout x="1" y="2" width="140" height="60" /></metadata>
        </state>
      </scxml>
    `;
    const { data } = parseSCXMLPartial(scxml, { captureStringPositions: true });
    const doc = data!;
    persistNodePosition(doc, [{ id: 'a', position: { x: 50, y: 60 }, data: {} }], 'a', 50, 60);
    const node = collectStateNodes(doc).find((n) => n.id === 'a')!;
    const layout = readLayout(node);
    expect(layout!.x).toBe(50);
    expect(layout!.y).toBe(60);
    expect(layout!.width).toBe(140);
    expect(layout!.height).toBe(60);
  });
});
