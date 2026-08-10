Looking at the screenshot, there are three primary visual bugs causing the layout to break:

1. **Edge Label Container Stretched (The full-width black bars)**: The label wrapper inside `TransitionEdge.tsx` is expanding to `width: 100%` across the DOM parent instead of being pinned to the midpoint of the edge path via `@xyflow/react`'s `EdgeLabelRenderer`.
2. **Bezier Curve Spaghetti**: Edges are using standard bezier curves with static handles on the four card sides, causing back-and-forth transitions (e.g., between `idle` and `running`) to loop through node bodies.
3. **Unbound ELK Routing**: ELK is currently treating edges as straight lines/splines without orthogonal constraints or sufficient layer separation.

Here is how to upgrade your visual canvas to reach parity with **Stately.ai**.

---

### 1. Fix the Edge Label Bug (`TransitionEdge.tsx`)

The giant black bars happen when an edge label element lacks `position: absolute`, `transform`, and inline-block bounds. In `@xyflow/react` (v12), use `EdgeLabelRenderer` combined with `getSmoothStepPath` or `getBezierPath`:

```tsx
import React from "react";
import {
  EdgeProps,
  getSmoothStepPath,
  EdgeLabelRenderer,
  BaseEdge,
} from "@xyflow/react";

export const TransitionEdge: React.FC<EdgeProps> = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  style,
  markerEnd,
}) => {
  // 1. Compute orthogonal / smooth step edge path + midpoint label coordinates
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 8,
  });

  return (
    <>
      <BaseEdge id={id} path={edgePath} style={style} markerEnd={markerEnd} />

      {/* 2. Render label in HTML portal over canvas */}
      {data?.event && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: "all",
            }}
            className="nodrag nopan inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-slate-900 border border-slate-700 shadow-lg text-xs font-mono text-slate-200 hover:border-slate-500 transition-colors"
          >
            <span className="text-blue-400 font-semibold">{data.event}</span>
            {data.cond && (
              <span className="text-amber-400 text-[10px]">[{data.cond}]</span>
            )}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
};
```

---

### 2. Configure Dynamic Floating Handles & Orthogonal Routing

Static handle anchors on `Top`, `Bottom`, `Left`, and `Right` cause self-loops and reciprocal transitions to cross directly over node bounds.

#### A. Enable Orthogonal Edge Routing in ELK (`elkLayout.ts`)

Update your ELK configuration parameters to force right-angle routing and layer clearance:

```typescript
// src/layout/elkLayout.ts
export const ELK_OPTIONS = {
  "elk.algorithm": "layered",
  "elk.direction": "DOWN", // Or 'RIGHT'
  "elk.edgeRouting": "ORTHOGONAL", // Prevents curves through node centers
  "elk.layered.ortho.straightness": "0.8",
  "elk.spacing.nodeNode": "80", // Horizontal node spacing
  "elk.layered.spacing.nodeNodeBetweenLayers": "100", // Vertical layer spacing
  "elk.padding": "[top=50,left=30,bottom=30,right=30]",
  "elk.layered.nodePlacement.strategy": "BRANDES_KOEPF", // Produces balanced trees
};
```

#### B. Handle Dynamic Connection Points

If two nodes transition back and forth (e.g., `idle` $\leftrightarrow$ `running`), calculate handles dynamically based on relative geometry using React Flow's floating handle pattern:

```typescript
// Helper to pick optimal Handle position based on node centers
export function getParams(sourceNode: Node, targetNode: Node) {
  const sourceCenter = getNodeCenter(sourceNode);
  const targetCenter = getNodeCenter(targetNode);

  // Compute angle to pick Top, Bottom, Left, or Right handle dynamically
  const dx = targetCenter.x - sourceCenter.x;
  const dy = targetCenter.y - sourceCenter.y;

  if (Math.abs(dx) > Math.abs(dy)) {
    return dx > 0
      ? { sourceHandle: "right", targetHandle: "left" }
      : { sourceHandle: "left", targetHandle: "right" };
  }
  return dy > 0
    ? { sourceHandle: "bottom", targetHandle: "top" }
    : { sourceHandle: "top", targetHandle: "bottom" };
}
```

---

### 3. Stately.ai Ergonomics Improvements

To transition the canvas from looking like a generic flowchart to a refined statechart editor:

```
[● Initial Indicator] ──> ( idle ) ──[ start ]──> ┌────────────────────────┐
                                                  │ running                │
                                                  │ ---------------------- │
                                                  │ entry / logStart       │
                                                  │ exit  / cleanup        │
                                                  └────────────────────────┘

```

#### 1. Initial State Indicator (`●`)

SCXML machines have an explicit initial state target (`<scxml initial="idle">` or `<initial><transition target="idle"/></initial>`).

- Add a small pseudo-node (`type: 'initialIndicator'`) rendered as a solid `16px` dot (`●`).
- Draw a single edge pointing from this dot to your initial state (`idle`). This eliminates hanging states at the top of the canvas.

#### 2. Visual State Hierarchy (Card Styling)

