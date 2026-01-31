"use client";

import { useSidebar } from "@/components/ui/sidebar";
import { ChatPanel } from "../execution/chat-panel/chat-panel";
import { FileChangesDrawer } from "../execution/file-changes-drawer";
import type { ExecutionSession, WSMessageData } from "@/features/chat/types";

interface MobileExecutionViewProps {
  session: ExecutionSession | null;
  sessionId?: string;
  updateSession: (newSession: Partial<ExecutionSession>) => void;
  registerMessageHandler?: (handler: (message: WSMessageData) => void) => void;
  registerReconnectHandler?: (handler: () => Promise<void>) => void;
}

export function MobileExecutionView({
  session,
  updateSession,
  registerMessageHandler,
  registerReconnectHandler,
}: MobileExecutionViewProps) {
  const { setOpenMobile } = useSidebar();

  return (
    <div className="h-full w-full flex flex-col overflow-hidden select-text">
      <ChatPanel
        session={session}
        statePatch={session?.state_patch}
        progress={session?.progress}
        currentStep={session?.state_patch.current_step ?? undefined}
        updateSession={updateSession}
        onIconClick={() => setOpenMobile(true)}
        registerMessageHandler={registerMessageHandler}
        registerReconnectHandler={registerReconnectHandler}
      />
      <FileChangesDrawer />
    </div>
  );
}
