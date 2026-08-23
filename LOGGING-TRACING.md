Here is a complete setup guide for pure client-side OpenTelemetry tracing in a TypeScript and Vite application, using the local console for visualization. [1]

## 1. Installation

Install the minimal browser-specific OpenTelemetry packages required for manual and automatic instrumentation.

npm install @opentelemetry/api \
 @opentelemetry/sdk-trace-web \
 @opentelemetry/resources \
 @opentelemetry/semantic-conventions \
 @opentelemetry/instrumentation-fetch \
 @opentelemetry/instrumentation-user-interaction

## 2. Tracing Initialization File

Create a file named tracing.ts in your src directory. This script configures the provider, captures user clicks, hooks into network calls, and outputs the spans directly to your browser's console. [2, 3]

import { WebTracerProvider } from '@opentelemetry/sdk-trace-web';import { BatchSpanProcessor, ConsoleSpanExporter } from '@opentelemetry/sdk-trace-web';import { Resource } from '@opentelemetry/resources';import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';import { registerInstrumentations } from '@opentelemetry/instrumentation';import { FetchInstrumentation } from '@opentelemetry/instrumentation-fetch';import { UserInteractionInstrumentation } from '@opentelemetry/instrumentation-user-interaction';
// 1. Initialize the Provider with your app nameconst provider = new WebTracerProvider({
resource: new Resource({
[ATTR_SERVICE_NAME]: 'my-vite-client-app',
}),
});
// 2. Export spans to the browser console for local testing
provider.addSpanProcessor(new BatchSpanProcessor(new ConsoleSpanExporter()));
// 3. Register the provider globally
provider.register();
// 4. Automatically capture network requests and UI clicks
registerInstrumentations({
instrumentations: [
new FetchInstrumentation({
clearTimingResources: true,
// propagate trace headers to your API if needed later
propagateTraceHeaderCorsUrls: [/.*/],
}),
new UserInteractionInstrumentation({
eventNames: ['click'],
}),
],
});

console.log('OpenTelemetry Web Tracing Initialized 🚀');

## 3. Integrate into Vite Entry Point

Import your tracing configuration at the absolute top of your main entry file (e.g., main.ts or index.tsx). It must execute before any other application code runs. [4, 5, 6, 7]

// main.tsimport './tracing'; // Must be first!import React from 'react';import ReactDOM from 'react-dom/client';import App from './App';import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(<App />);

## 4. Manual Tracing Example

To wrap business logic, page loads, or complex calculations in custom spans, use the OpenTelemetry API directly in your components or services. [8]

import { trace } from '@opentelemetry/api';
const tracer = trace.getTracer('my-vite-client-app', '1.0.0');
export function ProcessPayment() {
// Start a manual span
const span = tracer.startSpan('process-payment-operation');

// Set context data
span.setAttribute('payment.type', 'credit_card');

try {
// Your application logic here
span.addEvent('validation_passed');

    // Simulate work
    span.setStatus({ code: 1 }); // OK

} catch (error) {
span.setStatus({
code: 2, // ERROR
message: error instanceof Error ? error.message : 'Unknown error',
});
span.recordException(error as Error);
} finally {
// Always close the span
span.end();
}
}

## Integration Tips

- Vite Optimization: OpenTelemetry uses internal Node globals in some underlying packages. Vite handles this natively in newer versions, but if you hit bundler errors, add vite-plugin-node-polyfills to your vite.config.ts.
- Inspect the Console: Open your browser's Developer Tools (F12). Look for JSON objects printed by ConsoleSpanExporter. You will see automatic fields like traceId, duration, and HTTP status codes for fetch requests. [9, 10, 11, 12, 13]
- Trace Context Propagation: Even without a cloud provider, your FetchInstrumentation automatically attaches traceparent headers to outgoing HTTP requests. If your backend uses OpenTelemetry, it will read this header and seamlessly stitch your frontend and backend timelines together. [14]

## Custom Endpoint
To route your traces to a custom endpoint that changes dynamically based on your environment, you will transition from using the local ConsoleSpanExporter to the official OpenTelemetry OTLP (OpenTelemetry Protocol) JSON Exporter.
This approach converts spans into structured JSON payloads and POSTs them to your designated endpoint.
## 1. Install the OTLP Exporter
Remove the console exporter and install the lightweight HTTP/JSON OTLP exporter package:

npm install @opentelemetry/exporter-trace-otlp-http

## 2. Configure Vite Environment Variables
Vite manages environments using .env files. Define your ingestion URLs for development and production. [1] 
Create a .env.development file for local work:

# For localhost: Point to your local Vite dev server endpoint
VITE_OTLP_TRACE_ENDPOINT="http://localhost:5173/api/logs"