- **Header / Type Badge**: Standardize node titles with state type indicators in the top right (`atomic`, `compound`, `parallel`, `final`).
- **Internal State Actions**: Add an action list section inside state nodes to display `<onentry>` and `<onexit>` scripts directly inside the state box.
- **Compound State Padding**: When a state contains sub-states (`parentId`), assign transparent background fills with dotted or dashed borders (`border-dashed border-slate-600`) and a top header label.

#### 3. Distinct Edge Markers

Set `markerEnd={{ type: MarkerType.ArrowClosed, width: 16, height: 16, color: '#64748b' }}` on edges so transition direction is immediately legible without high zoom levels.

### 1. Direct Solutions for the 4 Visual Issues

#### (1) Remove Text Badges (`ATOMIC`, `COMPOUND`)

Relying on distinct border styles and background opacity is cleaner than inline text badges.

- **Fix**: In `AtomicStateNode.tsx` and `CompoundStateNode.tsx`, remove the `<span className="...">ATOMIC</span>` / `<span className="...">COMPOUND</span>` badges.
- **Styling Tokens**:
- **Atomic**: Solid dark border (`border-slate-700 bg-slate-900/90 text-slate-100`).
- **Compound**: Dashed border with container tint (`border-2 border-dashed border-purple-500/40 bg-purple-950/10`).
- **Parallel**: Dotted border with cyan accent (`border-2 border-dotted border-cyan-500/40 bg-cyan-950/10`).
- **Final**: Solid red ring/double-border (`border-2 border-red-500/60 bg-red-950/20`).

---

#### (2) Fix Overlapping Edge Labels (`start` and `cancel`)

`start` (`idle` $\rightarrow$ `running`) and `cancel` (`running` $\rightarrow$ `idle`) follow identical or overlapping orthogonal paths, causing both midpoint badges to render directly on top of each other at `(x, y)`.

- **Fix A (Label Path Offsetting)**: In `TransitionEdge.tsx`, shift the label position along the edge path (`t = 0.35` vs `t = 0.65`) or apply a small perpendicular offset when two states share reciprocal transitions:

```tsx
// Inside TransitionEdge.tsx
const [edgePath, labelX, labelY] = getSmoothStepPath({
  sourceX,
  sourceY,
  sourcePosition,
  targetX,
  targetY,
  targetPosition,
  borderRadius: 8,
});

// Offset inverse/reciprocal edge labels slightly along the perpendicular axis
const isReciprocal = data?.isReciprocal;
const offsetY = isReciprocal ? -14 : 0;

return (
  <>
    <BaseEdge id={id} path={edgePath} style={style} markerEnd={markerEnd} />
    <EdgeLabelRenderer>
      <div
        style={{
          position: "absolute",
          transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY + offsetY}px)`,
          pointerEvents: "all",
        }}
        className="nodrag nopan px-2 py-0.5 rounded bg-slate-900/95 border border-slate-700 text-[11px] font-mono text-blue-300 shadow-md"
      >
        {data?.event}
      </div>
    </EdgeLabelRenderer>
  </>
);
```

- **Fix B (ELK Port Clearance)**: Enable explicit port spacing in `elkLayout.ts` so parallel edges attach to separate offset handles rather than sharing the exact same center handle coordinate:

```typescript
'elk.layered.mergeEdges': 'false',
'elk.spacing.portPort': '20',

