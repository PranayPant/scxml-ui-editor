/**
 * React Error Boundary that captures rendering crashes and pipes them into the
 * OpenTelemetry tracing pipeline.
 *
 * On crash:
 * - Creates a `react-ui-crash` span with error details + component stack
 * - Records the exception and sets `SpanStatusCode.ERROR`
 * - Calls `forceFlush()` to push the crash data before the app unmounts
 * - Shows a fallback UI with the trace ID (for user support reference)
 */

import { Component, type ErrorInfo, type ReactNode } from "react";
import { trace, SpanStatusCode } from "@opentelemetry/api";
import { logger } from "@/plugins/tracing/logger";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
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
    return { hasError: true };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    logger.error("React UI crash", {
      error: error.message,
      componentStack: errorInfo.componentStack,
    });

    const t = trace.getTracer("react-error-boundary");

    const span = t.startSpan("react-ui-crash", {
      attributes: {
        "error.type": error.name || "UnknownError",
        "component.stack":
          errorInfo.componentStack || "No component stack trace",
      },
    });

    span.recordException(error);
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error.message,
    });

    const currentTraceId = span.spanContext().traceId;
    this.setState({ traceId: currentTraceId });

    span.end();

    // Force-flush so the crash data reaches the endpoint before the app
    // freezes or unmounts.
    const activeProvider = trace.getTracerProvider() as any;
    if (activeProvider && typeof activeProvider.forceFlush === "function") {
      activeProvider.forceFlush();
    }
  }

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div style={{ padding: "2rem", fontFamily: "sans-serif" }}>
          <h2>Something went wrong.</h2>
          <p>
            Our engineering team has been notified of this error automatically.
          </p>
          {this.state.traceId && (
            <p style={{ fontSize: "0.85rem", color: "#666" }}>
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