Create a .env.production file for your live service:

# For production: Point to your cloud collector, backend, or proxy gateway
VITE_OTLP_TRACE_ENDPOINT="https://yourproductionservice.com"

## 3. Dynamic Tracing Initialization File
Update your tracing.ts file to consume the Vite environment variable. The SDK will automatically swap endpoints depending on how you build or run the application.

// src/tracing.tsimport { WebTracerProvider, BatchSpanProcessor } from '@opentelemetry/sdk-trace-web';import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';import { Resource } from '@opentelemetry/resources';import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';import { registerInstrumentations } from '@opentelemetry/instrumentation';import { FetchInstrumentation } from '@opentelemetry/instrumentation-fetch';import { UserInteractionInstrumentation } from '@opentelemetry/instrumentation-user-interaction';
const provider = new WebTracerProvider({
  resource: new Resource({
    [ATTR_SERVICE_NAME]: 'my-react-client-app',
  }),
});
// Grab the endpoint string assigned by Vite dynamically per environmentconst traceEndpoint = import.meta.env.VITE_OTLP_TRACE_ENDPOINT;
// Configure the exporter to send structured JSON POST requestsconst otlpExporter = new OTLPTraceExporter({
  url: traceEndpoint,
  headers: {}, // You can inject authorization tokens here in production if required
});
// BatchSpanProcessor groups spans together and fires them efficiently
provider.addSpanProcessor(new BatchSpanProcessor(otlpExporter));
provider.register();

registerInstrumentations({
  instrumentations: [
    new FetchInstrumentation({ clearTimingResources: true }),
    new UserInteractionInstrumentation({ eventNames: ['click'] }),
  ],
});

## 4. Catch and Pipe Traces to stdout via Vite Dev Server
Because your localhost endpoint (http://localhost:5173/api/logs) hits the Vite dev server directly, you need a server-side proxy plugin to intercept these requests, extract the structured OpenTelemetry data, and pipe it directly to your terminal (stdout) or a local file.
Update your vite.config.ts to include a custom middleware plugin:

// vite.config.tsimport { defineConfig } from 'vite';import react from '@vitejs/react-plugin';import fs from 'fs';import path from 'path';
export default defineConfig({
  plugins: [
    react(),
    {
      name: 'vite-plugin-trace-collector',
      configureServer(server) {
        // Intercept incoming HTTP requests on the Vite dev server
        server.middlewares.use('/api/logs', (req, res, next) => {
          if (req.method === 'POST') {
            let body = '';
            
            req.on('data', (chunk) => {
              body += chunk;
            });

            req.on('end', () => {
              try {
                const parsedTraceData = JSON.parse(body);
                
                // 1. Pipe to terminal stdout (beautifully formatted)
                console.log('\n=== Received OpenTelemetry Spans ===');
                console.dir(parsedTraceData, { depth: null, colors: true });

                // 2. Pipe to a local text/log file
                const filePath = path.join(process.cwd(), 'stdout_traces.log');
                const logLine = `${new Date().toISOString()} - ${body}\n`;
                fs.appendFileSync(filePath, logLine, 'utf-8');

              } catch (err) {
                console.error('Failed to parse incoming client trace payload', err);
              }

              // Respond to the client browser to acknowledge receipt
              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ status: 'success' }));
            });
          } else {
            next();
          }
        });
      },
    },
  ],
});

## Integration Tips

* CORS Behavior: The Vite server middleware bypasses CORS friction automatically since the traffic runs on the exact same host and port (localhost:5173) during development.
* Production Security: When pointing your production .env config to a real logging service, ensure your cloud provider supports direct public ingestion webhooks from web browsers, or route the production endpoint through your own backend proxy to shield your private logging credentials.

## Error Boundary
To pipe uncaught React UI crashes directly into your OpenTelemetry tracing pipeline, you can build a custom React Error Boundary component.
When a component crashes during rendering, the Error Boundary catches the error, extracts the active trace context, records the exception details, and flushes the data immediately so the crash is pushed to your endpoint before the page changes or freezes. [1, 2] 
Here is the step-by-step setup guide and code implementation.
## 1. Create the Telemetry Error Boundary
React Error Boundaries must be written as Class Components, because functional components do not yet support lifecycles like componentDidCatch. [3, 4] 
Create a new file named TelemetryErrorBoundary.tsx in your components directory:

