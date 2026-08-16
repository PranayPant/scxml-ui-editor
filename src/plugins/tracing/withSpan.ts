/**
 * Lightweight OpenTelemetry tracing utilities for manual instrumentation.
 *
 * Usage:
 * ```ts
 * import { tracer, withSpan, withSpanSync } from '@/plugins/tracing/withSpan';
 *
 * // Async operation
 * const result = await withSpan(tracer, 'my-operation', async () => {
 *   return await doSomething();
 * });
 *
 * // Sync operation
 * const result = withSpanSync(tracer, 'my-sync-op', () => {
 *   return doSomethingSync();
 * });
 * ```
 */

import {
  trace,
  SpanStatusCode,
  type Tracer,
  SpanKind,
  type Span,
} from "@opentelemetry/api";

/** Singleton tracer shared across the application. */
export const tracer: Tracer = trace.getTracer("scxml-ui-editor", "0.1.0");

/**
 * Wrap an async function in a trace span.
 * The span is ended on success; on error the exception is recorded and the span
 * status is set to ERROR before re-throwing.
 */
export async function withSpan<T>(
  t: Tracer,
  name: string,
  fn: (span: Span) => Promise<T>,
): Promise<T> {
  return t.startActiveSpan(
    name,
    { kind: SpanKind.INTERNAL },
    async (span: Span) => {
      span.setAttribute("component", "scxml-ui-editor");

      try {
        const result = await fn(span);
        span.setStatus({ code: SpanStatusCode.OK });
        return result;
      } catch (error) {
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: error instanceof Error ? error.message : String(error),
        });
        if (error instanceof Error) {
          span.recordException(error);
        }
        throw error;
      } finally {
        span.end();
      }
    },
  );
}

/**
 * Wrap a synchronous function in a trace span.
 * The span is ended on success; on error the exception is recorded and the span
 * status is set to ERROR before re-throwing.
 */
export function withSpanSync<T>(t: Tracer, name: string, fn: () => T): T {
  const span = t.startSpan(name);
  span.setAttribute("component", "scxml-ui-editor");

  try {
    const result = fn();
    span.setStatus({ code: SpanStatusCode.OK });
    return result;
  } catch (error) {
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error instanceof Error ? error.message : String(error),
    });
    if (error instanceof Error) {
      span.recordException(error);
    }
    throw error;
  } finally {
    span.end();
  }
}
