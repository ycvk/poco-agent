# File Changes Drawer Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the fixed right-side file changes panel with an on-demand overlay drawer triggered by inline summary cards in messages.

**Architecture:** Create a new FileChangesDrawer context to manage drawer state globally. Add FileChangesSummaryCard component embedded in assistant messages. Modify ExecutionContainer to remove the fixed right panel and let ChatPanel take full width.

**Tech Stack:** React 19, TypeScript, Tailwind CSS v4, shadcn/ui Sheet component, Radix UI primitives

---

## Task 1: Create FileChangesDrawer Context

**Files:**
- Create: `frontend/features/chat/contexts/file-changes-drawer-context.tsx`

**Step 1: Create the context file with state management**

```tsx
"use client";

import * as React from "react";
import type { FileChange } from "@/features/chat/types";

const DRAWER_WIDTH_KEY = "file-changes-drawer-width";
const DEFAULT_DRAWER_WIDTH = 500;
const MIN_DRAWER_WIDTH = 400;
const MAX_DRAWER_WIDTH_PERCENT = 0.7;

interface FileChangesDrawerContextValue {
  isOpen: boolean;
  openDrawer: (fileChanges: FileChange[], selectedPath?: string) => void;
  closeDrawer: () => void;
  fileChanges: FileChange[];
  selectedPath: string | null;
  setSelectedPath: (path: string | null) => void;
  drawerWidth: number;
  setDrawerWidth: (width: number) => void;
}

const FileChangesDrawerContext =
  React.createContext<FileChangesDrawerContextValue | null>(null);

export function FileChangesDrawerProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [fileChanges, setFileChanges] = React.useState<FileChange[]>([]);
  const [selectedPath, setSelectedPath] = React.useState<string | null>(null);
  const [drawerWidth, setDrawerWidthState] = React.useState(DEFAULT_DRAWER_WIDTH);

  // Load saved width from localStorage
  React.useEffect(() => {
    const saved = localStorage.getItem(DRAWER_WIDTH_KEY);
    if (saved) {
      const parsed = parseInt(saved, 10);
      if (!isNaN(parsed) && parsed >= MIN_DRAWER_WIDTH) {
        setDrawerWidthState(parsed);
      }
    }
  }, []);

  const setDrawerWidth = React.useCallback((width: number) => {
    const maxWidth = typeof window !== "undefined"
      ? window.innerWidth * MAX_DRAWER_WIDTH_PERCENT
      : 800;
    const clamped = Math.max(MIN_DRAWER_WIDTH, Math.min(width, maxWidth));
    setDrawerWidthState(clamped);
    localStorage.setItem(DRAWER_WIDTH_KEY, String(clamped));
  }, []);

  const openDrawer = React.useCallback(
    (changes: FileChange[], initialPath?: string) => {
      setFileChanges(changes);
      setSelectedPath(initialPath ?? changes[0]?.path ?? null);
      setIsOpen(true);
    },
    [],
  );

  const closeDrawer = React.useCallback(() => {
    setIsOpen(false);
  }, []);

  const value = React.useMemo(
    () => ({
      isOpen,
      openDrawer,
      closeDrawer,
      fileChanges,
      selectedPath,
      setSelectedPath,
      drawerWidth,
      setDrawerWidth,
    }),
    [isOpen, openDrawer, closeDrawer, fileChanges, selectedPath, drawerWidth, setDrawerWidth],
  );

  return (
    <FileChangesDrawerContext.Provider value={value}>
      {children}
    </FileChangesDrawerContext.Provider>
  );
}

export function useFileChangesDrawer() {
  const context = React.useContext(FileChangesDrawerContext);
  if (!context) {
    throw new Error(
      "useFileChangesDrawer must be used within FileChangesDrawerProvider",
    );
  }
  return context;
}
```

**Step 2: Verify file was created correctly**

Run: `ls -la frontend/features/chat/contexts/file-changes-drawer-context.tsx`
Expected: File exists

**Step 3: Commit**

```bash
git add frontend/features/chat/contexts/file-changes-drawer-context.tsx
git commit -m "feat(frontend): add FileChangesDrawer context for drawer state management"
```

---

