import { HomePageClient } from "@/features/home/components/home-page-client";
import {
  projectsService,
  tasksService,
} from "@/features/projects/services/projects-service";

export default async function Page() {
  const [projects, taskHistory] = await Promise.all([
    projectsService.listProjects({ revalidate: 60 }),
    tasksService.listHistory({ revalidate: 60 }),
  ]);

  return (
    <HomePageClient
      initialProjects={projects}
      initialTaskHistory={taskHistory}
    />
  );
}
