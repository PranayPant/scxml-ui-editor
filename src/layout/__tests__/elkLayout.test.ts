import { parseSCXMLPartial } from 'scxml-parser';
import { describe, expect, it } from 'vitest';
import { scxmlToFlow } from '../../bridge/scxmlToFlow';
import { layoutScxmlGraph } from '../elkLayout';

/**
 * Deterministic layout tests that run in a plain Node environment (no jsdom,
 * no browser). `elkjs` runs natively in Node, and `scxmlToFlow` supplies
 * fallback node dimensions when DOM measurement is absent, so we can assert
 * graph layout, parent-child containment, and overlap invariants reliably.
 */
describe('ELK Layout Engine (Node environment)', () => {
  it('calculates deterministic layout and parent-child containment', async () => {
    const scxml = `
      <scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" initial="idle">
        <state id="idle">
          <transition event="start" target="running" />
        </state>
        <state id="running">
          <state id="processing" />
          <transition event="cancel" target="idle" />
        </state>
      </scxml>
    `;

    const result = parseSCXMLPartial(scxml);
    expect(result.data).toBeTruthy();
    const { nodes: rawNodes, edges } = scxmlToFlow(result.data!);

    // Run ELK layout in pure Node.
    const layoutNodes = await layoutScxmlGraph(rawNodes, edges);

    const idle = layoutNodes.find((n) => n.id === 'idle');
    const running = layoutNodes.find((n) => n.id === 'running');
    const processing = layoutNodes.find((n) => n.id === 'processing');

    expect(idle).toBeDefined();
    expect(running).toBeDefined();
    expect(processing).toBeDefined();

    // 1. Coordinates are non-zero numbers.
    expect(typeof idle!.position.x).toBe('number');
    expect(typeof running!.position.x).toBe('number');

    // 2. Parent-child containment invariants.
    expect(processing!.parentId).toBe('running');

    // Relative child coords must sit inside parent bounds (> 0, < parent dim).
    expect(processing!.position.x).toBeGreaterThan(0);
    expect(processing!.position.y).toBeGreaterThan(0);
    expect((running!.style as { width?: number } | undefined)?.width).toBeTypeOf('number');
    expect((running!.style as { height?: number } | undefined)?.height).toBeTypeOf('number');
    expect(processing!.position.x).toBeLessThan((running!.style as { width: number }).width);
    expect(processing!.position.y).toBeLessThan((running!.style as { height: number }).height);

    // 3. Top-level nodes do not overlap (bounding-box intersection).
    const idleRight = idle!.position.x + (idle!.width ?? 140);
    const idleBottom = idle!.position.y + (idle!.height ?? 60);
    const runningRight = running!.position.x + (running!.width ?? 160);
    const runningBottom = running!.position.y + (running!.height ?? 80);

    const overlaps =
      idle!.position.x < runningRight &&
      idleRight > running!.position.x &&
      idle!.position.y < runningBottom &&
      idleBottom > running!.position.y;

    expect(overlaps).toBe(false);
  });

  it('emits relative child coordinates and propagates parent dimensions', async () => {
    const scxml = `
      <scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" initial="a">
        <state id="a">
          <state id="a1" />
          <state id="a2" />
        </state>
        <state id="b" />
      </scxml>
    `;
    const result = parseSCXMLPartial(scxml);
    expect(result.data).toBeTruthy();
    const { nodes: rawNodes, edges } = scxmlToFlow(result.data!);
    const laid = await layoutScxmlGraph(rawNodes, edges);

    const parent = laid.find((n) => n.id === 'a')!;
    const child1 = laid.find((n) => n.id === 'a1')!;
    const child2 = laid.find((n) => n.id === 'a2')!;

    // Parent receives explicit width/height from ELK's computed bounds.
    const pw = (parent.style as { width?: number })?.width;
    const ph = (parent.style as { height?: number })?.height;
    expect(pw).toBeTypeOf('number');
    expect(ph).toBeTypeOf('number');
    expect(parent.width).toBe(pw);

    // Child coords are RELATIVE to the parent (inside `[0, parentDim]`), i.e.
    // not accumulated with the parent's global offset.
    expect(child1.position.x).toBeGreaterThanOrEqual(0);
    expect(child1.position.y).toBeGreaterThanOrEqual(0);
    expect(child1.parentId).toBe('a');
    expect(child1.position.x).toBeLessThanOrEqual(pw as number);
    expect(child2.position.y).toBeLessThanOrEqual(ph as number);
  });
});