## Task 2: Create FileChangesSummaryCard Component

**Files:**
- Create: `frontend/features/chat/components/chat/messages/file-changes-summary-card.tsx`

**Step 1: Create the inline summary card component**

```tsx
"use client";

import * as React from "react";
import { FolderGit2, ChevronRight, Plus, Minus, FileEdit } from "lucide-react";
import type { FileChange } from "@/features/chat/types";
import { useFileChangesDrawer } from "@/features/chat/contexts/file-changes-drawer-context";
import { useT } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

interface FileChangesSummaryCardProps {
  fileChanges: FileChange[];
}

const MAX_VISIBLE_FILES = 3;

function getStatusIcon(status: string) {
  switch (status) {
    case "added":
      return <Plus className="size-3 text-success" />;
    case "deleted":
      return <Minus className="size-3 text-destructive" />;
    case "modified":
    case "renamed":
    default:
      return <FileEdit className="size-3 text-info" />;
  }
}

function getFileName(path: string): string {
  return path.split("/").pop() || path;
}

export function FileChangesSummaryCard({
  fileChanges,
}: FileChangesSummaryCardProps) {
  const { t } = useT("translation");
  const { openDrawer } = useFileChangesDrawer();

  if (!fileChanges || fileChanges.length === 0) {
    return null;
  }

  const visibleFiles = fileChanges.slice(0, MAX_VISIBLE_FILES);
  const remainingCount = fileChanges.length - MAX_VISIBLE_FILES;

  const handleClick = () => {
    openDrawer(fileChanges);
  };

  return (
    <div
      className={cn(
        "w-full my-2 rounded-md border border-border/60 bg-muted/20",
        "hover:bg-muted/40 hover:border-border transition-colors cursor-pointer",
        "group",
      )}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleClick();
        }
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2">
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <FolderGit2 className="size-3.5" />
          <span>{t("fileChanges.title", "File Changes")}</span>
          <span className="opacity-70">({fileChanges.length})</span>
        </div>
        <ChevronRight className="size-4 text-muted-foreground group-hover:text-foreground transition-colors" />
      </div>

      {/* File List */}
      <div className="px-3 pb-2 space-y-1">
        {visibleFiles.map((change, index) => (
          <div
            key={`${change.path}-${index}`}
            className="flex items-center gap-2 text-xs text-foreground/80"
          >
            {getStatusIcon(change.status)}
            <span className="truncate" title={change.path}>
              {getFileName(change.path)}
            </span>
          </div>
        ))}
        {remainingCount > 0 && (
          <div className="text-xs text-muted-foreground pl-5">
            +{remainingCount} {t("fileChanges.moreFiles", "more files")}
          </div>
        )}
      </div>
    </div>
  );
}
```

**Step 2: Verify file was created correctly**

Run: `ls -la frontend/features/chat/components/chat/messages/file-changes-summary-card.tsx`
Expected: File exists

**Step 3: Commit**

```bash
git add frontend/features/chat/components/chat/messages/file-changes-summary-card.tsx
git commit -m "feat(frontend): add FileChangesSummaryCard inline component"
```

---

## Task 3: Create FileChangesDrawer Component

**Files:**
- Create: `frontend/features/chat/components/execution/file-changes-drawer/index.tsx`
- Create: `frontend/features/chat/components/execution/file-changes-drawer/drawer-file-list.tsx`
- Create: `frontend/features/chat/components/execution/file-changes-drawer/drawer-diff-viewer.tsx`

**Step 1: Create the drawer container component**

