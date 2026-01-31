# File Changes Panel Redesign

## Problem

The current "File Changes" panel has UX issues:
- Takes up ~55% of screen width permanently
- Cannot be collapsed or hidden
- Wastes space when there are no file changes
- Compresses the chat area, degrading reading experience

## Solution Overview

Replace the fixed side panel with an on-demand drawer system:
- **Default**: Chat panel takes full width
- **On file changes**: Show inline summary card in AI messages
- **On click**: Open overlay drawer from right side

## Design Details

### 1. Layout Architecture

**Current:**
```
[Sidebar | Chat(45%) | FileChanges(55%)]
```

**New:**
```
[Sidebar | Chat(100%)                  ]
              click card → [Drawer overlay]
```

### 2. Inline Summary Card

Embedded in AI messages, following tool execution results.

```
┌─────────────────────────────────────┐
│ 📁 File Changes (3)                → │
│ ┌─────────────────────────────────┐ │
│ │ + src/components/Button.tsx     │ │
│ │ ~ src/pages/Home.tsx            │ │
│ │ - src/utils/old-helper.ts       │ │
│ └─────────────────────────────────┘ │
└─────────────────────────────────────┘
```

**Specifications:**
- Icons: `+` green (added), `~` yellow (modified), `-` red (deleted)
- Show max 3-4 files, collapse with "+N more files"
- Show filename only, full path on hover
- Right arrow `→` indicates clickable
- Entire card clickable to open drawer

### 3. Right Overlay Drawer

**Behavior:**
- Slides in from right, overlays chat area (no layout push)
- Semi-transparent backdrop, click to close
- Default width: 500px
- Resizable by dragging left edge (range: 400px - 70% viewport)
- Persist user-adjusted width in localStorage

**Internal Layout (Split Pane):**
```
┌──────────────────────────────────────────────┐
│  ✕  File Changes                    ⬇ Export │  ← Header
├────────────────┬─────────────────────────────┤
│ 📁 File List   │  src/components/Button.tsx  │
│ ───────────── │  ─────────────────────────── │
│ + Button.tsx  │  @@ -1,5 +1,8 @@             │
│ ~ Home.tsx    │  - import React from 'react' │
│ - old-helper  │  + import { FC } from 'react'│
│               │  + import { cn } from 'utils' │
│               │                               │
│  (150px fixed) │     (remaining, shows diff)  │
└────────────────┴─────────────────────────────┘
```

**Interactions:**
- Left file list scrollable, click to switch diff view
- Right diff with syntax highlighting, red/green background for deletions/additions
- Header has close button `✕` and download button

### 4. Mobile Adaptation

- Inline card unchanged, displays normally in messages
- Drawer becomes full-screen (100% width), slides up from bottom
- Single column layout: file list at top (collapsible), diff below
- Swipe left or tap close to return to chat

## Implementation

### Files to Modify

| File | Changes |
|------|---------|
| `execution-container.tsx` | Remove fixed right panel, chat takes full width |
| `ArtifactsPanel` → new `FileChangesDrawer` | Convert to drawer component |
| New `FileChangesSummaryCard` | Inline summary card for messages |
| Chat/message rendering component | Integrate summary card rendering |
| `mobile-execution-view.tsx` | Adjust mobile drawer behavior |

### New State

```typescript
interface FileChangesDrawerState {
  isDrawerOpen: boolean;
  selectedFileChange: FileChange | null;
  drawerWidth: number;
}
```

### Components to Create

1. **FileChangesSummaryCard** - Inline card in messages
2. **FileChangesDrawer** - Overlay drawer container
3. **FileListPane** - Left pane file list
4. **DiffViewer** - Right pane diff display (may reuse existing)
