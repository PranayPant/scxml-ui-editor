import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Result, InstanceSnapshot } from "scxml-http-browser-client";

// ---------------------------------------------------------------------------
// Mocks must be set up BEFORE the module import
// ---------------------------------------------------------------------------

// Mock tracing — just execute the callback directly
vi.mock("@/plugins/tracing/withSpan", () => ({
  tracer: {},
  withSpan: (_t: any, _name: string, fn: (span: any) => Promise<any>) => fn({}),
}));

// Mock logger to prevent noise
vi.mock("@/plugins/tracing/logger", () => ({
  logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// Mock EngineClient to avoid real HTTP calls
class MockEngineClient {
  baseUrl: string;
  health = vi.fn<() => Promise<Result<{ status: string }>>>();
  createStatechart =
    vi.fn<
      (
        document: string | object,
        instanceId?: string,
      ) => Promise<Result<InstanceSnapshot>>
    >();
  deleteInstance = vi.fn<(id: string) => Promise<Result<null>>>();
  sendEvent =
    vi.fn<
      (
        instanceId: string,
        eventName: string,
        data?: Record<string, unknown>,
      ) => Promise<Result<InstanceSnapshot>>
    >();
  getInstance = vi.fn<(id: string) => Promise<Result<InstanceSnapshot>>>();

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }
}

vi.mock("scxml-http-browser-client", () => ({
  EngineClient: MockEngineClient,
}));

// Stub crypto.randomUUID for deterministic execution history IDs
vi.stubGlobal("crypto", { randomUUID: () => "mock-uuid" });

// Stub localStorage for Zustand persist middleware
const fakeStore: Record<string, string> = {};
vi.stubGlobal("localStorage", {
  getItem: (key: string) => fakeStore[key] ?? null,
  setItem: (key: string, value: string) => {
    fakeStore[key] = value;
  },
  removeItem: (key: string) => {
    delete fakeStore[key];
  },
  clear: () => {
    for (const k of Object.keys(fakeStore)) delete fakeStore[k];
  },
  get length() {
    return Object.keys(fakeStore).length;
  },
  key: (_i: number) => null,
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

function makeSnapshot(
  overrides: Partial<InstanceSnapshot> = {},
): InstanceSnapshot {
  return {
    instance_id: "g-test-instance",
    configuration: ["idle"],
    datamodel: null,
    done: false,
    execution_status: "running",
    active_states: [],
    ...overrides,
  };
}

const OK = <T>(data: T): Result<T> => ({ ok: true, data });
const ERR = (error: string): Result<never> => ({ ok: false, error });

describe("useEngineStore", () => {
  let store: typeof import("../useEngineStore").useEngineStore;
  let defaultConfig: typeof import("../useEngineStore").defaultConfig;

  beforeEach(async () => {
    // Clear localStorage
    localStorage.clear();
    // Re-import to get a fresh store instance
    vi.resetModules();
    const mod = await import("../useEngineStore");
    store = mod.useEngineStore;
    defaultConfig = mod.defaultConfig;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -----------------------------------------------------------------------
  // Initial state
  // -----------------------------------------------------------------------

  describe("initial state", () => {
    it("has default config", () => {
      const s = store.getState();
      expect(s.config).toEqual(defaultConfig);
      expect(s.client).toBeInstanceOf(MockEngineClient);
    });

    it("starts disconnected with no instance", () => {
      const s = store.getState();
      expect(s.connected).toBe(false);
      expect(s.connecting).toBe(false);
      expect(s.connectionError).toBeNull();
      expect(s.activeInstanceId).toBeNull();
      expect(s.instanceSnapshot).toBeNull();
      expect(s.isLoading).toBe(false);
      expect(s.executionHistory).toEqual([]);
      expect(s.panelOpen).toBe(false);
      expect(s.showHistory).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // setConfig
  // -----------------------------------------------------------------------

  describe("setConfig", () => {
    it("updates config and creates a new client", () => {
      const s = store.getState();
      const oldClient = s.client;

      // Disable auto-connect to avoid triggering connect() on the new client
      s.setConfig({ engineUrl: "http://localhost:9999", autoConnect: false });

      const updated = store.getState();
      expect(updated.config.engineUrl).toBe("http://localhost:9999");
      // A new client instance should be created
      expect(updated.client).not.toBe(oldClient);
      expect(updated.client?.baseUrl).toBe("http://localhost:9999");
    });

    it("triggers auto-connect when autoConnect is true and not connected", async () => {
      // Mock connect() itself so it doesn't try to call the unmocked new client
      const connectSpy = vi
        .spyOn(store.getState(), "connect")
        .mockImplementation(async () => {});

      store.getState().setConfig({ autoConnect: true });

      expect(connectSpy).toHaveBeenCalled();
    });

    it("does not auto-connect when already connected", () => {
      store.setState({ connected: true });
      const connectSpy = vi.spyOn(store.getState(), "connect");

      store.getState().setConfig({ autoConnect: true });

      expect(connectSpy).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // connect
  // -----------------------------------------------------------------------

  describe("connect", () => {
    it("sets connected on successful health check", async () => {
      const client = store.getState().client as MockEngineClient;
      client.health.mockResolvedValue(OK({ status: "ok" }));

      await store.getState().connect();

      const s = store.getState();
      expect(s.connected).toBe(true);
      expect(s.connecting).toBe(false);
      expect(s.connectionError).toBeNull();
    });

    it("sets connectionError on failed health check", async () => {
      const client = store.getState().client as MockEngineClient;
      client.health.mockResolvedValue(ERR("Engine unreachable"));

      await store.getState().connect();

      const s = store.getState();
      expect(s.connected).toBe(false);
      expect(s.connecting).toBe(false);
      expect(s.connectionError).toBe("Engine unreachable");
    });

    it("does nothing if client is null", async () => {
      store.setState({ client: null });

      await store.getState().connect();

      const s = store.getState();
      expect(s.connected).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // disconnect
  // -----------------------------------------------------------------------

  describe("disconnect", () => {
    it("clears connection and instance state", () => {
      store.setState({
        connected: true,
        connectionError: "some error",
        activeInstanceId: "g-test",
        instanceSnapshot: makeSnapshot(),
      });

      store.getState().disconnect();

      const s = store.getState();
      expect(s.connected).toBe(false);
      expect(s.connectionError).toBeNull();
      expect(s.activeInstanceId).toBeNull();
      expect(s.instanceSnapshot).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // startExecution
  // -----------------------------------------------------------------------

  describe("startExecution", () => {
    it("creates a statechart and stores the instance snapshot", async () => {
      const snapshot = makeSnapshot({ instance_id: "g-new-instance" });
      const client = store.getState().client as MockEngineClient;
      client.createStatechart.mockResolvedValue(OK(snapshot));

      await store.getState().startExecution('{"scxml":{}}');

      const s = store.getState();
      expect(s.activeInstanceId).toBe("g-new-instance");
      expect(s.instanceSnapshot).toBe(snapshot);
      expect(s.isLoading).toBe(false);
    });

    it("handles engine error gracefully", async () => {
      const client = store.getState().client as MockEngineClient;
      client.createStatechart.mockResolvedValue(ERR("Invalid SCXML"));

      await store.getState().startExecution("bad json");

      const s = store.getState();
      expect(s.activeInstanceId).toBeNull();
      expect(s.instanceSnapshot).toBeNull();
      expect(s.isLoading).toBe(false);
    });

    it("does nothing if client is null", async () => {
      store.setState({ client: null });

      await store.getState().startExecution("{}");

      const s = store.getState();
      expect(s.isLoading).toBe(false);
      expect(s.activeInstanceId).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // stopExecution
  // -----------------------------------------------------------------------

  describe("stopExecution", () => {
    it("deletes the instance and clears state", async () => {
      store.setState({
        activeInstanceId: "g-to-delete",
        instanceSnapshot: makeSnapshot(),
      });
      const client = store.getState().client as MockEngineClient;
      client.deleteInstance.mockResolvedValue(OK(null));

      await store.getState().stopExecution();

      const s = store.getState();
      expect(s.activeInstanceId).toBeNull();
      expect(s.instanceSnapshot).toBeNull();
      expect(s.isLoading).toBe(false);
    });

    it("does nothing if no active instance", async () => {
      store.setState({ activeInstanceId: null });
      const client = store.getState().client as MockEngineClient;
      client.deleteInstance.mockResolvedValue(OK(null));

      await store.getState().stopExecution();

      expect(client.deleteInstance).not.toHaveBeenCalled();
    });

    it("does nothing if client is null", async () => {
      store.setState({
        activeInstanceId: "g-test",
        client: null,
      });

      await store.getState().stopExecution();
      // Should not throw
    });

    it("handles deleteInstance error gracefully", async () => {
      store.setState({
        activeInstanceId: "g-test",
        instanceSnapshot: makeSnapshot(),
      });
      const client = store.getState().client as MockEngineClient;
      client.deleteInstance.mockResolvedValue(ERR("Delete failed"));

      await store.getState().stopExecution();

      const s = store.getState();
      // Instance state should remain (we only clear on success)
      expect(s.activeInstanceId).toBe("g-test");
      expect(s.instanceSnapshot).not.toBeNull();
      expect(s.isLoading).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // sendEvent
  // -----------------------------------------------------------------------

  describe("sendEvent", () => {
    it("sends event and records execution history", async () => {
      const snapshot = makeSnapshot({ configuration: ["running"] });
      store.setState({ activeInstanceId: "g-test" });
      const client = store.getState().client as MockEngineClient;
      client.sendEvent.mockResolvedValue(OK(snapshot));

      await store.getState().sendEvent("start", { payload: 1 });

      const s = store.getState();
      expect(s.instanceSnapshot?.configuration).toEqual(["running"]);
      expect(s.isLoading).toBe(false);
      expect(s.executionHistory.length).toBe(1);
      expect(s.executionHistory[0].eventName).toBe("start");
      expect(s.executionHistory[0].eventData).toEqual({ payload: 1 });
      expect(s.executionHistory[0].result).toBe("success");
      expect(s.executionHistory[0].snapshotAfter).toBe(snapshot);
    });

    it("records failed events in history", async () => {
      store.setState({ activeInstanceId: "g-test" });
      const client = store.getState().client as MockEngineClient;
      client.sendEvent.mockResolvedValue(ERR("Not found"));

      await store.getState().sendEvent("bad_event");

      const s = store.getState();
      expect(s.executionHistory.length).toBe(1);
      expect(s.executionHistory[0].eventName).toBe("bad_event");
      expect(s.executionHistory[0].result).toBe("error");
      expect(s.executionHistory[0].errorMessage).toBe("Not found");
      expect(s.isLoading).toBe(false);
    });

    it("caps execution history at 100 entries", async () => {
      const snapshot = makeSnapshot();
      store.setState({ activeInstanceId: "g-test" });
      const client = store.getState().client as MockEngineClient;
      client.sendEvent.mockResolvedValue(OK(snapshot));

      // Send 101 events
      for (let i = 0; i < 101; i++) {
        await store.getState().sendEvent(`event-${i}`);
      }

      const s = store.getState();
      expect(s.executionHistory.length).toBe(100);
      // Most recent events should be at the front
      expect(s.executionHistory[0].eventName).toBe("event-100");
      expect(s.executionHistory[99].eventName).toBe("event-1");
    });

    it("does nothing if no active instance", async () => {
      store.setState({ activeInstanceId: null });
      const client = store.getState().client as MockEngineClient;

      await store.getState().sendEvent("start");

      expect(client.sendEvent).not.toHaveBeenCalled();
    });

    it("does nothing if client is null", async () => {
      store.setState({ activeInstanceId: "g-test", client: null });

      await store.getState().sendEvent("start");
      // Should not throw
    });
  });

  // -----------------------------------------------------------------------
  // refreshSnapshot
  // -----------------------------------------------------------------------

  describe("refreshSnapshot", () => {
    it("fetches and updates the instance snapshot", async () => {
      const snapshot = makeSnapshot({ configuration: ["finished"] });
      store.setState({ activeInstanceId: "g-test" });
      const client = store.getState().client as MockEngineClient;
      client.getInstance.mockResolvedValue(OK(snapshot));

      await store.getState().refreshSnapshot();

      const s = store.getState();
      expect(s.instanceSnapshot?.configuration).toEqual(["finished"]);
      expect(s.isLoading).toBe(false);
    });

    it("does nothing if no active instance", async () => {
      store.setState({ activeInstanceId: null });
      const client = store.getState().client as MockEngineClient;

      await store.getState().refreshSnapshot();

      expect(client.getInstance).not.toHaveBeenCalled();
    });

    it("does nothing if client is null", async () => {
      store.setState({ activeInstanceId: "g-test", client: null });

      await store.getState().refreshSnapshot();
      // Should not throw
    });

    it("handles getInstance error gracefully", async () => {
      const oldSnapshot = makeSnapshot({ configuration: ["old"] });
      store.setState({
        activeInstanceId: "g-test",
        instanceSnapshot: oldSnapshot,
      });
      const client = store.getState().client as MockEngineClient;
      client.getInstance.mockResolvedValue(ERR("Instance not found"));

      await store.getState().refreshSnapshot();

      const s = store.getState();
      // Snapshot should remain unchanged on error
      expect(s.instanceSnapshot?.configuration).toEqual(["old"]);
      expect(s.isLoading).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // togglePanel / toggleHistory / clearHistory
  // -----------------------------------------------------------------------

  describe("togglePanel", () => {
    it("toggles panelOpen", () => {
      expect(store.getState().panelOpen).toBe(false);
      store.getState().togglePanel();
      expect(store.getState().panelOpen).toBe(true);
      store.getState().togglePanel();
      expect(store.getState().panelOpen).toBe(false);
    });
  });

  describe("toggleHistory", () => {
    it("toggles showHistory", () => {
      expect(store.getState().showHistory).toBe(false);
      store.getState().toggleHistory();
      expect(store.getState().showHistory).toBe(true);
      store.getState().toggleHistory();
      expect(store.getState().showHistory).toBe(false);
    });
  });

  describe("clearHistory", () => {
    it("clears execution history", () => {
      store.setState({ executionHistory: [{ id: "e1" } as any] });
      store.getState().clearHistory();
      expect(store.getState().executionHistory).toEqual([]);
    });
  });

  // -----------------------------------------------------------------------
  // loadFromLocalStorage
  // -----------------------------------------------------------------------

  describe("loadFromLocalStorage", () => {
    it("updates client if persisted URL differs from default", () => {
      // Manually set a different config
      store.setState({
        config: { ...defaultConfig, engineUrl: "http://localhost:5000" },
      });
      const oldClient = store.getState().client;

      store.getState().loadFromLocalStorage();

      const s = store.getState();
      expect(s.client).not.toBe(oldClient);
      expect(s.client?.baseUrl).toBe("http://localhost:5000");
    });

    it("does not create a new client if URL matches default", () => {
      const oldClient = store.getState().client;

      store.getState().loadFromLocalStorage();

      const s = store.getState();
      // Should be the same client instance
      expect(s.client).toBe(oldClient);
    });
  });
});
