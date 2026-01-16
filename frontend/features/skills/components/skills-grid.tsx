"use client";

import * as React from "react";
import { Layers, Terminal, Globe, Code2, PenTool } from "lucide-react";
import { FeatureCard } from "@/components/ui/feature-card";
import { useT } from "@/lib/i18n/client";
import { useSkills } from "@/features/skills/hooks/use-skills";
import { Skeleton } from "@/components/ui/skeleton";

const SKILL_ICONS: Record<string, React.ReactNode> = {
  "1": <Globe className="size-5" />,
  "2": <Terminal className="size-5" />,
  "3": <Layers className="size-5" />,
  "4": <PenTool className="size-5" />,
  "5": <Code2 className="size-5" />,
};

export function SkillsGrid() {
  const { t } = useT("translation");
  const { skills, isLoading } = useSkills();

  if (isLoading) {
    return (
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <Skeleton key={i} className="h-[200px] w-full rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
      {skills.map((skill) => (
        <FeatureCard
          key={skill.id}
          icon={SKILL_ICONS[skill.id] || <Terminal className="size-6" />}
          title={t(skill.nameKey)}
          description={t(skill.descKey)}
          badge={skill.source}
        />
      ))}
    </div>
  );
}
