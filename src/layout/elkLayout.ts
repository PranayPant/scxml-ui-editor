import type { Edge, Node } from '@xyflow/react';
import ELK from 'elkjs/lib/elk.bundled.js';

const elk = new ELK();

export interface LayoutOptions {
  direction?: 'RIGHT' | 'DOWN';
  nodeSpacing?: number;
  layerSpacing?: number;
}

interface ElkNode {
  id: string;
  width?: number;
  height?: number;
  /** Populated by ELK after layout runs. */
  x?: number;
  y?: number;
  children?: ElkNode[];
  layoutOptions?: Record<string, string>;
}

interface ElkEdge {
  id: string;
  sources: string[];
  targets: string[];
}

/**
 * Recommended ELK layered options for statecharts: force orthogonal edge
 * routing so transitions run as right-angle lines (never through node bodies)
 * and add generous layer separation for legible reciprocal transitions.
 */
export const ELK_OPTIONS: Record<string, string> = {
  'elk.algorithm': 'layered',
  // "elk.direction" is injected per-call from `options.direction`.
  'elk.edgeRouting': 'ORTHOGONAL',
  'elk.layered.ortho.straightness': '0.8',
  'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
  'elk.layered.crossingMinimization.semiInteractive': 'true',
  // Keep reciprocal edges separate so layouts don't merge the two directions
  // into one line, and give ports clearance so they don't share one handle.
  'elk.layered.mergeEdges': 'false',
  'elk.spacing.portPort': '20',
  'elk.spacing.nodeNode': '80',
  'elk.layered.spacing.nodeNodeBetweenLayers': '100',
  'elk.padding': '[top=50,left=30,bottom=30,right=30]',
};

/**
 * Auto-layout a set of React Flow nodes/edges into the ELK "layered" compound
 * graph format, run the layout, then map resulting positions back onto nodes.
 *
 * Compound (nested) states become ELK parent nodes via `parentId` so the
 * layout computes padding + child positioning in a single pass.
 */
export async function layoutScxmlGraph(
  nodes: Node[],
  edges: Edge[],
  options: LayoutOptions = {},
): Promise<Node[]> {
  const direction = options.direction ?? 'RIGHT';
  const nodeSpacing = options.nodeSpacing ?? 80;
  const layerSpacing = options.layerSpacing ?? 100;

  // Pseudo-nodes (e.g. the `__initial__` indicator) use a reserved "__" id
  // prefix and are excluded from auto-layout: they're positioned relative to
  // a real state by `scxmlToFlow` and would otherwise be given their own
  // ELK slot (and their entry edge would distort the layered layout).
  const isPseudo = (id: string) => id.startsWith('__');
  const realNodes = nodes.filter((n) => !isPseudo(n.id));
  const pseudoIds = new Set(nodes.filter((n) => isPseudo(n.id)).map((n) => n.id));
  const realEdges = edges.filter((e) => !pseudoIds.has(e.source) && !pseudoIds.has(e.target));

  // Build ELK child nodes for every node; nested ones become children of a
  // parent container (keyed by parentId).
  const children = new Map<string, ElkNode[]>();

  const nodeMap = new Map(realNodes.map((n) => [n.id, n]));

  const ensureContainer = (parentId: string): ElkNode[] => {
    let arr = children.get(parentId);
    if (!arr) {
      arr = [];
      children.set(parentId, arr);
    }
    return arr;
  };

  const buildElkNode = (node: Node): ElkNode => {
    // v12 stored dimensions live in node.measured (fall back to v11-style width/height).
    const width = node.measured?.width ?? node.width;
    const height = node.measured?.height ?? node.height;

    const elkNode: ElkNode = {
      id: node.id,
      ...(width !== undefined ? { width } : {}),
      ...(height !== undefined ? { height } : {}),
    };

    if (node.parentId) {
      ensureContainer(node.parentId).push(elkNode);
    } else {
      ensureContainer('__root__').push(elkNode);
    }

    // Recurse for any explicit children already represented in the node data.
    const nested = node.data?.children as Node[] | undefined;
    if (nested) {
      elkNode.children = nested.map(buildElkNode);
    }
    return elkNode;
  };

  realNodes.forEach(buildElkNode);

  const elkGraph = {
    id: 'root',
    layoutOptions: {
      ...ELK_OPTIONS,
      'elk.direction': direction,
      'elk.spacing.nodeNode': String(nodeSpacing),
      'elk.layered.spacing.nodeNodeBetweenLayers': String(layerSpacing),
    },
    children: children.get('__root__') ?? [],
    edges: realEdges
      .filter((e) => nodeMap.has(e.source) && nodeMap.has(e.target))
      .map<ElkEdge>((e) => ({
        id: e.id,
        sources: [e.source],
        targets: [e.target],
      })),
  };

  // Add container nodes that group nested children.
  for (const [parentId, childList] of children.entries()) {
    if (parentId === '__root__') continue;
    const parent = nodeMap.get(parentId);
    if (!parent) continue;
    const parentElk: ElkNode = {
      id: parentId,
      ...(parent.measured?.width
        ? { width: parent.measured.width }
        : parent.width
          ? { width: parent.width }
          : {}),
      ...(parent.measured?.height
        ? { height: parent.measured.height }
        : parent.height
          ? { height: parent.height }
          : {}),
      children: childList,
    };
    // Top-level containers belong to root; nested ones go under their parent.
    ensureContainer(parent.parentId ?? '__root__').push(parentElk);
  }

  const layout = await elk.layout(elkGraph);

  // Collect ELK output natively. Crucially, do NOT accumulate parent offsets
  // into child coordinates: ELK emits a child's `x`/`y` relative to its parent
  // container, which is exactly the relative coordinate React Flow expects for
  // nodes with a `parentId`. Top-level nodes carry global coordinates.
  const result = new Map<string, { x: number; y: number; width?: number; height?: number }>();
  const collect = (node: ElkNode) => {
    if (node.id && node.id !== 'root') {
      result.set(node.id, {
        x: node.x ?? 0,
        y: node.y ?? 0,
        width: node.width,
        height: node.height,
      });
    }
    for (const child of node.children ?? []) collect(child);
  };
  collect(layout);

  return realNodes.map((n) => {
    const layoutResult = result.get(n.id);
    if (!layoutResult) return n;

    // A node is a compound parent if any other node references it via parentId.
    const isCompound = realNodes.some((m) => m.parentId === n.id);

    return {
      ...n,
      position: { x: layoutResult.x, y: layoutResult.y },
      ...(isCompound && layoutResult.width && layoutResult.height
        ? {
            width: layoutResult.width,
            height: layoutResult.height,
            style: {
              ...(n.style ?? {}),
              width: layoutResult.width,
              height: layoutResult.height,
            },
          }
        : {}),
    };
  });
}