```

---

#### (3) Fix Compound State (`running`) Missing Nested States

In your XML, `<state id="processing">` is nested inside `<state id="running">`. It is appearing outside on the canvas due to **coordinate space mismatch**:

1. **React Flow Relative Positioning**: In React Flow v12, a child node (`parentId: "running"`) evaluates its `position: { x, y }` **relative to its parent's top-left corner `(0, 0)**`, not global canvas coordinates.
2. If `<metadata>` saves `processing` at global coordinates `x="180", y="120"`, React Flow places `processing` at `(120+180, 400+120) = (300, 520)`, rendering it way outside `running`.

- **Fix in `scxmlToFlow.ts` & `elkLayout.ts**`:
- **Global $\rightarrow$ Relative Conversion**: When generating React Flow nodes from AST, subtract parent coordinates for child nodes:

$$\text{child.position.x} = \text{child.globalX} - \text{parent.globalX}$$

$$\text{child.position.y} = \text{child.globalY} - \text{parent.globalY}$$

- **Parent Bounding Box Expansion**: Ensure compound parent nodes (`running`) set their `width` and `height` to enclose all child bounding boxes plus padding ($40\text{px}$).

---

#### (4) Replace the Giant Red "O" (`<final>` State)

Line 35 of the XML is `<final id="finished">`. It is currently being rendered as an unstyled, massive red ellipse with an "O" character.

- **Fix**: Align `<final>` with standard statechart/UML notation—render it as a sleek card or a compact double-circle icon (`◎`) with the state `id`:

```tsx
// FinalStateNode.tsx
export const FinalStateNode: React.FC<NodeProps> = ({ data, selected }) => (
  <div
    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900 border-2 border-red-500/70 shadow-lg ${selected ? "ring-2 ring-red-400" : ""}`}
  >
    {/* Concentric Bullseye Icon */}
    <div className="w-4 h-4 rounded-full border-2 border-red-400 flex items-center justify-center">
      <div className="w-2 h-2 rounded-full bg-red-400" />
    </div>
    <span className="font-mono text-xs font-semibold text-slate-200">
      {data.label}
    </span>
  </div>
);
```

---

### 2. Additional UX & Contrast Polish

1. **Title Contrast**: The state title `running` inside the compound box is currently dark purple on dark purple. Use `text-purple-200 font-semibold` for contrast against dark background fills.
2. **Handle Dot Visibility**: Default React Flow connection dots (`Handle`) are cluttering node boundaries. Set handles to `opacity: 0` by default and fade them in (`group-hover:opacity-100`) on node hover.

---

### 3. Deterministic Vitest Layout Testing (Without Browser / DOM)

`elkjs` is written in pure JavaScript/WASM and runs natively in Node.js inside Vitest without `jsdom` or browser rendering.

By supplying fallback node dimensions in `scxmlToFlow.ts` when DOM measurements are absent, you can test graph layout, node overlap, and parent-child containment deterministically.

#### `src/layout/__tests__/elkLayout.test.ts`

```typescript
import { describe, it, expect } from "vitest";
import { parseSCXMLPartial } from "scxml-parser";
import { scxmlToFlow } from "../../bridge/scxmlToFlow";
import { layoutScxmlGraph } from "../elkLayout";

describe("ELK Layout Engine (Node environment)", () => {
  it("calculates deterministic layout and parent-child containment", async () => {
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

    const { ast } = parseSCXMLPartial(scxml);
    const { nodes: rawNodes, edges } = scxmlToFlow(ast!);

    // Run ELK layout in pure Node
    const layoutNodes = await layoutScxmlGraph(rawNodes, edges);

    const idle = layoutNodes.find((n) => n.id === "idle")!;
    const running = layoutNodes.find((n) => n.id === "running")!;
    const processing = layoutNodes.find((n) => n.id === "processing")!;

    // 1. Assert coordinates are non-zero numbers
    expect(idle.position.x).toBeTypeOf("number");
    expect(running.position.x).toBeTypeOf("number");

    // 2. Assert parent-child containment invariants
    expect(processing.parentId).toBe("running");

    // Relative child coordinates must sit inside parent bounds (> 0 and < parent dimension)
    expect(processing.position.x).toBeGreaterThan(0);
    expect(processing.position.y).toBeGreaterThan(0);
    expect(processing.position.x).toBeLessThan(running.style?.width as number);
    expect(processing.position.y).toBeLessThan(running.style?.height as number);

    // 3. Assert top-level nodes do not overlap (bounding box intersection)
    const idleRight = idle.position.x + (idle.width ?? 140);
    const idleBottom = idle.position.y + (idle.height ?? 60);

    const overlaps =
      idle.position.x < running.position.x + (running.width ?? 160) &&
      idleRight > running.position.x &&
      idle.position.y < running.position.y + (running.height ?? 80) &&
      idleBottom > running.position.y;

    expect(overlaps).toBe(false);
  });
});
```

Your AI agent’s assessment is spot on. Handling compound states in React Flow v12 requires a strict coordinate contract between the SCXML AST and React Flow, along with updates to ELK's node collector.

---

### The Unified Coordinate Contract

To avoid double-offsetting, race conditions, or circular dependencies, enforce a clean separation between the storage layer and the render layer:

| Layer                          | Coordinate Convention                                               | Parent Dimensions                                    |
| ------------------------------ | ------------------------------------------------------------------- | ---------------------------------------------------- |
| **SCXML AST (`<metadata>`)**   | **100% Global** ($X_g, Y_g$)                                        | Saved per state (`width`, `height`)                  |
| **React Flow State (`nodes`)** | **Relative for children** ($X_{rel}, Y_{rel}$ if `parentId` exists) | Driven by `style: { width, height }` on parent nodes |
| **ELK Layout Engine**          | Natively works in **Relative** space for nested children            | Natively computes parent $W, H$ bounding boxes       |

---

### Resolution for Concern 1: Eliminating the Circular Dependency in `scxmlToFlow.ts`

The circular dependency is eliminated because **all coordinates in `<metadata>` are stored as absolute global numbers**.

When converting AST to React Flow nodes, compute parent bounding boxes and child relative positions in a deterministic two-pass approach:

1. **Pass 1 (Collect Global Coords)**: Extract all nodes with their global coordinates ($X_g, Y_g$) and explicit or default dimensions ($W, H$) from `<metadata>`.
2. **Pass 2 (Parent Bounds & Relative Offsets)**:

- For compound parent nodes: if children exist, calculate the parent's global bounding box from the union of all immediate children's global bounding boxes plus padding ($40\text{px}$):

$$X_{parent\_g} = \min(X_{child\_g}) - 40$$

$$Y_{parent\_g} = \min(Y_{child\_g}) - 40$$

$$W_{parent} = \max(X_{child\_g} + W_{child}) - X_{parent\_g} + 40$$

$$H_{parent} = \max(Y_{child\_g} + H_{child}) - Y_{parent\_g} + 40$$

- For child nodes (`parentId` exists): convert global coords to relative coords:

$$X_{rel} = X_{child\_g} - X_{parent\_g}$$

$$Y_{rel} = Y_{child\_g} - Y_{parent\_g}$$

```typescript
// src/bridge/scxmlToFlow.ts (Coordinate Normalization)
export function normalizeNodesForReactFlow(rawNodes: Node[]): Node[] {
  const nodeMap = new Map(rawNodes.map((n) => [n.id, { ...n }]));

  // 1. Calculate parent container bounds for compound states
  for (const node of nodeMap.values()) {
    const children = Array.from(nodeMap.values()).filter(
      (c) => c.parentId === node.id,
    );
    if (children.length > 0) {
      const minX = Math.min(...children.map((c) => c.position.x));
      const minY = Math.min(...children.map((c) => c.position.y));
      const maxX = Math.max(
        ...children.map((c) => c.position.x + (c.width ?? 140)),
      );
      const maxY = Math.max(
        ...children.map((c) => c.position.y + (c.height ?? 60)),
      );

      const padding = 40;
      const parentX = minX - padding;
      const parentY = minY - padding;
      const parentWidth = maxX - parentX + padding;
      const parentHeight = maxY - parentY + padding;

      node.position = { x: parentX, y: parentY };
      node.style = { ...node.style, width: parentWidth, height: parentHeight };
      node.width = parentWidth;
      node.height = parentHeight;
    }
  }

  // 2. Convert child nodes from global to relative coordinates
  for (const node of nodeMap.values()) {
    if (node.parentId) {
      const parent = nodeMap.get(node.parentId);
      if (parent) {
        node.position = {
          x: node.position.x - parent.position.x,
          y: node.position.y - parent.position.y,
        };
      }
    }
  }

  return Array.from(nodeMap.values());
}
```

---

### Resolution for Concern 2: Aligning `elkLayout.ts` to Output Relative Coords & Parent Dimensions

Update `elkLayout.ts` so `collect()` no longer accumulates `offsetX` and `offsetY` on child nodes. Instead, ELK should emit **relative positions** for children and attach explicit `width` and `height` to parent nodes.

#### Updated `elkLayout.ts` Collector

```typescript
// src/layout/elkLayout.ts
import { ElkNode } from "elkjs";
import { Node, Edge } from "@xyflow/react";

export async function layoutScxmlGraph(
  nodes: Node[],
  edges: Edge[],
): Promise<Node[]> {
  const elkGraph = buildElkGraph(nodes, edges);
  const layoutedGraph = await elk.layout(elkGraph);

  const resultMap = new Map<
    string,
    { x: number; y: number; width?: number; height?: number }
  >();

  // Collect positions natively from ELK without accumulating parent offset into child x,y
  function collect(elkNode: ElkNode) {
    if (elkNode.id && elkNode.id !== "root") {
      resultMap.set(elkNode.id, {
        x: elkNode.x ?? 0,
        y: elkNode.y ?? 0,
        width: elkNode.width,
        height: elkNode.height,
      });
    }
    if (elkNode.children) {
      elkNode.children.forEach(collect);
    }
  }

  collect(layoutedGraph);

  return nodes.map((node) => {
    const layout = resultMap.get(node.id);
    if (!layout) return node;

    const isCompound = nodes.some((n) => n.parentId === node.id);

    return {
      ...node,
      position: { x: layout.x, y: layout.y }, // Relative if parentId exists, Global if top-level
      ...(isCompound && layout.width && layout.height
        ? {
            width: layout.width,
            height: layout.height,
            style: {
              ...node.style,
              width: layout.width,
              height: layout.height,
            },
          }
        : {}),
    };
  });
}
```

---

### Writing Back to SCXML `<metadata>` (`flowToScxml.ts`)

When a user drags a child node inside a compound state or moves the parent container, convert the relative position back to a global position before storing it in AST metadata:

```typescript
// src/bridge/flowToScxml.ts
export function persistNodePosition(
  ast: SCXMLDocument,
  nodes: Node[],
  nodeId: string,
  relX: number,
  relY: number,
) {
  const node = nodes.find((n) => n.id === nodeId);
  let globalX = relX;
  let globalY = relY;

  // If node has a parent, add parent's global position to compute absolute AST coordinate
  if (node?.parentId) {
    const parentGlobal = getGlobalPosition(nodes, node.parentId);
    globalX += parentGlobal.x;
    globalY += parentGlobal.y;
  }

  writeLayout(ast, nodeId, { x: globalX, y: globalY });
}

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
```

### Summary of Changes

1. **`scxmlToFlow.ts`**: Converts AST absolute coords into React Flow relative coords for children and auto-calculates parent container dimensions.
2. **`elkLayout.ts`**: Stops adding parent offsets to children in `collect()` and attaches computed `style.width` and `style.height` to parent nodes.
3. **`flowToScxml.ts`**: Converts React Flow relative coords back to AST absolute coords when writing to `<metadata>`.
4. **Vitest Engine**: The Vitest assertion (`processing.position.x < running.style.width`) will pass natively in Node without a browser DOM.

To achieve a cohesive, Stately-grade aesthetic across both the React Flow canvas and Monaco Code Editor, adopt a **semantic dark-mode token system** based on standard slate/zinc neutral tones with functional accents.

Here is a recommended CSS token structure tailored to `scxml-visual-editor`.

---

### 1. `tailwind.config.js` Extended Color Palette

Add this semantic layer to your Tailwind configuration to standardize color roles across nodes, edges, panels, and Monaco:

```javascript
/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // App Shell & Panels
        app: {
          bg: "#09090b", // zinc-950
          surface: "#18181b", // zinc-900
          border: "#27272a", // zinc-800
          hover: "#3f3f46", // zinc-700
        },
        // State Machine Graph Semantics
        node: {
          atomic: {
            bg: "#18181b", // zinc-900
            border: "#3f3f46", // zinc-700
            text: "#f4f4f5", // zinc-100
          },
          compound: {
            bg: "rgba(49, 46, 129, 0.12)", // indigo-950 / 12%
            border: "rgba(99, 102, 241, 0.35)", // indigo-500 / 35%
            header: "#a5b4fc", // indigo-300
          },
          parallel: {
            bg: "rgba(22, 78, 99, 0.12)", // cyan-950 / 12%
            border: "rgba(6, 182, 212, 0.35)", // cyan-500 / 35%
            header: "#67e8f9", // cyan-300
          },
          final: {
            bg: "rgba(136, 19, 55, 0.15)", // rose-950 / 15%
            border: "rgba(244, 63, 94, 0.6)", // rose-500 / 60%
            accent: "#f43f5e", // rose-500
          },
          selected: "#3b82f6", // blue-500 ring
        },
        // Transitions & Badges
        edge: {
          stroke: "#52525b", // zinc-600 default path line
          selected: "#3b82f6", // blue-500 active selection line
          event: "#38bdf8", // sky-400 event text
          cond: "#fbbf24", // amber-400 guard condition text
        },
      },
    },
  },
  plugins: [],
};
```

---

### 2. Global CSS Variables (`src/index.css`)

Expose these variables so non-Tailwind sub-systems (like Monaco themes and React Flow SVG properties) read from the same source of truth:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  /* Canvas Background & Grid */
  --canvas-bg: #09090b;
  --canvas-grid-dots: #27272a;

  /* React Flow SVG Edge Styling */
  --xy-edge-stroke-default: #52525b;
  --xy-edge-stroke-selected: #3b82f6;
  --xy-node-border-radius: 8px;

  /* Monaco Sync Variables */
  --monaco-bg: #09090b;
  --monaco-line-highlight: #18181b;
  --monaco-selection-highlight: #1e3a8a;
}

