/**
 * Plugin entry point for the SCXML engine integration.
 *
 * Consumers can import from `@/plugins/engine` rather than reaching into
 * individual files.
 */

export { useEngineStore } from "./useEngineStore";
export type {
  EngineConfig,
  EngineState,
  ExecutionEntry,
} from "./useEngineStore";
export { defaultConfig } from "./useEngineStore";

export { useExecutionOverlay } from "./useExecutionOverlay";
export type {
  ExecutionMode,
  ExecutionOverlayState,
} from "./useExecutionOverlay";

export {
  syncSnapshotToCanvas,
  computeFiredTransitions,
} from "./useExecutionSync";

export { EnginePanel } from "./EnginePanel";
export { ConnectionStatus } from "./ConnectionStatus";
export { InstanceView } from "./InstanceView";
export { EventInput } from "./EventInput";
export { ExecutionHistory } from "./ExecutionHistory";
