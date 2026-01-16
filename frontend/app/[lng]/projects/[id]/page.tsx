import { ProjectPageClient } from "@/features/projects/components/project-page-client";
import {
  projectsService,
  tasksService,
} from "@/features/projects/services/projects-service";

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [projects, taskHistory] = await Promise.all([
    projectsService.listProjects({ revalidate: 60 }),
    tasksService.listHistory({ revalidate: 60 }),
  ]);

  return (
    <ProjectPageClient
      projectId={id}
      initialProjects={projects}
      initialTaskHistory={taskHistory}
    />
  );
}
