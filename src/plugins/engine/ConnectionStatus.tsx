import { useEngineStore } from "@/plugins/engine/useEngineStore";

/**
 * Compact inline connection status indicator.
 */
export function ConnectionStatus({ compact }: { compact?: boolean }) {
  const { connected, connecting, connectionError, config, connect } =
    useEngineStore();

  if (compact) {
    return (
      <span
        className={`connection-dot ${
          connected
            ? "connection-dot-connected"
            : connecting
              ? "connection-dot-connecting"
              : "connection-dot-error"
        }`}
        title={connected ? "Connected" : connectionError || "Disconnected"}
      />
    );
  }

  return (
    <div className="connection-status">
      <span
        className={`connection-dot ${
          connected
            ? "connection-dot-connected"
            : connecting
              ? "connection-dot-connecting"
              : "connection-dot-error"
        }`}
      />
      <span>
        {connected
          ? `Connected to ${config.engineUrl}`
          : connecting
            ? "Connecting…"
            : connectionError
              ? "Connection error"
              : "Disconnected"}
      </span>
      {connectionError && (
        <>
          <span className="connection-error-msg">{connectionError}</span>
          <button
            type="button"
            className="connection-retry-btn"
            onClick={connect}
          >
            Retry
          </button>
        </>
      )}
    </div>
  );
}
