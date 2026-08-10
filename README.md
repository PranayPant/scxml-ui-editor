# System Architecture: SCXML Visual & Code Editor

This document outlines the high-level component architecture and data-flow specifications for a real-time, two-way synchronized SCXML editor built with **Monaco Editor**, **React Flow**, and **`scxml-parser`**.

---

## 1. Architectural Overview

The application maintains a dual-view paradigm where statecharts can be edited as XML text or visual graph nodes. Synchronization is governed by a unified transactional store acting as the single source of truth for both representations.

```
                  +-----------------------------------+
                  |         Unified Store             |
                  |  (Zustand / React Flow Store)     |
                  +-----------------+-----------------+
                                    |
          +-------------------------+-------------------------+
          |                                                   |
          v                                                   v
+-------------------+                               +-------------------+
|   Monaco Editor   |                               | React Flow Canvas |
|    (Code View)    |                               |   (Visual View)   |
+---------+---------+                               +---------+---------+
          |                                                   |
          | Text Change                                       | Canvas Event
          v                                                   v
+-----------------------------------------------------------------------+
|                       SCXML Bridge & Sync Engine                      |
|                                                                       |
|   +---------------------+   TagRegistry    +----------------------+   |
|   | parseSCXMLPartial() |  ------------->  | Layout / Metadata    |   |
|   | AST Transformer     |  <-------------  | AST Mutators         |   |
|   +---------------------+                  +----------------------+   |
+-----------------------------------------------------------------------+

```

---

## 2. Component Topology

```
src/
├── components/
│   ├── editor/
│   │   ├── EditorShell.tsx             # Root layout container & splitter
│   │   ├── MonacoEditor.tsx            # Monaco code editor wrapper
│   │   └── Toolbar.tsx                 # Global actions (export, format, zoom)
│   ├── canvas/
│   │   ├── ReactFlowCanvas.tsx         # Main React Flow viewport wrapper
│   │   ├── nodes/
│   │   │   ├── AtomicStateNode.tsx     # Custom node for simple states
│   │   │   ├── CompoundStateNode.tsx   # Custom parent node for nested states
│   │   │   ├── ParallelNode.tsx        # Custom node for parallel regions
│   │   │   └── HistoryNode.tsx         # Deep/shallow history node
│   │   ├── edges/
│   │   │   └── TransitionEdge.tsx      # Custom edge with event/condition labels
│   │   └── controls/
│   │       ├── CanvasControls.tsx      # MiniMap, Zoom, FitView
│   │       └── NodePalette.tsx         # Drag-and-drop state creator sidebar
├── bridge/
│   ├── scxmlToFlow.ts                  # AST -> React Flow Node[] & Edge[]
│   ├── flowToScxml.ts                  # React Flow updates -> AST mutations
│   ├── metadataRegistry.ts            # TagRegistry config for coordinates/UI
│   └── sourceMapper.ts                 # AstNode <-> Monaco Range mapper
├── store/
│   ├── useEditorStore.ts               # Central state machine & sync orchestrator
│   └── slices/
│       ├── codeSlice.ts                # Raw XML, Monaco markers, ranges
│       ├── graphSlice.ts               # React Flow nodes, edges, selection
│       └── syncSlice.ts                # Lock state, transaction origins

```

---

## 3. Detailed Component Specifications

### 3.1 Editor Shell (`EditorShell.tsx`)

- **Role**: Primary layout controller utilizing a split-pane interface (e.g., `react-resizable-panels`).
- **Responsibilities**:
- Renders `MonacoEditor` and `ReactFlowCanvas` side by side or stacked.
- Mounts global event listeners for keyboard shortcuts and sync status indicators.

### 3.2 Monaco Editor Container (`MonacoEditor.tsx`)

