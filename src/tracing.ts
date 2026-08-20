/**
 * OpenTelemetry Web Tracing bootstrap.
 *
 * Must be imported **before any other application code** in the entry point
 * (src/main.tsx).  Configures the WebTracerProvider with an OTLP HTTP exporter
 * that sends spans to the Vite dev server at `/api/logs`, where they are
 * printed to the terminal and persisted to `.otlp-traces.log`.
 *
 * Auto-instrumentation:
 * - `fetch` calls (engine HTTP requests, etc.) — each becomes a span
 * - user clicks — each click becomes a span (filter with `shouldPreventSpanCreation` if noisy)
 */

import {
  WebTracerProvider,
  BatchSpanProcessor,
} from "@opentelemetry/sdk-trace-web";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";
import { registerInstrumentations } from "@opentelemetry/instrumentation";
import { FetchInstrumentation } from "@opentelemetry/instrumentation-fetch";
import { UserInteractionInstrumentation } from "@opentelemetry/instrumentation-user-interaction";
import { logger } from "@/plugins/tracing/logger";
import { parserTracer } from "scxml-parser";
import { clientTracer } from "scxml-http-browser-client";

const traceEndpoint = import.meta.env.VITE_OTLP_TRACE_ENDPOINT;

// Mirror the INFO/DEBUG log-level split into the fine-grained spans of the
// bundled parser and browser-client libraries (they are API-only deps, so
// these become no-ops when this provider is absent).
const detailEnabled =
  String(import.meta.env.VITE_LOG_LEVEL ?? "INFO").toUpperCase() === "DEBUG";
parserTracer.setDetail(detailEnabled);
clientTracer.setDetail(detailEnabled);

const otlpExporter = new OTLPTraceExporter({
  url: traceEndpoint,
  headers: {},
});

const provider = new WebTracerProvider({
  resource: resourceFromAttributes({
    [ATTR_SERVICE_NAME]: "scxml-ui-editor",
  }),
  spanProcessors: [new BatchSpanProcessor(otlpExporter)],
});

provider.register();

registerInstrumentations({
  instrumentations: [
    new FetchInstrumentation({
      clearTimingResources: true,
      // Propagate traceparent to the engine so spans are linked across the
      // HTTP boundary. The engine's CORS config (cors_plug) allows the
      // traceparent header through.
      propagateTraceHeaderCorsUrls: [new RegExp("http://localhost:4000")],
      // Don't auto-instrument the OTLP exporter's own POSTs (to the collector
      // or the Vite fallback endpoint) — the exporter creates its own spans
      // and instrumenting them would just add self-referential noise.
      ignoreUrls: [
        new RegExp(":4318"),
        new RegExp("/api/logs"),
      ],
    }),
    new UserInteractionInstrumentation({
      eventNames: ["click"],
      // Rename generic "click" spans to include a human-readable label so
      // the dev-log output is actionable (e.g. "click: Export" instead of
      // "[click]").
      // Labels are derived from the `data-track` attribute when present,
      // falling back to the element's trimmed text content or tag name.
      shouldPreventSpanCreation: (eventType, element, span) => {
        if (eventType !== "click") return true;
        if (!element) return true;

        // Only instrument <button> and elements with data-track
        if (
          element.tagName !== "BUTTON" &&
          !element.hasAttribute("data-track")
        ) {
          return true;
        }

        // Rename the span to something descriptive
        const label =
          element.getAttribute("data-track") ??
          element.textContent?.trim() ??
          element.tagName.toLowerCase();
        span.updateName(`click: ${label}`);

        return false;
      },
    }),
  ],
});

logger.info("OpenTelemetry initialized");
