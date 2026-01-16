import { ChatLayoutClient } from "@/features/chat/components/layout/chat-layout-client";
import {
  projectsService,
  tasksService,
} from "@/features/projects/services/projects-service";

export default async function ChatLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [projects, taskHistory] = await Promise.all([
    projectsService.listProjects({ revalidate: 60 }),
    tasksService.listHistory({ revalidate: 60 }),
  ]);

  return (
    <ChatLayoutClient
      initialProjects={projects}
      initialTaskHistory={taskHistory}
    >
      {children}
    </ChatLayoutClient>
  );
}
