# Implementation Plan: scxml-http-browser-client + scxml-ui-editor Integration

## Overview

This plan describes how to integrate the **scxml-http-engine** (Elixir/BEAM runtime) with **scxml-ui-editor** (React/Monaco/React Flow) so users can **execute their visual statecharts directly on the canvas**, with real-time visual feedback showing active states and traversed transitions.

### Architecture: Standalone Client Package

The HTTP client layer is extracted into a **standalone npm package** called `scxml-http-browser-client`. This makes it reusable by any frontend project — not just this editor. No npm scope prefix.

```
┌───────────────────────────────────────────────────────────┐
│  scxml-ui-editor (this repo)                              │
│                                                           │
│  ┌───────────────────────────────────────────────────┐    │
│  │  Editor Core (existing)                            │    │
│  │  • AST, nodes, edges, toolbar, panels             │    │
│  └──────────────────────┬────────────────────────────┘    │
│                         │ imports                         │
│  ┌──────────────────────▼────────────────────────────┐    │
│  │  scxml-http-browser-client (external package)      │    │
│  │  • EngineClient class                              │    │
│  │  • TypeScript types                                │    │
│  │  • Result<T> error handling                        │    │
│  └──────────────────────┬────────────────────────────┘    │
│                         │ Zustand-specific                │
│  ┌──────────────────────▼────────────────────────────┐    │
│  │  Editor's own engine integration                   │    │
│  │  • useEngineStore.ts (Zustand slice)               │    │
│  │  • EnginePanel.tsx, EventInput.tsx, etc.           │    │
│  │  • Canvas visualization components                 │    │
│  └───────────────────────────────────────────────────┘    │
│                           │                               │
└───────────────────────────┼───────────────────────────────┘
                            │ HTTP
                            ▼
              ┌─────────────────────────┐
              │  scxml-http-engine      │
              │  (Elixir/Phoenix)       │
              │                         │
              │  POST /statecharts      │
              │  POST /instances/:id/events │
              │  GET  /instances/:id    │
              └─────────────────────────┘
```

**Key principle**: The standalone package contains ONLY framework-agnostic code — no React, no Zustand, no DOM APIs. Just HTTP client + types. Everything else (stores, components, canvas visuals) lives in the editor.

### Execution Model: Synchronous Step-by-Step

The engine's `step/3` is **synchronous** — it blocks until the macrostep fully settles, then returns the settled snapshot. The client never observes a mid-macrostep state.

```
Client                    Engine
  │                         │
  ├─ POST /instances/:id/events ─►
  │                         │  ScxmlEngine.send_event() blocks
  │    (loading spinner)    │  while macrostep settles
  │                         │
  │◄─ full InstanceSnapshot ──┘  ← settled state after step
  │
  │  Canvas updates with new active/inactive states
```

**Key implication**: While the client is waiting for a response, the previous snapshot's `execution_status` is the last known status. The UI shows a loading spinner during the request. When the response arrives, the full settled snapshot is applied — including `execution_status` and `active_states` reflecting the state *after* that step.

```
Before event         During request        After response
─────────────────────────────────────────────────────────
execution_status:    Loading spinner       execution_status: 
"idle"                                     "running"

execution_status:    Loading spinner       execution_status:
"running"                                  "running"

execution_status:    Loading spinner       execution_status:
"running"                                  "completed"
```

The full lifecycle:

```
User presses ▶ Play
    │
    ▼
POST /statecharts → returns initial snapshot (execution_status: "idle")
    │
    ▼
Editor canvas enters EXECUTION MODE
    │  ├─ Active states highlighted (green glow + border)
    │  ├─ Inactive states dimmed (opacity 0.4)
    │  └─ Initial states enter animation
    │
    ▼
User sends event via EnginePanel
    │
    ▼
POST /instances/:id/events — engine blocks until settled
    │  (loading spinner shown during request)
    ▼
Engine returns full settled snapshot
    │  ├─ Transition path computed (which edges fired)
    │  ├─ New active states identified
    │  └─ execution_status reflects state AFTER the step
    │
    ▼
Canvas updates VISUALLY
    │  ├─ Old active states exit animation
    │  ├─ Fired edges flash briefly (animated stroke)
    │  ├─ New active states enter animation
    │  └─ Datamodel changes shown as toast notifications
    │
    ▼
Loop until done === true (statechart reaches final state)
```

**Note on execution lifecycle**: Statecharts represent user journeys — stopping mid-execution can leave the instance in an inconsistent state that doesn't reflect real-world usage. For now, the Play button is greyed out once execution starts (no Stop button). The engine panel's "Stop Execution" button tears down the entire instance rather than interrupting a running macrostep. This will be revisited when we define proper journey/session management.

The editor canvas **IS** the execution view — not a separate panel. The EnginePanel is a control surface; the canvas is the stage.

### From scxml-ui-editor ✅

- **Canonical AST Store**: Zustand store with `ast`, `rawXml`, `nodes`, `edges` — this IS the data we need to send to the engine
- **Serialization Pipeline**: `serializeSCXML()` from scxml-parser already converts AST → XML
- **Bridge Layer**: `flowToScxml.ts` mutates AST in-place — mutations are engine-ready
- **Sync Origin Pattern**: `syncOrigin` flag prevents circular updates — same pattern works for engine sync
- **Toolbar Component**: Natural place to add execution controls

### From scxml-parser ✅

- **AST → JSON**: The store's `ast` field is already a TypeScript object matching the orchestrator's input contract
- **Validation**: `validateAST()` ensures only valid statecharts reach the engine
- **Custom Tags**: TagRegistry system means custom actions can be preserved

### From scxml-orchestrator ✅

- **Input Contract**: Plain JSON AST — exactly what scxml-parser produces
- **Instance API**: `run(ast_json)` → pid, `send_event(pid, name, payload)` → settled state
- **Graph Caching**: Compiled graphs stored in `:persistent_term` — fast repeated executions

### From scxml-http-engine ✅

- **REST API**: Full CRUD for instances (`/statecharts`, `/instances`, `/instances/:id/events`)
- **Docker Build**: Ready to deploy locally or remotely
- **Health Check**: `/healthz` endpoint for connection validation

---

## 3. Package Architecture: scxml-http-browser-client

The HTTP client layer is a **standalone npm package** (`scxml-http-browser-client`) with no npm scope. It contains only framework-agnostic code — no React, no Zustand, no DOM APIs. Everything else (stores, components, canvas visuals) lives in the editor.

### 3.1 Package Structure

```
scxml-http-browser-client/          # Standalone npm package (separate repo or workspace)
├── package.json                    # name: "scxml-http-browser-client"
├── tsconfig.json
└── src/
    ├── index.ts                    # Public exports
    ├── types.ts                    # All TypeScript interfaces
    └── client.ts                   # EngineClient class + Result<T> helper
```

### 3.2 Engine REST API Routes

The `scxml-http-browser-client` wraps these endpoints from `scxml-http-engine`:

| Method   | Route                   | Purpose                          | Request Body                                      | Response                                              |
| -------- | ----------------------- | -------------------------------- | ------------------------------------------------- | ----------------------------------------------------- |
| `GET`    | `/healthz`              | Liveness probe                   | —                                                 | `"ok"` (200, text/plain)                              |
| `POST`   | `/statecharts`          | Register AST + start instance    | `{ document: "<AST JSON>", instance_id?: string }` | `InstanceSnapshot` (201, full snapshot — all 6 fields) |
| `POST`   | `/instances`            | Start instance from stored graph | `{ graph_id, instance_id?, initial_datamodel? }`  | `InstanceSnapshot` (201, full snapshot — all 6 fields) |
| `GET`    | `/instances/:id`        | Snapshot current state           | —                                                 | `InstanceSnapshot` (200, full snapshot — all 6 fields) |
| `POST`   | `/instances/:id/events` | Step one macrostep               | `{ name: "event", data? }`                        | `InstanceSnapshot` (200, full snapshot — all 6 fields) |
| `DELETE` | `/instances/:id`        | Tear down instance               | —                                                 | `{ deleted: true }` (200)                              |
| `GET`    | `/instances`            | List all running instances       | —                                                 | `InstanceSnapshot[]` (200, full snapshot array)        |

**Two ways to create an instance**:

