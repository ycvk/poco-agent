"use client";

import {
  useLayoutEffect,
  useRef,
  useState,
  useCallback,
  useEffect,
} from "react";
import { useRouter } from "next/navigation";
import { gsap } from "gsap";
import {
  Plug,
  Server,
  Sparkles,
  AppWindow,
  Loader2,
  ChevronRight,
} from "lucide-react";
import { mcpService } from "@/features/mcp/services/mcp-service";
import { skillsService } from "@/features/skills/services/skills-service";
import type { McpServer, UserMcpInstall } from "@/features/mcp/types";
import { Skill, UserSkillInstall } from "@/features/skills/types";
import { useAppShell } from "@/components/shared/app-shell-context";
import { useT } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import { playMcpInstallSound } from "@/lib/utils/sound";

export interface CardNavProps {
  triggerText?: string;
  className?: string;
  forceExpanded?: boolean;
}

interface InstalledItem {
  id: number;
  name: string;
  enabled: boolean;
  installId: number;
}

/**
 * CardNav Component
 *
 * An expandable card that shows MCP, Skill, and App sections on hover
 */
export function CardNav({
  triggerText,
  className = "",
  forceExpanded = false,
}: CardNavProps) {
  const { t } = useT("translation");
  const router = useRouter();
  const { lng } = useAppShell();
  const resolvedTriggerText = triggerText ?? t("hero.tools");
  const [isExpanded, setIsExpanded] = useState(false);
  const navRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const cardsRef = useRef<(HTMLDivElement | null)[]>([]);
  const tlRef = useRef<gsap.core.Timeline | null>(null);
  const isHoveringRef = useRef(false);
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // API data state
  const [mcpServers, setMcpServers] = useState<McpServer[]>([]);
  const [mcpInstalls, setMcpInstalls] = useState<UserMcpInstall[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [skillInstalls, setSkillInstalls] = useState<UserSkillInstall[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasFetched, setHasFetched] = useState(false);

  // Fetch MCP and Skill data
  const fetchData = useCallback(async () => {
    if (hasFetched || isLoading) return;

    setIsLoading(true);
    try {
      const [mcpServersData, mcpInstallsData, skillsData, skillInstallsData] =
        await Promise.all([
          mcpService.listServers(),
          mcpService.listInstalls(),
          skillsService.listSkills(),
          skillsService.listInstalls(),
        ]);
      setMcpServers(mcpServersData);
      setMcpInstalls(mcpInstallsData);
      setSkills(skillsData);
      setSkillInstalls(skillInstallsData);
      setHasFetched(true);
    } catch (error) {
      console.error("[CardNav] Failed to fetch data:", error);
    } finally {
      setIsLoading(false);
    }
  }, [hasFetched, isLoading]);

  // Get all installed MCPs
  const installedMcps: InstalledItem[] = mcpInstalls.map((install) => {
    const server = mcpServers.find((s) => s.id === install.server_id);
    return {
      id: install.server_id,
      name:
        server?.name ||
        t("hero.toolsPanel.unknownMcp", { id: String(install.server_id) }),
      enabled: install.enabled,
      installId: install.id,
    };
  });

  // Get all installed Skills
  const installedSkills: InstalledItem[] = skillInstalls.map((install) => {
    const skill = skills.find((s) => s.id === install.skill_id);
    return {
      id: install.skill_id,
      name:
        skill?.name ||
        t("hero.toolsPanel.unknownSkill", { id: String(install.skill_id) }),
      enabled: install.enabled,
      installId: install.id,
    };
  });

  // Toggle MCP enabled state
  const toggleMcpEnabled = useCallback(
    async (installId: number, currentEnabled: boolean) => {
      try {
        await mcpService.updateInstall(installId, { enabled: !currentEnabled });
        setMcpInstalls((prev) =>
          prev.map((install) =>
            install.id === installId
              ? { ...install, enabled: !currentEnabled }
              : install,
          ),
        );
        if (!currentEnabled) {
          playMcpInstallSound();
        }
      } catch (error) {
        console.error("[CardNav] Failed to toggle MCP:", error);
      }
    },
    [],
  );

  // Toggle Skill enabled state
  const toggleSkillEnabled = useCallback(
    async (installId: number, currentEnabled: boolean) => {
      try {
        await skillsService.updateInstall(installId, {
          enabled: !currentEnabled,
        });
        setSkillInstalls((prev) =>
          prev.map((install) =>
            install.id === installId
              ? { ...install, enabled: !currentEnabled }
              : install,
          ),
        );
        if (!currentEnabled) {
          playMcpInstallSound();
        }
      } catch (error) {
        console.error("[CardNav] Failed to toggle Skill:", error);
      }
    },
    [],
  );

  const createTimeline = useCallback(() => {
    const navEl = navRef.current;
    const cards = cardsRef.current.filter(Boolean);
    if (!navEl) return null;

    gsap.set(navEl, { height: 48 });
    gsap.set(cards, { opacity: 0, scale: 0.95, y: 15 });

    const tl = gsap.timeline({
      paused: true,
      defaults: { ease: "power2.out" },
    });

    tl.to(navEl, { height: "auto", duration: 0.15 });
    tl.to(
      cards,
      { opacity: 1, scale: 1, y: 0, duration: 0.25, stagger: 0.08 },
      "-=0.25",
    );

    return tl;
  }, []);

  useLayoutEffect(() => {
    const tl = createTimeline();
    tlRef.current = tl;
    return () => {
      tl?.kill();
      tlRef.current = null;
    };
  }, [createTimeline]);

  const openMenu = useCallback(() => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }

    if (!isExpanded) {
      setIsExpanded(true);
      fetchData();

      requestAnimationFrame(() => {
        if (!tlRef.current) {
          tlRef.current = createTimeline();
        }
        tlRef.current?.play(0);
      });
    }
  }, [isExpanded, fetchData, createTimeline]);

  const closeMenu = useCallback(() => {
    const tl = tlRef.current;
    if (!tl || !isExpanded) return;

    tl.reverse();
    tl.eventCallback("onReverseComplete", () => {
      setIsExpanded(false);
    });
  }, [isExpanded]);

  // Handle forceExpanded prop
  useEffect(() => {
    if (forceExpanded) {
      openMenu();
    } else if (!isHoveringRef.current) {
      closeMenu();
    }
  }, [forceExpanded, openMenu, closeMenu]);

  const handleMouseEnter = useCallback(() => {
    isHoveringRef.current = true;
    openMenu();
  }, [openMenu]);

  const handleMouseLeave = useCallback(() => {
    isHoveringRef.current = false;
    closeTimeoutRef.current = setTimeout(() => {
      if (!isHoveringRef.current && !forceExpanded) {
        closeMenu();
      }
    }, 50);
  }, [closeMenu, forceExpanded]);

  const setCardRef = (index: number) => (el: HTMLDivElement | null) => {
    cardsRef.current[index] = el;
  };

  const handleLabelClick = useCallback(
    (e: React.MouseEvent, path: string) => {
      e.stopPropagation();
      router.push(`/${lng}/${path}?from=home`);
    },
    [router, lng],
  );

  const renderItemBadges = (
    items: InstalledItem[],
    emptyText: string,
    type: "mcp" | "skill",
  ) => {
    if (isLoading) {
      return (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Loader2 className="size-3 animate-spin" />
          <span>{t("common.syncing")}</span>
        </div>
      );
    }

    if (items.length === 0) {
      return (
        <span className="text-xs italic text-muted-foreground">
          {emptyText}
        </span>
      );
    }

    const toggleFn = type === "mcp" ? toggleMcpEnabled : toggleSkillEnabled;

    return (
      <div className="flex flex-col gap-1 max-h-[180px] overflow-y-auto -mr-1 pr-2 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-muted-foreground/10 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-muted-foreground/30 transition-colors">
        {items.map((item, index) => (
          <button
            key={item.id}
            style={{
              animationDelay: `${index * 30}ms`,
              animationFillMode: "both",
            }}
            className={cn(
              "group/item flex items-center gap-2.5 px-2.5 py-1.5 text-xs font-medium rounded-md transition-all duration-200 text-left w-full cursor-pointer select-none animate-in fade-in slide-in-from-left-1",
              "text-muted-foreground hover:text-foreground hover:bg-muted/60 active:bg-muted/80",
            )}
            onClick={(e) => {
              e.stopPropagation();
              toggleFn(item.installId, item.enabled);
            }}
            type="button"
          >
            <div
              className={cn(
                "w-2 h-2 rounded-full transition-all duration-300 flex-shrink-0",
                item.enabled
                  ? "bg-primary ring-2 ring-primary/20 scale-100"
                  : "bg-muted-foreground/30 scale-90 group-hover/item:bg-muted-foreground/50",
              )}
            />
            <span className="flex-1 truncate tracking-tight opacity-90 group-hover/item:opacity-100">
              {item.name}
            </span>
          </button>
        ))}
      </div>
    );
  };

  return (
    <div className={cn("w-full", className)}>
      <nav
        ref={navRef}
        className={cn(
          "relative overflow-hidden rounded-2xl border border-border/70 bg-card transition-colors duration-200",
          "before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-highlight/45 before:to-transparent",
          isExpanded ? "shadow-sm" : "hover:bg-muted/10",
        )}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {/* Entry Bar */}
        <div className="group flex cursor-pointer items-center gap-3 p-4">
          <Plug
            className={cn(
              "size-5 flex-shrink-0 text-muted-foreground transition-all duration-300",
              isExpanded && "text-foreground",
            )}
          />
          <span className="text-sm font-medium text-muted-foreground transition-colors duration-300">
            {resolvedTriggerText}
          </span>
        </div>

        {/* Modular Content */}
        <div ref={contentRef} className="overflow-hidden">
          <div className="grid grid-cols-3 gap-4 border-t border-border/50 p-4 max-[900px]:grid-cols-1">
            {/* MCP Card */}
            <div
              ref={setCardRef(0)}
              className="group relative flex min-h-[140px] flex-col rounded-xl border border-border/70 bg-background p-5 transition-all duration-300 hover:border-border hover:bg-muted/20 hover:shadow-sm"
            >
              <div className="flex items-center gap-2.5 mb-3">
                <div className="flex size-9 items-center justify-center rounded-md bg-muted text-muted-foreground transition-all duration-300">
                  <Server className="size-[1.125rem]" />
                </div>
                <button
                  className="flex items-center gap-1 bg-transparent border-none cursor-pointer transition-all duration-200 rounded px-2 py-1 -mx-2 -my-1 hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2"
                  onClick={(e) => handleLabelClick(e, "capabilities/mcp")}
                  type="button"
                >
                  <span className="text-base font-semibold tracking-[-0.01em] text-foreground">
                    MCP
                  </span>
                  <ChevronRight className="size-3.5 text-muted-foreground transition-transform duration-200 group-hover:translate-x-0.5" />
                </button>
              </div>
              {renderItemBadges(installedMcps, t("hero.toolsPanel.emptyMcp"), "mcp")}
            </div>

            {/* Skill Card */}
            <div
              ref={setCardRef(1)}
              className="group relative flex min-h-[140px] flex-col rounded-xl border border-border/70 bg-background p-5 transition-all duration-300 hover:border-border hover:bg-muted/20 hover:shadow-sm"
            >
              <div className="flex items-center gap-2.5 mb-3">
                <div className="flex size-9 items-center justify-center rounded-md bg-muted text-muted-foreground transition-all duration-300">
                  <Sparkles className="size-[1.125rem]" />
                </div>
                <button
                  className="flex items-center gap-1 bg-transparent border-none cursor-pointer transition-all duration-200 rounded px-2 py-1 -mx-2 -my-1 hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2"
                  onClick={(e) => handleLabelClick(e, "capabilities/skills")}
                  type="button"
                >
                  <span className="text-base font-semibold tracking-[-0.01em] text-foreground">
                    Skills
                  </span>
                  <ChevronRight className="size-3.5 text-muted-foreground transition-transform duration-200 group-hover:translate-x-0.5" />
                </button>
              </div>
              {renderItemBadges(installedSkills, t("hero.toolsPanel.emptySkills"), "skill")}
            </div>

            {/* App Card */}
            <div className="group relative flex min-h-[140px] flex-col rounded-xl border border-border/70 bg-background p-5 transition-all duration-300 hover:border-border hover:bg-muted/20 hover:shadow-sm">
              <div className="flex items-center gap-2.5 mb-3">
                <div className="flex size-9 items-center justify-center rounded-md bg-muted text-muted-foreground transition-all duration-300">
                  <AppWindow className="size-[1.125rem]" />
                </div>
                <span className="text-base font-semibold tracking-[-0.01em] text-foreground">
                  {t("hero.toolsPanel.apps")}
                </span>
              </div>
              <span className="text-xs italic text-muted-foreground">
                {t("hero.comingSoon")}
              </span>
            </div>
          </div>
        </div>
      </nav>
    </div>
  );
}

export default CardNav;