- **Role**: Textual editing surface backed by Microsoft Monaco Editor.
- **Responsibilities**:
- Binds to `codeSlice.rawXml`.
- Reports user keystrokes with a 200ms debounce to the `SyncEngine`.
- Listens to selection events in the visual canvas to highlight corresponding SCXML line ranges (`scxmlStringRange`).
- Emits Monaco diagnostic markers when `parseSCXMLPartial` encounters syntax errors.

### 3.3 React Flow Canvas Container (`ReactFlowCanvas.tsx`)

- **Role**: Interactive canvas surface rendering statechart topology.
- **Responsibilities**:
- Displays nodes (`State`, `Parallel`, `History`, `Final`) and edges (`Transition`).
- Captures drag, drop, connect, disconnect, and resize actions, delegating them to `flowToScxml.ts`.
- Manages nested/compound states via React Flow sub-flows (`parentId` relationships).
- Listens to cursor/selection changes to highlight active code sections in Monaco.

### 3.4 SCXML Bridge & Adapter Layer

The adapter layer mediates between the DOM/Canvas representations and the `scxml-parser` AST.

#### A. `scxmlToFlow.ts` (Code $\rightarrow$ Visual)

- Calls `parseSCXML` (or `parseSCXMLPartial`).
- Extracts visual coordinates from custom `<metadata>` tags registered via `metadataRegistry.ts`.
- Generates React Flow `Node[]` and `Edge[]`:
- Map `<state>` $\rightarrow$ `AtomicStateNode` or `CompoundStateNode`.
- Map `<transition>` $\rightarrow$ `TransitionEdge` with deterministic ID `source:target_index`.

- Calculates auto-layout positions (using Dagre or Elkjs) for any states lacking visual metadata.

#### B. `flowToScxml.ts` (Visual $\rightarrow$ Code)

- Intercepts React Flow events (`onNodesChange`, `onEdgesChange`, `onConnect`).
- Translates UI interactions directly into `scxml-parser` mutation helpers:
- Node drag end $\rightarrow$ Update `<metadata>` node coordinates in AST.
- Edge draw $\rightarrow$ `addTransition(ast, sourceId, targetId, event)`.
- Node rename $\rightarrow$ `renameState(ast, oldId, newId)` (cascades across all transition targets).
- Node deletion $\rightarrow$ `removeState(ast, stateId)` (cleans dangling targets).

- Serializes the updated AST back into standard SCXML.

#### C. `metadataRegistry.ts`

- Configures `TagRegistry` in `scxml-parser` to handle persistent visual properties inside SCXML `<metadata>`:

```xml
<metadata>
  <ui:layout nodeId="State_A" x="120" y="340" width="180" height="100" />
</metadata>

```

---

## 4. State Management & Sync Lifecycle

### 4.1 Central Store Schema (`useEditorStore`)

```typescript
interface EditorStore {
  // Document State
  rawXml: string;
  ast: SCXMLDocumentNode | null;
  nodes: Node[];
  edges: Edge[];

  // Sync Mechanism
  syncOrigin: "CODE" | "CANVAS" | "IDLE";
  isDirty: boolean;
  parseErrors: SCXMLParseError[];

  // Selection Sync
  selectedNodeId: string | null;
  activeSourceRange: SourceRange | null;

  // Actions
  updateCodeFromUser: (xml: string) => void;
  updateGraphFromUser: (nodes: Node[], edges: Edge[]) => void;
  applyAstMutation: (mutationFn: (ast: SCXMLDocumentNode) => void) => void;
  selectElement: (id: string | null, source: "CODE" | "CANVAS") => void;
}
```

### 4.2 Circular Sync Prevention Protocol

To prevent recursive loops (Code Update $\rightarrow$ Canvas Redraw $\rightarrow$ Canvas Change Event $\rightarrow$ Code Rewrite), synchronization is governed by an explicit transaction state machine.

| Trigger Origin           | `syncOrigin` Flag | Action Sequence                   |
| ------------------------ | ----------------- | --------------------------------- |
| **User types in Monaco** | `CODE`            | 1. Set `syncOrigin = 'CODE'`.<br> |

