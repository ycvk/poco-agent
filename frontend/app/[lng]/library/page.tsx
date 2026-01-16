import { LibraryPageClient } from "@/features/library/components/library-page-client";
import {
  projectsService,
  tasksService,
} from "@/features/projects/services/projects-service";

export default async function LibraryPage() {
  const [projects, taskHistory] = await Promise.all([
    projectsService.listProjects({ revalidate: 60 }),
    tasksService.listHistory({ revalidate: 60 }),
  ]);

  return (
    <LibraryPageClient
      initialProjects={projects}
      initialTaskHistory={taskHistory}
    />
  );
}
