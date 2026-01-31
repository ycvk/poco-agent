"use client";

import { useState } from "react";

import { PullToRefresh } from "@/components/ui/pull-to-refresh";
import { SlashCommandsHeader } from "@/features/slash-commands/components/slash-commands-header";
import { SlashCommandsList } from "@/features/slash-commands/components/slash-commands-list";
import {
  SlashCommandDialog,
  type SlashCommandDialogMode,
} from "@/features/slash-commands/components/slash-command-dialog";
import { useSlashCommandsStore } from "@/features/slash-commands/hooks/use-slash-commands-store";
import type { SlashCommand } from "@/features/slash-commands/types";

export function SlashCommandsPageClient() {
  const store = useSlashCommandsStore();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] =
    useState<SlashCommandDialogMode>("create");
  const [editing, setEditing] = useState<SlashCommand | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const filteredCommands = store.commands.filter((cmd) => {
    if (!searchQuery) return true;
    const lowerQuery = searchQuery.toLowerCase();
    return (
      cmd.name.toLowerCase().includes(lowerQuery) ||
      (cmd.description || "").toLowerCase().includes(lowerQuery) ||
      (cmd.content || "").toLowerCase().includes(lowerQuery)
    );
  });

  return (
    <>
      <SlashCommandsHeader
        onAddClick={() => {
          setDialogMode("create");
          setEditing(null);
          setDialogOpen(true);
        }}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
      />

      <div className="flex flex-1 flex-col overflow-hidden">
        <PullToRefresh onRefresh={store.refresh} isLoading={store.isLoading}>
          <div className="flex flex-1 flex-col px-6 py-6 overflow-auto">
            <div className="w-full max-w-4xl mx-auto">
              <SlashCommandsList
                commands={filteredCommands}
                savingId={store.savingId}
                onToggleEnabled={(id, enabled) => store.setEnabled(id, enabled)}
                onEdit={(cmd) => {
                  setDialogMode("edit");
                  setEditing(cmd);
                  setDialogOpen(true);
                }}
                onDelete={(cmd) => store.deleteCommand(cmd.id)}
              />
            </div>
          </div>
        </PullToRefresh>
      </div>

      <SlashCommandDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        mode={dialogMode}
        initialCommand={editing}
        isSaving={store.savingId !== null}
        onCreate={store.createCommand}
        onUpdate={store.updateCommand}
      />
    </>
  );
}
