"use client";

import * as React from "react";
import { ChatPanel } from "../execution/chat-panel/chat-panel";
import { MobileExecutionView } from "./mobile-execution-view";
import { FileChangesDrawerProvider } from "@/features/chat/contexts/file-changes-drawer-context";
import { FileChangesDrawer } from "../execution/file-changes-drawer";
import {
  SessionRealtimeProvider,
  useSessionRealtime,
} from "@/features/chat/contexts/session-realtime-context";
import { useTaskHistoryContext } from "@/features/projects/contexts/task-history-context";
import { useIsMobile } from "@/lib/hooks/use-mobile";
import { useT } from "@/lib/i18n/client";
import { Loader2 } from "lucide-react";
import type { WSMessageData } from "@/features/chat/types/websocket";

interface ExecutionContainerProps {
  sessionId: string;
}

function ExecutionContainerInner({
  sessionId,
  registerMessageHandler,
  registerReconnectHandler,
}: ExecutionContainerProps & {
  registerMessageHandler: (handler: (message: WSMessageData) => void) => void;
  registerReconnectHandler: (handler: () => Promise<void>) => void;
}) {
  const { t } = useT("translation");
  const { session, isLoading, error, updateSession, connectionState } =
    useSessionRealtime();

  const isMobile = useIsMobile();

  // Log connection mode changes
  React.useEffect(() => {
    console.log(
      `%c[Session] Connection state: ${connectionState}`,
      connectionState === "connected"
        ? "color: #22c55e; font-weight: bold;"
        : "color: #f59e0b; font-weight: bold;",
    );
  }, [connectionState]);

  // Loading state
  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center bg-transparent select-text">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground/20" />
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="flex h-full items-center justify-center bg-transparent select-text">
        <div className="text-center">
          <p className="text-destructive mb-2">
            {t("chat.sessionLoadErrorTitle")}
          </p>
          <p className="text-muted-foreground text-sm">
            {error.message || t("chat.unknownError")}
          </p>
        </div>
      </div>
    );
  }

  // Mobile view (under 768px)
  if (isMobile) {
    return (
      <MobileExecutionView
        session={session}
        sessionId={sessionId}
        updateSession={updateSession}
        registerMessageHandler={registerMessageHandler}
        registerReconnectHandler={registerReconnectHandler}
      />
    );
  }

  // Desktop full-width chat layout
  return (
    <div className="flex h-full min-h-0 overflow-hidden bg-transparent select-text">
      <div className="flex-1 h-full flex flex-col min-w-0">
        <ChatPanel
          session={session}
          statePatch={session?.state_patch}
          progress={session?.progress}
          currentStep={session?.state_patch.current_step ?? undefined}
          updateSession={updateSession}
          registerMessageHandler={registerMessageHandler}
          registerReconnectHandler={registerReconnectHandler}
        />
      </div>
      <FileChangesDrawer />
    </div>
  );
}

export function ExecutionContainer({ sessionId }: ExecutionContainerProps) {
  const { refreshTasks } = useTaskHistoryContext();

  // Refs to hold message handlers registered from ChatPanel
  const messageHandlerRef = React.useRef<
    ((message: WSMessageData) => void) | null
  >(null);
  const reconnectHandlerRef = React.useRef<(() => Promise<void>) | null>(null);

  const handleNewMessage = React.useCallback((message: WSMessageData) => {
    messageHandlerRef.current?.(message);
  }, []);

  const handleReconnect = React.useCallback(async () => {
    await reconnectHandlerRef.current?.();
  }, []);

  const registerMessageHandler = React.useCallback(
    (handler: (message: WSMessageData) => void) => {
      messageHandlerRef.current = handler;
    },
    [],
  );

  const registerReconnectHandler = React.useCallback(
    (handler: () => Promise<void>) => {
      reconnectHandlerRef.current = handler;
    },
    [],
  );

  return (
    <FileChangesDrawerProvider>
      <SessionRealtimeProvider
        sessionId={sessionId}
        onNewMessage={handleNewMessage}
        onReconnect={handleReconnect}
        onTerminal={refreshTasks}
      >
        <ExecutionContainerInner
          sessionId={sessionId}
          registerMessageHandler={registerMessageHandler}
          registerReconnectHandler={registerReconnectHandler}
        />
      </SessionRealtimeProvider>
    </FileChangesDrawerProvider>
  );
}