// src/components/TelemetryErrorBoundary.tsximport React, { Component, ErrorInfo, ReactNode } from 'react';import { trace, context, SpanStatusCode } from '@opentelemetry/api';
interface Props {
  children: ReactNode;
  fallback?: ReactNode; // Optional custom UI to show to users instead of a blank screen
}
interface State {
  hasError: boolean;
  traceId: string | null;
}
export class TelemetryErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    traceId: null,
  };

  public static getDerivedStateFromError(_: Error): Partial<State> {
    // Update state so the next render will show the fallback UI.
    return { hasError: true };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // 1. Get the current active telemetry tracer
    const tracer = trace.getTracer('react-error-boundary');
    
    // 2. Start a dedicated crash span
    const span = tracer.startSpan('react-ui-crash', {
      attributes: {
        'error.type': error.name || 'UnknownError',
        'component.stack': errorInfo.componentStack || 'No component stack trace',
      },
    });

    // 3. Record the true exception details and fail the span status
    span.recordException(error);
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error.message,
    });

    // 4. Capture the Trace ID to show on-screen for user support reference
    const currentTraceId = span.spanContext().traceId;
    this.setState({ traceId: currentTraceId });

    // 5. Always end the span to trigger the BatchSpanProcessor
    span.end();
    
    // Pro-Tip: Force the OpenTelemetry SDK to immediately flush its buffer 
    // to your Vite server or Prod endpoint so data isn't lost if the app unmounts.
    const activeProvider = trace.getTracerProvider() as any;
    if (activeProvider && typeof activeProvider.forceFlush === 'function') {
      activeProvider.forceFlush();
    }
  }

  public render() {
    if (this.state.hasError) {
      // Return a clean fallback UI to the user
      return this.props.fallback ? (
        this.props.fallback
      ) : (
        <div style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
          <h2>Something went wrong.</h2>
          <p>Our engineering team has been notified of this error automatically.</p>
          {this.state.traceId && (
            <p style={{ fontSize: '0.85rem', color: '#666' }}>
              Reference ID: <code>{this.state.traceId}</code>
            </p>
          )}
          <button onClick={() => window.location.reload()}>Reload Page</button>
        </div>
      );
    }

    return this.props.children;
  }
}

## 2. Wrap Your Application
To catch any rendering crashes across your whole app, wrap your main component tree inside this error boundary inside your main.tsx (or App.tsx) file.

// src/main.tsximport './tracing'; // Ensure telemetry initializes first!import React from 'react';import ReactDOM from 'react-dom/client';import App from './App';import { TelemetryErrorBoundary } from './components/TelemetryErrorBoundary';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <TelemetryErrorBoundary>
      <App />
    </TelemetryErrorBoundary>
  </React.StrictMode>
);

## 3. How to Test the Integration
To verify that errors are flowing through your environment-based configurations properly, you can build a small component designed to crash deliberately.

// src/components/BrokenComponent.tsximport { useState } from 'react';
export function BrokenComponent() {
  const [shouldCrash, setShouldCrash] = useState(false);

  if (shouldCrash) {
    // This will trigger an uncaught render-time error
    throw new Error('Simulated UI crash event!');
  }

  return (
    <button onClick={() => setShouldCrash(true)} style={{ background: 'red', color: 'white' }}>
      Force Component Crash
    </button>
  );
}

When you click that button:

* The React application UI will switch over to your clean Error Boundary fallback state.
* The error stack trace and component details will package into a JSON span payload.
* In development, the payload travels to http://localhost:5173/api/logs. Your customized vite.config.ts plugin will intercept it, print the crash to your terminal console (stdout), and write the exact payload details into your local stdout_traces.log file.
* In production, the exact same structure routes directly to the API url specified in your .env.production file. [5] 

If you want, tell me:

* Would you like to see how to extend this to capture global unhandled promise rejections (like failed async API calls that happen outside of component rendering loops)?
* Do you want to see how to inject a custom logging tool like tslog into the error boundary fallback UI for local terminal debugging?

I can provide the specific configurations or snippets.

