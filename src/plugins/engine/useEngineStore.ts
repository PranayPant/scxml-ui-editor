/**
 * Zustand store slice for SCXML Engine Plugin state.
 *
 * Manages engine connection, instance lifecycle, and execution history.
 * Persists engine URL to localStorage for convenience.
 */

import { create } from "zustand";
import { persist, subscribeWithSelector } from "zustand/middleware";
import { EngineClient } from "scxml-http-browser-client";
import type { InstanceSnapshot } from "scxml-http-browser-client";
import { logger } from "@/plugins/tracing/logger";
import { tracer, withSpan } from "@/plugins/tracing/withSpan";

// ---------------------------------------------------------------------------
// Editor-specific configuration
// ---------------------------------------------------------------------------

export interface EngineConfig {
  /** Base URL of scxml-http-engine */
  engineUrl: string;
  /** Enable/disable the plugin */
  enabled: boolean;
  /** Auto-connect on page load */
  autoConnect: boolean;
  /** Polling interval for snapshots (ms) */
  pollInterval: number;
}

export const defaultConfig: EngineConfig = {
  engineUrl: "http://localhost:4000",
  enabled: true,
  autoConnect: true,
  pollInterval: 1000,
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ExecutionEntry {
  id: string;
  timestamp: number;
  eventName: string;
  eventData: Record<string, unknown> | null;
  result: "success" | "error";
  errorMessage?: string;
  snapshotAfter?: InstanceSnapshot;
}

export interface EngineState {
  // Configuration
  config: EngineConfig;
  client: EngineClient | null;

  // Connection state
  connected: boolean;
  connecting: boolean;
  connectionError: string | null;

  // Instance state
  activeInstanceId: string | null;
  instanceSnapshot: InstanceSnapshot | null;
  isLoading: boolean;

  // Execution history
  executionHistory: ExecutionEntry[];

  // UI state
  panelOpen: boolean;
  showHistory: boolean;

  // Actions
  setConfig: (partial: Partial<EngineConfig>) => void;
  connect: () => Promise<void>;
  disconnect: () => void;
  startExecution: (astJson: string, instanceId?: string) => Promise<void>;
  stopExecution: () => Promise<void>;
  sendEvent: (
    eventName: string,
    data?: Record<string, unknown>,
  ) => Promise<void>;
  refreshSnapshot: () => Promise<void>;
  togglePanel: () => void;
  toggleHistory: () => void;
  clearHistory: () => void;
  loadFromLocalStorage: () => void;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

const STORAGE_KEY = "scxml-engine-plugin-config";

export const useEngineStore = create<EngineState>()(
  subscribeWithSelector(
    persist(
      (set, get) => ({
        // Configuration
        config: defaultConfig,
        client: new EngineClient(defaultConfig.engineUrl),

        // Connection state
        connected: false,
        connecting: false,
        connectionError: null,

        // Instance state
        activeInstanceId: null,
        instanceSnapshot: null,
        isLoading: false,

        // Execution history
        executionHistory: [],

        // UI state
        panelOpen: false,
        showHistory: false,

        // ------------------------------------------------------------------
        // Actions
        // ------------------------------------------------------------------

        setConfig: (partial) => {
          const newConfig = { ...get().config, ...partial };
          const newClient = new EngineClient(newConfig.engineUrl);
          set({ config: newConfig, client: newClient });

          // Auto-connect if enabled and was previously connected
          if (newConfig.autoConnect && !get().connected) {
            get().connect();
          }
        },

        connect: async () => {
          await withSpan(tracer, "engine.connect", async () => {
            logger.info("Engine connected", { url: get().config.engineUrl });
            set({ connecting: true, connectionError: null });
            const { client } = get();
            if (!client) return;

            const result = await client.health();
            if (result.ok) {
              set({
                connected: true,
                connecting: false,
                connectionError: null,
              });
            } else {
              set({
                connected: false,
                connecting: false,
                connectionError: result.error,
              });
            }
          });
        },

        disconnect: () => {
          set({
            connected: false,
            connectionError: null,
            activeInstanceId: null,
            instanceSnapshot: null,
          });
        },

        startExecution: async (astJson: string, instanceId?: string) => {
          await withSpan(tracer, "engine.startExecution", async () => {
            logger.info("Execution started");
            set({ isLoading: true });
            const { client } = get();
            if (!client) {
              set({ isLoading: false });
              return;
            }

            const result = await client.createStatechart(astJson, instanceId);
            if (result.ok && result.data) {
              set({
                activeInstanceId: result.data.instance_id,
                instanceSnapshot: result.data,
                isLoading: false,
              });
            } else {
              set({ isLoading: false });
            }
          });
        },
        stopExecution: async () => {
          await withSpan(tracer, "engine.stopExecution", async () => {
            logger.info("Execution stopped");
            const { client, activeInstanceId } = get();
            if (!client || !activeInstanceId) return;

            set({ isLoading: true });
            const result = await client.deleteInstance(activeInstanceId);
            if (result.ok) {
              set({
                activeInstanceId: null,
                instanceSnapshot: null,
                isLoading: false,
              });
            } else {
              set({ isLoading: false });
            }
          });
        },

        sendEvent: async (
          eventName: string,
          data?: Record<string, unknown>,
        ) => {
          await withSpan(tracer, "engine.sendEvent", async () => {
            logger.info("Event sent", { event: eventName });
            const { client, activeInstanceId } = get();
            if (!client || !activeInstanceId) return;

            set({ isLoading: true });
            const result = await client.sendEvent(
              activeInstanceId,
              eventName,
              data,
            );

            const entry: ExecutionEntry = {
              id: crypto.randomUUID(),
              timestamp: Date.now(),
              eventName,
              eventData: data || null,
              result: result.ok ? "success" : "error",
              errorMessage: result.ok ? undefined : result.error,
              snapshotAfter: result.ok && result.data ? result.data : undefined,
            };

            if (result.ok && result.data) {
              set({
                instanceSnapshot: result.data,
                isLoading: false,
                executionHistory: [entry, ...get().executionHistory].slice(
                  0,
                  100,
                ), // keep last 100
              });
            } else {
              set({
                isLoading: false,
                executionHistory: [entry, ...get().executionHistory].slice(
                  0,
                  100,
                ),
              });
            }
          });
        },

        refreshSnapshot: async () => {
          await withSpan(tracer, "engine.refreshSnapshot", async () => {
            logger.debug("Snapshot refreshed");
            const { client, activeInstanceId } = get();
            if (!client || !activeInstanceId) return;

            set({ isLoading: true });
            const result = await client.getInstance(activeInstanceId);
            if (result.ok && result.data) {
              set({ instanceSnapshot: result.data, isLoading: false });
            } else {
              set({ isLoading: false });
            }
          });
        },

        togglePanel: () => {
          set((state) => ({ panelOpen: !state.panelOpen }));
        },

        toggleHistory: () => {
          set((state) => ({ showHistory: !state.showHistory }));
        },

        clearHistory: () => {
          set({ executionHistory: [] });
        },

        loadFromLocalStorage: () => {
          // Zustand persist middleware handles this automatically on init
          const state = get();
          if (state.config.engineUrl !== defaultConfig.engineUrl) {
            // Update client if URL changed from storage
            state.client = new EngineClient(state.config.engineUrl);
          }
        },
      }),
      {
        name: STORAGE_KEY,
        partialize: (state) => ({
          config: state.config,
        }),
      },
    ),
  ),
);
