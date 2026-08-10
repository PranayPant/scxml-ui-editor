import { type Edge, MarkerType, type Node } from '@xyflow/react';
import type {
  ExecutableContent,
  ParallelNode,
  SCXMLDocument,
  StateNode,
  StateNodeLike,
  Transition,
} from 'scxml-parser';

import { readLayout, readTransitionId } from './metadataRegistry';

export type ScxmlNodeKind =
  | 'atomic'
  | 'compound'
  | 'parallel'
  | 'final'
  | 'history'
  | 'initialIndicator';

export interface ScxmlNodeData extends Record<string, unknown> {
  kind: ScxmlNodeKind;
  scxmlType?: string;
  label: string;
  /** Human-readable summary of <onentry>/<onexit> for the node's action list. */
  actions?: { onentry?: string[]; onexit?: string[] };
}

export type ScxmlFlowNode = Node<ScxmlNodeData>;

/** Shared arrow marker so transition direction is legible at low zoom. */
const EDGE_MARKER = {
  type: MarkerType.ArrowClosed,
  width: 16,
  height: 16,
  color: '#64748b',
};

/**
 * Collapse an <onentry>/<onexit> executable-content list into a short,
 * human-readable string for node badges/summary lines.
 *
 * `ExecutableContent` is a union whose members carry an optional `kind`
 * discriminant, so we narrow defensively with `"kind" in a` casts rather than
 * relying on exhaustive switch narrowing (which is brittle here because
 * `ScriptElement`/`CancelElement` lack a `kind` tag).
 */
function summarizeExecutables(list: ExecutableContent[] | undefined): string[] {
  if (!list || list.length === 0) return [];
  return list.map((a) => {
    const kind = 'kind' in a ? (a.kind as string) : 'script';
    const anyA = a as unknown as Record<string, unknown>;
    switch (kind) {
      case 'log':
        return `log: ${String(anyA.label ?? anyA.expr ?? '')}`.trim();
      case 'raise':
        return `raise ${String(anyA.event ?? '')}`;
      case 'assign':
        return `assign ${String(anyA.location ?? '')}`;
      case 'send':
        return `send ${String(anyA.event ?? anyA.id ?? '')}`.trim();
      case 'if':
        return `if ${String(anyA.cond ?? '')}`;
      default:
        return kind;
    }
  });
}

export interface ScxmlToFlowResult {
  nodes: ScxmlFlowNode[];
  edges: Edge[];
  /** True when any node lacks persisted coordinates and needs an ELK layout. */
  needsAutoLayout: boolean;
}

/** Default node dimensions used when DOM measurement is absent (e.g. in tests). */
export const DEFAULT_NODE_WIDTH = 140;
export const DEFAULT_NODE_HEIGHT = 60;
/** Padding (px) added around a compound container's children bounds. */
const PARENT_PADDING = 40;

/**
 * Enforce the coordinate contract between the SCXML AST (which stores 100%
 * global coordinates) and React Flow (which, since v12, interprets a node's
 * `position` as **relative to its parent** when `parentId` is set).
 *
 * Deterministic two-pass approach:
 *   1. Give every real node a fallback `width`/`height` (so the layout engine
 *      and DOM-less tests work without measured dimensions).
 *   2. For each compound parent, derive its bounding box from the union of its
 *      immediate children's boxes plus `PARENT_PADDING`, and write it to
 *      `style.width`/`style.height` (+ `width`/`height`) on the parent.
 *   3. Convert every child's position from global to relative by subtracting
 *      its parent's global position.
 *
 * The pseudo initial-indicator node is left untouched: it has no `parentId`
 * and is positioned relative to its top-level target, so it stays global.
 */
export function normalizeNodesForReactFlow<T extends Node>(rawNodes: T[]): T[] {
  const nodeMap = new Map(rawNodes.map((n) => [n.id, { ...n } as T]));

  // 1. Ensure fallback dimensions.
  for (const n of nodeMap.values()) {
    n.width = n.width ?? n.measured?.width ?? DEFAULT_NODE_WIDTH;
    n.height = n.height ?? n.measured?.height ?? DEFAULT_NODE_HEIGHT;
  }

  // 2. Compute parent container bounds AND position from its immediate children
  //    (global space). Recomputing the parent's position from `minX/minY - pad`
  //    is what keeps a container wrapping its children — otherwise a child whose
  //    persisted global coords fall outside the parent's persisted position will
  //    render as a negative relative offset (i.e. outside the box).
  for (const node of nodeMap.values()) {
    const children = Array.from(nodeMap.values()).filter((c) => c.parentId === node.id);
    if (children.length === 0) continue;
    const minX = Math.min(...children.map((c) => c.position.x));
    const minY = Math.min(...children.map((c) => c.position.y));
    const maxX = Math.max(...children.map((c) => c.position.x + (c.width ?? DEFAULT_NODE_WIDTH)));
    const maxY = Math.max(...children.map((c) => c.position.y + (c.height ?? DEFAULT_NODE_HEIGHT)));

    const parentX = minX - PARENT_PADDING;
    const parentY = minY - PARENT_PADDING;
    const width = maxX - parentX + PARENT_PADDING;
    const height = maxY - parentY + PARENT_PADDING;
    node.position = { x: parentX, y: parentY };
    node.style = { ...(node.style ?? {}), width, height };
    node.width = width;
    node.height = height;
  }

  // 3. Convert children from global to relative coordinates.
  for (const node of nodeMap.values()) {
    if (!node.parentId) continue;
    const parent = nodeMap.get(node.parentId);
    if (parent) {
      node.position = {
        x: node.position.x - parent.position.x,
        y: node.position.y - parent.position.y,
      };
    }
  }

  return Array.from(nodeMap.values());
}

