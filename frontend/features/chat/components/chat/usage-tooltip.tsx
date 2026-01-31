"use client";

import * as React from "react";

import { Coins } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Separator } from "@/components/ui/separator";
import type { UsageStats } from "@/types";
import { useT } from "@/lib/i18n/client";

interface UsageTooltipProps {
  stats: UsageStats;
}

export function UsageTooltip({ stats }: UsageTooltipProps) {
  const { t } = useT("translation");
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return t("usage.duration", { minutes: mins, seconds: secs });
  };

  return (
    <Tooltip>
      <TooltipTrigger>
        <div className="flex items-center gap-2 cursor-help">
          <Coins className="size-4 text-primary" />
          <span className="font-medium">{stats.credits.toLocaleString()}</span>
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="w-72">
        <div className="space-y-3">
          <div className="font-medium text-sm">
            {t("userMenu.credits")}: {stats.credits.toLocaleString()}
          </div>
          <Separator />
          <div>
            <div className="text-sm font-medium mb-2">{t("usage.thisSession")}:</div>
            <div className="text-xs space-y-1 text-muted-foreground">
              <div className="flex justify-between">
                <span>{t("chat.tokens")}:</span>
                <span className="font-medium text-foreground">
                  {stats.tokensUsed.toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between">
                <span>{t("chat.duration")}:</span>
                <span className="font-medium text-foreground">
                  {formatDuration(stats.duration)}
                </span>
              </div>
            </div>
          </div>
          <Separator />
          <div>
            <div className="text-sm font-medium mb-2">{t("usage.usageStats")}:</div>
            <div className="text-xs space-y-1 text-muted-foreground">
              <div className="flex justify-between">
                <span>{t("usage.today")}:</span>
                <span className="font-medium text-foreground">
                  {stats.todayUsage.toLocaleString()} {t("usage.tokensUnit")}
                </span>
              </div>
              <div className="flex justify-between">
                <span>{t("usage.week")}:</span>
                <span className="font-medium text-foreground">
                  {stats.weekUsage.toLocaleString()} {t("usage.tokensUnit")}
                </span>
              </div>
              <div className="flex justify-between">
                <span>{t("usage.month")}:</span>
                <span className="font-medium text-foreground">
                  {stats.monthUsage.toLocaleString()} {t("usage.tokensUnit")}
                </span>
              </div>
            </div>
          </div>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