```tsx
// frontend/features/chat/components/execution/file-changes-drawer/index.tsx
"use client";

import * as React from "react";
import { X, Download } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useFileChangesDrawer } from "@/features/chat/contexts/file-changes-drawer-context";
import { useT } from "@/lib/i18n/client";
import { useIsMobile } from "@/lib/hooks/use-mobile";
import { DrawerFileList } from "./drawer-file-list";
import { DrawerDiffViewer } from "./drawer-diff-viewer";
import { cn } from "@/lib/utils";

export function FileChangesDrawer() {
  const { t } = useT("translation");
  const isMobile = useIsMobile();
  const {
    isOpen,
    closeDrawer,
    fileChanges,
    selectedPath,
    setSelectedPath,
    drawerWidth,
    setDrawerWidth,
  } = useFileChangesDrawer();

  const selectedChange = React.useMemo(
    () => fileChanges.find((c) => c.path === selectedPath) ?? null,
    [fileChanges, selectedPath],
  );

  // Resize handler
  const isResizing = React.useRef(false);
  const handleMouseDown = React.useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isResizing.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, []);

  React.useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing.current) return;
      const newWidth = window.innerWidth - e.clientX;
      setDrawerWidth(newWidth);
    };

    const handleMouseUp = () => {
      isResizing.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [setDrawerWidth]);

  if (fileChanges.length === 0) {
    return null;
  }

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && closeDrawer()}>
      <SheetContent
        side={isMobile ? "bottom" : "right"}
        className={cn(
          "p-0 flex flex-col",
          isMobile
            ? "h-[85vh] w-full"
            : "h-full border-l",
        )}
        style={isMobile ? undefined : { width: `${drawerWidth}px`, maxWidth: "70vw" }}
      >
        {/* Resize Handle (desktop only) */}
        {!isMobile && (
          <div
            className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-primary/20 transition-colors"
            onMouseDown={handleMouseDown}
          />
        )}

        {/* Header */}
        <SheetHeader className="flex-row items-center justify-between px-4 py-3 border-b shrink-0">
          <SheetTitle className="text-base font-semibold">
            {t("fileChanges.title", "File Changes")}
          </SheetTitle>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="size-8">
              <Download className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              onClick={closeDrawer}
            >
              <X className="size-4" />
            </Button>
          </div>
        </SheetHeader>

        {/* Content */}
        <div className={cn(
          "flex-1 min-h-0 overflow-hidden",
          isMobile ? "flex flex-col" : "grid grid-cols-[180px_1fr]",
        )}>
          {/* File List */}
          <DrawerFileList
            fileChanges={fileChanges}
            selectedPath={selectedPath}
            onSelectPath={setSelectedPath}
            isMobile={isMobile}
          />

          {/* Diff Viewer */}
          <DrawerDiffViewer change={selectedChange} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
```

**Step 2: Create the file list component**

```tsx
// frontend/features/chat/components/execution/file-changes-drawer/drawer-file-list.tsx
"use client";

import * as React from "react";
import { Plus, Minus, FileEdit, GitCompare } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { FileChange } from "@/features/chat/types";
import { cn } from "@/lib/utils";

interface DrawerFileListProps {
  fileChanges: FileChange[];
  selectedPath: string | null;
  onSelectPath: (path: string | null) => void;
  isMobile?: boolean;
}

function getStatusIcon(status: string) {
  switch (status) {
    case "added":
      return <Plus className="size-3.5 text-success shrink-0" />;
    case "deleted":
      return <Minus className="size-3.5 text-destructive shrink-0" />;
    case "renamed":
      return <GitCompare className="size-3.5 text-renamed shrink-0" />;
    case "modified":
    default:
      return <FileEdit className="size-3.5 text-info shrink-0" />;
  }
}

function getFileName(path: string): string {
  return path.split("/").pop() || path;
}

export function DrawerFileList({
  fileChanges,
  selectedPath,
  onSelectPath,
  isMobile = false,
}: DrawerFileListProps) {
  return (
    <div className={cn(
      "border-border bg-muted/30",
      isMobile ? "border-b shrink-0 max-h-32" : "border-r h-full",
    )}>
      <ScrollArea className="h-full">
        <div className="p-2 space-y-0.5">
          {fileChanges.map((change, index) => (
            <button
              key={`${change.path}-${index}`}
              onClick={() => onSelectPath(change.path)}
              className={cn(
                "w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs text-left transition-colors",
                selectedPath === change.path
                  ? "bg-accent text-accent-foreground"
                  : "hover:bg-muted text-foreground/80",
              )}
            >
              {getStatusIcon(change.status)}
              <span className="truncate" title={change.path}>
                {getFileName(change.path)}
              </span>
            </button>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
```

**Step 3: Create the diff viewer component**