- **`POST /statecharts`** — Upload a SCXML document, compile it, cache the graph, and start an instance in one call. Use this when you have a new statechart to register.
- **`POST /instances`** — Create a fresh instance from a **previously cached** graph (identified by `graph_id`). Use this when you want to spawn multiple independent runs from the same compiled statechart without re-uploading the document.

**When `POST /instances` is useful**: Imagine a traffic-light editor where users can open 5 tabs and run 5 concurrent simulations of the same light controller. You register the AST once via `POST /statecharts`, then spawn each simulation with `POST /instances`. Each instance has its own isolated state, but they all share the same compiled graph — no redundant parsing or compilation.

**Execution model**: All interactions are synchronous request/response. Each `POST /instances/:id/events` steps exactly one macrostep and returns the settled state. The client drives execution step-by-step — no streaming or SSE. This matches the debugger/editor mental model where the user explicitly triggers each transition.

**Note on future streaming**: SSE or WebSocket support could be added later for auto-play mode (push each macrostep completion as an event). Not in scope for MVP.

#### Example Scenarios

**Scenario 1: Register AST, start execution, step through, tear down**

```
// 1. Register the statechart document and start
POST /statecharts
Body: { "document": "<scxml ...>...</scxml>", "instance_id": "abc123" }
→ 201 {
    "instance_id": "abc123",
    "configuration": ["Idle"],
    "datamodel": {},
    "done": false,
    "execution_status": "idle",
    "active_states": [
      { "id": "Idle", "status": "running", "type": "atomic" }
    ]
  }

// 2. Send events one at a time — client drives the loop
POST /instances/abc123/events
Body: { "name": "start" }
→ 200 {
    "instance_id": "abc123",
    "configuration": ["Processing"],
    "datamodel": {},
    "done": false,
    "execution_status": "running",
    "active_states": [
      { "id": "Processing", "status": "running", "type": "atomic" }
    ]
  }

POST /instances/abc123/events
Body: { "name": "complete" }
→ 200 {
    "instance_id": "abc123",
    "configuration": ["Done"],
    "datamodel": {},
    "done": true,
    "execution_status": "completed",
    "active_states": [
      { "id": "Done", "status": "completed", "type": "final" }
    ]
  }

// 3. Done — tear down the instance
DELETE /instances/abc123
→ 200 { "deleted": true }
```

**Scenario 2: Start from a stored graph (pre-registered AST)**

```
// 1. Pre-register the graph (done once, cached by engine)
POST /statecharts
Body: { "document": "<scxml ...>...</scxml>", "instance_id": "my-graph" }
→ 201 (full InstanceSnapshot)

// 2. Later: create instances from the stored graph
POST /instances
Body: { "graph_id": "my-graph", "instance_id": "run-001" }
→ 201 (full InstanceSnapshot)

POST /instances
Body: { "graph_id": "my-graph", "instance_id": "run-002" }
→ 201 (full InstanceSnapshot)

// 3. Step each instance independently
POST /instances/run-001/events   Body: { "name": "start" }
→ 200 (full InstanceSnapshot with execution_status: "running")

POST /instances/run-002/events   Body: { "name": "start" }
→ 200 (full InstanceSnapshot with execution_status: "running")

// 4. List all running instances
GET /instances
→ 200 [ full InstanceSnapshot, full InstanceSnapshot ]
```

#### ✅ Dependency Contract: Execution Status Field (DONE)

**Status**: Implemented in `scxml-http-engine`. All snapshot endpoints now return `execution_status` as part of every response.

**Implementation** (`ScxmlHttpEngine.Engine`):

```elixir
@type execution_status :: :idle | :running | :completed | :error

@type snapshot :: %{
  instance_id: String.t(),
  configuration: [String.t()],
  datamodel: map(),
  done: boolean(),
  execution_status: execution_status(),
  active_states: [%{
    id: String.t(),
    status: :running | :completed | :error,
    type: :atomic | :compound | :parallel | :history | :final
  }]
}
```

Semantics:

| Value | Meaning |
|-------|---------|
| `:idle` | Instance created but no events sent yet; at initial configuration |
| `:running` | Events have been processed; transitions may be active |
| `:completed` | All final states reached; `done?` is true |
| `:error` | Active configuration is empty (unhandled error or raise terminated the instance) |

**Per-state `status` semantics** (inside `active_states[]`):

| Value | Meaning |
|-------|---------|
| `:running` | State is actively executing — awaiting events, processing, or idle |
| `:completed` | State is a `<state type="final">` that has been reached |
| `:error` | Reserved for unhandled errors |

**Per-state `type` values** (from `ScxmlEngine.RuntimeState.state_type`):

| Value | Meaning |
|-------|---------|
| `:atomic` | Leaf state with no children |
| `:compound` | Container state with child states |
| `:parallel` | Container with concurrent child regions |
| `:history` | Pseudo-state for remembering previous active configuration |
| `:final` | Terminal state within a compound state |

Both `execution_status` and `active_states` are computed by the orchestrator library — `ScxmlEngine.execution_status/1` and `ScxmlEngine.active_states/1` — and baked into the snapshot at construction time. All 7 REST endpoints return these fields since they all go through `snapshot_for/2`. The editor can use `active_states` directly to drive per-state visual styling without any client-side computation.

### 3.3 Package Contract (Public API)

#### Types

```typescript
export interface StateInfo {
  id: string;
  status: "running" | "completed" | "error";
  type: "atomic" | "compound" | "parallel" | "history" | "final";
}

export interface InstanceSnapshot {
  instance_id: string;
  configuration: string[]; // e.g., ["Waiting", "Processing"]
  datamodel: Record<string, unknown> | null;
  done: boolean;
  execution_status: "idle" | "running" | "completed" | "error";
  active_states: StateInfo[];
}

export interface HealthStatus {
  status: string;
}
```

#### Result Pattern

```typescript
interface Ok<T> {
  ok: true;
  data: T;
}
interface Err {
  ok: false;
  error: string;
}
type Result<T> = Ok<T> | Err;
```

All client methods return `Result<T>` — never throw. Consistent, composable, no unhandled rejections.

#### EngineClient Class

```typescript
class EngineClient {
  constructor(baseUrl: string);

  health(): Promise<Result<HealthStatus>>;
  createStatechart(
    document: string,
    instanceId?: string,
  ): Promise<Result<InstanceSnapshot>>;
  createInstance(
    graphId: string,
    instanceId?: string,
    initialDatamodel?: Record<string, unknown>,
  ): Promise<Result<InstanceSnapshot>>;
  getInstance(instanceId: string): Promise<Result<InstanceSnapshot>>;
  sendEvent(
    instanceId: string,
    name: string,
    data?: unknown,
  ): Promise<Result<InstanceSnapshot>>;
  deleteInstance(instanceId: string): Promise<Result<{ deleted: boolean }>>;
  listInstances(): Promise<Result<InstanceSnapshot[]>>;
}
```

**Design decisions:**

- No config object — just `new EngineClient(url)`. Simple, explicit.
- Native `fetch` only — no axios, no superagent. Zero dependencies.
- Types are the contract — both repos share the same definitions via the package.

### 3.3 What Stays in scxml-ui-editor

| File                                                                                                    | Why It Stays                              |
| ------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| `useEngineStore.ts`                                                                                     | Zustand-specific (React state management) |
| `EnginePanel.tsx`, `EventInput.tsx`, `InstanceView.tsx`, `ConnectionStatus.tsx`, `ExecutionHistory.tsx` | React components                          |
| `useExecutionOverlay.ts`                                                                                | Canvas visualization state                |
| `useExecutionSync.ts`                                                                                   | Bridge between editor stores              |
| `ExecutionNode.tsx`, `ExecutionEdge.tsx`                                                                | React Flow components                     |
| `ExecutionControls.tsx`, `StateHighlight.css`                                                           | Canvas UI                                 |

### 3.4 How the Editor Consumes the Package

