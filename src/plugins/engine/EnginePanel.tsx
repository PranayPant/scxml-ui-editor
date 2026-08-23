import { useEngineStore } from "@/plugins/engine/useEngineStore";
import { ConnectionStatus } from "./ConnectionStatus";
import { InstanceView } from "./InstanceView";
import { EventInput } from "./EventInput";
import { ExecutionHistory } from "./ExecutionHistory";

/**
 * Collapsible sidebar control surface for the SCXML engine.
 *
 * Composes connection status, instance view, event input, and execution
 * history into a single panel that overlays the right side of the editor.
 */
export function EnginePanel() {
  const { panelOpen, togglePanel, connected, connect } = useEngineStore();

  if (!panelOpen) return null;

  return (
    <div className="engine-panel-overlay">
      <div className="engine-panel-header">
        <span>⚡ Engine</span>
        <button
          type="button"
          data-track="Close Engine Panel"
          className="engine-panel-close"
          onClick={togglePanel}
        >
          ✕
        </button>
      </div>

      <div className="engine-panel-section">
        <div className="engine-panel-section-title">Connection</div>
        <ConnectionStatus />
        {!connected && (
          <button
            type="button"
            data-track="Connect"
            className="connection-retry-btn"
            onClick={connect}
            style={{ marginTop: 6 }}
          >
            Connect
          </button>
        )}
      </div>

      <InstanceView />
      <EventInput />
      <ExecutionHistory />
    </div>
  );
}