<br>2. Debounce (200ms).<br>

<br>3. Run `parseSCXMLPartial(xml)`.<br>

<br>4. Update AST and render errors.<br>

<br>5. Diff and patch React Flow `nodes`/`edges` while preserving viewport/selection.<br>

<br>6. Reset `syncOrigin = 'IDLE'`. |
| **User drags/edits Canvas** | `CANVAS` | 1. Set `syncOrigin = 'CANVAS'`.<br>

<br>2. Apply AST mutation helper (`renameState`, `addTransition`, etc.).<br>

<br>3. Serialize AST to SCXML text.<br>

<br>4. Push updated text to Monaco buffer without re-triggering full re-parse.<br>

<br>5. Reset `syncOrigin = 'IDLE'`. |

```
                 +-----------------------+
                 |        IDLE           |
                 +-----------+-----------+
                             |
         User Types          |          Canvas Edit
      (Monaco Change)        |        (Drag / Connect)
                             |
                             v
                 +-----------------------+
                 |  Acquire Transaction  |
                 |  syncOrigin = CODE/UI |
                 +-----------+-----------+
                             |
             +---------------+---------------+
             |                               |
             v                               v
    [Code -> AST Pipeline]         [UI -> AST Pipeline]
    1. Parse (parseSCXMLPartial)   1. Execute AST Mutation
    2. Extract <metadata>          2. Update <metadata>
    3. Patch Flow Nodes/Edges      3. Serialize to XML
             |                               |
             +---------------+---------------+
                             |
                             v
                 +-----------------------+
                 |  Commit & Release     |
                 |  syncOrigin = IDLE    |
                 +-----------------------+

```

---

## 5. Error Handling & Edge Case Strategies

1. **Incomplete Syntax during Typing**

- While the user is actively writing XML, `parseSCXMLPartial` produces a usable AST along with a list of syntax diagnostics.
- The React Flow view retains its last-valid node/edge structure while highlighting broken nodes or displaying a small banner indicating "Live preview paused—syntax error in line X".

2. **Dangling Edges & Missing Targets**

- If a user deletes a state in Monaco that was the target of three other states, `scxml-parser`'s `removeState` mutation helper automatically strips or flags those transitions to prevent canvas crash rendering.

3. **Node Identity Preservation**

- React Flow node state (such as expansion, drag offset, or custom component state) relies on persistent string IDs.
- The system utilizes standard SCXML `id` attributes for node IDs, and fallback `source:target_index` hashes generated by `scxml-parser` for transitions.

## 6. Elkjs

**ELK.js (`elkjs`) is the clear choice for auto-laying out SCXML statecharts.**

Standard flowchart layout tools like Dagre fail on statecharts because SCXML relies heavily on **compound (nested) states** and **parallel regions**. ELK.js is built specifically to handle complex hierarchical graphs.

---

### Comparison Matrix

| Layout Approach | Compound / Nested Support | Edge Routing | Maintenance | Suitability for SCXML |
| --- | --- | --- | --- | --- |
| **ELK.js (`elkjs`)** | **Native & Excellent** | Orthogonal, Spline, Polyline | Active (Eclipse Foundation) | **Best in Class** (Industry standard for Statecharts) |
| **Dagre** | Hacky / Broken | Simple curves | Unmaintained (stale) | **Poor** (Cannot layout nested states reliably) |
| **Cytoscape.js (fCoSE)** | Good (Force-Directed) | Straight / Simple | Active | **Mediocre** (Produces "bubble" layouts, not structured top-to-bottom/left-to-right flow) |
| **Manual Layout Only** | N/A | N/A | N/A | **Unusable** (Importing external XML collapses all nodes at `(0,0)`) |

---

### Why ELK.js Wins for SCXML & React Flow

