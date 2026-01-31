"use client";

import * as React from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/client";

export function ThemeToggle({ className }: { className?: string }) {
  const { t } = useT("translation");
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => setMounted(true), []);

  const activeTheme = mounted ? resolvedTheme : undefined;
  const isDark = activeTheme === "dark";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => setTheme(isDark ? "light" : "dark")}
          className={cn("size-8 text-muted-foreground hover:bg-accent", className)}
          aria-label={t("common.toggleTheme")}
          title={t("common.toggleTheme")}
        >
          {isDark ? (
            <Sun className="size-4" />
          ) : (
            <Moon className="size-4" />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={8}>
        {t("common.toggleTheme")}
      </TooltipContent>
    </Tooltip>
  );
}

