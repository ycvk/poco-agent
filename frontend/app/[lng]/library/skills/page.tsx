import { SkillsPageClient } from "@/features/skills/components/skills-page-client";
import {
  projectsService,
  tasksService,
} from "@/features/projects/services/projects-service";

export default async function SkillsPage() {
  const [projects, taskHistory] = await Promise.all([
    projectsService.listProjects({ revalidate: 60 }),
    tasksService.listHistory({ revalidate: 60 }),
  ]);

  return (
    <SkillsPageClient
      initialProjects={projects}
      initialTaskHistory={taskHistory}
    />
  );
}
