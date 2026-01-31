"use client";

import * as React from "react";
import { MessageSquare, Loader2 } from "lucide-react";
import { ChatMessageList } from "../../chat/chat-message-list";
import { TodoList } from "./todo-list";
import { StatusBar } from "./status-bar";
import { PendingMessageList } from "./pending-message-list";
import { ChatInput } from "./chat-input";
import { UserInputRequestCard } from "./user-input-request-card";
import { PlanApprovalCard } from "./plan-approval-card";
import { PanelHeader } from "@/components/shared/panel-header";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { buttonVariants } from "@/components/ui/button";
import { useChatMessages } from "./hooks/use-chat-messages";
import { usePendingMessages } from "./hooks/use-pending-messages";
import { cancelSessionAction } from "@/features/chat/actions/session-actions";
import type {
  ExecutionSession,
  StatePatch,
  InputFile,
  WSMessageData,
} from "@/features/chat/types";
import { useT } from "@/lib/i18n/client";
import { useSessionRealtime } from "@/features/chat/contexts/session-realtime-context";

interface ChatPanelProps {
  session: ExecutionSession | null;
  statePatch?: StatePatch;
  progress?: number;
  currentStep?: string;
  updateSession: (newSession: Partial<ExecutionSession>) => void;
  onIconClick?: () => void;
  /** Register new message handler for WebSocket updates */
  registerMessageHandler?: (handler: (message: WSMessageData) => void) => void;
  /** Register reconnect handler for WebSocket reconnection */
  registerReconnectHandler?: (handler: () => Promise<void>) => void;
}

/**
 * Chat Panel Container Component
 *
 * Responsibilities:
 * - Compose message and pending message hooks
 * - Coordinate between active/idle session states
 * - Render UI layout
 *
 * Delegates to:
 * - useChatMessages: Message loading, polling, display
 * - usePendingMessages: Queue management, auto-send
 * - ChatInput: Input handling
 * - ChatMessageList: Message rendering
 * - TodoList/StatusBar: State display
 */
