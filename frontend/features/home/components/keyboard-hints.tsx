"use client";

import * as React from "react";

import { useT } from "@/lib/i18n/client";

export function KeyboardHints() {
  const { t } = useT("translation");

  return (
    <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground/70">
      <kbd className="rounded-md border border-border bg-muted/30 px-1.5 py-0.5 font-mono text-[10px]">
        Enter
      </kbd>
      <span>{t("hints.send") + t("hints.separator")}</span>
      <kbd className="rounded-md border border-border bg-muted/30 px-1.5 py-0.5 font-mono text-[10px]">
        Shift + Enter
      </kbd>
      <span>{t("hints.newLine")}</span>
    </div>
  );
}