[1] [https://www.acte.in](https://www.acte.in/understanding-error-boundaries-in-react)
[2] [https://www.youtube.com](https://www.youtube.com/watch?v=HTkttwd0rdA)
[3] [https://refine.dev](https://refine.dev/blog/react-error-boundaries/)
[4] [https://medium.com](https://medium.com/@rajeevranjan2k11/error-handling-in-react-apps-a-complete-guide-to-error-boundaries-and-best-practices-094aa0e4a641)
[5] [https://reliasoftware.com](https://reliasoftware.com/blog/react-error-boundary)

# Further Notes
In the past, OpenTelemetry packages occasionally relied on internal Node.js modules (like util or path), which forced Vite users to install polyfill libraries. [1] 
The latest behavior reveals that vite-plugin-node-polyfills is no longer required for a standard web setup if you are using modern OpenTelemetry packages. The OpenTelemetry maintainers updated the browser-specific SDKs and exporters (such as @opentelemetry/sdk-trace-web and @opentelemetry/exporter-trace-otlp-http) to rely completely on standard web APIs (like fetch and performance) rather than Node.js built-ins. [1, 2, 3] 
However, there are still a few edge cases where polyfills are necessary: [4] 
## 1. Accidentally Importing Node SDK Packages
If you accidentally import packages intended exclusively for server-side execution, Vite will immediately throw error warnings about missing dependencies: [5] 

* 
* ❌ Do not use: @opentelemetry/sdk-node or @opentelemetry/auto-instrumentations-node in your frontend files.
* Only use: @opentelemetry/sdk-trace-web and custom manual web wrappers. [2, 6] 
* 

## 2. When Polyfills Are Still Needed
You will only need to fall back on vite-plugin-node-polyfills if: [7] 

* 
* You pull in third-party, non-OTel open-source packages that expect a global process.env variable to be defined.
* You are handling heavy cryptographic or buffer-related processes alongside your telemetry tracking. [7, 8, 9] 
* 

## The Recommended Implementation (If Needed)
If you hit an edge-case dependency that demands Node globals, install the plugin: [7] 

npm install vite-plugin-node-polyfills --save-dev

Then modify your vite.config.ts to selectively target only the required globals, which avoids bloating your final production bundle bundle: [10] 

import { defineConfig } from 'vite';import react from '@vitejs/plugin-react';import { nodePolyfills } from 'vite-plugin-node-polyfills';
export default defineConfig({
  plugins: [
    react(),
    nodePolyfills({
      // Keep this as minimal as possible!
      globals: {
        process: true, 
        global: true,
      },
    }),
  ],
});

You have an excellent grasp of how these instruments behave under the hood. Your observations regarding both trace propagation and instrumentation noise are spot on.
Here is what to look out for regarding those specific behaviors as your setup grows:
## Trace Propagation (traceparent)
Using propagateTraceHeaderCorsUrls: [/.*/] is a great strategy during early development because it guarantees you won't miss a cross-origin boundary.
If your Elixir engine or any third-party service (like an image hosting API or authentication provider) does start throwing CORS errors due to the traceparent header, it will look like a network failure in your browser console. If that happens, you can easily restrict propagation to just your engine by tightening the pattern in your tracing.ts:

new FetchInstrumentation({
  clearTimingResources: true,
  // Restrict header propagation exclusively to your Elixir engine
  propagateTraceHeaderCorsUrls: [
    /localhost:4000/,
    /api\.yourproductiondomain\.com/ // Keep your future prod API in mind!
  ], 
})

## Managing User Interaction Noise
You are completely right—UserInteractionInstrumentation captures every click event by default, which fills up the terminal and local log files quickly.
If the noise becomes too distracting during heavy UI building, you can filter the events. The plugin allows you to pass a shouldPreventSpanCreation hook to ignore basic clicks (like opening a dropdown or toggling a tab) while keeping high-value interactions:

new UserInteractionInstrumentation({
  eventNames: ['click'],
  shouldPreventSpanCreation: (eventType, element, span) => {
    // Example: Only create spans for elements that have a specific data attribute
    // <button data-track="checkout">Pay</button>
    const shouldTrack = element.hasAttribute('data-track');
    return !shouldTrack; // Return true to block/prevent the span creation
  }
})

This keeps your automatic click tracking intact for major workflows without flooding your stdout log file with every minor UI interaction.
If you want, tell me:

* Would you like to see how to adjust your Vite server middleware plugin to filter out or ignore specific types of spans (like low-priority clicks) before they write to your stdout_traces.log file?
* Do you want to see how to structure the Elixir plug/middleware on your backend engine to read that incoming traceparent header and continue the frontend's timeline?

I can provide the exact code changes for either side of your stack.

## Robust OteL with tslog
No, you should not use custom tslog transports to pipe your application logs into OpenTelemetry. In a production environment, doing so creates massive network overhead because every single log line triggers an active OpenTelemetry SDK processing lifecycle.
Instead, the most robust, standard-compliant, and noise-free architecture splits the work by using Logs for Context and Traces for Flow.
Here is the ultimate blueprint used to maintain high utility in development without impacting production performance.
------------------------------
## The Master Blueprint: High Utility, Zero Noise
The trick to a robust setup is changing how the tools emit data based on whether you are running a local build or production code:

   1. Development (Readable): tslog pretty-prints human-readable logs directly to the Browser Console. Simultaneously, OpenTelemetry sends structured JSON blocks to your Vite local server proxy, which parses them into clear visual graphs or lines.
   2. Production (Performance): tslog changes its output style to raw structured JSON strings directed straight to console.log. The cloud collector or container agent (e.g., Datadog, AWS FireLens, or an OpenTelemetry Collector) scrapes the console logs and seamlessly links them with your OpenTelemetry traces using a shared Trace ID.

------------------------------
## 1. The Production-Ready Logger (src/logger.ts)
Configure tslog to be a pure metadata injector. It stays lightweight and simply stamps the active OpenTelemetry Trace ID onto your standard logs.

import { Logger } from 'tslog';import { trace } from '@opentelemetry/api';
export const log = new Logger({
  name: 'scxml-editor',
  // Local dev gets pretty colors; Production gets high-speed, scrapable JSON strings
  type: import.meta.env.PROD ? 'json' : 'pretty',
  // Suppress low-level debug/trace logs in production completely
  minLevel: import.meta.env.PROD ? 3 : 1, 
});
// Automatically stamp the active OpenTelemetry IDs into every single log line
log.addTransformProcessor((logObject) => {
  const activeSpan = trace.getActiveSpan();
  if (activeSpan) {
    const context = activeSpan.spanContext();
    logObject.trace_id = context.traceId;
    logObject.span_id = context.spanId;
  }
  return logObject;
});

------------------------------
## 2. Noise-Free Tracing Engine (src/tracing.ts)
To prevent your system from flooding your logs with thousands of useless mouse clicks, tighten your automatic instrumentation settings. Only trace high-value user actions and nested execution blocks.

import { WebTracerProvider, BatchSpanProcessor } from '@opentelemetry/sdk-trace-web';import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';import { Resource } from '@opentelemetry/resources';import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';import { registerInstrumentations } from '@opentelemetry/instrumentation';import { FetchInstrumentation } from '@opentelemetry/instrumentation-fetch';import { UserInteractionInstrumentation } from '@opentelemetry/instrumentation-user-interaction';
const provider = new WebTracerProvider({
  resource: new Resource({ [ATTR_SERVICE_NAME]: 'scxml-ui-editor' }),
});
// Direct spans to the current environment's target ingestion linkconst otlpExporter = new OTLPTraceExporter({
  url: import.meta.env.VITE_OTLP_TRACE_ENDPOINT,
});

provider.addSpanProcessor(new BatchSpanProcessor(otlpExporter));
provider.register();

registerInstrumentations({
  instrumentations: [
    new FetchInstrumentation({
      clearTimingResources: true,
      // Target only your Elixir backend to stop leaking trace headers to third parties
      propagateTraceHeaderCorsUrls: [/localhost:4000/, /api\.yourdomain\.com/],
    }),
    new UserInteractionInstrumentation({
      eventNames: ['click'],
      // ELIMINATE NOISE: Ignore passive UI clicks entirely
      shouldPreventSpanCreation: (eventType, element) => {
        const isCriticalAction = 
          element.tagName === 'BUTTON' || 
          element.hasAttribute('data-track');
        return !isCriticalAction; 
      },
    }),
  ],
});

------------------------------
## 3. The Visual Vite Developer Plugin (vite.config.ts)
Instead of listing a flat file list of raw JSON logs, upgrade your local Vite server middleware proxy to render an ASCII tree structure. This visually maps parent-child dependencies directly in your terminal.

// Inside your vite.config.ts configureServer(server) hook:
server.middlewares.use('/api/logs', (req, res, next) => {
  if (req.method === 'POST') {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        
        payload.resourceSpans?.forEach((resSpan: any) => {
          resSpan.scopeSpans?.forEach((scopeSpan: any) => {
            // Sort incoming spans by their start time to guarantee a logical timeline
            const spans = scopeSpan.spans || [];
            spans.sort((a: any, b: any) => Number(BigInt(a.startTimeUnixNano) - BigInt(b.startTimeUnixNano)));

            spans.forEach((span: any) => {
              const start = BigInt(span.startTimeUnixNano);
              const end = BigInt(span.endTimeUnixNano);
              const durationMs = Number(end - start) / 1_000_000;
              
              // Detect if this span is a nested child block
              const isChild = !!span.parentSpanId;
              const indent = isChild ? '   └── ⚡ ' : '🔹 ';
              const StatusSymbol = span.status?.code === 2 ? '❌' : '⏱️';

              console.log(
                `${indent}${StatusSymbol} [${span.name}] ` +
                `${durationMs.toFixed(2)}ms (ID: ${span.spanId.slice(0,6)})`
              );
            });
          });
        });
      } catch (e) {}
      res.statusCode = 200;
      res.end(JSON.stringify({ status: 'ok' }));
    });
  } else {
    next();
  }
});

