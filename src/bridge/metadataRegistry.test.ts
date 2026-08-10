import { parseSCXMLPartial } from 'scxml-parser';
import { describe, expect, it } from 'vitest';
import {
  collectStateNodes,
  LAYOUT_TAG,
  readLayout,
  readTransitionId,
  TRANSITION_ID_TAG,
  writeLayout,
  writeTransitionId,
} from './metadataRegistry';

describe('metadataRegistry layout helpers', () => {
  it('readLayout returns null when no ui:layout block exists', () => {
    const { data } = parseSCXMLPartial(
      `<scxml xmlns="http://www.w3.org/2005/07/scxml"><state id="a"/></scxml>`,
      { captureStringPositions: true },
    );
    const node = collectStateNodes(data!)[0];
    expect(readLayout(node)).toBeNull();
  });

  it('readLayout parses x/y and optional width/height', () => {
    // Construct a state-like node with the persisted metadata shape directly
    // so we exercise readLayout's parsing logic without depending on the
    // parser's custom-tag nesting details.
    const node = {
      id: 'a',
      metadata: [
        {
          tag: LAYOUT_TAG,
          attributes: { x: '10', y: '20', width: '140', height: '60' },
        },
      ],
    } as never;
    expect(readLayout(node as never)).toEqual({
      x: 10,
      y: 20,
      width: 140,
      height: 60,
    });
  });

  it('writeLayout updates an existing block, replacing its attributes', () => {
    const node = {
      id: 'a',
      metadata: [
        {
          tag: LAYOUT_TAG,
          attributes: { x: '1', y: '2', width: '100', height: '50' },
        },
      ],
    } as never;
    writeLayout(node as never, { x: 99, y: 88 });
    // writeLayout replaces the block's attributes with the new (x,y) values;
    // width/height not passed are omitted from the persisted attributes.
    expect(readLayout(node as never)).toMatchObject({ x: 99, y: 88 });
    expect(readLayout(node as never)!.width).toBeUndefined();
  });

  it('writeLayout inserts a new block (no existing) and stores rounded coords', () => {
    const node = {
      id: 'a',
      metadata: [] as { tag: string; attributes: Record<string, string> }[],
    };
    writeLayout(node as never, { x: 10.6, y: 20.4, width: 100, height: 50 });
    expect(readLayout(node as never)).toMatchObject({
      x: 11,
      y: 20,
      width: 100,
      height: 50,
    });
    // Block was unshifted to the front of metadata.
    expect(node.metadata[0].tag).toBe(LAYOUT_TAG);
  });
});

describe('metadataRegistry transition id helpers', () => {
  it('readTransitionId returns undefined when absent, and value when present', () => {
    // Construct a transition object directly with a transitionId metadata entry.
    const withId = {
      metadata: [{ tag: TRANSITION_ID_TAG, attributes: { value: 'a:0' } }],
    };
    expect(readTransitionId(withId as never)).toBe('a:0');

    const withoutId = { metadata: [{ tag: 'other', attributes: {} }] };
    expect(readTransitionId(withoutId as never)).toBeUndefined();
    // Transition with no metadata at all -> undefined.
    expect(readTransitionId({} as never)).toBeUndefined();
  });

  it('writeTransitionId updates existing and inserts new metadata', () => {
    // Update existing entry in place.
    const withExisting = {
      metadata: [{ tag: TRANSITION_ID_TAG, attributes: { value: 'old' } }],
    } as { metadata: { tag: string; attributes: { value: string } }[] };
    writeTransitionId(withExisting as never, 'new');
    expect(withExisting.metadata.length).toBe(1);
    expect(withExisting.metadata[0].attributes.value).toBe('new');

    // Fresh transition without metadata: insert.
    const bare = {
      metadata: [] as { tag: string; attributes: { value: string } }[],
    };
    writeTransitionId(bare as never, 'fresh');
    expect(bare.metadata[0].tag).toBe(TRANSITION_ID_TAG);
    expect(bare.metadata[0].attributes.value).toBe('fresh');
  });
});

describe('metadataRegistry node traversal', () => {
  it('collectStateNodes walks nested states, parallels, and finals (incl. nested finals)', () => {
    const scxml = `
      <scxml xmlns="http://www.w3.org/2005/07/scxml">
        <state id="root">
          <state id="child" />
          <parallel id="par">
            <state id="pState" />
          </parallel>
          <final id="nestedFinal" />
        </state>
        <final id="topFinal" />
      </scxml>
    `;
    const { data } = parseSCXMLPartial(scxml, { captureStringPositions: true });
    const ids = collectStateNodes(data!).map((n) => n.id);
    expect(ids).toEqual(
      expect.arrayContaining(['root', 'child', 'par', 'pState', 'nestedFinal', 'topFinal']),
    );
  });
});
