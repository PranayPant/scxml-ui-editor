/**
 * tslog singleton with OTel trace_id/span_id stamping.
 *
 * Import this module once (it is re-exported from the tracing bootstrap).
 * The logger auto-detects browser vs. Node and TTY vs. piped; in the browser
 * dev console it renders pretty CSS-styled output.
 *
 * Log level is controlled via `VITE_LOG_LEVEL` env var (default: INFO).
 * Set `VITE_LOG_LEVEL=DEBUG` in `.env.development` for verbose output.
 */

import { Logger } from "tslog";
import { trace } from "@opentelemetry/api";

const logLevel = (import.meta as any).env?.VITE_LOG_LEVEL ?? "INFO";

export const logger = new Logger({
  name: "scxml-ui-editor",
  type: (import.meta as any).env?.PROD ? "json" : "pretty",
  minLevel: logLevel,
});

// Stamp every log record with the active OTel trace_id and span_id so
// logs and traces are correlated in the dev console.
logger.use((ctx) => {
  const activeSpan = trace.getActiveSpan();
  if (activeSpan) {
    const { traceId, spanId } = activeSpan.spanContext();
    ctx.meta.trace_id = traceId;
    ctx.meta.span_id = spanId;
  }
  return ctx;
});

/**
 * Create a child logger scoped to a named sub-module.
 * Inherits all settings (minLevel, type, middleware) from the root logger.
 */
export function getSubLogger(name: string): Logger<unknown> {
  return logger.getSubLogger({ name });
}