1. **Native Nesting Support (`elk.layered`)**
SCXML states can contain sub-states (`<state id="parent"><state id="child"/></state>`). ELK accepts parent-child hierarchies natively and computes padding, parent container bounds, and child positioning in a single pass.
2. **Orthogonal Edge Routing**
Transitions in statecharts look cleanest when drawn as right-angle orthogonal lines. ELK’s `layered` layout algorithm routes edges around sibling states and out of parent boundaries cleanly.
3. **Web Worker Offloading**
ELK calculations run asynchronously inside a Web Worker, preventing the Monaco editor or React Flow canvas from freezing during large statechart calculations.
4. **Used by Leading Statechart Tools**
Stately.ai (XState Visualizer), JetBrains, and Eclipse statechart tools use ELK internally for state machine auto-layout.

---

### Recommended Hybrid Strategy for 2-Way Sync

Do **not** run ELK on every keystroke in Monaco, as it will overwrite user-arranged canvas positions. Instead, combine ELK with coordinate persistence:

```
                  +--------------------------------+
                  |    Import or Parse SCXML       |
                  +---------------+----------------+
                                  |
                   Does <metadata> have (x,y)?
                                 / \
                           YES  /   \  NO
                               /     \
                              v       v
            +-------------------+   +-------------------------+
            | Use Saved Coords  |   | Run ELK.js Auto-Layout  |
            +---------+---------+   +------------+------------+
                      |                          |
                      +------------+-------------+
                                   |
                                   v
                    +------------------------------+
                    |  Render React Flow Canvas    |
                    +--------------+---------------+
                                   |
                          User drags a node
                                   v
                    +------------------------------+
                    | Update <metadata> in AST/XML |
                    +------------------------------+

```

1. **On First Import / XML without Layout Metadata**:
* Run `elkjs` to calculate `(x, y)` positions and `(width, height)` for all atomic, compound, and parallel states.
* Write those calculated coordinates back into the SCXML AST's `<metadata>` block.


2. **On Manual Drag**:
* When the user drags a node on the React Flow canvas, update only that state's `<metadata>` coordinates in the AST.


3. **Explicit "Re-layout" Button**:
* Provide an "Auto Layout" toolbar button that re-runs ELK.js across the entire graph to clean up messy diagrams on demand.



---

### Basic ELK.js Integration with React Flow

To pass React Flow nodes to ELK.js, format the React Flow node hierarchy into ELK's expected JSON structure:

```typescript
import ELK from 'elkjs/lib/elk.bundled.js';

const elk = new ELK();

export async function layoutScxmlGraph(nodes: Node[], edges: Edge[]) {
  // 1. Convert React Flow nodes/edges into ELK compound graph format
  const elkGraph = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'RIGHT', // Flow direction: RIGHT or DOWN
      'elk.spacing.nodeNode': '50',
      'elk.layered.spacing.nodeNodeBetweenLayers': '50',
      'elk.padding': '[top=40,left=20,bottom=20,right=20]', // Padding for compound nodes
    },
    children: nodes
      .filter((n) => !n.parentId) // Top-level states
      .map((n) => buildElkNode(n, nodes)),
    edges: edges.map((e) => ({
      id: e.id,
      sources: [e.source],
      targets: [e.target],
    })),
  };

  // 2. Compute layout
  const layout = await elk.layout(elkGraph);

  // 3. Map calculated positions back to React Flow nodes
  return applyElkPositionsToNodes(nodes, layout);
}

```

## 7. react-resizeable-panels

**`react-resizable-panels` is the clear choice for this editor shell.**

While pure CSS Flexbox handles static multi-column layouts well, dynamic interactive splitting in a web-based IDE introduces specific browser edge cases—especially when housing **Monaco Editor** and a **React Flow Canvas**.

---

### Comparison Breakdown

