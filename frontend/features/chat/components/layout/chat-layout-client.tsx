"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/shared/sidebar/app-sidebar";
import { SettingsDialog } from "@/features/settings/components/settings-dialog";
import { useProjects } from "@/features/projects/hooks/use-projects";
import { useTaskHistory } from "@/features/projects/hooks/use-task-history";
import type { ProjectItem, TaskHistoryItem } from "@/features/projects/types";

interface ChatLayoutClientProps {
  children: React.ReactNode;
  initialProjects: ProjectItem[];
  initialTaskHistory: TaskHistoryItem[];
}

export function ChatLayoutClient({
  children,
  initialProjects,
  initialTaskHistory,
}: ChatLayoutClientProps) {
  const router = useRouter();
  const [isSettingsOpen, setIsSettingsOpen] = React.useState(false);
  const { projects, addProject } = useProjects({
    initialProjects,
  });
  const { taskHistory, removeTask, moveTask } = useTaskHistory({
    initialTasks: initialTaskHistory,
  });

  return (
    <SidebarProvider defaultOpen={true}>
      <div className="flex min-h-svh w-full overflow-hidden bg-background">
        <AppSidebar
          projects={projects}
          taskHistory={taskHistory}
          onNewTask={() => router.push("/")}
          onDeleteTask={removeTask}
          onCreateProject={addProject}
          onMoveTaskToProject={moveTask}
          onOpenSettings={() => setIsSettingsOpen(true)}
        />
        <SidebarInset className="flex flex-col bg-muted/30">
          {children}
        </SidebarInset>
        <SettingsDialog
          open={isSettingsOpen}
          onOpenChange={setIsSettingsOpen}
        />
      </div>
    </SidebarProvider>
  );
}
