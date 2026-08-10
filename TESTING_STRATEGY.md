To achieve 100% coverage on meaningful business logic while eliminating framework noise, your testing strategy must treat the **Zustand store and SCXML Bridge as the primary contract boundary**.

Because your architecture maintains a single source of truth (the SCXML AST) and derives both Monaco and React Flow views from pure functions, **over 80% of your test suite can run in Node without a browser DOM**, executing in milliseconds with zero flaky UI tests.

---

### The Boundary Protocol: What to Test vs. What to Exclude

| Test Target                                    | Included (Meaningful Paths)                                                                                                           | Excluded (Testing Noise)                                             |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| **Bridge Core** (`scxmlToFlow`, `flowToScxml`) | Round-trip mutations, global-to-relative coordinate math, dynamic handle calculations (`getOptimalHandles`), `__initial__` synthesis. | SVG path string parsing, React Flow internal DOM element generation. |
| **Sync Engine** (`useEditorStore`)             | `syncOrigin` loop prevention, transactional rollbacks via `structuredClone`, debounced sync guards, dirty flags.                      | Monaco keybinding handlers, UI split-pane resize events.             |
| **Layout Engine** (`elkLayout`)                | Bounding-box containment, parent width/height derivation (+40px padding), non-overlapping coordinates.                                | `elkjs` web worker messaging, internal graph solver physics.         |
| **Source Mapper** (`sourceMapper`)             | Mapping AST node IDs to Monaco line/column ranges (`SourceRange`).                                                                    | Monaco editor pixel scrolling, DOM viewport offsets.                 |
| **Canvas Components**                          | Verification that `StateNodeWrapper` renders all 8 namespaced handle IDs (`source-top`, `target-left`, etc.).                         | Drag-and-drop mouse movement simulations, canvas zoom pan physics.   |

---

### Pillar 1: Bridge Contract Suite (`src/bridge/__tests__/`)

This suite tests the conversion contract between SCXML AST and React Flow nodes/edges.

#### 1. `scxmlToFlow.test.ts`

- **AST to Graph Generation**: Verify atomic, compound, parallel, and final states convert to their corresponding React Flow node types.
- **Initial State Synthesis**: Assert that when `ast.initial` is defined, an `__initial__` pseudo-node and `__initial__:0` edge are generated, positioned $-50\text{px}$ to the left of the target, and assigned `source-right` $\rightarrow$ `target-left` handles.
- **Namespaced Handle Calculation**: Pass node pairs at varying relative positions to `getOptimalHandles` and assert correct handle output:
- Target to the right $\rightarrow$ `{ sourceHandle: 'source-right', targetHandle: 'target-left' }`
- Target below $\rightarrow$ `{ sourceHandle: 'source-bottom', targetHandle: 'target-top' }`

- **Parent Container Bounding Box**: Given nested child states with known global coordinates, assert `normalizeNodesForReactFlow` computes:
- $$X_{parent} = \min(X_{children}) - 40$$

- $$Y_{parent} = \min(Y_{children}) - 40$$

- Child relative position = $X_{child\_global} - X_{parent\_global}$.

#### 2. `flowToScxml.test.ts`

- **Mutation Isolation**: Assert `connectStates`, `deleteState`, `deleteEdge`, and `renameStateId` mutate the AST in-place without altering unrelated nodes.
- **Coordinate Persistence**: Call `persistNodePosition` on a nested child node with relative position $(10, 20)$ and parent global position $(100, 200)$; assert the written SCXML metadata is $(110, 220)$.

---

### Pillar 2: Sync Engine & Store Transaction Semantics (`src/store/__tests__/`)

This suite guarantees that user interactions on one view update the store correctly without causing infinite feedback loops.

#### `useEditorStore.test.ts`

- **Circular Sync Prevention Protocol**:

1. Set `syncOrigin` to `"CANVAS"`.
2. Invoke `updateCodeFromUser(newXml)`.
3. Assert that `updateCodeFromUser` **short-circuits** and does not overwrite graph nodes or re-parse the AST.

- **Transactional State Rollback**: Assert that `applyAstMutation` clones the AST via `structuredClone` and only commits changes to `rawXml` and `nodes` when the mutation function succeeds without throwing.
- **Initial Seed Auto-Layout Trigger**: Call `seedStore(xmlWithoutMetadata)` and verify `needsAutoLayout` triggers an async `layoutScxmlGraph` pass and writes coordinates back to the AST metadata.

---

### Pillar 3: Layout Engine Contract (`src/layout/__tests__/`)

This suite tests `elkLayout.ts` deterministically in Node.

#### `elkLayout.test.ts`

- **Relative Position Emission**: Confirm that `collect()` in `elkLayout` outputs relative coordinates for child nodes rather than accumulating `offsetX/offsetY`.
- **Parent Dimension Propagation**: Assert that parent compound nodes receive explicit `style.width` and `style.height` matching ELK's calculated bounding boxes.

---

### Pillar 4: Handle Integrity & Component Contracts (`src/components/canvas/__tests__/`)

This suite prevents runtime canvas errors (like React Flow Error #008: handle missing) using `@testing-library/react` in `jsdom`.

#### `StateNodeWrapper.test.tsx`

- **Handle Guard**: Render `AtomicStateNode`, `CompoundStateNode`, `ParallelNode`, and `HistoryNode`. Assert that all 8 namespaced handles are mounted in the DOM:
- Target: `target-top`, `target-bottom`, `target-left`, `target-right`
- Source: `source-top`, `source-bottom`, `source-left`, `source-right`

---

### Vitest Exclusion Strategy (`vitest.config.ts`)

To report true 100% domain coverage, exclude pure setup files, UI shell layouts, and type definitions from coverage metrics:

```typescript
// vitest.config.ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "node",
    globals: true,
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      // Strictly enforce 100% threshold on core domain code
      thresholds: {
        lines: 100,
        functions: 100,
        branches: 100,
        statements: 100,
      },
      // Exclude framework noise and visual UI shells
      exclude: [
        "src/main.tsx",
        "src/App.tsx",
        "src/components/editor/EditorShell.tsx", // Panel resize shell
        "src/components/editor/Toolbar.tsx", // Visual action buttons
        "src/components/canvas/controls/**", // Zoom/Minimap controls
        "**/*.d.ts",
        "**/index.ts",
      ],
    },
  },
});
```

---

### Implementation Priority Sequence

1. **`scxmlToFlow.test.ts`**: Add unit tests for `getOptimalHandles`, `normalizeNodesForReactFlow`, and `finalizeGraphLayout`.
2. **`useEditorStore.test.ts`**: Add transaction state tests for `syncOrigin` loop blocking and `structuredClone` mutations.
3. **`StateNodeWrapper.test.tsx`**: Add `jsdom` handle presence assertion across all 4 node types.