------------------------------
## The Developer Experience Result## Local Terminal Output
When your React frontend executes complex operations, your terminal output remains tidy and clean:

🔹 ⏱️ [seedStore] 12.40ms (ID: 44b915)
   └── ⚡ ⏱️ [scxmlToFlow] 2.10ms (ID: 7cc1b5)
   └── ⚡ ⏱️ [validateSchema] 0.85ms (ID: d2394b)
🔹 ⏱️ [HTTP POST - localhost:4000/api/save] 45.10ms (ID: a812ef)

## Why This Setup is Unbreakable

* Zero Performance Lag: Traces are batched and dispatched asynchronously via web workers or background micro-tasks.
* Seamless Correlation: Because your logs (tslog) and performance graphs (otel) share an identical, unique trace_id string, clicking any log error in a platform like Datadog or Sentry immediately opens up the exact execution timeline that caused the failure.

If you want, tell me:

* Would you like to see how to integrate this context tracing seamlessly with Zustand or Redux actions?
* Do you want to wire up custom attributes to the spans (like tracking SCXML file sizes)?

I can supply the code expansions.

Yes, you absolutely should use tslog's structured JSON feature, but exclusively for production environments. [1, 2] 
In your development environment, you should stick to tslog's pretty-printed format. Here is exactly why you want this split setup and how to configure it correctly.
------------------------------
## Why You Use JSON in Prod, but Not in Dev