/** Deterministic transition edge id: "source:target_index". */
export function transitionEdgeId(sourceId: string, index: number): string {
  return `${sourceId}:${index}`;
}

const HANDLE_RIGHT = 'source-right';
const HANDLE_LEFT = 'source-left';
const HANDLE_TOP = 'source-top';
const HANDLE_BOTTOM = 'source-bottom';
const TARGET_RIGHT = 'target-right';
const TARGET_LEFT = 'target-left';
const TARGET_TOP = 'target-top';
const TARGET_BOTTOM = 'target-bottom';

/**
 * Pick the optimal namespaced handle pair for an edge based on the relative
 * geometry of its (already normalized) source and target nodes.
 *
 * Use the dominant axis of the delta vector so edges leave/enter the most
 * natural side of each node, keeping paths from crossing through node bodies.
 * Handle ids are namespaced per type+direction (e.g. `source-right`,
 * `target-left`) and must exist on every rendered node via `StateNodeWrapper`.
 */
export function getOptimalHandles(
  sourceNode: Node,
  targetNode: Node,
): { sourceHandle: string; targetHandle: string } {
  const dx = targetNode.position.x - sourceNode.position.x;
  const dy = targetNode.position.y - sourceNode.position.y;

  if (Math.abs(dx) > Math.abs(dy)) {
    // Horizontal alignment.
    return dx > 0
      ? { sourceHandle: HANDLE_RIGHT, targetHandle: TARGET_LEFT }
      : { sourceHandle: HANDLE_LEFT, targetHandle: TARGET_RIGHT };
  }
  // Vertical alignment.
  return dy > 0
    ? { sourceHandle: HANDLE_BOTTOM, targetHandle: TARGET_TOP }
    : { sourceHandle: HANDLE_TOP, targetHandle: TARGET_BOTTOM };
}

function isCompound(n: StateNode): boolean {
  return !!n.states?.length || !!n.parallels?.length || !!n.finals?.length || n.type === 'compound';
}

function transitionLabel(t: Transition): string {
  const parts: string[] = [];
  if (t.event) parts.push(`[${t.event}]`);
  if (t.cond) parts.push(t.cond);
  return parts.join(' ');
}

function nodeTypeFor(
  kind: ScxmlNodeKind,
): 'atomic' | 'compound' | 'parallel' | 'history' | 'initialIndicator' {
  switch (kind) {
    case 'parallel':
      return 'parallel';
    case 'history':
      return 'history';
    case 'compound':
      return 'compound';
    case 'initialIndicator':
      return 'initialIndicator';
    // atomic and final both render via AtomicStateNode (final uses data.kind).
    default:
      return 'atomic';
  }
}

/**
 * Convert an SCXML AST into React Flow nodes + edges.
 *
 * Layout strategy (per spec §6):
 *   - Nodes carrying <metadata><ui:layout/></metadata> use those saved coords.
 *   - Nodes without coords are flagged via `needsAutoLayout` so the caller can
 *     run an ELK pass (and persist the results back into <metadata>).
 */
