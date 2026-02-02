import type { PanelGroupStorage } from "react-resizable-panels";

export type BufferedPanelGroupStorageControls = {
  suspend: () => void;
  resumeAndFlush: () => void;
  resumeAndDiscard: () => void;
};

export function createBufferedPanelGroupStorage(
  backend: PanelGroupStorage,
): {
  storage: PanelGroupStorage;
  controls: BufferedPanelGroupStorageControls;
} {
  let suspended = false;
  const buffer = new Map<string, string>();

  const storage: PanelGroupStorage = {
    getItem: (name) => backend.getItem(name),
    setItem: (name, value) => {
      if (suspended) {
        buffer.set(name, value);
        return;
      }
      backend.setItem(name, value);
    },
  };

  const flushBuffer = () => {
    for (const [name, value] of buffer.entries()) {
      backend.setItem(name, value);
    }
    buffer.clear();
  };

  const controls: BufferedPanelGroupStorageControls = {
    suspend: () => {
      suspended = true;
    },
    resumeAndFlush: () => {
      suspended = false;
      flushBuffer();
    },
    resumeAndDiscard: () => {
      buffer.clear();
      suspended = false;
    },
  };

  return { storage, controls };
}

