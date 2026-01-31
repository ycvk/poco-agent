"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { useT } from "@/lib/i18n/client";

import { useAutosizeTextarea } from "../hooks/use-autosize-textarea";

import { HomeHeader } from "./home-header";
import { TaskComposer } from "./task-composer";
import { ConnectorsBar } from "./connectors-bar";
import { KeyboardHints } from "./keyboard-hints";
import { QuickActions } from "./quick-actions";
import { createSessionAction } from "@/features/chat/actions/session-actions";
import type { ComposerMode, TaskSendOptions } from "./task-composer";

import { useAppShell } from "@/components/shared/app-shell-context";
import { scheduledTasksService } from "@/features/scheduled-tasks/services/scheduled-tasks-service";
import { toast } from "sonner";
import type { TaskConfig } from "@/features/chat/types/api/session";

export function HomePageClient() {
  const { t } = useT("translation");
  const router = useRouter();
  const { lng, addTask, openSettings } = useAppShell();

  const [inputValue, setInputValue] = React.useState("");
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [isInputFocused, setIsInputFocused] = React.useState(false);
  const [mode, setMode] = React.useState<ComposerMode>("task");
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  useAutosizeTextarea(textareaRef, inputValue);

  // Determine if connectors bar should be expanded
  const shouldExpandConnectors = isInputFocused || inputValue.trim().length > 0;

  const handleSendTask = React.useCallback(
    async (options?: TaskSendOptions) => {
      const inputFiles = options?.attachments ?? [];
      const repoUrl = (options?.repo_url || "").trim();
      const gitBranch = (options?.git_branch || "").trim() || "main";
      const runSchedule = options?.run_schedule ?? null;
      const scheduledTask = options?.scheduled_task ?? null;
      if (
        (mode === "scheduled"
          ? inputValue.trim() === ""
          : inputValue.trim() === "" && inputFiles.length === 0) ||
        isSubmitting
      ) {
        return;
      }

      setIsSubmitting(true);
      console.log("[Home] Sending task:", inputValue, { mode });

      try {
        // Build config object (shared by plan/task, and also used to pin scheduled task config)
        const config: TaskConfig & Record<string, unknown> = {};
        if (inputFiles.length > 0) {
          config.input_files = inputFiles;
        }
        if (repoUrl) {
          config.repo_url = repoUrl;
          config.git_branch = gitBranch;
        }

        if (mode === "scheduled") {
          const name =
            (scheduledTask?.name || "").trim() ||
            inputValue.trim().slice(0, 32);
          const cron = (scheduledTask?.cron || "").trim() || "*/5 * * * *";
          const timezone = (scheduledTask?.timezone || "").trim() || "UTC";
          const enabled = Boolean(scheduledTask?.enabled ?? true);
          const reuseSession = Boolean(scheduledTask?.reuse_session ?? true);

          const created = await scheduledTasksService.create({
            name,
            cron,
            timezone,
            prompt: inputValue,
            enabled,
            reuse_session: reuseSession,
            config: Object.keys(config).length > 0 ? config : undefined,
          });

          toast.success(t("library.scheduledTasks.toasts.created"));
          setInputValue("");
          router.push(
            `/${lng}/capabilities/scheduled-tasks/${created.scheduled_task_id}`,
          );
          return;
        }

        // 1. Call create session API
        const session = await createSessionAction({
          prompt: inputValue,
          config: Object.keys(config).length > 0 ? config : undefined,
          permission_mode: mode === "plan" ? "plan" : "default",
          schedule_mode: runSchedule?.schedule_mode,
          timezone: runSchedule?.timezone,
          scheduled_at: runSchedule?.scheduled_at,
        });
        console.log("session", session);
        const sessionId = session.sessionId;
        console.log("sessionId", sessionId);

        // 2. Save prompt to localStorage for compatibility/fallback
        localStorage.setItem(`session_prompt_${sessionId}`, inputValue);

        // 3. Add to local history (persisted via localStorage in hook)
        addTask(inputValue, {
          id: sessionId,
          timestamp: new Date().toISOString(),
          status: "running",
        });

        console.log("[Home] Navigating to chat session:", sessionId);
        setInputValue("");

        // 4. Navigate to the chat page
        router.push(`/${lng}/chat/${sessionId}`);
      } catch (error) {
        console.error("[Home] Failed to create session:", error);
      } finally {
        setIsSubmitting(false);
      }
    },
    [addTask, inputValue, isSubmitting, lng, mode, router, t],
  );

  return (
    <>
      <HomeHeader onOpenSettings={openSettings} />

      <div className="flex flex-1 overflow-hidden">
        <div className="mx-auto flex w-full max-w-6xl flex-col px-6 pb-12 pt-10">
          <div className="grid gap-10 lg:grid-cols-[1.05fr_1.45fr] lg:items-start">
            <div className="pt-1">
              <h1 className="font-display text-3xl font-semibold leading-[1.05] tracking-tight text-foreground md:text-5xl">
                {t("hero.title")}
              </h1>
              <p className="mt-3 max-w-[46ch] text-sm leading-relaxed text-muted-foreground/80 md:text-base">
                {t("hero.subtitle")}
              </p>
              <QuickActions
                onPick={(prompt) => {
                  setInputValue(prompt);
                  requestAnimationFrame(() => textareaRef.current?.focus());
                }}
              />
            </div>

            <div className="w-full">
              <TaskComposer
                textareaRef={textareaRef}
                value={inputValue}
                onChange={setInputValue}
                mode={mode}
                onModeChange={setMode}
                onSend={handleSendTask}
                isSubmitting={isSubmitting}
                onFocus={() => setIsInputFocused(true)}
                onBlur={() => setIsInputFocused(false)}
              />

              <KeyboardHints />

              <ConnectorsBar
                forceExpanded={shouldExpandConnectors && mode !== "scheduled"}
              />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
