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

const traceEndpoint = import.meta.env.VITE_OTLP_TRACE_ENDPOINT;

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
    }),
    new UserInteractionInstrumentation({
      eventNames: ["click"],
      // Skip spans for passive/background clicks — only instrument
      // interactive elements where user actions are meaningful for debugging.
      shouldPreventSpanCreation: (eventType, element) => {
        if (eventType !== "click") return true;
        if (!element) return true;
        // Only create spans for <button> and elements with data-track
        if (
          element.tagName === "BUTTON" ||
          element.hasAttribute("data-track")
        ) {
          return false;
        }
        return true;
      },
    }),
  ],
});

logger.info("OpenTelemetry initialized");