```tsx
// frontend/features/chat/components/execution/file-changes-drawer/drawer-diff-viewer.tsx
"use client";

import * as React from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { FileChange } from "@/features/chat/types";
import { useT } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

interface DrawerDiffViewerProps {
  change: FileChange | null;
}

function parseDiffLines(diff: string): { type: "add" | "remove" | "context"; content: string }[] {
  if (!diff) return [];
  return diff.split("\n").map((line) => {
    if (line.startsWith("+") && !line.startsWith("+++")) {
      return { type: "add", content: line };
    }
    if (line.startsWith("-") && !line.startsWith("---")) {
      return { type: "remove", content: line };
    }
    return { type: "context", content: line };
  });
}

export function DrawerDiffViewer({ change }: DrawerDiffViewerProps) {
  const { t } = useT("translation");

  if (!change) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
        {t("fileChanges.selectFile", "Select a file to view changes")}
      </div>
    );
  }

  const diffLines = parseDiffLines(change.diff || "");

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
      {/* File Path Header */}
      <div className="px-4 py-2 border-b bg-muted/30 shrink-0">
        <div className="text-sm font-mono truncate" title={change.path}>
          {change.path}
        </div>
        {change.added_lines !== undefined || change.deleted_lines !== undefined ? (
          <div className="flex items-center gap-3 mt-1 text-xs">
            {change.added_lines !== undefined && change.added_lines > 0 && (
              <span className="text-success">+{change.added_lines}</span>
            )}
            {change.deleted_lines !== undefined && change.deleted_lines > 0 && (
              <span className="text-destructive">-{change.deleted_lines}</span>
            )}
          </div>
        ) : null}
      </div>

      {/* Diff Content */}
      <ScrollArea className="flex-1">
        {diffLines.length > 0 ? (
          <pre className="p-4 text-xs font-mono leading-relaxed">
            {diffLines.map((line, index) => (
              <div
                key={index}
                className={cn(
                  "px-2 -mx-2",
                  line.type === "add" && "bg-success/10 text-success",
                  line.type === "remove" && "bg-destructive/10 text-destructive",
                )}
              >
                {line.content}
              </div>
            ))}
          </pre>
        ) : (
          <div className="p-4 text-sm text-muted-foreground">
            {t("fileChanges.noDiff", "No diff available for this file")}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
```

**Step 4: Verify files were created correctly**

Run: `ls -la frontend/features/chat/components/execution/file-changes-drawer/`
Expected: index.tsx, drawer-file-list.tsx, drawer-diff-viewer.tsx

**Step 5: Commit**

```bash
git add frontend/features/chat/components/execution/file-changes-drawer/
git commit -m "feat(frontend): add FileChangesDrawer overlay component with file list and diff viewer"
```

---

## Task 4: Add i18n Translations

**Files:**
- Modify: `frontend/lib/i18n/locales/zh/translation.json`
- Modify: `frontend/lib/i18n/locales/en/translation.json`

**Step 1: Add Chinese translations**

Add to `frontend/lib/i18n/locales/zh/translation.json` inside the root object:

```json
"fileChangesDrawer": {
  "title": "文件变更",
  "moreFiles": "更多文件",
  "selectFile": "选择文件查看变更",
  "noDiff": "该文件暂无 diff 信息"
}
```

**Step 2: Add English translations**

Add to `frontend/lib/i18n/locales/en/translation.json` inside the root object:

```json
"fileChangesDrawer": {
  "title": "File Changes",
  "moreFiles": "more files",
  "selectFile": "Select a file to view changes",
  "noDiff": "No diff available for this file"
}
```

**Step 3: Commit**

```bash
git add frontend/lib/i18n/locales/
git commit -m "feat(i18n): add translations for file changes drawer"
```

---

## Task 5: Integrate Provider and Drawer into ExecutionContainer

**Files:**
- Modify: `frontend/features/chat/components/layout/execution-container.tsx`

**Step 1: Import new components**

Add imports at top of file:

```tsx
import { FileChangesDrawerProvider } from "@/features/chat/contexts/file-changes-drawer-context";
import { FileChangesDrawer } from "../execution/file-changes-drawer";
```

**Step 2: Modify ExecutionContainerInner to remove right panel**