```typescript
// In useEngineStore.ts (editor's own file)
import { EngineClient } from "scxml-http-browser-client";
import type { InstanceSnapshot } from "scxml-http-browser-client";

const useEngineStore = create<EngineState>((set) => ({
  client: null,
  connected: false,
  activeInstanceId: null,
  instanceSnapshot: null,

  connect: async (url: string) => {
    const client = new EngineClient(url);
    const health = await client.health();
    set({ client, connected: health.ok });
  },

  startExecution: async (astXml: string) => {
    const result = await useEngineStore
      .getState()
      .client!.createStatechart(astXml);
    if (!result.ok) return;
    // The engine returns a full InstanceSnapshot — no need to fill in defaults
    set({
      activeInstanceId: result.data.instance_id,
      instanceSnapshot: result.data,
    });
  },

  sendEvent: async (name: string, data?: unknown) => {
    const id = useEngineStore.getState().activeInstanceId!;
    const result = await useEngineStore
      .getState()
      .client!.sendEvent(id, name, data);
    if (result.ok) set({ instanceSnapshot: result.data });
  },
}));
```

---

## 4. What We Need to Build in the Editor

### 4.1 Editor Plugin Structure

```
src/plugins/
├── engine/
│   ├── index.ts                 # Plugin entry point + exports
│   ├── useEngineStore.ts        # Zustand slice for engine state
│   ├── EnginePanel.tsx          # Control surface (collapsible sidebar)
│   ├── EventInput.tsx           # Event sender component
│   ├── InstanceView.tsx         # Running instance snapshot viewer
│   ├── ConnectionStatus.tsx     # Engine connectivity indicator
│   ├── ExecutionHistory.tsx     # Event log
│   ├── settings.ts              # Default config (engine URL, etc.)
│   └── useExecutionSync.ts      # Pub/sub bridge: engine → canvas
├── canvas/
│   ├── useExecutionOverlay.ts   # Zustand slice: execution visuals on canvas
│   ├── ExecutionNode.tsx        # React Flow node with active/inactive styling
│   ├── ExecutionEdge.tsx        # React Flow edge with transition-flash animation
│   ├── ExecutionControls.tsx    # ▶ Play / ■ Stop inline controls (canvas overlay)
│   └── StateHighlight.css       # Tailwind-compatible CSS for glow/dim/flash
```

**Note**: `types.ts` and `client.ts` have moved to `scxml-http-browser-client`. The editor imports them from there.

### 4.2 Core Components to Implement in the Editor

#### A. Engine Store Slice (`useEngineStore.ts`)

Extends existing Zustand store with engine-specific state. Uses `EngineClient` from `scxml-http-browser-client`:

- `client: EngineClient | null` — the injected client instance
- `connected: boolean` — health check status
- `activeInstanceId: string | null` — currently executing instance ID
- `instanceSnapshot: InstanceSnapshot | null` — latest state from engine
- `executionHistory: ExecutionEntry[]` — log of events sent + responses
- `panelOpen: boolean` — whether the EnginePanel is visible
- `isLoading: boolean` — loading spinner state during API calls

Actions: `connect()`, `disconnect()`, `startExecution()`, `sendEvent()`, `stopExecution()`, `refreshSnapshot()`, `togglePanel()`, `clearHistory()`

Persistence: Zustand `persist` middleware saves `engineUrl`, `activeInstanceId`, `panelOpen` to localStorage.

#### B. Execution Sync Bridge (`useExecutionSync.ts`) — NEW

**Purpose**: Acts as the pub/sub bridge between the engine store and the canvas store. When the engine returns a new snapshot, this module computes the delta (which states entered/exited, which transitions fired) and publishes it to the canvas store.

**State published to canvas**:

- `activeStateIds: string[]` — IDs of currently active states
- `firedTransitionIds: string[]` — IDs of edges that just fired (for flash animation)
- `previousStateIds: string[]` — IDs from the previous step (for exit animation)
- `datamodelChanges: Record<string, {old: unknown; new: unknown}>` — key-value pairs that changed
- `isDone: boolean` — whether the statechart has reached a final state

**Mechanism**: Uses Zustand's ability to read from one store inside another. No external pub/sub library needed.

```typescript
// Pseudo-code
export const useExecutionSync = create((set, get) => ({
  activeStateIds: [],
  firedTransitionIds: [],

  onEngineSnapshot: (snapshot: InstanceSnapshot) => {
    const prev = get().activeStateIds;
    const next = snapshot.configuration;

    set({
      activeStateIds: next,
      firedTransitionIds: computeFiredTransitions(prev, next),
      // ... publish to canvas store
    });
  },
}));
```

#### C. Canvas Execution Overlay (`useExecutionOverlay.ts`) — NEW

**Purpose**: A Zustand slice that lives alongside the existing `graphSlice`. It stores execution-specific visual state without mutating the core graph data.

**State**:

```typescript
interface ExecutionOverlayState {
  mode: "idle" | "running" | "done";
  activeStateIds: string[];
  firedTransitionIds: string[];
  datamodelChanges: Record<string, { old: unknown; new: unknown }>;

  enterRunning: (stateIds: string[]) => void;
  stepComplete: (
    prevStateIds: string[],
    nextStateIds: string[],
    firedEdges: string[],
    dmChanges?: Record<string, { old: unknown; new: unknown }>,
  ) => void;
  stop: () => void;
  clearFlash: () => void; // clears firedTransitionIds after animation
}
```

**Integration with graphSlice**: The canvas renderer reads from BOTH `graphSlice.nodes` (positions, labels) AND `executionOverlay` (highlighting). Nodes are rendered with conditional styles based on whether their ID is in `activeStateIds`.

#### D. Visual Node Component (`ExecutionNode.tsx`) — NEW

**Purpose**: Custom React Flow node wrapper that applies execution-aware styling.

**Behavior**:

| Condition                     | Visual Effect                                         |
| ----------------------------- | ----------------------------------------------------- |
| Node ID in `activeStateIds`   | Green glow border, slight scale-up, bright background |
| Node ID in `previousStateIds` | Red fade-out (exit animation)                         |
| Node ID in neither            | Dimmed (opacity 0.4, grayscale)                       |

**Animation**: CSS transitions (0.3s ease) between states. Enter animation includes a subtle bounce.

#### E. Visual Edge Component (`ExecutionEdge.tsx`) — NEW

**Purpose**: Custom React Flow edge wrapper with transition flash animation.

**Behavior**:

| Condition                       | Visual Effect                                                          |
| ------------------------------- | ---------------------------------------------------------------------- |
| Edge ID in `firedTransitionIds` | Animated dashed stroke (flows along path, bright color), opacity pulse |
| Edge ID not in list             | Standard gray stroke                                                   |

**Animation**: After 800ms, auto-clears the flash via `useExecutionOverlay.getState().clearFlash()`.

#### F. Canvas Controls (`ExecutionControls.tsx`) — NEW

**Purpose**: Inline play/stop controls overlaid on the canvas.

**UI**: Small floating button group in the top-left corner of the canvas:

```
▶ Play   │ Running    ← when idle or running
■ Stop   │ Done       ← when running or done
```

**Behavior**:

- `▶ Play` → calls `useEngineStore.startExecution(astJson)` + opens EnginePanel
- `■ Stop` → calls `useEngineStore.stopExecution()` + restores canvas to idle
- Status badge shows "Running", "Done", or disappears when idle

**Why both toolbar and canvas controls?** Toolbar is for discovery; canvas controls are for quick access during editing. They call the same underlying actions.

#### G. Execution Panel (`EnginePanel.tsx`)

Collapsible sidebar control surface. Composes all sub-components:

1. **Header bar**: Title "⚡ Engine" + close button (X)
2. **Connection status bar**: Uses `ConnectionStatus` component (compact mode)
3. **Instance view**: Uses `InstanceView` component (conditionally rendered)
4. **Divider**
5. **Event input**: Uses `EventInput` component (always visible)
6. **Divider**
7. **Execution history**: Uses `ExecutionHistory` component (collapsible)

Fixed width ~320px, slide-in/out animation, positioned as absolute overlay on right side.

#### H. Connection Status (`ConnectionStatus.tsx`)

Small inline component showing connection state. Used in both Toolbar and EnginePanel.

- `connected` → green checkmark + "Connected"
- `connecting` → spinning icon + "Connecting..."
- `connectionError` → red X + error message (clickable to retry)

Props: `compact?: boolean` — dot indicator vs full status text.

#### I. Instance View (`InstanceView.tsx`)

Displays current instance snapshot when an execution is active.

Sections:

1. Header: Instance ID + "Running"/"Done" badge
2. Active Configuration: List of currently active state IDs
3. Datamodel: Key-value table (read-only, labeled "Runtime — not editable")
4. Actions row: "Stop Execution" (red), "Refresh" (blue)

Hidden when `!activeInstanceId`.