/* React Flow Overrides for Dark Mode */
.react-flow {
  background-color: var(--canvas-bg) !important;
}

/* Custom dashed container bounds for compound states */
.state-node-compound {
  @apply rounded-xl border-2 border-dashed border-node-compound-border bg-node-compound-bg transition-colors;
}

.state-node-parallel {
  @apply rounded-xl border-2 border-dotted border-node-parallel-border bg-node-parallel-bg transition-colors;
}

/* Smooth active selection outlines */
.react-flow__node.selected .state-card {
  @apply ring-2 ring-node-selected border-transparent;
}
```

---

### 3. Component Token Mapping Matrix

| UI Component          | Token / Classes                                                | Visual Behavior                                     |
| --------------------- | -------------------------------------------------------------- | --------------------------------------------------- |
| **Atomic State**      | `bg-app-surface border border-app-hover shadow-md rounded-lg`  | Solid card, high-contrast title, clean slate finish |
| **Compound State**    | `state-node-compound`                                          | Dashed border with subtle indigo tint container     |
| **Parallel State**    | `state-node-parallel`                                          | Dotted border with subtle cyan tint container       |
| **Final State**       | `border-2 border-rose-500/60 bg-rose-950/20`                   | Concentric red ring with bullseye dot indicator     |
| **Initial Indicator** | `w-3.5 h-3.5 rounded-full bg-blue-500 ring-4 ring-blue-500/20` | Small glowing blue entry dot (`●`)                  |
| **Edge Path Line**    | `stroke: var(--xy-edge-stroke-default), strokeWidth: 2`        | Clean `#52525b` orthogonal line                     |
| **Edge Label Badge**  | `bg-app-bg/95 border border-app-border text-edge-event`        | Compact pill centered on path midpoint              |
| **Guard Condition**   | `text-edge-cond font-mono`                                     | Small amber bracketed text `[cond]` inside badge    |
| **Splitter Handle**   | `bg-app-border hover:bg-blue-500`                              | Thin `2px` vertical divider with hover feedback     |