Replace the desktop layout section (the ResizablePanelGroup) with:

```tsx
// Desktop full-width chat layout
return (
  <div className="flex h-full min-h-0 overflow-hidden bg-transparent select-text">
    <div className="flex-1 h-full flex flex-col min-w-0">
      <ChatPanel
        session={session}
        statePatch={session?.state_patch}
        progress={session?.progress}
        currentStep={session?.state_patch.current_step ?? undefined}
        updateSession={updateSession}
        registerMessageHandler={registerMessageHandler}
        registerReconnectHandler={registerReconnectHandler}
      />
    </div>
    <FileChangesDrawer />
  </div>
);
```

**Step 3: Wrap with FileChangesDrawerProvider**

In the `ExecutionContainer` function, wrap the return with the provider:

```tsx
return (
  <FileChangesDrawerProvider>
    <SessionRealtimeProvider
      sessionId={sessionId}
      onNewMessage={handleNewMessage}
      onReconnect={handleReconnect}
      onTerminal={refreshTasks}
    >
      <ExecutionContainerInner
        sessionId={sessionId}
        registerMessageHandler={registerMessageHandler}
        registerReconnectHandler={registerReconnectHandler}
      />
    </SessionRealtimeProvider>
  </FileChangesDrawerProvider>
);
```

**Step 4: Remove unused imports**

Remove these imports as they are no longer needed:
- `ArtifactsPanel`
- `ResizableHandle`, `ResizablePanel`, `ResizablePanelGroup`

**Step 5: Verify changes compile**

Run: `cd frontend && pnpm build`
Expected: Build succeeds

**Step 6: Commit**

```bash
git add frontend/features/chat/components/layout/execution-container.tsx
git commit -m "refactor(frontend): replace fixed ArtifactsPanel with overlay FileChangesDrawer"
```

---

## Task 6: Integrate FileChangesSummaryCard into Message Rendering

**Files:**
- Modify: `frontend/features/chat/components/chat/messages/assistant-message.tsx`

**Step 1: Import the summary card**

Add import:

```tsx
import { FileChangesSummaryCard } from "./file-changes-summary-card";
```

**Step 2: Add fileChanges prop to AssistantMessageProps**

```tsx
interface AssistantMessageProps {
  message: ChatMessage;
  runUsage?: UsageResponse | null;
  animate?: boolean;
  fileChanges?: FileChange[];
}
```

**Step 3: Add FileChange import**

```tsx
import type { FileChange } from "@/features/chat/types";
```

**Step 4: Update component to render summary card**

Add fileChanges to destructured props:

```tsx
const AssistantMessageComponent = ({
  message,
  runUsage,
  animate = true,
  fileChanges,
}: AssistantMessageProps) => {
```

Add the card render after `<MessageContent>`:

```tsx
<div className="text-foreground text-base break-words w-full min-w-0">
  <MessageContent content={message.content} />
  {message.status === "streaming" && <TypingIndicator />}
  {fileChanges && fileChanges.length > 0 && (
    <FileChangesSummaryCard fileChanges={fileChanges} />
  )}
</div>
```

**Step 5: Update memo comparison**

Update the memo comparison to include fileChanges:

```tsx
export const AssistantMessage = React.memo(
  AssistantMessageComponent,
  (prev, next) => {
    return (
      prev.message.id === next.message.id &&
      prev.message.content === next.message.content &&
      prev.message.status === next.message.status &&
      prev.runUsage === next.runUsage &&
      prev.animate === next.animate &&
      prev.fileChanges === next.fileChanges
    );
  },
);
```

**Step 6: Commit**

```bash
git add frontend/features/chat/components/chat/messages/assistant-message.tsx
git commit -m "feat(frontend): integrate FileChangesSummaryCard into assistant messages"
```

---

## Task 7: Pass fileChanges to AssistantMessage from ChatMessageList

**Files:**
- Modify: `frontend/features/chat/components/chat/chat-message-list.tsx`

**Step 1: Read the file to understand current structure**

Examine how messages are rendered and where to inject fileChanges prop.

**Step 2: Add fileChanges prop passing**