export function scxmlToFlow(doc: SCXMLDocument): ScxmlToFlowResult {
  const nodes: ScxmlFlowNode[] = [];
  const edges: Edge[] = [];
  let needsAutoLayout = false;

  // nodeId -> parentId for every node (used for subflow boundary routing).
  const parentOf = new Map<string, string | undefined>();

  // ------------------------------------------------------------------
  // Reciprocal-transition detection
  // Sets of directed pairs "source>target" so back-and-forth transitions
  // (e.g. idle <-> running) can offset their labels instead of overlapping.
  // ------------------------------------------------------------------
  const directedPairs = new Set<string>();
  const walker = (owner: StateNodeLike): void => {
    const container = owner as Partial<StateNode | ParallelNode>;
    for (const t of (container.transitions ?? []) as Transition[]) {
      const targets = (t.target ?? '').split(/\s+/).filter(Boolean);
      for (const tg of targets) directedPairs.add(`${owner.id}>${tg}`);
    }
    if ('states' in container) {
      for (const c of [
        ...(container.states ?? []),
        ...(container.parallels ?? []),
        ...(container.finals ?? []),
      ]) {
        walker(c);
      }
    }
  };
  for (const s of doc.scxml.states) walker(s);
  for (const p of doc.scxml.parallels) walker(p);
  for (const f of doc.scxml.finals) walker(f);

  // ------------------------------------------------------------------
  // Subflow boundary routing helpers
  // ------------------------------------------------------------------
  /**
   * Return the ancestor chain of `id`, ordered from the node itself up to the
   * document root. Uses the parent map captured while building nodes; a node
   * with no entry is treated as a root-level node.
   */
  const ancestorChain = (id: string): string[] => {
    const chain: string[] = [];
    let cur: string | undefined = id;
    while (cur !== undefined) {
      chain.push(cur);
      cur = parentOf.get(cur);
    }
    return chain;
  };

  /**
   * Resolve the node that an edge endpoint should attach to so that the edge
   * can actually be rendered by React Flow. Sub-flow edges cannot connect a
   * child node directly to an outside node — they must route through the
   * boundary handle of the nearest common ancestor.
   *
   * Implementation: find the Lowest Common Ancestor (LCA) of `endpoint` and
   * `otherEndpoint`. If the endpoint is nested under the LCA, the edge must
   * attach to the direct child of the LCA on the endpoint's path (the
   * topmost node of that subflow). If there is no recorded common ancestor,
   * attach to the endpoint's root-level ancestor.
   */
  const boundaryNode = (endpoint: string, otherEndpoint: string): string => {
    const selfChain = ancestorChain(endpoint); // [endpoint, parent, grandparent, ...]
    const otherChain = new Set(ancestorChain(otherEndpoint));

    for (let i = 0; i < selfChain.length; i++) {
      if (otherChain.has(selfChain[i])) {
        // selfChain[i] is the LCA.
        if (i === 0) return endpoint; // endpoint is the container itself
        // Climb to the topmost descendant of the LCA on the endpoint's path.
        return selfChain[i - 1];
      }
    }
    // No recorded common ancestor — climb to the endpoint's root-level node.
    return selfChain[selfChain.length - 1];
  };

  const pushHistory = (h: { id: string; type?: 'shallow' | 'deep' }, parentId: string): void => {
    nodes.push({
      id: h.id,
      type: 'history',
      position: { x: 0, y: 0 },
      parentId,
      data: { kind: 'history', label: h.id, scxmlType: h.type },
    });
    parentOf.set(h.id, parentId);
    needsAutoLayout = true;
  };

  const pushTransitions = (
    owner: StateNode | ParallelNode,
    ownerId: string,
    indexShift: number,
  ): void => {
    owner.transitions.forEach((t, i) => {
      const id = readTransitionId(t) ?? transitionEdgeId(ownerId, indexShift + i);
      const firstTarget = (t.target ?? '').split(/\s+/).filter(Boolean)[0] ?? ownerId;

      // Route cross-subflow edges so React Flow can render them: attach each
      // endpoint to the boundary node visible at its nearest shared ancestor.
      const source = boundaryNode(ownerId, firstTarget);
      const target = boundaryNode(firstTarget, ownerId);

      // Back-and-forth transition pairs overlap at the same path midpoint, so
      // we offset the label of ONE direction of the pair to separate them. If
      // both directions were flagged, both labels would shift by the same delta
      // and still collide. Use a deterministic ordering (lexicographic source)
      // so exactly one edge carries the offset.
      const reciprocal = directedPairs.has(`${firstTarget}>${ownerId}`);
      const isReciprocal = firstTarget !== ownerId && reciprocal && ownerId > firstTarget;

      // NOTE: no `sourceHandle`/`targetHandle` here — dynamic handle ids are
      // assigned in `finalizeGraphLayout` once all node positions/dimensions are
      // normalized, so geometry-based routing can use resolved node objects.
      edges.push({
        id,
        source,
        target,
        type: 'transition',
        label: transitionLabel(t),
        markerEnd: EDGE_MARKER,
        data: { event: t.event, cond: t.cond, isReciprocal },
      });
    });
  };

  const pushState = (
    node: StateNodeLike,
    parentId: string | undefined,
    kind: ScxmlNodeKind,
  ): void => {
    const layout = readLayout(node);
    if (!layout) needsAutoLayout = true;

    const containerLike = node as Partial<StateNode>;
    const onentry = summarizeExecutables(containerLike.onentry);
    const onexit = summarizeExecutables(containerLike.onexit);

    nodes.push({
      id: node.id,
      type: nodeTypeFor(kind),
      position: layout ? { x: layout.x, y: layout.y } : { x: 0, y: 0 },
      parentId,
      data: {
        kind,
        scxmlType: 'type' in node && node.type ? node.type : undefined,
        label: node.id,
        ...((onentry.length || onexit.length) && {
          actions: {
            ...(onentry.length ? { onentry } : {}),
            ...(onexit.length ? { onexit } : {}),
          },
        }),
      },
    });
    parentOf.set(node.id, parentId);

    const container = node as StateNode | ParallelNode;
    const isStateContainer = 'states' in container;

    if (isStateContainer) {
      const allChildren: StateNodeLike[] = [
        ...container.states,
        ...container.parallels,
        ...container.finals,
      ];
      for (const child of allChildren) {
        const childKind = determineKind(child);
        pushState(child, node.id, childKind);
      }
      for (const h of container.history) {
        pushHistory(h, node.id);
      }
      pushTransitions(container, node.id, 0);
    }
  };

  const determineKind = (child: StateNodeLike): ScxmlNodeKind => {
    // FinalNode has no `states`/`transitions` containers; ParallelNode does.
    if (!('states' in child) && !('parallels' in child)) {
      return 'final';
    }
    if ('states' in child) {
      const s = child as StateNode;
      if (s.states?.length || s.parallels?.length || s.finals?.length) return 'compound';
    }
    return 'atomic';
  };

  doc.scxml.states.forEach((s) => pushState(s, undefined, isCompound(s) ? 'compound' : 'atomic'));
  doc.scxml.parallels.forEach((p) => pushState(p, undefined, 'parallel'));
  doc.scxml.finals.forEach((f) => pushState(f, undefined, 'final'));

  const initialId = doc.scxml.initial ?? doc.scxml.states[0]?.id; // fall back to first state
  const result = finalizeGraphLayout(nodes, edges, initialId);
  return { ...result, needsAutoLayout };
}