#### J. Event Input (`EventInput.tsx`)

Form for sending events to the running instance.

Fields:

1. **Event Name** (required): Text input, validates non-empty
2. **Event Data** (optional): JSON textarea, validates JSON syntax

Submit calls `store.sendEvent(eventName, parsedData)`. On success: clears form, brief flash. On error: shows error below form, keeps form populated for retry.

#### K. Execution History (`ExecutionHistory.tsx`)

Collapsible log of recent events sent and their results.

Each entry shows: relative timestamp ("2m ago"), event name, result badge (green ✓ / red ✗), error message if any. "Clear History" button at bottom.

#### L. Plugin Index (`index.ts`)

Single import point for consumers:

```typescript
export { useEngineStore } from "./useEngineStore";
export { EnginePanel } from "./EnginePanel";
export { ConnectionStatus } from "./ConnectionStatus";
export { InstanceView } from "./InstanceView";
export { EventInput } from "./EventInput";
export { ExecutionHistory } from "./ExecutionHistory";
```

enterRunning: (stateIds: string[]) => void;
stepComplete: (
prevStateIds: string[],
nextStateIds: string[],
firedEdges: string[],
dmChanges?: Record<string, { old: unknown; new: unknown }>,
) => void;
stop: () => void;
clearFlash: () => void; // clears firedTransitionIds after animation
}

```

**Integration with existing graphSlice**: The canvas renderer reads from BOTH `graphSlice.nodes` (positions, labels) AND `executionOverlay` (highlighting). Nodes are rendered with conditional styles based on whether their ID is in `activeStateIds`.

#### E. Visual Node Component (`ExecutionNode.tsx`) — NEW

**Purpose**: Custom React Flow node wrapper that applies execution-aware styling.

**Behavior**:

- If node ID is in `activeStateIds` → green glow border, slight scale-up, bright background
- If node ID was in `previousStateIds` → red fade-out (exit animation)
- If node ID is neither → dimmed (opacity 0.4, grayscale)
- If node ID is in `firedTransitionIds` → pulsing ring animation

**Props**: Receives standard React Flow node props + execution state from `useExecutionOverlay`.

#### F. Visual Edge Component (`ExecutionEdge.tsx`) — NEW

**Purpose**: Custom React Flow edge wrapper with transition flash animation.

**Behavior**:

- If edge ID is in `firedTransitionIds` → animated stroke (dashed line flows along path, bright color)
- Normal edges → standard gray stroke
- After animation completes (~800ms), calls `clearFlash()` to reset

#### G. Canvas Controls (`ExecutionControls.tsx`) — NEW

**Purpose**: Inline play/stop controls overlaid on the canvas (not in toolbar).

**UI**: Small floating button group in the top-left corner of the canvas:

- `▶ Play` — starts execution (same as toolbar Execute, but more prominent)
- `■ Stop` — stops execution (appears when running)
- Status badge: "Running" or "Done" (appears next to buttons)

**Why both toolbar and canvas controls?** Toolbar is for discovery; canvas controls are for quick access during editing. They call the same underlying actions.

#### H. Execution Panel (`EnginePanel.tsx`)

- Collapsible sidebar control surface
- Shows connection status
- Displays current instance state (configuration, datamodel, done?)
- Event input form (name + optional JSON data)
- Execution history log
- **Does NOT duplicate canvas visuals** — it's the control surface, not the stage

#### I. Toolbar Integration

- Add "Execute" button to existing Toolbar
- Also triggers canvas to enter EXECUTION MODE (not just opening EnginePanel)
- Visual indicator: button text changes to "Stop" while running
- Green dot indicator when engine is connected

---

## 4. Data Flow — Progress-Driven Lifecycle

### 4a. Start Execution

```

User presses ▶ Play (toolbar or canvas controls)
│
▼
EditorShell calls useEngineStore.startExecution(astJson)
│ where astJson = serializeSCXML(store.ast)
│
▼
EngineClient.createStatechart(document)
│
▼
POST /statecharts { document, instance_id? }
│
▼
Engine returns full InstanceSnapshot (all 6 fields)
│
▼
useEngineStore updates activeInstanceId + instanceSnapshot
│
▼
useExecutionSync.onEngineSnapshot(snapshot) fires
│ ├─ activeStateIds = ["Initial"]
│ └─ firedTransitionIds = []
│
▼
useExecutionOverlay.enterRunning(["Initial"])
│
▼
Canvas re-renders with EXECUTION MODE styles
├─ "Initial" node → green glow + scale-up
├─ All other nodes → dimmed (opacity 0.4)
└─ Toolbar button changes to "Stop"

```

### 4b. Send Event → Step Statechart

```

User types event in EnginePanel EventInput
│
▼
store.sendEvent("timer", { count: 1 })
│  sets isLoading = true (loading spinner)
│
▼
POST /instances/:id/events { name: "timer", data: { count: 1 } }
│
▼
Engine steps statechart — blocks until macrostep settles
│  (previous snapshot still visible, with loading overlay)
│
▼
Engine returns full settled InstanceSnapshot
│  sets isLoading = false
│ {
│   instance_id: "abc123",
│   configuration: ["Waiting"],
│   datamodel: { count: 1 },
│   done: false,
│   execution_status: "running",
│   active_states: [ { id: "Waiting", status: "running", type: "atomic" } ]
│ }
│
▼
useEngineStore updates instanceSnapshot
│
▼
useExecutionSync computes delta:
│ prevStates = ["Initial"]
│ nextStates = ["Waiting"]
│ firedEdges = ["Initial→Waiting"] ← computed from AST edges
│ dmChanges = { count: { old: 0, new: 1 } }
│
▼
useExecutionOverlay.stepComplete(prev, next, firedEdges, dmChanges)
│
▼
Canvas re-renders with VISUAL TRANSITIONS
├─ "Initial" node → exit animation (red fade-out)
├─ Edge "Initial→Waiting" → flash animation (dashed stroke flows)
├─ "Waiting" node → enter animation (green glow + scale-up)
├─ Other states → remain dimmed
└─ Toast notification: "count: 0 → 1"
│
▼
Loop continues until done === true or user stops

```

### 4c. Stop Execution

```

User presses ■ Stop (toolbar or canvas)
│
▼
store.stopExecution()
│
▼
POST /instances/:id (DELETE)
│
▼
useExecutionOverlay.stop()
│ ├─ mode = 'idle'
│ ├─ activeStateIds = []
│ └─ firedTransitionIds = []
│
▼
Canvas restores normal editing styles
└─ All nodes return to default appearance

````

---

## 5. Challenges & Mitigations

### Challenge 1: Synchronous Blocking During Step Execution

**Problem**: The engine's `step/3` blocks until the macrostep settles. During this time, the HTTP response is pending. The client must handle this gracefully — no mid-macrostep state is observable.

**Solution**:

- The engine already returns the settled state — the client just waits for the response
- Show a loading spinner during step execution (the previous snapshot remains visible underneath)
- Set `isLoading` on the store while the request is in-flight; the UI shows a loading overlay
- Timeout handling for hung instances (abort controller with configurable timeout)
- Visual feedback: edge flash animation only starts after response arrives

### Challenge 2: Canvas State Sync (Pub/Sub Bridge)

**Problem**: The engine store knows about execution state, but the canvas renderer doesn't. They need to communicate without tight coupling.
**Solution**:

- **`useExecutionSync.ts`** acts as a bridge module that reads from the engine store and publishes deltas to the canvas overlay store
- Uses Zustand's cross-store read pattern (no external pub/sub library)
- Computes transition paths by matching engine's `configuration[]` against the AST's edge definitions
- Animation timing is handled client-side (CSS transitions), so the UI feels responsive even if network has latency