* In Development (Turn JSON Off): Structured JSON strings are hard for human eyes to parse quickly in a scrolling terminal or browser developer tools. You want tslog's "pretty" mode because it uses clear spacing, timestamps, and colored text tags. [3] 
* In Production (Turn JSON On): Cloud logging infrastructure (like Datadog, AWS CloudWatch, Google Cloud Logging, or Sentry) cannot easily parse colored terminal text. These platforms expect a flat, pure JSON object string per line. They read the JSON properties instantly, index them, and let you filter logs by trace_id, span_id, or logLevel with zero parsing setup. [4, 5, 6] 

------------------------------
## The Production JSON Output Structure
When tslog's JSON feature is enabled, a single log statement like log.error("Failed to parse SCXML document") stops printing raw text and instead outputs a single-line string that looks like this:

{"_meta":{"name":"scxml-editor","logLevelId":5,"logLevelName":"ERROR","date":"2026-08-16T14:32:00.000Z"},"0":"Failed to parse SCXML document","trace_id":"ab96a623dc7ba0e9cc0c1e85f8a9edaa","span_id":"44b9151131aad385"}

------------------------------
## How to Cleanly Toggle It
Vite provides the import.meta.env.PROD boolean out of the box. You use this inside your src/logger.ts file to automatically flip the switch during your production build step, requiring zero manual changes from you.

// src/logger.tsimport { Logger } from 'tslog';import { trace } from '@opentelemetry/api';
export const log = new Logger({
  name: 'scxml-editor',
  
  // 🌟 THE TOGGLE: 'json' outputs clean string objects for cloud scrapers.
  // 'pretty' outputs colored, human-readable terminal lines for local coding.
  type: import.meta.env.PROD ? 'json' : 'pretty',
  
  // Clean up production by ignoring low-level debug or trace lines entirely
  minLevel: import.meta.env.PROD ? 3 : 1, 
});
// Maintain the transformer to inject your OpenTelemetry links
log.addTransformProcessor((logObject) => {
  const activeSpan = trace.getActiveSpan();
  if (activeSpan) {
    const context = activeSpan.spanContext();
    // These keys become root-level parameters in your production cloud JSON log
    logObject.trace_id = context.traceId;
    logObject.span_id = context.spanId;
  }
  return logObject;
});

------------------------------
## Pro-Tip: Avoid Log Object Nesting
By default, when you pass objects to tslog like this:

log.info("State changed", { computationalNode: "A1" });

tslog puts your custom arguments inside numbered array keys ("0", "1") inside the output JSON string.
If your production log platform struggles to index those numbered arrays, you can use a small map helper inside your addTransformProcessor block to pull your custom keys straight out to the root layer of the JSON object, keeping your production data flat and easy to search.
If you want, tell me:

Yes, while there isn't an official plugin called zustand-opentelemetry, you can easily build a custom Zustand middleware that automatically wraps every state action inside an OpenTelemetry trace span and logs transitions with tslog.
Because Zustand handles all state mutations through a central store, this single middleware gives you complete visibility into which user action triggered a state change, how long the reducers took to process, and what the before/after state snapshots look like. [1] 
------------------------------
## 1. Create the Telemetry Middleware
Create a reusable utility file named src/store/telemetryMiddleware.ts. This middleware intercepts every execution block, maps it to an OpenTelemetry span, and handles performance benchmarking automatically.