| Feature | `react-resizable-panels` | Pure CSS Flexbox + Custom JS | Legacy Libraries (`react-split`, `react-split-pane`) |
| --- | --- | --- | --- |
| **Monaco & Canvas Event Protection** | **Built-in** (Disables pointer events on children while dragging) | Manual (Requires custom overlays to prevent event-swallowing) | Hit-or-miss |
| **`ResizeObserver` Smoothness** | **Native** (Drives DOM width/height cleanly) | High risk of layout thrashing or sync jitter | Often uses layout-heavy manual reflows |
| **Collapse / Snap Behavior** | **Built-in** (Snap to 0% to maximize editor or canvas) | Complex custom logic and state math | Basic / Clunky |
| **Persistence** | **Built-in** (`autoSaveId` auto-saves layout to `localStorage`) | Manual `localStorage` code | Manual |
| **Accessibility & Keyboard Navigation** | **WAI-ARIA Compliant** (Resize via Arrow keys) | Must build custom ARIA keyboard handlers | Non-standard or missing |
| **Ecosystem Status** | Standard in modern React IDEs (Shadcn UI, StackBlitz) | High maintenance burden | Mostly unmaintained or outdated for React 18+ |

---

### 4 Critical Reasons Why CSS Flexbox / Manual JS Fails for Canvas + Code IDEs

#### 1. The "Pointer Capture Trap"

Monaco Editor and React Flow Canvas listen aggressively to mouse and pointer events. If you build a custom JS drag handle over CSS flex containers, the moment the user drags the splitter handle faster than the frame rate, the mouse cursor hovers over Monaco or the SVG Canvas. Monaco/React Flow immediately "swallows" the `mousemove` and `mouseup` events, causing the splitter to get stuck or freeze.

`react-resizable-panels` automatically applies temporary `pointer-events: none` overlays to panel children during drag operations to prevent this.

#### 2. Clean `ResizeObserver` Triggers

Both Monaco Editor and React Flow depend on container dimensions to recalculate their render surfaces:

* **Monaco**: Requires `editor.layout()` or `automaticLayout: true` (driven by container size updates).
* **React Flow**: Needs container resize triggers to re-center or adjust its viewport bounds.

`react-resizable-panels` mutates panel sizes via performant DOM style updates, allowing `ResizeObserver` inside Monaco and React Flow to observe size changes smoothly without React re-render lag.

#### 3. Panel Collapsing & View Maximizing

In a statechart editor, developers frequently want to toggle between:

* **Split View** (50% Code / 50% Visual)
* **Code Only** (100% Code / 0% Visual)
* **Canvas Only** (0% Code / 100% Visual)

`react-resizable-panels` supports `collapsible={true}` and `minSize={10}` on `<Panel>`, letting users drag the handle all the way to the edge to snap a view shut, or programmatically collapse panels via ref imperative APIs (`panelRef.current.collapse()`).

#### 4. Automatic Layout Persistence

With `autoSaveId="scxml-editor-layout"`, the library automatically remembers the user's preferred panel proportions across page reloads without requiring custom state or `useEffect` hooks.

---

### Recommended `EditorShell.tsx` Implementation

Here is how the `EditorShell` component should be structured using `react-resizable-panels`:

```tsx
import React, { useRef } from 'react';
import { PanelGroup, Panel, PanelResizeHandle, ImperativePanelHandle } from 'react-resizable-panels';
import { MonacoEditor } from './MonacoEditor';
import { ReactFlowCanvas } from './ReactFlowCanvas';
import { Toolbar } from './Toolbar';

export const EditorShell: React.FC = () => {
  const codePanelRef = useRef<ImperativePanelHandle>(null);
  const canvasPanelRef = useRef<ImperativePanelHandle>(null);

  // Helper functions for Toolbar maximize buttons
  const maximizeCode = () => codePanelRef.current?.resize(100);
  const maximizeCanvas = () => canvasPanelRef.current?.resize(100);
  const resetSplit = () => {
    codePanelRef.current?.resize(40);
    canvasPanelRef.current?.resize(60);
  };

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden">
      <Toolbar 
        onMaximizeCode={maximizeCode} 
        onMaximizeCanvas={maximizeCanvas} 
        onResetSplit={resetSplit} 
      />

      <PanelGroup 
        direction="horizontal" 
        autoSaveId="scxml-editor-split"
        className="flex-1"
      >
        {/* Left Panel: Monaco Code Editor */}
        <Panel 
          ref={codePanelRef} 
          defaultSize={40} 
          minSize={15} 
          collapsible={true}
          className="relative"
        >
          <MonacoEditor />
        </Panel>

        {/* Drag Handle */}
        <PanelResizeHandle className="w-2 bg-neutral-200 hover:bg-blue-500 active:bg-blue-600 transition-colors cursor-col-resize flex items-center justify-center">
          <div className="w-1 h-8 bg-neutral-400 rounded-full" />
        </PanelResizeHandle>

        {/* Right Panel: React Flow Canvas */}
        <Panel 
          ref={canvasPanelRef} 
          defaultSize={60} 
          minSize={20} 
          collapsible={true}
          className="relative"
        >
          <ReactFlowCanvas />
        </Panel>
      </PanelGroup>
    </div>
  );
};

```

## 8. React Flow Gotchas with Elkjs

**Yes, that stack is ideal.** Using `@monaco-editor/react` alongside `@xyflow/react` aligns with modern React standards for code-and-canvas interfaces.

Here is why those two specific packages fit the architecture, along with key version-specific nuances to keep in mind:

---

### 1. `@monaco-editor/react`

* **Why it works**: It handles asynchronous loading of the Monaco worker bundle without requiring custom bundler plugins (Vite, Webpack, etc.) or ejecting configs.
* **Key Specs Alignment**:
* **`onMount(editor, monaco)`**: Exposes the direct `editor` instance needed to trigger scrolling and text range highlights when clicking nodes on the React Flow canvas.
* **Diagnostics**: Allows setting syntax error markers directly on the text model when `parseSCXMLPartial` returns parse errors:
```typescript
monaco.editor.setModelMarkers(editor.getModel()!, 'scxml', markers);

```





---

### 2. `@xyflow/react` (React Flow v12)

React Flow v12 officially rebranded its npm package from `reactflow` to `@xyflow/react`.

#### Crucial v12 Gotchas for SCXML & ELK.js Sync:

1. **Measured Node Dimensions (`node.measured`)**
* **v11:** Node dimensions were written to `node.width` and `node.height`.
* **v12:** Calculated node dimensions are stored under `node.measured.width` and `node.measured.height`.
* *Impact on ELK.js Auto-Layout*: When converting React Flow nodes to ELK.js nested graphs, read dimensions from `node.measured?.width ?? node.width` so ELK accurately accounts for custom state node sizes.


2. **Built-in Deletion Handlers (`onDelete`)**
* v12 provides unified `onDelete` callbacks for nodes and edges, making it easy to trigger `scxml-parser`'s `removeState` and `removeTransition` mutators when nodes or connections are erased from the canvas.


3. **Style & Import Syntax**
* Ensure you use named imports and updated CSS paths:
```typescript
import { ReactFlow, useNodesState, useEdgesState } from '@xyflow/react';
import '@xyflow/react/dist/style.css';

```


4. **Nested-Subflow Edge Routing (Cross-Boundary Transitions)**
* A transition from a **child** of a compound/parallel state directly to a state **outside** that subflow cannot be rendered by React Flow — it throws error#008 ("Couldn't create edge"). React Flow only connects between a node and a handle on an **ancestor** boundary.
* **Fix**: when building React Flow edges, route each endpoint through its boundary node — the topmost descendant of the **Lowest Common Ancestor (LCA)** of the two endpoint nodes. For example `processing → finished` (where `processing` is inside `running`) becomes `running → finished`, drawn from `running`'s boundary `source` handle:
  ```
  edge.source = boundaryNode(sourceId, targetId);
  edge.target = boundaryNode(targetId, sourceId);
  ```
  where `boundaryNode(a, b)` returns the LCA-child on `a`'s ancestor path (or `a` itself when `a` is the container).