```typescript
// Bridge pattern — engine store triggers sync, canvas reacts
useEngineStore.subscribe((state) => {
  if (state.instanceSnapshot) {
    useExecutionSync.getState().onEngineSnapshot(state.instanceSnapshot);
  }
});
````

### Challenge 3: Transition Path Computation

**Problem**: The engine returns `configuration: ["A", "B"]` but does NOT tell us which transitions fired. We must infer this on the client.
**Solution**:

- Compare previous `configuration[]` with current `configuration[]`
- Look up AST edges whose `target` matches the new states and `source` matches the old states
- Map those edge IDs to React Flow edge IDs using the metadata registry
- This gives us `firedTransitionIds` for the flash animation

```typescript
function computeFiredTransitions(
  prevConfig: string[],
  nextConfig: string[],
  edges: Edge[],
): string[] {
  const entered = new Set(nextConfig.filter((id) => !prevConfig.includes(id)));
  return edges
    .filter((e) => {
      const targetMatches = e.target && entered.has(e.target);
      const sourceMatches = e.source && prevConfig.includes(e.source);
      return targetMatches && sourceMatches;
    })
    .map((e) => e.id);
}
```

### Challenge 4: Design-Time vs Runtime Divergence

**Problem**: User edits the XML while an instance is running. Editor AST changes but engine still uses the compiled version.
**Solution**:

- Running instances are isolated from editor edits (engine has its own compiled graph)
- When user edits source, show a warning banner: "Editing while running — changes won't affect current execution"
- Option to "Restart" which recompiles and restarts the instance with the updated AST
- Datamodel changes shown separately from state changes (toast notifications)

### Challenge 5: Instance Lifecycle Management

**Problem**: Engine instances are ephemeral (in-memory). Browser refresh loses connection.
**Solution**:

- Auto-create new instance on page load if previous instance_id stored in localStorage
- Graceful error messages when instance is gone ("Instance not found — create a new one")
- "Restart" button to recreate instance with current AST
- Resume prompt on page load (Phase 3 polish)

### Challenge 6: CORS & Development

**Problem**: Vite dev server (localhost:5173) calling Elixir server (localhost:4000) triggers CORS.
**Solution**:

- Vite proxy configuration for `/api` routes
- Document CORS setup for production
- Allow configuring engine URL in plugin settings

### Challenge 7: Parallel Executions

**Problem**: User may want to run multiple instances side-by-side for comparison.
**Solution**:

- Instance list in EnginePanel
- Switch between active instances (canvas shows current instance's highlights)
- Clean up old instances when no longer needed
- Phase 4 feature (not MVP)

---

## 6. Implementation Phases

### Phase 1: Foundation (MVP) — Engine + Controls

- [x] Create plugin directory structure
- [x] Implement HTTP client (`client.ts`)
- [x] Add engine store slice (`useEngineStore.ts`)
- [ ] Create `src/plugins/engine/settings.ts`
- [ ] Create `src/plugins/engine/ConnectionStatus.tsx`
- [ ] Create `src/plugins/engine/InstanceView.tsx`
- [ ] Create `src/plugins/engine/EventInput.tsx`
- [ ] Create `src/plugins/engine/ExecutionHistory.tsx`
- [ ] Create `src/plugins/engine/EnginePanel.tsx`
- [ ] Create `src/plugins/engine/index.ts`
- [ ] Modify `src/components/editor/Toolbar.tsx` (Execute/Stop toggle button)
- [ ] Modify `vite.config.ts` (dev proxy for `/api` → localhost:4000)

### Phase 2: Canvas Execution Visualization ⭐ NEW

**This is the core of your vision — the canvas IS the execution view.**

- [ ] Create `src/plugins/canvas/useExecutionOverlay.ts` — Zustand slice for execution visuals on canvas
- [ ] Create `src/plugins/engine/useExecutionSync.ts` — Pub/sub bridge between engine store and canvas overlay
- [ ] Create `src/plugins/canvas/ExecutionNode.tsx` — React Flow node wrapper with active/inactive/dimmed styling
- [ ] Create `src/plugins/canvas/ExecutionEdge.tsx` — React Flow edge wrapper with transition flash animation
- [ ] Create `src/plugins/canvas/ExecutionControls.tsx` — ▶ Play / ■ Stop floating controls on canvas
- [ ] Create `src/plugins/canvas/StateHighlight.css` — CSS for green glow, dimming, exit fade, edge flash
- [ ] Modify `src/components/editor/EditorShell.tsx` — wire in ExecutionOverlay + ExecutionControls
- [ ] Implement `computeFiredTransitions()` — delta computation from engine configuration changes
- [ ] Implement datamodel change detection + toast notifications

### Phase 3: Polish & Persistence

- [ ] Connection status indicator with retry logic
- [ ] localStorage persistence of instance_id
- [ ] Error boundaries and graceful degradation
- [ ] Responsive layout for EnginePanel
- [ ] Keyboard shortcuts (Space = send event, Escape = stop)
- [ ] "Resume last session" prompt on page load
- [ ] Warning banner when editing while running
- [ ] "Restart" button to recompile + restart with updated AST

### Phase 4: Advanced (Future)

- [ ] WebSocket support for real-time pushes (no polling)
- [ ] Datamodel synchronization (engine → editor Monaco panel)
- [ ] Multiple instance management (side-by-side comparison)
- [ ] Export/import execution traces
- [ ] Recording & playback of event sequences
- [ ] Auto-play mode (step through events automatically)

---

## 7. Configuration

Users will configure the plugin via a simple settings object:

```typescript
interface EnginePluginConfig {
  /** Base URL of scxml-http-engine */
  engineUrl: string;
  /** Enable/disable the plugin */
  enabled: boolean;
  /** Auto-connect on page load */
  autoConnect: boolean;
  /** Polling interval for snapshots (ms) */
  pollInterval: number;
}