// src/store/telemetryMiddleware.tsimport { StateCreator } from 'zustand';import { trace, SpanStatusCode } from '@opentelemetry/api';import { log } from '../logger';
const tracer = trace.getTracer('zustand-state-tracer');
type TelemetryMiddleware = <T>(
  f: StateCreator<T, [], []>,
  storeName?: string
) => StateCreator<T, [], []>;
export const telemetryMiddleware: TelemetryMiddleware = (config, storeName = 'Store') => (
  set,
  get,
  api
) => {
  // Wrap the standard Zustand set method
  const loggedSet: typeof set = (partial, replace) => {
    // 1. Identify what action or mutation is being executed
    // We try to extract an active stack or calling trace name if available
    const actionName = `${storeName}.setState`;

    tracer.startActiveSpan(actionName, (span) => {
      try {
        const prevState = { ...get() };
        
        // 2. Execute the state mutation
        set(partial, replace);
        
        const nextState = get();

        // 3. Document the milestone locally using tslog
        log.debug(`State Mutation: ${actionName}`, {
          prev: prevState,
          next: nextState
        });

        span.setStatus({ code: SpanStatusCode.OK });
      } catch (error) {
        if (error instanceof Error) {
          log.error(`Zustand mutation crashed inside ${actionName}`, error);
          span.recordException(error);
          span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
        }
        throw error;
      } finally {
        span.end();
      }
    });
  };

  return config(loggedSet, get, api);
};

------------------------------
## 2. Apply it to Your Store
Wrap your store initialization with the custom telemetryMiddleware. Pass your store name as the second string argument so your spans are explicitly named in your terminal logs.

// src/store/useEditorStore.tsimport { create } from 'zustand';import { telemetryMiddleware } from './telemetryMiddleware';
interface EditorState {
  scxmlRaw: string;
  flowNodes: any[];
  setScxml: (xml: string) => void;
  clearEditor: () => void;
}
export const useEditorStore = create<EditorState>()(
  telemetryMiddleware(
    (set) => ({
      scxmlRaw: '',
      flowNodes: [],
      
      setScxml: (xml) => set((state) => ({ 
        scxmlRaw: xml,
        // Any child calculations run here automatically nest under this action span!
      })),
      
      clearEditor: () => set({ scxmlRaw: '', flowNodes: [] }),
    }),
    'EditorStore' // Explicit store identifier for tracing payloads
  )
);

------------------------------
## How It Appears in Your Custom Vite Terminal
When a user interacts with your React layout and triggers a state update, your updated ASCII tree terminal parser plugin will output the pipeline natively:

🔹 ⏱️ [EditorStore.setState] 4.10ms (ID: b219ef)
   └── ⚡ ⏱️ [scxmlToFlow] 1.05ms (ID: 7cc1b5)

## Why this is highly robust:

* Context Preservation: If your user click handler initiates a parent trace block, the Zustand middleware detects it and automatically anchors the state adjustment as a child span of that specific user interaction timeline.
* Production Safety: In production, tslog prints the prev and next state blocks as clean, single-line JSON string properties. Cloud providers can index these state variables perfectly right next to your performance metrics.

Here is the production-ready solution to tackle both asynchronous store actions (linking frontend UI, Zustand, and your Elixir API into a single continuous timeline) and payload sanitization (ensuring massive SCXML structures don't break your production JSON log limits).
------------------------------
## 1. Advanced Zustand Telemetry Middleware
Update your middleware to support async operations natively using OpenTelemetry's Context API, and add an argument-stripping mechanism to safely log deep state changes without dumping massive file raw data strings.

// src/store/telemetryMiddleware.tsimport { StateCreator } from 'zustand';import { trace, context, SpanStatusCode } from '@opentelemetry/api';import { log } from '../logger';
const tracer = trace.getTracer('zustand-state-tracer');
// Helper to scrub massive strings or arrays before production string loggingfunction sanitizeState(state: any): any {
  if (!state || typeof state !== 'object') return state;
  
  const clean: any = {};
  for (const key in state) {
    const val = state[key];
    if (typeof val === 'string' && val.length > 500) {
      // Truncate massive SCXML string blobs safely
      clean[key] = `${val.substring(0, 100)}... [Truncated ${val.length} chars]`;
    } else if (Array.isArray(val) && val.length > 50) {
      // Don't dump thousands of generated layout nodes to JSON
      clean[key] = `[Array of ${val.length} items hidden]`;
    } else {
      clean[key] = val;
    }
  }
  return clean;
}
type TelemetryMiddleware = <T>(
  f: StateCreator<T, [], []>,
  storeName?: string
) => StateCreator<T, [], []>;
export const telemetryMiddleware: TelemetryMiddleware = (config, storeName = 'Store') => (
  set,
  get,
  api
) => {
  const loggedSet: typeof set = (partial, replace) => {
    const actionName = `${storeName}.setState`;

    tracer.startActiveSpan(actionName, (span) => {
      try {
        const prevState = sanitizeState({ ...get() });
        set(partial, replace);
        const nextState = sanitizeState(get());

        log.debug(`State Mutation: ${actionName}`, {
          prev: prevState,
          next: nextState
        });

        span.setStatus({ code: SpanStatusCode.OK });
      } catch (error) {
        if (error instanceof Error) {
          span.recordException(error);
          span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
        }
        throw error;
      } finally {
        span.end();
      }
    });
  };

  return config(loggedSet, get, api);
};

