import type { Node } from "@xyflow/react";
import {
  addState,
  addTransition,
  removeState,
  removeTransition,
  renameState,
  type SCXMLDocument,
  type StateNodeLike,
  type Transition,
  walkTransitions,
} from "scxml-parser";
import {
  collectStateNodes,
  writeLayout,
  writeTransitionId,
} from "./metadataRegistry";
import { transitionEdgeId } from "./scxmlToFlow";
import { logger } from "@/plugins/tracing/logger";
import { tracer, withSpanSync } from "@/plugins/tracing/withSpan";

/**
 * Translate React Flow / canvas interactions into `scxml-parser` AST
 * mutations, keeping the SCXML document as the single source of truth.
 * All functions mutate the AST in place; callers re-serialize + re-render.
 */

/** Reconstruct a node's global (canvas) position by summing its relative
 * position with every ancestor's position up the `parentId` chain. */
function getGlobalPosition(
  nodes: Node[],
  nodeId: string,
): { x: number; y: number } {
  const node = nodes.find((n) => n.id === nodeId);
  if (!node) return { x: 0, y: 0 };
  if (node.parentId) {
    const parentPos = getGlobalPosition(nodes, node.parentId);
    return {
      x: node.position.x + parentPos.x,
      y: node.position.y + parentPos.y,
    };
  }
  return { x: node.position.x, y: node.position.y };
}

/**
 * Persist the final drag position of a node into its <metadata> coordinates.
 *
 * React Flow reports a dragged child's `position` relative to its parent, but
 * the AST stores **global** coordinates (per the coordinate contract). We
 * therefore add back the ancestor chain's global offset before writing.
 */
export function persistNodePosition(
  doc: SCXMLDocument,
  nodes: Node[],
  nodeId: string,
  x: number,
  y: number,
): void {
  logger.debug("persistNodePosition", { nodeId, x, y });
  withSpanSync(tracer, "persistNodePosition", () => {
    const target = collectStateNodes(doc).find((n) => n.id === nodeId);
    if (!target) return;

    // Preserve the node's ancestry when synthesizing its entry, so a nested
    // child's relative position is correctly converted back to global: without
    // `parentId`, `getGlobalPosition` would omit the ancestor offset and write
    // the wrong AST coordinates on drag.
    const existingNode = nodes.find((n) => n.id === nodeId);

    const global = getGlobalPosition(
      [
        ...nodes.filter((n) => n.id !== nodeId),
        {
          id: nodeId,
          position: { x, y },
          parentId: existingNode?.parentId,
        } as Node,
      ],
      nodeId,
    );

    const existing = target.metadata.find((m) => m.tag === "ui:layout");
    const attrs: Record<string, string> = existing
      ? { ...existing.attributes }
      : { x: "0", y: "0" };
    writeLayout(target, {
      x: global.x,
      y: global.y,
      width: num(attrs.width),
      height: num(attrs.height),
    });
  });
}

/** Draw a new transition from source -> target with an optional event. */
export function connectStates(
  doc: SCXMLDocument,
  sourceId: string,
  targetId: string,
  event?: string,
): Transition | null {
  logger.debug("connectStates", { sourceId, targetId, event });
  return withSpanSync(tracer, "connectStates", () => {
    try {
      const t = addTransition(doc, sourceId, targetId, event);
      // Persist a stable transition id. `addTransition` always assigns the
      // transition's `id`, so we record it verbatim; the fallback keeps the type
      // total without depending on parser internals.
      writeTransitionId(t, t.id ?? transitionEdgeId(sourceId, t.target ?? ""));
      return t;
    } catch {
      return null;
    }
  });
}

/** Remove a state and prune dangling references/targets. */
export function deleteState(doc: SCXMLDocument, stateId: string): void {
  withSpanSync(tracer, "deleteState", () => {
    logger.debug("deleteState", { stateId });
    removeState(doc, stateId);
  });
}

export function deleteEdge(doc: SCXMLDocument, edgeId: string): void {
  withSpanSync(tracer, "deleteEdge", () => {
    logger.debug("deleteEdge", { edgeId });
    removeTransition(doc, edgeId);
  });
}

/**
 * Set (or clear) the label — the `event` trigger and optional `cond` guard —
 * on the transition identified by its stable edge id. `walkTransitions`
 * locates the transition wherever it lives (state / parallel / initial /
 * history). An empty `event` clears the trigger so an unlabeled edge renders
 * without a badge.
 */
export function setTransitionLabel(
  doc: SCXMLDocument,
  edgeId: string,
  event: string,
  cond?: string,
): void {
  withSpanSync(tracer, "setTransitionLabel", () => {
    logger.debug("setTransitionLabel", { edgeId, event, cond });
    walkTransitions(doc, (t) => {
      if (t.id !== edgeId) return;
      if (event === undefined || event === "") {
        delete t.event;
      } else {
        t.event = event;
      }
      if (cond === undefined || cond === "") {
        delete t.cond;
      } else {
        t.cond = cond;
      }
    });
  });
}

/** Rename a state, cascading across transitions/initial refs. */
export function renameStateId(
  doc: SCXMLDocument,
  oldId: string,
  newId: string,
): void {
  withSpanSync(tracer, "renameStateId", () => {
    logger.debug("renameStateId", { oldId, newId });
    renameState(doc, oldId, newId);
  });
}

/**
 * Add a new state node at the root of the document. Supports atomic, compound,
 * parallel-featured, and final-ish placeholders (all modelled as <state>).
 * Returns the created node so callers can persist an initial layout.
 */
export function addStateNode(
  doc: SCXMLDocument,
  id: string,
  kind: "atomic" | "compound" | "parallel" | "final",
): StateNodeLike | null {
  return withSpanSync(tracer, "addStateNode", () => {
    logger.debug("addStateNode", { id, kind });
    try {
      const node = addState(doc, null, { id });
      if (kind === "compound" || kind === "parallel") {
        // Give container nodes an empty children array to host sub-states.
        node.states = node.states ?? [];
        node.parallels = node.parallels ?? [];
        node.finals = node.finals ?? [];
      }
      return node;
    } catch {
      return null;
    }
  });
}

function num(v: string | undefined): number | undefined {
  if (v === undefined || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}