const defaultConfig: EnginePluginConfig = {
  engineUrl: "http://localhost:4000",
  enabled: true,
  autoConnect: true,
  pollInterval: 1000,
};
```

### Canvas Execution Settings

Separate from engine config — controls how the canvas visualizes execution:

```typescript
interface ExecutionVisualSettings {
  /** Highlight color for active states */
  activeColor?: string; // default: "#22c55e" (green-500)
  /** Dim factor for inactive states (0-1) */
  inactiveOpacity?: number; // default: 0.4
  /** Duration of transition flash animation (ms) */
  flashDuration?: number; // default: 800
  /** Show datamodel change toasts */
  showDatamodelToasts?: boolean; // default: true
  /** Auto-open EnginePanel on start */
  openPanelOnStart?: boolean; // default: false
}
```

---

## 8. Dependencies

No new npm dependencies required for Phase 1-3. Uses:

- Native `fetch` API (already available in browsers)
- Existing Zustand store pattern (cross-store pub/sub)
- Existing React component patterns
- Existing React Flow node/edge rendering infrastructure
- CSS transitions for animations (no animation library needed)

Phase 4 (WebSocket) may add `socket.io-client` or use native `WebSocket`.

---

## 9. Implementation Plan — Detailed File-by-File Breakdown

### Current State (Already Built)

| File                                   | Status  | Purpose                                     |
| -------------------------------------- | ------- | ------------------------------------------- |
| `src/plugins/engine/types.ts`          | ✅ Done | Shared types (config, API responses)        |
| `src/plugins/engine/client.ts`         | ✅ Done | HTTP client wrapping engine REST API        |
| `src/plugins/engine/useEngineStore.ts` | ✅ Done | Zustand store with localStorage persistence |

### Phase 1: Core Components (Files to Create)

#### 1. `src/plugins/engine/settings.ts`

**Purpose**: Clean import path for default config. Re-exports from `types.ts`.

```typescript
export { defaultConfig } from "./types";
export type { EngineConfig } from "./types";
export const PLUGIN_STORAGE_KEY = "scxml-engine-plugin-config";
```

**Changes**: New file, ~5 lines.

---

#### 2. `src/plugins/engine/ConnectionStatus.tsx`

**Purpose**: Small inline component showing connection state. Used in both Toolbar and EnginePanel.

**Props**:

- `compact?: boolean` — when true, shows as a small dot indicator; when false, shows full status text

**State consumed from store**:

- `connected` → green checkmark + "Connected"
- `connecting` → spinning icon + "Connecting..."
- `connectionError` → red X + error message (clickable to retry)

**Actions**:

- Clicking error triggers `store.connect()` again

**Styling**: Tailwind classes matching existing editor theme (neutral colors, small font)

**Changes**: New file, ~60 lines.

---

#### 3. `src/plugins/engine/InstanceView.tsx`

**Purpose**: Displays current instance snapshot when an execution is active.

**State consumed from store**:

- `activeInstanceId` → if null, component is hidden
- `instanceSnapshot` → configuration list, datamodel key-value pairs, done? badge
- `isLoading` → show spinner during refresh

**UI sections**:

1. **Header**: Instance ID + "Running"/"Done" badge
2. **Active Configuration**: List of currently active state IDs (from `configuration` array)
3. **Datamodel**: Key-value table showing runtime datamodel values (clearly labeled "Runtime — not editable")
4. **Actions row**: "Stop Execution" button (red), "Refresh" button (blue)

**Actions**:

- "Stop Execution" → calls `store.stopExecution()`, clears `activeInstanceId`
- "Refresh" → calls `store.refreshSnapshot()`

**Conditional rendering**: Entire component hidden when `!activeInstanceId`

**Changes**: New file, ~80 lines.

---

#### 4. `src/plugins/engine/EventInput.tsx`

**Purpose**: Form for sending events to the running instance.

**State consumed from store**:

- `activeInstanceId` → if null, form is disabled with message "No active instance"
- `isLoading` → disable submit button during send

**Form fields**:

1. **Event Name** (required): Text input, validates non-empty on submit
2. **Event Data** (optional): JSON textarea, validates JSON syntax on submit

**Submit behavior**:

- Calls `store.sendEvent(eventName, parsedData)`
- On success: clears form, shows brief success flash
- On error: shows error message below form, keeps form populated for retry

**Validation**:

- Event name: required, trimmed
- Event data: optional, but if provided must be valid JSON (try/catch on parse)

**Changes**: New file, ~70 lines.

---

#### 5. `src/plugins/engine/ExecutionHistory.tsx`

**Purpose**: Collapsible log of recent events sent and their results.

**State consumed from store**:

- `executionHistory` → array of `ExecutionEntry` objects
- `showHistory` → controls visibility toggle

**UI**:

- Toggle button/header: "Execution History" with chevron icon (expand/collapse)
- Each entry shows: timestamp (relative, e.g., "2m ago"), event name, result badge (green ✓ / red ✗), error message if any
- "Clear History" button at bottom

**Formatting**:

- Timestamps shown as relative time ("just now", "5m ago", "2h ago")
- Error entries highlighted in red background
- Success entries in neutral background

**Actions**:

- "Clear History" → calls `store.clearHistory()`

**Changes**: New file, ~60 lines.

---

#### 6. `src/plugins/engine/EnginePanel.tsx`

**Purpose**: Main collapsible sidebar panel. Container that composes all sub-components.

**Layout**: Fixed width ~320px, scrollable, positioned as absolute overlay on right side of editor (doesn't disrupt Monaco/ReactFlow split).

**Sections (top to bottom)**:

1. **Header bar**: Title "⚡ Engine" + close button (X)
2. **Connection status bar**: Uses `ConnectionStatus` component (compact mode)
3. **Instance view**: Uses `InstanceView` component (conditionally rendered)
4. **Divider**
5. **Event input**: Uses `EventInput` component (always visible)
6. **Divider**
7. **Execution history**: Uses `ExecutionHistory` component (collapsible)

**State consumed from store**:

- `panelOpen` → controls CSS transform/opacity for slide-in/out animation
- All sub-components read their own state from the store

**CSS**:

- `transform: translateX(100%)` when closed, `translateX(0)` when open
- Smooth transition: `transition-transform duration-200`
- Backdrop overlay when open (optional, for focus mode)
- Background: white, border-left: 1px solid neutral-200
- Shadow: `shadow-xl` for depth

**Changes**: New file, ~50 lines (mostly composition).

---

#### 7. `src/plugins/engine/index.ts`

**Purpose**: Public API exports. Single import point for consumers.

```typescript
export { EngineClient } from "./client";
export type { EngineConfig, InstanceSnapshot, ExecutionEntry } from "./types";
export { defaultConfig } from "./settings";
export { useEngineStore } from "./useEngineStore";
export { EnginePanel } from "./EnginePanel";
export { ConnectionStatus } from "./ConnectionStatus";
export { InstanceView } from "./InstanceView";
export { EventInput } from "./EventInput";
export { ExecutionHistory } from "./ExecutionHistory";
```

**Changes**: New file, ~15 lines.

---

### Phase 2: Canvas Execution Visualization ⭐ NEW — The Stage

These are the files that make the canvas the execution view. **This is the core of your vision.**

#### 8. `src/plugins/canvas/useExecutionOverlay.ts` ⭐ KEY FILE

**Purpose**: Zustand slice that stores execution-specific visual state on the canvas. Lives alongside the existing `graphSlice`.

**State**:

```typescript
interface ExecutionOverlayState {
  mode: "idle" | "running" | "done";
  activeStateIds: string[]; // currently active states
  previousStateIds: string[]; // from last step (for exit anim)
  firedTransitionIds: string[]; // edges that just fired (for flash)
  datamodelChanges: Record<string, { old: unknown; new: unknown }>;

  enterRunning: (stateIds: string[]) => void;
  stepComplete: (
    prevStateIds: string[],
    nextStateIds: string[],
    firedEdges: string[],
    dmChanges?: Record<string, { old: unknown; new: unknown }>,
  ) => void;
  stop: () => void;
  clearFlash: () => void; // called after animation completes
}
```

**Integration with graphSlice**: The canvas renderer reads from BOTH `graphSlice.nodes` (positions, labels) AND `executionOverlay` (highlighting). Nodes are rendered with conditional styles based on whether their ID is in `activeStateIds`.

**Auto-cleanup**: `firedTransitionIds` auto-clears after 800ms via `setTimeout` inside the slice.

**Changes**: New file, ~60 lines.

---

#### 9. `src/plugins/engine/useExecutionSync.ts` ⭐ BRIDGE

**Purpose**: Pub/sub bridge between engine store and canvas overlay. No external pub/sub library needed — uses Zustand's cross-store read pattern.

**Mechanism**: Subscribes to changes in `useEngineStore.instanceSnapshot`. When it updates, computes the delta and publishes to `useExecutionOverlay`.

```typescript
// Pseudo-code
export const useExecutionSync = create((set, get) => ({
  onEngineSnapshot: (snapshot: InstanceSnapshot) => {
    const prev = get().activeStateIds;
    const next = snapshot.configuration;

    // Compute which transitions fired
    const edges = useEditorStore.getState().edges;
    const firedEdges = computeFiredTransitions(prev, next, edges);

    // Detect datamodel changes
    const dmChanges = computeDatamodelChanges(
      get().lastDatamodel,
      snapshot.datamodel,
    );

    // Publish to canvas overlay
    useExecutionOverlay
      .getState()
      .stepComplete(prev, next, firedEdges, dmChanges);

    set({ activeStateIds: next, lastDatamodel: snapshot.datamodel });
  },
}));

// Subscribe to engine store changes
useEngineStore.subscribe((state) => {
  if (state.instanceSnapshot) {
    useExecutionSync.getState().onEngineSnapshot(state.instanceSnapshot);
  }
});
```

**Changes**: New file, ~80 lines.

---

#### 10. `src/plugins/canvas/ExecutionNode.tsx` ⭐ VISUAL

**Purpose**: Custom React Flow node wrapper that applies execution-aware styling.

**Behavior**:

| Condition                     | Visual Effect                                                                                  |
| ----------------------------- | ---------------------------------------------------------------------------------------------- |
| Node ID in `activeStateIds`   | Green glow border (`box-shadow: 0 0 12px #22c55e`), slight scale-up (1.05x), bright background |
| Node ID in `previousStateIds` | Red fade-out (opacity 0.6, red tint) — exit animation                                          |
| Node ID in neither            | Dimmed (opacity 0.4, grayscale filter)                                                         |
| Node has no match in either   | Normal appearance (editing mode fallback)                                                      |

**Animation**: CSS transitions (0.3s ease) between states. Enter animation includes a subtle bounce.

**Props**: Receives standard React Flow node props + execution state from `useExecutionOverlay`.

**Changes**: New file, ~50 lines.

---

#### 11. `src/plugins/canvas/ExecutionEdge.tsx` ⭐ VISUAL

**Purpose**: Custom React Flow edge wrapper with transition flash animation.

**Behavior**:

| Condition                       | Visual Effect                                                                  |
| ------------------------------- | ------------------------------------------------------------------------------ |
| Edge ID in `firedTransitionIds` | Animated dashed stroke (flows along path, bright color #3b82f6), opacity pulse |
| Edge ID not in list             | Standard gray stroke                                                           |

**Animation**: After 800ms, calls `useExecutionOverlay.getState().clearFlash()` to reset.

**Implementation**: Uses React Flow's `EdgeProps` with custom SVG path styling. Dashed stroke with `stroke-dashoffset` animation.

**Changes**: New file, ~40 lines.

---

#### 12. `src/plugins/canvas/ExecutionControls.tsx` ⭐ CONTROLS

**Purpose**: Inline play/stop controls overlaid on the canvas (not in toolbar).

**UI**: Small floating button group in the top-left corner of the canvas:

```
┌─────────────────────┐
│ ▶ Play   │ Running │  ← when idle or running
│ ■ Stop   │ Done    │  ← when running or done
└─────────────────────┘
```

**Behavior**:

- `▶ Play` → calls `useEngineStore.startExecution(astJson)` + opens EnginePanel
- `■ Stop` → calls `useEngineStore.stopExecution()` + restores canvas to idle
- Status badge shows "Running", "Done", or disappears when idle

**Why both toolbar and canvas controls?** Toolbar is for discovery; canvas controls are for quick access during editing without reaching for the toolbar. They call the same underlying actions.

**Changes**: New file, ~40 lines.

---

#### 13. `src/plugins/canvas/StateHighlight.css`

**Purpose**: CSS classes for execution visuals. Tailwind-compatible custom properties.

```css
/* Active state highlight */
.scxml-exec-active {
  box-shadow: 0 0 12px rgba(34, 197, 94, 0.6);
  border-color: #22c55e !important;
  transform: scale(1.05);
  transition: all 0.3s ease;
}

/* Inactive/dimmed state */
.scxml-exec-inactive {
  opacity: 0.4;
  filter: grayscale(0.5);
  transition: all 0.3s ease;
}

/* Exit animation */
.scxml-exec-exit {
  opacity: 0.6;
  border-color: #ef4444 !important;
  transition: all 0.3s ease;
}

/* Edge flash animation */
.scxml-exec-flash {
  stroke-dasharray: 8 4;
  animation: scxml-edge-flow 0.8s linear;
}

@keyframes scxml-edge-flow {
  from {
    stroke-dashoffset: 0;
  }
  to {
    stroke-dashoffset: -24;
  }
}
```

**Changes**: New file, ~40 lines.

---

### Phase 3: Editor Integration (Files to Modify)

#### 14. Modify `src/components/editor/Toolbar.tsx`

**Changes**:

- Add new prop: `onToggleEngine?: () => void`
- Add "Execute" button in the **right toolbar group**, before the Code/Split/Canvas buttons
- Button styling: same as existing buttons, with a green dot indicator when `connected`
- **Button text toggles**: Shows "Execute" when idle, "Stop" when running
- Visual indicator: small green circle (`w-2 h-2 bg-green-500 rounded-full`) next to button text when connected

**Before**:

```tsx
<div className="toolbar-group">
  <button onClick={onExport}>Export</button>
  <button onClick={onAutoLayout}>Auto Layout</button>
</div>
<div className="toolbar-group toolbar-spacer" />
<div className="toolbar-group">
  <button onClick={onMaximizeCode}>Code</button>
  <button onClick={onResetSplit}>Split</button>
  <button onClick={onMaximizeCanvas}>Canvas</button>
</div>
```

**After**:

```tsx
<div className="toolbar-group">
  <button onClick={onExport}>Export</button>
  <button onClick={onAutoLayout}>Auto Layout</button>
</div>
<div className="toolbar-group toolbar-spacer" />
<div className="toolbar-group">
  <button onClick={onToggleEngine} title={isRunning ? "Stop Execution" : "Start Execution"}>
    {isRunning ? "■ Stop" : "▶ Execute"}
    {connected && !isRunning && <span className="ml-1 w-2 h-2 bg-green-500 rounded-full inline-block" />}
  </button>
</div>
<div className="toolbar-group">
  <button onClick={onMaximizeCode}>Code</button>
  <button onClick={onResetSplit}>Split</button>
  <button onClick={onMaximizeCanvas}>Canvas</button>
</div>
```

**Note**: Both `connected` and `isRunning` come from `useEngineStore` directly inside Toolbar (no need to pass as props).

**Lines changed**: ~10 lines added to existing file.

---

#### 15. Modify `src/components/editor/EditorShell.tsx`

**Changes**:

- Import `EnginePanel` from `@/plugins/engine`
- Import `useEngineStore` from `@/plugins/engine`
- Import `useExecutionOverlay` from `@/plugins/canvas`
- Import `ExecutionPanel` as an absolute-positioned overlay div after the `PanelGroup`
- Import `ExecutionControls` and render it inside the canvas area
- Import `ExecutionNode` and `ExecutionEdge` as custom React Flow components
- Render `EnginePanel` as an absolute-positioned overlay div after the `PanelGroup`

**Import additions**:

```typescript
import { EnginePanel } from "@/plugins/engine";
import { useEngineStore } from "@/plugins/engine";
import { useExecutionOverlay } from "@/plugins/canvas/useExecutionOverlay";
import { ExecutionControls } from "@/plugins/canvas/ExecutionControls";
import { ExecutionNode } from "@/plugins/canvas/ExecutionNode";
import { ExecutionEdge } from "@/plugins/canvas/ExecutionEdge";
```

**Hook addition** (inside component):

```typescript
const enginePanelOpen = useEngineStore((s) => s.panelOpen);
const executionMode = useExecutionOverlay((s) => s.mode);
```

**JSX addition** (after `</PanelGroup>`, before closing `</div>`):

```tsx
{
  enginePanelOpen && (
    <div className="absolute top-0 right-0 h-full w-80 z-50">
      <EnginePanel />
    </div>
  );
}
```

**Canvas overlay** (inside the React Flow panel, above nodes):

```tsx
<Panel>
  <ExecutionControls />
</Panel>
```

**Custom node/edge types** (passed to `<ReactFlow>`):

```tsx
<ReactFlow
  nodeTypes={{ execution: ExecutionNode }}
  edgeTypes={{ execution: ExecutionEdge }}
  nodes={nodes.map((n) => ({
    ...n,
    type: executionMode !== "idle" ? "execution" : undefined,
  }))}
  edges={edges.map((e) => ({
    ...e,
    type: executionMode !== "idle" ? "execution" : undefined,
  }))}
/>
```

**Lines changed**: ~25 lines added to existing file.

---

#### 16. Modify `vite.config.ts`

**Purpose**: Proxy `/api` requests to engine during development to avoid CORS issues.

**Changes**: Add `server.proxy` configuration.

**Before**:

```typescript
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": "/src" },
  },
});
```

**After**:

```typescript
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": "/src" },
  },
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:4000",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
});
```

**Note**: This only affects dev mode. Production builds don't use Vite's dev server. Users pointing to remote engines configure the URL directly in the plugin settings.

**Lines changed**: ~10 lines added to existing file.

---

### Phase 4: Polish & Persistence

#### 17. Resume Last Session Prompt

**Location**: `src/components/editor/EditorShell.tsx`

**Behavior**:

- On mount, after AST is seeded, check `useEngineStore.getState().activeInstanceId`
- If an instance ID exists from previous session (restored from localStorage), show a toast/banner:
  - Message: "Resume last execution?" with "Yes" / "No" buttons
  - "Yes": calls `store.refreshSnapshot()` to verify instance still exists
  - "No": does nothing, user can manually start via Execute button

**Implementation**: Simple conditional render of a banner component at the top of the editor (below Toolbar, above PanelGroup).

**Lines changed**: ~20 lines added.

---

#### 18. Error Boundary Wrapper

**Location**: `src/plugins/engine/ErrorBoundary.tsx` (new file)

**Purpose**: Prevent plugin crashes from breaking the editor.

**Implementation**: Wrap `EnginePanel` content in a React ErrorBoundary class component. On error, show a fallback UI:

- Message: "Engine plugin encountered an error"
- Button: "Reload Plugin" (re-mounts the panel)
- Button: "Dismiss" (closes panel)

**Lines changed**: ~30 lines (new ErrorBoundary component) + ~5 lines in EnginePanel.

---

### File Change Summary

| Action     | File                                        | Lines Changed | Description                       |
| ---------- | ------------------------------------------- | ------------- | --------------------------------- |
| **Create** | `src/plugins/engine/settings.ts`            | ~5            | Config re-export                  |
| **Create** | `src/plugins/engine/ConnectionStatus.tsx`   | ~60           | Connectivity indicator            |
| **Create** | `src/plugins/engine/InstanceView.tsx`       | ~80           | Instance snapshot display         |
| **Create** | `src/plugins/engine/EventInput.tsx`         | ~70           | Event sender form                 |
| **Create** | `src/plugins/engine/ExecutionHistory.tsx`   | ~60           | Event log                         |
| **Create** | `src/plugins/engine/EnginePanel.tsx`        | ~50           | Main panel container              |
| **Create** | `src/plugins/engine/index.ts`               | ~15           | Public API exports                |
| **Create** | `src/plugins/canvas/useExecutionOverlay.ts` | ~60           | Execution visual state slice      |
| **Create** | `src/plugins/engine/useExecutionSync.ts`    | ~80           | Pub/sub bridge (engine → canvas)  |
| **Create** | `src/plugins/canvas/ExecutionNode.tsx`      | ~50           | Canvas node with active/inactive  |
| **Create** | `src/plugins/canvas/ExecutionEdge.tsx`      | ~40           | Canvas edge with transition flash |
| **Create** | `src/plugins/canvas/ExecutionControls.tsx`  | ~40           | ▶ Play / ■ Stop on canvas         |
| **Create** | `src/plugins/canvas/StateHighlight.css`     | ~40           | Glow/dim/flash CSS classes        |
| **Modify** | `src/components/editor/Toolbar.tsx`         | ~10           | Execute/Stop toggle button        |
| **Modify** | `src/components/editor/EditorShell.tsx`     | ~25           | Wire in EnginePanel + controls    |
| **Modify** | `vite.config.ts`                            | ~10           | Add dev proxy                     |
| **Create** | `src/plugins/engine/ErrorBoundary.tsx`      | ~30           | Error boundary (Phase 4)          |

**Total new files**: 13
**Total modified files**: 3
**Estimated total lines of code**: ~700 lines

---

### Key Integration Points Diagram

```
EditorShell.tsx
├── Toolbar.tsx ──────────────► onToggleEngine callback (Execute↔Stop)
│   └── reads useEngineStore.connected/isRunning for dot/text
├── ReactFlow Canvas
│   ├── <Panel>
│   │   └── ExecutionControls.tsx ──► ▶ Play / ■ Stop floating buttons
│   ├── nodes.map(n => ({ ...n, type: 'execution' }))
│   │   └── ExecutionNode.tsx ───────► green glow / dimmed / exit anim
│   └── edges.map(e => ({ ...e, type: 'execution' }))
│       └── ExecutionEdge.tsx ───────► transition flash animation
└── EnginePanel.tsx (absolute overlay)
    ├── ConnectionStatus.tsx ──► reads connected/connecting/error
    ├── InstanceView.tsx ──────► reads instanceSnapshot, calls stop/refresh
    ├── EventInput.tsx ────────► calls sendEvent()
    └── ExecutionHistory.tsx ──► reads executionHistory

Pub/Sub Bridge:
useEngineStore.subscribe() → useExecutionSync.onEngineSnapshot()
                              → useExecutionOverlay.stepComplete()
                                  → Canvas re-renders with visuals
```

---

### Data Flow During Execution

```
User presses ▶ Play (toolbar or canvas controls)
    │
    ▼
EditorShell calls useEngineStore.startExecution(astJson)
    │  where astJson = serializeSCXML(store.ast)
    │
    ▼
EngineClient.createStatechart(document)
    │
    ▼
POST /statecharts { document, instance_id? }
    │
    ▼
Engine returns { instance_id, configuration: ["Initial"] }
    │
    ▼
useEngineStore updates activeInstanceId + instanceSnapshot
    │
    ▼
useExecutionSync.onEngineSnapshot(snapshot) fires
    │  ├─ activeStateIds = ["Initial"]
    │  └─ firedTransitionIds = []
    │
    ▼
useExecutionOverlay.enterRunning(["Initial"])
    │
    ▼
Canvas re-renders with EXECUTION MODE styles
    ├─ "Initial" node → green glow + scale-up
    ├─ All other nodes → dimmed (opacity 0.4)
    └─ Toolbar button changes to "■ Stop"


User types event in EnginePanel EventInput
    │
    ▼
store.sendEvent("timer", { count: 1 })
    │
    ▼
POST /instances/:id/events { name: "timer", data: { count: 1 } }
    │
    ▼
Engine steps statechart → returns settled state
    │  {
    │    configuration: ["Waiting"],
    │    datamodel: { count: 1 },
    │    done: false
    │  }
    │
    ▼
useEngineStore updates instanceSnapshot
    │
    ▼
useExecutionSync computes delta:
    │  prevStates = ["Initial"]
    │  nextStates = ["Waiting"]
    │  firedEdges = ["Initial→Waiting"]  ← computed from AST edges
    │  dmChanges  = { count: { old: 0, new: 1 } }
    │
    ▼
useExecutionOverlay.stepComplete(prev, next, firedEdges, dmChanges)
    │
    ▼
Canvas re-renders with VISUAL TRANSITIONS
    ├─ "Initial" node → exit animation (red fade-out)
    ├─ Edge "Initial→Waiting" → flash animation (dashed stroke flows)
    ├─ "Waiting" node → enter animation (green glow + scale-up)
    ├─ Other states → remain dimmed
    └─ Toast notification: "count: 0 → 1"
    │
    ▼
Loop continues until done === true or user stops


User presses ■ Stop (toolbar or canvas)
    │
    ▼
store.stopExecution()
    │
    ▼
POST /instances/:id (DELETE)
    │
    ▼
useExecutionOverlay.stop()
    │  ├─ mode = 'idle'
    │  ├─ activeStateIds = []
    │  └─ firedTransitionIds = []
    │
    ▼
Canvas restores normal editing styles
    └─ All nodes return to default appearance
```

---

### Decisions Embedded in This Plan

| Decision         | Choice                                     | Rationale                                            |
| ---------------- | ------------------------------------------ | ---------------------------------------------------- |
| Canvas as stage  | Canvas IS the execution view               | Progress-driven lifecycle — not a separate panel     |
| EnginePanel role | Control surface only (not the stage)       | Avoids visual duplication; canvas shows live state   |
| Pub/sub bridge   | Zustand cross-store pattern                | No external pub/sub library needed                   |
| Transition infer | Client-side delta computation              | Engine doesn't report fired transitions              |
| Visual feedback  | CSS transitions (no animation library)     | Lightweight, works with React Flow node/edge system  |
| Controls         | Both toolbar + canvas                      | Toolbar for discovery, canvas for quick access       |
| Persistence      | Zustand persist middleware (already built) | Stores engineUrl + instanceId in localStorage        |
| CORS handling    | Vite dev proxy for `/api`                  | Simple, works out of the box for local dev           |
| Error handling   | ErrorBoundary wrapper                      | Graceful degradation, editor survives plugin crashes |

---

### Testing Strategy (Future)

| Component             | Test Type         | What to Test                                                 |
| --------------------- | ----------------- | ------------------------------------------------------------ |
| `EngineClient`        | Unit (mock fetch) | All endpoint methods, error handling, 204 response           |
| `useEngineStore`      | Unit (mock store) | State transitions, action sequencing, persistence            |
| `useExecutionSync`    | Unit              | Delta computation, transition inference, DM change detection |
| `useExecutionOverlay` | Unit (mock store) | Mode transitions, flash auto-cleanup, stepComplete           |
| `ConnectionStatus`    | Component (RTL)   | Connected/connecting/error states, click-to-retry            |
| `InstanceView`        | Component (RTL)   | Rendering snapshot, stop/refresh actions                     |
| `EventInput`          | Component (RTL)   | Validation, submit behavior, error display                   |
| `ExecutionHistory`    | Component (RTL)   | Entry rendering, clear action, empty state                   |
| `ExecutionNode`       | Component (RTL)   | Active/inactive/dimmed styling, exit animation               |
| `ExecutionEdge`       | Component (RTL)   | Flash animation, auto-reset after 800ms                      |
| `ExecutionControls`   | Component (RTL)   | Play/Stop toggling, status badge                             |
| `EnginePanel`         | Component (RTL)   | Composition, open/close animation                            |
| Toolbar integration   | Integration       | Execute↔Stop toggle, panel opens, canvas enters exec mode    |
| End-to-end            | Manual            | Full flow: play → send event → see canvas animate → stop     |
