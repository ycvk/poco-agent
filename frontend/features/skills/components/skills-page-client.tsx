"use client";

import * as React from "react";

import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/shared/sidebar/app-sidebar";

import { SkillsHeader } from "@/features/skills/components/skills-header";
import { SkillsGrid } from "@/features/skills/components/skills-grid";

import { useProjects } from "@/features/projects/hooks/use-projects";
import { useTaskHistory } from "@/features/projects/hooks/use-task-history";
import type { ProjectItem, TaskHistoryItem } from "@/features/projects/types";

interface SkillsPageClientProps {
  initialProjects: ProjectItem[];
  initialTaskHistory: TaskHistoryItem[];
}

export function SkillsPageClient({
  initialProjects,
  initialTaskHistory,
}: SkillsPageClientProps) {
  const { projects, addProject } = useProjects({
    initialProjects,
  });
  const { taskHistory, removeTask } = useTaskHistory({
    initialTasks: initialTaskHistory,
  });

  return (
    <SidebarProvider defaultOpen={true}>
      <div className="flex min-h-svh w-full overflow-hidden bg-background">
        <AppSidebar
          projects={projects}
          taskHistory={taskHistory}
          onNewTask={() => {}}
          onDeleteTask={removeTask}
          onCreateProject={addProject}
        />

        <SidebarInset className="flex flex-col bg-muted/30">
          <SkillsHeader />

          <div className="flex flex-1 flex-col px-6 py-10">
            <div className="w-full max-w-6xl mx-auto">
              <SkillsGrid />
            </div>
          </div>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
