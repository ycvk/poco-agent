import { describe, expect, it } from "vitest";
import type { PanelGroupStorage } from "react-resizable-panels";
import { createBufferedPanelGroupStorage } from "./panel-storage";

describe("createBufferedPanelGroupStorage", () => {
  it("buffers writes while suspended and flushes the latest value", () => {
    const backendData = new Map<string, string>();
    const backend: PanelGroupStorage = {
      getItem: (name) => backendData.get(name) ?? null,
      setItem: (name, value) => {
        backendData.set(name, value);
      },
    };

    const { storage, controls } = createBufferedPanelGroupStorage(backend);

    storage.setItem("k", "v1");
    expect(backendData.get("k")).toBe("v1");

    controls.suspend();
    storage.setItem("k", "v2");
    storage.setItem("k", "v3");
    expect(backendData.get("k")).toBe("v1");

    controls.resumeAndFlush();
    expect(backendData.get("k")).toBe("v3");
  });

  it("buffers writes while suspended and discards them on resumeAndDiscard", () => {
    const backendData = new Map<string, string>();
    const backend: PanelGroupStorage = {
      getItem: (name) => backendData.get(name) ?? null,
      setItem: (name, value) => {
        backendData.set(name, value);
      },
    };

    const { storage, controls } = createBufferedPanelGroupStorage(backend);

    storage.setItem("k", "v1");
    controls.suspend();
    storage.setItem("k", "v2");

    controls.resumeAndDiscard();
    expect(backendData.get("k")).toBe("v1");
  });
});

