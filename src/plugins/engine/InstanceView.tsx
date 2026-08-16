import { useEngineStore } from "./useEngineStore";
import { useExecutionOverlay } from "./useExecutionOverlay";

/**
 * Displays the current instance snapshot when an execution is active.
 */
export function InstanceView() {
  const { activeInstanceId, instanceSnapshot, stopExecution, refreshSnapshot } =
    useEngineStore();
  const { loading } = useExecutionOverlay();

  if (!activeInstanceId || !instanceSnapshot) return null;

  const { execution_status, done, configuration, datamodel } = instanceSnapshot;

  return (
    <div className="engine-panel-section">
      <div className="engine-panel-section-title">Instance</div>

      <div className="instance-header">
        <span className="instance-id" title={activeInstanceId}>
          {activeInstanceId.slice(0, 16)}…
        </span>
        <span
          className={`instance-badge ${
            done
              ? "instance-badge-completed"
              : execution_status === "running" || execution_status === "idle"
                ? "instance-badge-running"
                : "instance-badge-idle"
          }`}
        >
          {done ? "Done" : execution_status}
        </span>
      </div>

      <div className="engine-panel-section-title" style={{ marginTop: 8 }}>
        Active Configuration
      </div>
      <ul className="instance-config-list">
        {configuration.map((id) => (
          <li key={id} className="instance-config-item">
            {id}
          </li>
        ))}
      </ul>

      {datamodel && Object.keys(datamodel).length > 0 && (
        <>
          <div className="engine-panel-section-title" style={{ marginTop: 8 }}>
            Datamodel (read-only)
          </div>
          <table className="datamodel-table">
            <thead>
              <tr>
                <th>Key</th>
                <th>Value</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(datamodel).map(([key, value]) => (
                <tr key={key}>
                  <td>{key}</td>
                  <td>{JSON.stringify(value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {!datamodel && (
        <div className="datamodel-empty" style={{ marginTop: 4 }}>
          No datamodel
        </div>
      )}

      <div className="instance-actions">
        <button
          type="button"
          className="instance-btn instance-btn-stop"
          onClick={stopExecution}
          disabled={loading}
        >
          ■ Stop Execution
        </button>
        <button
          type="button"
          className="instance-btn instance-btn-refresh"
          onClick={refreshSnapshot}
          disabled={loading}
        >
          ↻ Refresh
        </button>
      </div>
    </div>
  );
}