* **Final nodes must expose handles.** A `<final>` is typically a transition target, so it needs an incoming `target` handle (and an outgoing `source` handle for generality) — otherwise edges into a final state fail with error#008.

5. **TypeScript 7.0 (Native Compiler)**
* `scxml-parser` and the editor both run **TypeScript 7.x** (the native/`tsgo` compiler). TS 7 is stricter than TS 5.x and removed a few options:
* `baseUrl` is **removed** — use relative `paths` instead: `"paths": { "@/*": ["./src/*"] }`.
* CSS side-effect imports (`import "./index.css"`) require type declarations — add a `src/vite-env.d.ts` containing `/// <reference types="vite/client" />` (otherwise TS 7 reports `TS2882`).

---

### Summary Checklist for `package.json`

```json
{
  "dependencies": {
    "@monaco-editor/react": "^4.6.0",
    "@xyflow/react": "^12.0.0",
    "elkjs": "^0.9.0",
    "react-resizable-panels": "^2.0.0",
    "scxml-parser": "latest",
    "zustand": "^4.5.0"
  },
  "devDependencies": {
    "typescript": "^7.0.0"
  }
}

```

Both libraries align with the requirements and provide the hooks needed to handle two-way AST synchronization.

## 9. GitHub as a package manager

If you want to use a GitHub repository as a dependency instead of publishing or downloading it from npm, you can actually install it directly using the npm CLI without setting up Git submodules.
## The Direct npm Approach (Recommended)
You can reference a GitHub repository directly in your package.json file. Run this command in your terminal: [1] 

npm install username/repo-name

This updates your package.json to pull directly from GitHub: [2] 

"dependencies": {
  "package-name": "github:username/repo-name"
}

## Key Differences in This Workflow

* Version Pinning: By default, npm pulls from the main or master branch. You can pin it to a specific release tag, branch, or commit hash using #:

npm install username/repo-name#v1.0.0
npm install username/repo-name#dev
npm install username/repo-name#caba123

[3] 
* The Build Step Gotcha: If the GitHub repository requires a compilation step (like TypeScript to JavaScript) before running, standard npm registries handle this during publishing. When pulling directly from GitHub, ensure the repo either includes the built files in its repository or has a prepare script in its package.json to build the code automatically upon installation. [4] 
* Private Repositories: If the repository is private, anyone running npm install on your project will need configured SSH keys or a personal access token with read access to that GitHub repository. [5, 6] 

Does this GitHub repository belong to you or a third party? I can show you how to structure the package.json build scripts if the code needs compilation. [7, 8] 

[1] [https://www.reddit.com](https://www.reddit.com/r/node/comments/cwn6f9/sharing_code_between_projects_how_do_you_handle/)
[2] [https://www.talentica.com](https://www.talentica.com/blogs/a-step-by-step-guide-to-publishing-private-npm-package-on-github/)
[3] [https://medium.com](https://medium.com/@haroldfinch01/how-to-install-an-npm-package-from-github-directly-d0f916c096b1)
[4] [https://glebbahmutov.com](https://glebbahmutov.com/blog/npm-install-with-just-github/)
[5] [https://medium.com](https://medium.com/pravin-lolage/how-to-use-your-own-package-from-git-repository-as-a-node-module-8b543c13957e)
[6] [https://community.latenode.com](https://community.latenode.com/t/how-to-install-a-particular-git-branch-using-npm-package-manager/32055)
[7] [https://reemus.dev](https://reemus.dev/article/npm-package-best-practices)
[8] [https://daily.dev](https://daily.dev/blog/npm-basics-for-new-developers/)