export function ChatPanel({
  session,
  statePatch,
  progress = 0,
  currentStep,
  updateSession,
  onIconClick,
  registerMessageHandler,
  registerReconnectHandler,
}: ChatPanelProps) {
  const { t } = useT("translation");
  const [isCancelling, setIsCancelling] = React.useState(false);
  const [isCancelDialogOpen, setIsCancelDialogOpen] = React.useState(false);

  // Message management hook
  const {
    displayMessages,
    isLoadingHistory,
    showTypingIndicator,
    sendMessage,
    internalContextsByUserMessageId,
    runUsageByUserMessageId,
    handleNewMessage,
    handleReconnect,
  } = useChatMessages({ session });

  // Register handlers with parent for WebSocket integration
  React.useEffect(() => {
    if (registerMessageHandler) {
      registerMessageHandler(handleNewMessage);
    }
  }, [registerMessageHandler, handleNewMessage]);

  React.useEffect(() => {
    if (registerReconnectHandler) {
      registerReconnectHandler(handleReconnect);
    }
  }, [registerReconnectHandler, handleReconnect]);

  // Pending message queue hook
  const {
    pendingMessages,
    addPendingMessage,
    sendPendingMessage,
    modifyPendingMessage,
    deletePendingMessage,
  } = usePendingMessages({ session, sendMessage });

  // Determine if session is running/active
  const isSessionActive =
    session?.status === "running" || session?.status === "accepted";

  const { userInputRequests, submitUserInputAnswer } = useSessionRealtime();
  const [isSubmittingUserInput, setIsSubmittingUserInput] =
    React.useState(false);

  const activeUserInput = userInputRequests[0];

  const isSessionCancelable =
    session?.status === "running" || session?.status === "accepted";

  const openCancelDialog = React.useCallback(() => {
    if (!session?.session_id) return;
    if (!isSessionCancelable) return;
    if (isCancelling) return;
    setIsCancelDialogOpen(true);
  }, [isCancelling, isSessionCancelable, session?.session_id]);

  const confirmCancel = React.useCallback(async () => {
    if (!session?.session_id) return;
    if (isCancelling) return;

    const prevStatus = session.status;
    setIsCancelling(true);
    // Optimistically mark as terminal so polling/streaming stops immediately.
    updateSession({ status: "canceled" });

    try {
      await cancelSessionAction({ sessionId: session.session_id });
      setIsCancelDialogOpen(false);
    } catch (error) {
      console.error("[ChatPanel] Failed to cancel session:", error);
      // Best-effort revert so the UI doesn't get stuck in a wrong terminal state.
      updateSession({ status: prevStatus });
    } finally {
      setIsCancelling(false);
    }
  }, [isCancelling, session?.session_id, session?.status, updateSession]);

  // Handle send from input
  const handleSend = async (content: string, attachments?: InputFile[]) => {
    if (!session?.session_id) return;

    if (activeUserInput) {
      return;
    }

    if (isSessionActive) {
      // Session is running, add to pending queue
      addPendingMessage(content, attachments);
    } else {
      // Session is idle, send immediately and mark as active
      if (session.status !== "running" && session.status !== "accepted") {
        updateSession({ status: "accepted" });
      }
      await sendMessage(content, attachments);
    }
  };

  // Condition checks for UI sections
  const hasTodos = statePatch?.todos && statePatch.todos.length > 0;
  // Check for config snapshot or runtime data
  const hasConfigSnapshot =
    session?.config_snapshot &&
    ((session.config_snapshot.mcp_server_ids &&
      session.config_snapshot.mcp_server_ids.length > 0) ||
      (session.config_snapshot.skill_ids &&
        session.config_snapshot.skill_ids.length > 0));
  const hasSkills =
    statePatch?.skills_used && statePatch.skills_used.length > 0;
  const hasMcp = statePatch?.mcp_status && statePatch.mcp_status.length > 0;

  return (
    <div className="flex flex-col h-full bg-background min-w-0">
      {/* Header */}
      <PanelHeader
        icon={MessageSquare}
        title={
          session?.task_name ||
          session?.new_message?.title ||
          t("chat.executionTitle")
        }
        description={t("chat.emptyStateDesc")}
        onIconClick={onIconClick}
      />

      {/* Top Section: Todo List (full width) */}
      {hasTodos && (
        <div className="px-4 pt-4 pb-2 shrink-0">
          <TodoList
            todos={statePatch.todos!}
            progress={progress}
            currentStep={currentStep}
          />
        </div>
      )}

      {/* Message list */}
      <div className="flex-1 min-h-0 px-4">
        {isLoadingHistory ? (
          <div className="flex h-full w-full items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground/20" />
          </div>
        ) : (
          <ChatMessageList
            messages={displayMessages}
            isTyping={showTypingIndicator}
            internalContextsByUserMessageId={internalContextsByUserMessageId}
            runUsageByUserMessageId={runUsageByUserMessageId}
            isInitialLoad
          />
        )}
      </div>

      {/* Status Bar - Skills and MCP */}
      {(hasConfigSnapshot || hasSkills || hasMcp) && (
        <StatusBar
          configSnapshot={session?.config_snapshot}
          skills={statePatch?.skills_used}
          mcpStatuses={statePatch?.mcp_status}
        />
      )}

      {/* Pending Messages Queue */}
      {pendingMessages.length > 0 && (
        <PendingMessageList
          messages={pendingMessages}
          onSend={sendPendingMessage}
          onModify={modifyPendingMessage}
          onDelete={deletePendingMessage}
        />
      )}

      {activeUserInput && (
        <div className="px-4 pb-3">
          {activeUserInput.tool_name === "ExitPlanMode" ? (
            <PlanApprovalCard
              request={activeUserInput}
              isSubmitting={isSubmittingUserInput}
              onApprove={() =>
                (async () => {
                  setIsSubmittingUserInput(true);
                  try {
                    await submitUserInputAnswer(activeUserInput.id, {
                      approved: "true",
                    });
                  } finally {
                    setIsSubmittingUserInput(false);
                  }
                })()
              }
              onReject={() =>
                (async () => {
                  setIsSubmittingUserInput(true);
                  try {
                    await submitUserInputAnswer(activeUserInput.id, {
                      approved: "false",
                    });
                  } finally {
                    setIsSubmittingUserInput(false);
                  }
                })()
              }
            />
          ) : (
            <UserInputRequestCard
              request={activeUserInput}
              isSubmitting={isSubmittingUserInput}
              onSubmit={(answers) =>
                (async () => {
                  setIsSubmittingUserInput(true);
                  try {
                    await submitUserInputAnswer(activeUserInput.id, answers);
                  } finally {
                    setIsSubmittingUserInput(false);
                  }
                })()
              }
            />
          )}
        </div>
      )}

      {/* Input */}
      <ChatInput
        onSend={handleSend}
        onCancel={openCancelDialog}
        canCancel={isSessionCancelable || isCancelling}
        isCancelling={isCancelling}
        disabled={!session?.session_id || !!activeUserInput || isCancelling}
      />

      <AlertDialog
        open={isCancelDialogOpen}
        onOpenChange={(open) => {
          if (isCancelling) return;
          setIsCancelDialogOpen(open);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("chat.cancelTask")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("chat.cancelTaskConfirm")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isCancelling}>
              {t("common.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void confirmCancel();
              }}
              disabled={isCancelling}
              className={buttonVariants({ variant: "destructive" })}
            >
              {isCancelling ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t("chat.cancelTask")}
                </>
              ) : (
                t("chat.cancelTask")
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