---

### 4. Monaco Editor Custom Dark Theme Integration

To prevent Monaco from displaying its default bright gray background, define a custom theme on mount in `MonacoEditor.tsx`:

```typescript
// Inside MonacoEditor.tsx onMount callback
import { OnMount } from "@monaco-editor/react";

export const handleEditorWillMount = (monaco: Parameters<OnMount>[1]) => {
  monaco.editor.defineTheme("scxml-dark", {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "tag", foreground: "38bdf8" }, // sky-400 for SCXML tags
      { token: "attribute.name", foreground: "a5b4fc" }, // indigo-300 for attributes
      { token: "attribute.value", foreground: "fbbf24" }, // amber-400 for target/event values
      { token: "comment", foreground: "52525b" }, // zinc-600 for comments
    ],
    colors: {
      "editor.background": "#09090b", // Matches app-bg (zinc-950)
      "editor.lineHighlightBackground": "#18181b", // Matches app-surface
      "editorGutter.background": "#09090b",
      "editorLineNumber.foreground": "#52525b",
      "editorLineNumber.activeForeground": "#f4f4f5",
    },
  });
};
```

This token mapping delivers a high-contrast dark environment where code, canvas elements, and transition labels read clearly without visual clutter.

Both of these visual issues stem from two root causes in the React Flow graph setup:

1. **Unconstrained Handles on the Initial Dot**: The `__initial__` pseudo-node isn't explicitly setting its handle positions or vertical alignment relative to the target state's center, causing `getSmoothStepPath` to loop around to default top/bottom handles.
2. **Missing Handle Orientation / Midpoint Collisions**: Without dynamic handle assignment (`sourcePosition` and `targetPosition` based on relative node geometry), React Flow routes edges through default handles, causing paths to cross state borders and label badges (`start`, `cancel`, `done`) to stack on top of node boundaries.

Here is how to resolve both issues in `scxmlToFlow.ts` and `TransitionEdge.tsx`.

---

### 1. Fix Initial State (`__initial__`) Alignment & Handles

In `src/bridge/scxmlToFlow.ts`, explicitly align the `__initial__` dot vertically with the target state's left edge center, and hardcode `sourceHandle: 'right'` and `targetHandle: 'left'`:

```typescript
// src/bridge/scxmlToFlow.ts

if (ast.initial) {
  const targetNode = rawNodes.find((n) => n.id === ast.initial);

  if (targetNode) {
    const dotSize = 16;
    const targetHeight = targetNode.height ?? 60;

    // 1. Position dot centered vertically with target's left edge
    const initialNode: Node = {
      id: "__initial__",
      type: "initialIndicator",
      position: {
        x: targetNode.position.x - 50,
        y: targetNode.position.y + targetHeight / 2 - dotSize / 2,
      },
      data: { label: "" },
    };

    // 2. Explicitly bind handles from right of dot -> left of target
    const initialEdge: Edge = {
      id: "__initial__:0",
      source: "__initial__",
      target: ast.initial,
      sourceHandle: "right",
      targetHandle: "left",
      type: "transition",
      style: { strokeWidth: 2, stroke: "#3b82f6" },
    };

    rawNodes.push(initialNode);
    rawEdges.push(initialEdge);
  }
}
```

---

### 2. Dynamically Assign Source/Target Handles for All Transitions

To prevent edges from looping awkwardly when nodes are stacked or offset, assign optimal handle positions (`left`, `right`, `top`, `bottom`) based on the relative direction between source and target nodes in `scxmlToFlow.ts`:

```typescript
// src/bridge/scxmlToFlow.ts

export function getOptimalHandles(sourceNode: Node, targetNode: Node) {
  const dx = targetNode.position.x - sourceNode.position.x;
  const dy = targetNode.position.y - sourceNode.position.y;

  // Determine primary axis direction
  if (Math.abs(dx) > Math.abs(dy)) {
    // Horizontal alignment
    return dx > 0
      ? { sourceHandle: "right", targetHandle: "left" }
      : { sourceHandle: "left", targetHandle: "right" };
  } else {
    // Vertical alignment
    return dy > 0
      ? { sourceHandle: "bottom", targetHandle: "top" }
      : { sourceHandle: "top", targetHandle: "bottom" };
  }
}
```

Apply `getOptimalHandles` when building transition edges in `scxmlToFlow.ts`:

```typescript
const handles = getOptimalHandles(sourceNode, targetNode);

edges.push({
  id: transitionId,
  source: trans.sourceId,
  target: trans.target,
  sourceHandle: handles.sourceHandle,
  targetHandle: handles.targetHandle,
  type: "transition",
  data: { event: trans.event, cond: trans.cond },
});
```

---

### 3. Ensure Custom Nodes Support Multi-Directional Handles

Ensure `AtomicStateNode.tsx`, `CompoundStateNode.tsx`, and `ParallelNode.tsx` render four handles (one on each side) with explicit `id`s so React Flow can anchor to them cleanly:

```tsx
// Inside state node components (AtomicStateNode.tsx, etc.)
import { Handle, Position } from "@xyflow/react";

export function StateNodeContainer({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative">
      <Handle
        id="top"
        type="target"
        position={Position.Top}
        className="!bg-zinc-600 opacity-0 group-hover:opacity-100"
      />
      <Handle
        id="top"
        type="source"
        position={Position.Top}
        className="!bg-zinc-600 opacity-0 group-hover:opacity-100"
      />

      <Handle
        id="bottom"
        type="target"
        position={Position.Bottom}
        className="!bg-zinc-600 opacity-0 group-hover:opacity-100"
      />
      <Handle
        id="bottom"
        type="source"
        position={Position.Bottom}
        className="!bg-zinc-600 opacity-0 group-hover:opacity-100"
      />

      <Handle
        id="left"
        type="target"
        position={Position.Left}
        className="!bg-zinc-600 opacity-0 group-hover:opacity-100"
      />
      <Handle
        id="left"
        type="source"
        position={Position.Left}
        className="!bg-zinc-600 opacity-0 group-hover:opacity-100"
      />

      <Handle
        id="right"
        type="target"
        position={Position.Right}
        className="!bg-zinc-600 opacity-0 group-hover:opacity-100"
      />
      <Handle
        id="right"
        type="source"
        position={Position.Right}
        className="!bg-zinc-600 opacity-0 group-hover:opacity-100"
      />

      {children}
    </div>
  );
}
```

---

### 4. Edge Label Badge Offset Guard in `TransitionEdge.tsx`

To keep labels like `cancel` and `start` from stacking when edges run parallel or overlap:

```tsx
// src/canvas/edges/TransitionEdge.tsx
import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  EdgeProps,
} from "@xyflow/react";

export function TransitionEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  markerEnd,
  style,
}: EdgeProps) {
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 8,
  });

  const eventText = data?.event as string | undefined;
  const condText = data?.cond as string | undefined;

  if (!eventText && !condText) {
    return (
      <BaseEdge id={id} path={edgePath} markerEnd={markerEnd} style={style} />
    );
  }

  return (
    <>
      <BaseEdge id={id} path={edgePath} markerEnd={markerEnd} style={style} />
      <EdgeLabelRenderer>
        <div
          style={{
            position: "absolute",
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            pointerEvents: "all",
          }}
          className="nodrag nopan flex items-center gap-1 rounded bg-zinc-950/90 px-1.5 py-0.5 text-xs border border-zinc-800 shadow-md"
        >
          {eventText && (
            <span className="font-mono text-sky-400">{eventText}</span>
          )}
          {condText && (
            <span className="font-mono text-amber-400">[{condText}]</span>
          )}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
```

### Summary of Result

- The **blue initial dot** will point straight into `idle` via a clean horizontal vector from the left.
- Transitions like `running -> idle` (`cancel`) and `idle -> running` (`start`) will detach onto distinct handles (e.g., top/bottom or left/right), preventing edge paths from crossing through state node bounds.
- Edge label badges will center cleanly on straight segment midpoints.

Here are the answers to your questions and a concrete resolution strategy for the high-impact architectural concerns.

---

### Answers to Your Questions

#### 1. Boundary Routing vs. Dynamic Handles