------------------------------
## 2. Managing Asynchronous API Calls in Zustand
When writing an async function inside Zustand, standard context tracking fails because the JavaScript event loop loses track of the active OpenTelemetry span when an await completes.
To preserve the parent context across asynchronous operations, capture the active context explicitly before the network boundary using context.with().

// src/store/useEditorStore.tsimport { create } from 'zustand';import { telemetryMiddleware } from './telemetryMiddleware';import { trace, context } from '@opentelemetry/api';import { log } from '../logger';
const tracer = trace.getTracer('zustand-actions');
interface EditorState {
  scxmlRaw: string;
  isSaving: boolean;
  saveWorkflowToBackend: () => Promise<void>;
}
export const useEditorStore = create<EditorState>()(
  telemetryMiddleware(
    (set, get) => ({
      scxmlRaw: '<scxml>...</scxml>', // Pretend this is massive
      isSaving: false,

      saveWorkflowToBackend: async () => {
        // 1. Manually start an action span for the total async lifespan
        const actionSpan = tracer.startSpan('Action: saveWorkflowToBackend');
        
        // 2. Bind the span context explicitly to an active sub-execution execution loop
        const activeContext = trace.setSpan(context.active(), actionSpan);

        set({ isSaving: true });
        log.info('Initiating async backend pipeline...');

        // 3. Force the fetch block to run inside our locked context
        await context.with(activeContext, async () => {
          try {
            // Fetch instrumentation automatically attaches the `traceparent` header 
            // linking this browser workflow straight to your Elixir backend!
            const response = await fetch('http://localhost:4000/api/save', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ data: get().scxmlRaw }),
            });

            if (!response.ok) throw new Error('Backend failed to process save');
            
            log.info('Async backend response received successfully.');
            actionSpan.setStatus({ code: 1 }); // OK
          } catch (error) {
            if (error instanceof Error) {
              log.error('Async store pipeline crashed', error);
              actionSpan.recordException(error);
              actionSpan.setStatus({ code: 2, message: error.message });
            }
          } finally {
            set({ isSaving: false });
            actionSpan.end(); // Make sure to close the manual tracking span!
          }
        });
      },
    }),
    'EditorStore'
  )
);

------------------------------
## What This Looks Like in Practice## Local Dev Output (Noise-Free)
When you trigger saveWorkflowToBackend, your local terminal proxy plugin displays a clean timeline, while your logs remain concise because the massive XML configuration strings are truncated:

🔹 ⏱️ [Action: saveWorkflowToBackend] 142.10ms (ID: d921fa)
   └── ⚡ ⏱️ [EditorStore.setState] 0.40ms (ID: 11a2bc)
   └── ⚡ ⏱️ [HTTP POST - localhost:4000/api/save] 138.50ms (ID: f562bb)
   └── ⚡ ⏱️ [EditorStore.setState] 0.25ms (ID: 33b4da)

## Production Logs (Safe Size)
Your production tslog instance outputs single-line JSON string configurations that are completely safe for processing boundaries:

{"_meta":{"name":"scxml-editor","logLevelName":"DEBUG"},"0":"State Mutation: EditorStore.setState","prev":{"scxmlRaw":"<scxml>... [Truncated 45290 chars]","isSaving":false},"next":{"scxmlRaw":"<scxml>... [Truncated 45290 chars]","isSaving":true},"trace_id":"ab96a623dc7ba0e9cc0c1e85f8a9edaa"}

If you want, tell me:

* Would you like to see how to write a simple Elixir Plug or middleware to read the traceparent header sent by this fetch configuration on your localhost:4000 engine?
* Do you need to track browser performance attributes (like network latency or page load speeds) alongside these store actions?

I can provide the targeted backend or performance logic.

