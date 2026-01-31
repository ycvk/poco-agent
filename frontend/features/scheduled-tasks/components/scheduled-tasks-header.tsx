"use client";

import { Clock, Plus } from "lucide-react";

import { useT } from "@/lib/i18n/client";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

interface ScheduledTasksHeaderProps {
  onAddClick?: () => void;
}

export function ScheduledTasksHeader({
  onAddClick,
}: ScheduledTasksHeaderProps) {
  const { t } = useT("translation");

  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-border/50 bg-background/50 px-6 backdrop-blur-sm sticky top-0 z-10">
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex items-center justify-center p-2 rounded-lg bg-muted text-foreground">
          <Clock className="size-5" />
        </div>
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-lg font-bold tracking-tight shrink-0">
            {t("library.scheduledTasks.page.title")}
          </span>
          <Separator orientation="vertical" className="h-4 shrink-0" />
          <span className="text-sm text-muted-foreground truncate">
            {t("library.scheduledTasks.description")}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          className="gap-2"
          onClick={onAddClick}
        >
          <Plus className="size-4" />
          {t("library.scheduledTasks.page.create")}
        </Button>
      </div>
    </header>
  );
}
