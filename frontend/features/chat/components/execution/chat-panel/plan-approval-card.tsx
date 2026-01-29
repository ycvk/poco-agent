"use client";

import * as React from "react";
import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/client";
import type { UserInputRequest } from "@/features/chat/types";

export function PlanApprovalCard({
  request,
  isSubmitting = false,
  onApprove,
  onReject,
}: {
  request: UserInputRequest;
  isSubmitting?: boolean;
  onApprove: () => Promise<void>;
  onReject: () => Promise<void>;
}) {
  const { t } = useT("translation");

  const plan = String(request.tool_input?.plan || "").trim();
  const [secondsLeft, setSecondsLeft] = React.useState<number | null>(null);

  React.useEffect(() => {
    if (!request.expires_at) {
      setSecondsLeft(null);
      return;
    }
    const expiresAt = new Date(request.expires_at).getTime();
    const update = () => {
      const now = Date.now();
      const diff = Math.max(0, Math.ceil((expiresAt - now) / 1000));
      setSecondsLeft(diff);
    };
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [request.expires_at]);

  if (secondsLeft === 0) {
    return null;
  }

  return (
    <div className="border border-border rounded-lg bg-card/60 p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-medium text-foreground">
            {t("chat.planApprovalTitle")}
          </div>
          <div className="text-xs text-muted-foreground">
            {t("chat.planApprovalHint")}
          </div>
        </div>

        {secondsLeft !== null && (
          <div
            className={cn(
              "text-xs shrink-0",
              secondsLeft <= 10 ? "text-destructive" : "text-muted-foreground",
            )}
          >
            {t("chat.askUserTimeout", { seconds: secondsLeft })}
          </div>
        )}
      </div>

      <div className="rounded-md border border-border/60 bg-muted/20 px-3 py-2">
        {plan ? (
          <div className="prose prose-sm dark:prose-invert max-w-none break-words break-all [&_pre]:whitespace-pre-wrap [&_pre]:break-words [&_code]:break-words [&_p]:break-words [&_p]:break-all [&_*]:break-words [&_*]:break-all">
            <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>
              {plan}
            </ReactMarkdown>
          </div>
        ) : (
          <div className="text-xs text-muted-foreground">
            {t("chat.planApprovalEmpty")}
          </div>
        )}
      </div>

      <div className="flex items-center justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={isSubmitting}
          onClick={onReject}
        >
          {t("chat.planApprovalReject")}
        </Button>
        <Button type="button" disabled={isSubmitting} onClick={onApprove}>
          {t("chat.planApprovalApprove")}
        </Button>
      </div>
    </div>
  );
}
