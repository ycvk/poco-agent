"use client";

import * as React from "react";
import type { FileChange } from "@/features/chat/types";

// Constants for drawer width management
export const DRAWER_WIDTH_KEY = "file-changes-drawer-width";
export const DEFAULT_DRAWER_WIDTH = 500;
export const MIN_DRAWER_WIDTH = 400;
export const MAX_DRAWER_WIDTH_PERCENT = 0.7;

type FileChangesDrawerContextValue = {
  isOpen: boolean;
  fileChanges: FileChange[];
  selectedPath: string | null;
  drawerWidth: number;
  openDrawer: (fileChanges: FileChange[], selectedPath?: string) => void;
  closeDrawer: () => void;
  setSelectedPath: (path: string | null) => void;
  setDrawerWidth: (width: number) => void;
};

const FileChangesDrawerContext =
  React.createContext<FileChangesDrawerContextValue | null>(null);

export function useFileChangesDrawer(): FileChangesDrawerContextValue {
  const ctx = React.useContext(FileChangesDrawerContext);
  if (!ctx) {
    throw new Error(
      "useFileChangesDrawer must be used within FileChangesDrawerProvider",
    );
  }
  return ctx;
}

function clampWidth(width: number): number {
  const maxWidth =
    typeof window !== "undefined"
      ? window.innerWidth * MAX_DRAWER_WIDTH_PERCENT
      : DEFAULT_DRAWER_WIDTH;
  return Math.max(MIN_DRAWER_WIDTH, Math.min(width, maxWidth));
}

export function FileChangesDrawerProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [fileChanges, setFileChanges] = React.useState<FileChange[]>([]);
  const [selectedPath, setSelectedPathState] = React.useState<string | null>(
    null,
  );
  const [drawerWidth, setDrawerWidthState] =
    React.useState(DEFAULT_DRAWER_WIDTH);

  // Load saved width from localStorage on mount
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = localStorage.getItem(DRAWER_WIDTH_KEY);
    if (saved) {
      const parsed = parseInt(saved, 10);
      if (!Number.isNaN(parsed)) {
        setDrawerWidthState(clampWidth(parsed));
      }
    }
  }, []);

  const openDrawer = React.useCallback(
    (changes: FileChange[], path?: string) => {
      setFileChanges(changes);
      setSelectedPathState(path ?? null);
      setIsOpen(true);
    },
    [],
  );

  const closeDrawer = React.useCallback(() => {
    setIsOpen(false);
  }, []);

  const setSelectedPath = React.useCallback((path: string | null) => {
    setSelectedPathState(path);
  }, []);

  const setDrawerWidth = React.useCallback((width: number) => {
    const clamped = clampWidth(width);
    setDrawerWidthState(clamped);
    if (typeof window !== "undefined") {
      localStorage.setItem(DRAWER_WIDTH_KEY, String(clamped));
    }
  }, []);

  const value = React.useMemo<FileChangesDrawerContextValue>(
    () => ({
      isOpen,
      fileChanges,
      selectedPath,
      drawerWidth,
      openDrawer,
      closeDrawer,
      setSelectedPath,
      setDrawerWidth,
    }),
    [
      isOpen,
      fileChanges,
      selectedPath,
      drawerWidth,
      openDrawer,
      closeDrawer,
      setSelectedPath,
      setDrawerWidth,
    ],
  );

  return (
    <FileChangesDrawerContext.Provider value={value}>
      {children}
    </FileChangesDrawerContext.Provider>
  );
}
