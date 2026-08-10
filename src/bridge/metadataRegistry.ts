import type { MetadataBlock, SCXMLDocument, StateNodeLike, Transition } from 'scxml-parser';

/** Tag name for the `ui:layout` UI-coordinate metadata block. */
export const LAYOUT_TAG = 'ui:layout';
export const TRANSITION_ID_TAG = 'transitionId';

/** Parsed layout payload persisted on an AST node. */
export interface LayoutInfo {
  x: number;
  y: number;
  width?: number;
  height?: number;
}

// ---------------------------------------------------------------------------
// Layout metadata read / write helpers
// ---------------------------------------------------------------------------

function findLayoutBlock(metadata: MetadataBlock[] | undefined): MetadataBlock | undefined {
  return metadata?.find((m) => m.tag === LAYOUT_TAG);
}

function toNum(value: string | undefined): number | undefined {
  if (value === undefined || value === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

/** Read the persisted layout (x, y, w, h) off a state-like node, if present. */
export function readLayout(node: StateNodeLike): LayoutInfo | null {
  const block = findLayoutBlock(node.metadata);
  if (!block) return null;
  return {
    x: toNum(block.attributes.x) ?? 0,
    y: toNum(block.attributes.y) ?? 0,
    width: toNum(block.attributes.width),
    height: toNum(block.attributes.height),
  };
}

/** Write (or update) the persisted layout on a state-like node. */
export function writeLayout(node: StateNodeLike, layout: LayoutInfo): void {
  const attrs = {
    x: String(Math.round(layout.x)),
    y: String(Math.round(layout.y)),
    ...(layout.width !== undefined ? { width: String(Math.round(layout.width)) } : {}),
    ...(layout.height !== undefined ? { height: String(Math.round(layout.height)) } : {}),
  };

  const existing = findLayoutBlock(node.metadata);
  if (existing) {
    existing.attributes = attrs;
    return;
  }
  // Keep metadata blocks at the front for readable serialization.
  node.metadata.unshift({ tag: LAYOUT_TAG, attributes: attrs });
}

// ---------------------------------------------------------------------------
// Transition id metadata helpers
// ---------------------------------------------------------------------------

/** Read the persisted stable transition id from a transition's metadata. */
export function readTransitionId(t: Transition): string | undefined {
  const block = t.metadata?.find((m) => m.tag === TRANSITION_ID_TAG);
  return block?.attributes.value;
}

/** Write (or update) the persisted stable transition id. */
export function writeTransitionId(t: Transition, id: string): void {
  const existing = t.metadata?.find((m) => m.tag === TRANSITION_ID_TAG);
  if (existing) {
    existing.attributes = { value: id };
    return;
  }
  t.metadata.push({ tag: TRANSITION_ID_TAG, attributes: { value: id } });
}

/** Safely collect all state-like nodes (including finals + parallels) from a doc. */
export function collectStateNodes(doc: SCXMLDocument): StateNodeLike[] {
  const out: StateNodeLike[] = [];
  const walk = (nodes: StateNodeLike[], depth: number) => {
    for (const n of nodes) {
      out.push(n);
      if ('states' in n) walk(n.states as StateNodeLike[], depth + 1);
      if ('parallels' in n) walk(n.parallels as StateNodeLike[], depth + 1);
      if ('finals' in n) {
        for (const f of n.finals) out.push(f);
      }
    }
  };
  walk(doc.scxml.states, 0);
  walk(doc.scxml.parallels, 0);
  for (const f of doc.scxml.finals) out.push(f);
  return out;
}
