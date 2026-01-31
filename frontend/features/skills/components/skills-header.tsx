"use client";

import { ArrowLeft, Search } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";

import { useT } from "@/lib/i18n/client";
import { Button } from "@/components/ui/button";
import { useAppShell } from "@/components/shared/app-shell-context";
import { HeaderSearchInput } from "@/components/shared/header-search-input";

interface SkillsHeaderProps {
  onImport?: () => void;
  searchQuery: string;
  onSearchChange: (value: string) => void;
}

export function SkillsHeader({
  onImport,
  searchQuery,
  onSearchChange,
}: SkillsHeaderProps) {
  const { t } = useT("translation");
  const router = useRouter();
  const searchParams = useSearchParams();
  const { lng } = useAppShell();

  const fromHome = searchParams.get("from") === "home";
  const backPath = fromHome ? `/${lng}/home` : `/${lng}/capabilities`;

  return (
    <header className="sticky top-0 z-10 flex h-16 shrink-0 items-center justify-between border-b border-border bg-card px-6">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.push(backPath)}
          className="mr-2"
        >
          <ArrowLeft className="size-5" />
        </Button>
        <span className="text-lg font-bold tracking-tight">
          {t("library.skillsPage.header.title", "Skills 管理")}
        </span>
      </div>

      {/* Right: Action Buttons */}
      <div className="flex items-center gap-2">
        <HeaderSearchInput
          value={searchQuery}
          onChange={onSearchChange}
          placeholder={t("library.skillsPage.searchPlaceholder", "搜索技能...")}
        />
        <Button variant="ghost" size="sm" className="gap-2" onClick={onImport}>
          <Search className="size-4" />
          {t("library.skillsImport.title", "导入技能")}
        </Button>
      </div>
    </header>
  );
}
