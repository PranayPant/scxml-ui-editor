import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";
import fs from "node:fs";
import path from "node:path";

interface SpanInfo {
  name: string;
  status: string;
  startTime: number;
  duration: number;
  spanId: string;
  parentSpanId: string;
}

/**
 * Recursively print a span and its children as an indented ASCII tree.
 */
function printSpanTree(
  span: SpanInfo,
  depth: number,
  childMap: Map<string, SpanInfo[]>,
): void {
  const indent = "   ".repeat(depth);
  const prefix = depth === 0 ? "*" : "\\-";
  // eslint-disable-next-line no-console
  console.log(
    `${indent}${prefix} [${span.name}] ${span.duration}ms (ID: ${span.spanId}) ${span.status}`,
  );

  const children = childMap.get(span.spanId) ?? [];
  for (const child of children) {
    printSpanTree(child, depth + 1, childMap);
  }
}

export default defineConfig({
  plugins: [
    react(),
    {
      name: "vite-plugin-trace-collector",
      configureServer(server) {
        server.middlewares.use("/api/logs", (req, res, next) => {
          if (req.method === "POST") {
            let body = "";

            req.on("data", (chunk: string) => {
              body += chunk;
            });

            req.on("end", () => {
              try {
                const parsed = JSON.parse(body);

                // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                const resourceSpans = parsed?.resourceSpans ?? [];
                const allSpans: Array<{
                  name: string;
                  status: string;
                  startTime: number;
                  duration: number;
                  spanId: string;
                  parentSpanId: string;
                }> = [];

                for (const rs of resourceSpans) {
                  // eslint-disable-next-line @typescript-eslint/no-unsafe-optional-chain, @typescript-eslint/no-unsafe-member-access
                  const scopeSpans = rs?.scopeSpans ?? [];
                  for (const ss of scopeSpans) {
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                    for (const span of ss?.spans ?? []) {
                      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access
                      const startUnix = Number(span.startTimeUnixNano ?? 0);
                      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access
                      const endUnix = Number(span.endTimeUnixNano ?? 0);
                      const durationMs = (
                        (endUnix - startUnix) /
                        1_000_000
                      ).toFixed(2);
                      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                      const statusCode = span?.status?.code ?? 0;
                      allSpans.push({
                        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access
                        name: String(span.name ?? "unnamed"),
                        status:
                          statusCode === 2
                            ? "ERROR"
                            : statusCode === 1
                              ? "WARN"
                              : "OK",
                        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access
                        startTime: Number(span.startTimeUnixNano ?? 0),
                        duration: Number(durationMs),
                        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access
                        spanId: String(span.spanId ?? "").slice(0, 6),
                        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access
                        parentSpanId: String(span.parentSpanId ?? "").slice(
                          0,
                          6,
                        ),
                      });
                    }
                  }
                }

                // Sort by startTime for chronological order
                allSpans.sort((a, b) => a.startTime - b.startTime);

                // Build a parent-child tree using parentSpanId
                const childMap = new Map<string, typeof allSpans>();
                for (const s of allSpans) {
                  const parent = s.parentSpanId || "root";
                  if (!childMap.has(parent)) childMap.set(parent, []);
                  childMap.get(parent)!.push(s);
                }

                // eslint-disable-next-line no-console
                console.log("\n--- OpenTelemetry Spans ---");

                const rootSpans =
                  childMap.get("root") ??
                  allSpans.filter((s) => !s.parentSpanId);
                for (const root of rootSpans) {
                  printSpanTree(root, 0, childMap);
                }

                // ──────────────────────────────────────────────────────────
                // Persist raw JSON to disk for later analysis
                // ──────────────────────────────────────────────────────────
                const filePath = path.join(process.cwd(), ".otlp-traces.log");
                const logLine = `${new Date().toISOString()} - ${body}\n`;
                fs.appendFileSync(filePath, logLine, "utf-8");
              } catch (err) {
                // eslint-disable-next-line no-console
                console.error(
                  "Failed to parse incoming client trace payload",
                  err,
                );
              }

              res.statusCode = 200;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ status: "success" }));
            });
          } else {
            next();
          }
        });
      },
    },
  ],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    port: 5173,
  },
  test: {
    // The bridge/store/layout suites are pure logic and run in Node without a
    // DOM; component tests opt into jsdom via a per-file `@vitest-environment`
    // pragma (e.g. StateNodeWrapper.test.tsx).
    environment: "node",
    globals: true,
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      // Global baseline threshold kept deliberately achievable so CI stays
      // green while the suites expand. The core data-transformation modules
      // (bridge conversions + store slices) are strict at 100% — these are pure
      // domain functions where a contract break (like the persistNodePosition
      // parentId bug) must be caught instantly without DOM/React Flow noise.
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 70,
        statements: 80,
        // Strict 100% on the pure data schemas: store slices are trivial
        // set/get contracts with no I/O, so every line/function is reachable
        // and fully locked down.
        "src/store/slices/**": {
          lines: 100,
          functions: 100,
          branches: 100,
          statements: 100,
        },
        // Bridge conversions are high-value but include parser-interop and
        // defensive branches (e.g. registered custom-tag parse callbacks and
        // unreachable catch paths) whose 100% coverage would require mocking
        // scxml-parser internals — the "test noise" this strategy avoids. Enforce
        // a strong floor here while keeping the global baseline honest.
        "src/bridge/**": {
          lines: 90,
          functions: 90,
          branches: 80,
          statements: 90,
        },
      },
      // Exclude framework noise, visual UI shells, and non-app config/output.
      exclude: [
        "src/main.tsx",
        "src/App.tsx",
        "src/components/editor/EditorShell.tsx",
        "src/components/editor/Toolbar.tsx",
        "src/components/editor/MonacoEditor.tsx",
        "src/components/canvas/controls/**",
        "src/components/canvas/ReactFlowCanvas.tsx",
        "src/components/canvas/edges/TransitionEdge.tsx",
        "src/components/canvas/nodes/InitialIndicatorNode.tsx",
        "src/components/TelemetryErrorBoundary.tsx",
        "src/plugins/**",
        "src/tracing.ts",
        "**/*.d.ts",
        "**/index.ts",
        "**/*.config.js",
        "**/*.config.ts",
        "dist/**",
      ],
    },
  },
});
