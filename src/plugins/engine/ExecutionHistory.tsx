import { useEngineStore } from "@/plugins/engine/useEngineStore";

/**
 * Relative time formatting for history entries.
 */
function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  return `${Math.floor(diff / 3_600_000)}h ago`;
}

/**
 * Collapsible log of recent events sent and their results.
 */
export function ExecutionHistory() {
  const { showHistory, toggleHistory, executionHistory, clearHistory } =
    useEngineStore();

  if (executionHistory.length === 0) return null;

  return (
    <div className="engine-panel-section">
      <div
        className="engine-panel-section-title"
        style={{ cursor: "pointer", userSelect: "none" }}
        onClick={toggleHistory}
      >
        {showHistory ? "▼" : "▶"} History ({executionHistory.length})
      </div>

      {showHistory && (
        <>
          <ul className="history-list">
            {executionHistory.map((entry) => (
              <li key={entry.id} className="history-entry">
                <span className="history-entry-time">
                  {relativeTime(entry.timestamp)}
                </span>
                <span className="history-entry-event">{entry.eventName}</span>
                <span
                  className={`history-entry-result ${
                    entry.result === "success"
                      ? "history-entry-success"
                      : "history-entry-error"
                  }`}
                >
                  {entry.result === "success" ? "✓" : "✗"}
                </span>
                {entry.errorMessage && (
                  <span className="history-entry-error-msg">
                    {entry.errorMessage}
                  </span>
                )}
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="history-clear-btn"
            onClick={clearHistory}
          >
            Clear History
          </button>
        </>
      )}
    </div>
  );
}