Apply dynamic handle calculation based on the geometry of the **actual connected source and target nodes** after layout/normalization. Ensure every node type (including compound containers and LCA boundary nodes) implements the exact same 8-handle interface. This prevents missing-handle runtime errors (React Flow Error #008) regardless of whether an edge anchors to an inner state or an LCA container.

#### 2. Handle ID Naming

Namespace all handle IDs explicitly by type and direction:

- **Source Handles:** `source-top`, `source-bottom`, `source-left`, `source-right`
- **Target Handles:** `target-top`, `target-bottom`, `target-left`, `target-right`

While React Flow differentiates handles by `(type, id)` tuple, namespacing avoids edge ambiguity during programmatic updates and interactive manual connections.

#### 3. Initial Dot Placement Timing

Compute the `__initial__` node’s coordinates **inside or immediately after `normalizeNodesForReactFlow**`, never before. By deriving the dot’s position after the target state’s dimensions ($W, H$) and normalized coordinates ($X, Y$) are resolved, the dot stays vertically centered and aligned with the target state's left edge ($X_{dot} = X_{target} - 50$, $Y_{dot} = Y_{target} + H_{target}/2 - 8$).

#### 4. Scope Across Node Kinds

Apply the 8-handle layout across **all** node types (`AtomicStateNode`, `CompoundStateNode`, `ParallelNode`, `HistoryNode`) via a shared wrapper component (`StateNodeWrapper`). The `__initial__` indicator only needs a single `source-right` handle.

#### 5. Priority & Goal Alignment

The primary goal is visual clarity—preventing edges from clipping through state bodies, separating reciprocal label badges, and aligning the start dot. Namespacing handles and calculating them post-normalization solves both visual clipping and manual interaction reliability without refactoring the underlying AST sync engine.

---

### Resolution Strategy for High-Impact Concerns

#### Resolving Concern #1 & #3: Post-Normalization Handle & Position Calculation

Update `scxmlToFlow.ts` so `pushTransitions` stores raw transitions without computing handle IDs prematurely. Instead, calculate optimal handles and synthesize `__initial__` in a post-normalization pass once all absolute/relative node coordinates and dimensions are established.

```typescript
// src/bridge/scxmlToFlow.ts

export function getOptimalHandles(
  sourceNode: Node,
  targetNode: Node,
): { sourceHandle: string; targetHandle: string } {
  // Use relative or absolute coordinates consistently for delta vector
  const dx = targetNode.position.x - sourceNode.position.x;
  const dy = targetNode.position.y - sourceNode.position.y;

  if (Math.abs(dx) > Math.abs(dy)) {
    return dx > 0
      ? { sourceHandle: "source-right", targetHandle: "target-left" }
      : { sourceHandle: "source-left", targetHandle: "target-right" };
  } else {
    return dy > 0
      ? { sourceHandle: "source-bottom", targetHandle: "target-top" }
      : { sourceHandle: "source-top", targetHandle: "target-bottom" };
  }
}

export function finalizeGraphLayout(
  nodes: Node[],
  edges: Edge[],
  initialTargetId?: string,
): { nodes: Node[]; edges: Edge[] } {
  // 1. Normalize node coordinates and fallback dimensions
  const normalizedNodes = normalizeNodesForReactFlow(nodes);
  const nodeMap = new Map(normalizedNodes.map((n) => [n.id, n]));

  // 2. Synthesize __initial__ indicator post-normalization
  if (initialTargetId && nodeMap.has(initialTargetId)) {
    const target = nodeMap.get(initialTargetId)!;
    const targetHeight = target.height ?? 60;
    const dotSize = 16;

    const initialNode: Node = {
      id: "__initial__",
      type: "initialIndicator",
      position: {
        x: target.position.x - 50,
        y: target.position.y + targetHeight / 2 - dotSize / 2,
      },
      data: { label: "" },
    };

    const initialEdge: Edge = {
      id: "__initial__:0",
      source: "__initial__",
      target: initialTargetId,
      sourceHandle: "source-right",
      targetHandle: "target-left",
      type: "transition",
      style: { strokeWidth: 2, stroke: "#3b82f6" },
    };

    normalizedNodes.push(initialNode);
    edges.push(initialEdge);
  }

  // 3. Assign dynamic handle IDs to transition edges using resolved node objects
  const updatedEdges = edges.map((edge) => {
    if (edge.id.startsWith("__initial__")) return edge;

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

  return { nodes: normalizedNodes, edges: updatedEdges };
}
```

---

#### Resolving Concern #2 & #6: Universal `StateNodeWrapper`

Wrap all state node renderers (`Atomic`, `Compound`, `Parallel`, `History`) with a reusable component that mounts all 8 namespaced handles. Using CSS rules ensures handles remain invisible until hovered while keeping DOM footprint low.

```tsx
// src/components/canvas/nodes/StateNodeWrapper.tsx
import React from "react";
import { Handle, Position } from "@xyflow/react";

interface Props {
  children: React.ReactNode;
  className?: string;
}

export function StateNodeWrapper({ children, className = "" }: Props) {
  return (
    <div className={`group relative ${className}`}>
      {/* Target Handles */}
      <Handle
        id="target-top"
        type="target"
        position={Position.Top}
        className="!bg-blue-500 opacity-0 group-hover:opacity-100"
      />
      <Handle
        id="target-bottom"
        type="target"
        position={Position.Bottom}
        className="!bg-blue-500 opacity-0 group-hover:opacity-100"
      />
      <Handle
        id="target-left"
        type="target"
        position={Position.Left}
        className="!bg-blue-500 opacity-0 group-hover:opacity-100"
      />
      <Handle
        id="target-right"
        type="target"
        position={Position.Right}
        className="!bg-blue-500 opacity-0 group-hover:opacity-100"
      />

      {/* Source Handles */}
      <Handle
        id="source-top"
        type="source"
        position={Position.Top}
        className="!bg-blue-500 opacity-0 group-hover:opacity-100"
      />
      <Handle
        id="source-bottom"
        type="source"
        position={Position.Bottom}
        className="!bg-blue-500 opacity-0 group-hover:opacity-100"
      />
      <Handle
        id="source-left"
        type="source"
        position={Position.Left}
        className="!bg-blue-500 opacity-0 group-hover:opacity-100"
      />
      <Handle
        id="source-right"
        type="source"
        position={Position.Right}
        className="!bg-blue-500 opacity-0 group-hover:opacity-100"
      />

      {children}
    </div>
  );
}
```

---

### Implementation Verification Checklist

1. **Error #008 Prevention**: Every custom React Flow node component must use `StateNodeWrapper` to guarantee `target-left`, `target-right`, `target-top`, `target-bottom`, `source-left`, `source-right`, `source-top`, and `source-bottom` exist on all rendered nodes.
2. **Initial Dot Alignment**: Verify the blue start indicator (`__initial__`) sits $50\text{px}$ to the left of its target state and perfectly aligned with the horizontal midpoint of the state container.
3. **Vitest Unit Test**: Add a test in `scxmlToFlow.test.ts` verifying that `getOptimalHandles` returns correct namespaced handle strings based on relative node positions.
