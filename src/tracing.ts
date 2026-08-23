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

// Per-element timestamps of the last accepted `click:` span, used to collapse
// the instrumentation's nested duplicate click spans (see below). A WeakMap
// keeps no strong references to DOM elements, so it can't leak.
const lastClickSpanAt = new WeakMap<Element, number>();
// A real user cannot trigger two clicks on the same element within this
// window, but the instrumentation's nested capture/bubble spans all fire
// within microseconds, so this cleanly separates "one real click" from
// "the duplicate chain created for that one click".
const CLICK_DEDUP_WINDOW_MS = 250;

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
      propagateTraceHeaderCorsUrls: [/http:\/\/localhost:4000/],
      // Don't auto-instrument the OTLP exporter's own POSTs (to the collector
      // or the Vite fallback endpoint) — the exporter creates its own spans
      // and instrumenting them would just add self-referential noise.
      ignoreUrls: [/:4318/, /\/api\/logs/],
    }),
    new UserInteractionInstrumentation({
      eventNames: ["click"],
      // Dedup via shouldPreventSpanCreation: the instrumentation emits a
      // nested `click:` span per event listener, so one click becomes a
      // 4-deep chain of identical spans. (No `preventDuplicates` option
      // exists in this package — don't add one.) The window collapses the
      // chain to one span per real click while allowing genuine re-clicks.
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

        // Dedup: reject any click span on the same element that fires within
        // the dedup window of the previous one (the nested chain).
        const now = Date.now();
        const prev = lastClickSpanAt.get(element) ?? 0;
        if (now - prev < CLICK_DEDUP_WINDOW_MS) return true;
        lastClickSpanAt.set(element, now);

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
