import { useCallback, useState } from "react";
import { useEngineStore } from "@/plugins/engine/useEngineStore";

/**
 * Form for sending events to the running instance.
 *
 * Fields: event name (required) + optional JSON data.
 */
export function EventInput() {
  const { activeInstanceId, isLoading, sendEvent } = useEngineStore();
  const [eventName, setEventName] = useState("");
  const [eventData, setEventData] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(async () => {
    const trimmed = eventName.trim();
    if (!trimmed) {
      setError("Event name is required");
      return;
    }

    let parsed: Record<string, unknown> | undefined;
    if (eventData.trim()) {
      try {
        parsed = JSON.parse(eventData.trim()) as Record<string, unknown>;
      } catch {
        setError("Invalid JSON in event data");
        return;
      }
    }

    setError(null);
    await sendEvent(trimmed, parsed);

    // Clear form on success (check store state after send)
    const state = useEngineStore.getState();
    const lastEntry = state.executionHistory[0];
    if (lastEntry?.result === "success") {
      setEventName("");
      setEventData("");
    }
  }, [eventName, eventData, sendEvent]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit],
  );

  if (!activeInstanceId) return null;

  return (
    <div className="engine-panel-section">
      <div className="engine-panel-section-title">Send Event</div>

      <div className="event-form">
        <div className="event-input-row">
          <input
            type="text"
            className="event-name-input"
            placeholder="Event name (e.g. start)"
            value={eventName}
            onChange={(e) => setEventName(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isLoading}
          />
          <button
            type="button"
            className="event-send-btn"
            onClick={handleSubmit}
            disabled={isLoading || !eventName.trim()}
          >
            {isLoading ? "…" : "Send"}
          </button>
        </div>

        <textarea
          className="event-data-input"
          placeholder={'Optional JSON data (e.g. { "count": 1 })'}
          value={eventData}
          onChange={(e) => setEventData(e.target.value)}
          disabled={isLoading}
          rows={2}
        />

        {error && <p className="event-error">{error}</p>}
      </div>
    </div>
  );
}
