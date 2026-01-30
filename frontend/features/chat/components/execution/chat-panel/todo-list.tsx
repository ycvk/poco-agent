"use client";

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, Circle, CircleDot } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/client";
import type { TodoItem as TodoItemType } from "@/features/chat/types";

interface TodoListProps {
  todos: TodoItemType[];
  progress?: number;
  currentStep?: string;
}

export function TodoList({ todos, progress = 0, currentStep }: TodoListProps) {
  const { t } = useT("translation");

  const completedCount = todos.filter(
    (todo) => todo.status === "completed",
  ).length;
  const derivedProgress =
    progress > 0
      ? progress
      : todos.length > 0
        ? Math.round((completedCount / todos.length) * 100)
        : 0;

  return (
    <Card className="overflow-hidden">
      <CardHeader className="py-2.5 px-4">
        <div className="space-y-1.5">
          {/* Title with icon and count */}
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <CheckCircle2 className="size-4 text-foreground" />
            <span className="flex-1">
              {t("todo.title")}
              {currentStep && (
                <span className="ml-2 text-xs font-normal text-muted-foreground/70">
                  - {currentStep}
                </span>
              )}
            </span>
            <span className="text-xs text-muted-foreground font-normal">
              {completedCount}/{todos.length} {derivedProgress}%
            </span>
          </CardTitle>

          {/* Progress bar */}
          <Progress value={derivedProgress} className="h-1" />
        </div>
      </CardHeader>

      {/* Todo items - auto height */}
      <CardContent className="px-4 pb-3 pt-0">
        <div className="grid grid-cols-3 gap-x-4 gap-y-1.5">
          {todos.map((todo, index) => {
            const isCompleted = todo.status === "completed";
            const isInProgress = todo.status === "in_progress";

            // Show active_form when in progress, otherwise show content
            const displayText =
              isInProgress && todo.active_form
                ? todo.active_form
                : todo.content;

            return (
              <div
                key={index}
                className={cn(
                  "flex items-center gap-1.5 text-xs rounded px-1.5 -mx-1.5 py-0.5 transition-colors duration-200",
                  isInProgress && "bg-primary/10",
                  isCompleted ? "text-foreground/80" : "text-foreground/60",
                )}
              >
                {isCompleted ? (
                  <CheckCircle2 className="size-3.5 text-foreground shrink-0" />
                ) : isInProgress ? (
                  <CircleDot className="size-3.5 text-primary shrink-0 animate-pulse-glow" />
                ) : (
                  <Circle className="size-3.5 text-muted-foreground shrink-0" />
                )}
                <span className="truncate">{displayText}</span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
