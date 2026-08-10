import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
  },
  test: {
    // The bridge/store/layout suites are pure logic and run in Node without a
    // DOM; component tests opt into jsdom via a per-file `@vitest-environment`
    // pragma (e.g. StateNodeWrapper.test.tsx).
    environment: 'node',
    globals: true,
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
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
        'src/store/slices/**': {
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
        'src/bridge/**': {
          lines: 90,
          functions: 90,
          branches: 80,
          statements: 90,
        },
      },
      // Exclude framework noise, visual UI shells, and non-app config/output.
      exclude: [
        'src/main.tsx',
        'src/App.tsx',
        'src/components/editor/EditorShell.tsx',
        'src/components/editor/Toolbar.tsx',
        'src/components/editor/MonacoEditor.tsx',
        'src/components/canvas/controls/**',
        'src/components/canvas/ReactFlowCanvas.tsx',
        'src/components/canvas/edges/TransitionEdge.tsx',
        'src/components/canvas/nodes/InitialIndicatorNode.tsx',
        '**/*.d.ts',
        '**/index.ts',
        '**/*.config.js',
        '**/*.config.ts',
        'dist/**',
      ],
    },
  },
});
