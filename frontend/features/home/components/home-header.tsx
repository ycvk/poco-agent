"use client";

import * as React from "react";
import { ChevronDown, Coins } from "lucide-react";

import { useT } from "@/lib/i18n/client";
import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { CreditsPopover } from "./credits-popover";
import { UserMenu } from "@/features/user/components/user-menu";
import { RepoLinkButton } from "@/components/shared/repo-link-button";
import { ThemeToggle } from "@/components/shared/theme-toggle";

import { useUserAccount } from "@/features/user/hooks/use-user-account";

interface HomeHeaderProps {
  onOpenSettings?: () => void;
}

export function HomeHeader({ onOpenSettings }: HomeHeaderProps) {
  const { t } = useT("translation");
  const { credits, isLoading } = useUserAccount();

  return (
    <header className="flex h-12 items-center justify-between border-b border-border/70 bg-card px-4">
      <div className="flex items-center gap-2">
        <SidebarTrigger className="md:hidden" />
        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-1 rounded-full px-2 text-sm font-medium hover:bg-accent/50"
          title={t("header.switchWorkspace")}
        >
          {t("header.workspace")}
          <ChevronDown className="size-3.5 text-muted-foreground" />
        </Button>
      </div>
      <div className="flex items-center gap-1">
        <RepoLinkButton size="sm" />
        <ThemeToggle className="mx-1" />
        <CreditsPopover
          trigger={
            <Button
              variant="ghost"
              size="sm"
              className="mx-1 h-8 gap-1.5 rounded-full border border-border/70 bg-background px-3 text-sm font-medium text-foreground hover:bg-muted/20"
            >
              <Coins className="size-3.5" />
              <span>
                {isLoading ? "..." : credits?.total?.toLocaleString()}
              </span>
            </Button>
          }
        />
        <UserMenu
          onOpenSettings={() => {
            if (onOpenSettings) onOpenSettings();
          }}
        />
      </div>
    </header>
  );
}