The ChatMessageList needs to receive fileChanges from ChatPanel and pass to the appropriate AssistantMessage (typically the last one or messages after tool execution).

This requires:
1. Adding `fileChanges` prop to ChatMessageList
2. Passing it to the last AssistantMessage in the list

**Step 3: Commit**

```bash
git add frontend/features/chat/components/chat/chat-message-list.tsx
git commit -m "feat(frontend): pass fileChanges to AssistantMessage in message list"
```

---

## Task 8: Pass fileChanges from ChatPanel to ChatMessageList

**Files:**
- Modify: `frontend/features/chat/components/execution/chat-panel/chat-panel.tsx`

**Step 1: Add fileChanges prop to ChatPanelProps**

```tsx
interface ChatPanelProps {
  session: ExecutionSession | null;
  statePatch?: StatePatch;
  progress?: number;
  currentStep?: string;
  updateSession: (newSession: Partial<ExecutionSession>) => void;
  onIconClick?: () => void;
  registerMessageHandler?: (handler: (message: WSMessageData) => void) => void;
  registerReconnectHandler?: (handler: () => Promise<void>) => void;
}
```

**Step 2: Extract fileChanges from session**

```tsx
const fileChanges = session?.state_patch?.workspace_state?.file_changes;
```

**Step 3: Pass to ChatMessageList**

```tsx
<ChatMessageList
  messages={displayMessages}
  isTyping={showTypingIndicator}
  internalContextsByUserMessageId={internalContextsByUserMessageId}
  runUsageByUserMessageId={runUsageByUserMessageId}
  isInitialLoad
  fileChanges={fileChanges}
/>
```

**Step 4: Commit**

```bash
git add frontend/features/chat/components/execution/chat-panel/chat-panel.tsx
git commit -m "feat(frontend): pass fileChanges from ChatPanel to message list"
```

---

## Task 9: Update Mobile View

**Files:**
- Modify: `frontend/features/chat/components/layout/mobile-execution-view.tsx`

**Step 1: Remove ArtifactsPanel slide and bottom navigation**

The mobile view currently has a Swiper with two slides. We need to:
1. Remove the ArtifactsPanel slide
2. Remove the bottom navigation bar (chat/artifacts buttons)
3. Keep only the ChatPanel

**Step 2: Simplify to single view**

```tsx
return (
  <div className="h-full w-full flex flex-col overflow-hidden select-text">
    <ChatPanel
      session={session}
      statePatch={session?.state_patch}
      progress={session?.progress}
      currentStep={session?.state_patch.current_step ?? undefined}
      updateSession={updateSession}
      onIconClick={() => setOpenMobile(true)}
      registerMessageHandler={registerMessageHandler}
      registerReconnectHandler={registerReconnectHandler}
    />
    <FileChangesDrawer />
  </div>
);
```

**Step 3: Remove Swiper imports and unused code**

Remove:
- Swiper imports
- ArtifactsPanel import
- activeIndex state
- swiperRef
- Bottom navigation

**Step 4: Commit**

```bash
git add frontend/features/chat/components/layout/mobile-execution-view.tsx
git commit -m "refactor(frontend): simplify mobile view to single ChatPanel with drawer"
```

---

## Task 10: Final Verification and Cleanup

**Step 1: Run type check**

Run: `cd frontend && pnpm tsc --noEmit`
Expected: No type errors

**Step 2: Run lint**

Run: `cd frontend && pnpm lint`
Expected: No lint errors

**Step 3: Run build**

Run: `cd frontend && pnpm build`
Expected: Build succeeds

**Step 4: Manual testing checklist**

- [ ] Chat panel takes full width on desktop
- [ ] File changes summary card appears in assistant messages
- [ ] Clicking summary card opens right drawer
- [ ] Drawer shows file list on left, diff on right
- [ ] Clicking file in list updates diff view
- [ ] Drawer can be closed via X button or clicking overlay
- [ ] Drawer width is resizable by dragging left edge
- [ ] Drawer width persists across page reloads
- [ ] Mobile: drawer slides from bottom
- [ ] Mobile: drawer is full width

**Step 5: Final commit**

```bash
git add .
git commit -m "feat(frontend): complete file changes drawer implementation"
```