/**
 * Post-normalization graph pass. Enforces the coordinate contract, synthesizes
 * the `__initial__` indicator, and assigns dynamic, geometry-based handles to
 * every transition edge.
 *
 * Must run AFTER `normalizeNodesForReactFlow` so that:
 *   - child positions are relative and dimensions are resolved (for the dot).
 *   - `getOptimalHandles` computes from final node geometry, not raw global coords.
 *
 * Pseudo-nodes (`__`-prefixed, e.g. the indicator) are excluded from handle
 * assignment; the indicator's own edge uses the fixed `source-right` →
 * `target-left` pair.
 */
export function finalizeGraphLayout(
  rawNodes: ScxmlFlowNode[],
  rawEdges: Edge[],
  initialTargetId?: string,
): { nodes: ScxmlFlowNode[]; edges: Edge[] } {
  // 1. Normalize coordinates + fallback dimensions.
  const nodes = normalizeNodesForReactFlow(rawNodes);
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  // 2. Synthesize the __initial__ indicator after normalization so the dot can
  //    use the target's resolved dimensions/position.
  const edges = [...rawEdges];
  if (initialTargetId && nodeMap.has(initialTargetId)) {
    const target = nodeMap.get(initialTargetId)!;
    const targetHeight = target.height ?? DEFAULT_NODE_HEIGHT;
    const dotSize = 16;
    const indicatorId = '__initial__';
    const indicatorX = target.position.x - 50;
    const indicatorY = target.position.y + targetHeight / 2 - dotSize / 2;

    nodes.push({
      id: indicatorId,
      type: 'initialIndicator',
      position: { x: indicatorX, y: indicatorY },
      data: { kind: 'initialIndicator', label: initialTargetId },
    });
    edges.push({
      id: '__initial__:0',
      source: indicatorId,
      target: initialTargetId,
      sourceHandle: HANDLE_RIGHT,
      targetHandle: TARGET_LEFT,
      type: 'transition',
      markerEnd: EDGE_MARKER,
    });
  }

  // 3. Assign dynamic handle ids to every non-pseudo transition edge.
  const updatedEdges = edges.map((edge) => {
    if (edge.id.startsWith('__')) return edge;
    const sourceNode = nodeMap.get(edge.source);
    const targetNode = nodeMap.get(edge.target);
    if (!sourceNode || !targetNode) return edge;

    const handles = getOptimalHandles(sourceNode, targetNode);
    return {
      ...edge,
      sourceHandle: handles.sourceHandle,
      targetHandle: handles.targetHandle,
    };
  });

  return { nodes, edges: updatedEdges };
}
