"use client";

import * as React from "react";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export interface FeatureCardProps {
  id?: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  badge?: string;
  comingSoon?: boolean;
  className?: string;
}

export function FeatureCard({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  badge,
  comingSoon,
  className,
}: FeatureCardProps) {
  return (
    <div
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-2xl bg-card border border-border/50",
        "transition-all duration-300 hover:shadow-lg hover:-translate-y-1 hover:border-foreground/10",
        comingSoon && "opacity-80",
        className,
      )}
    >
      <div className="p-6 flex flex-col h-full">
        <div className="flex items-start justify-between mb-6">
          {/* Icon */}
          <div
            className={cn(
              "flex size-14 shrink-0 items-center justify-center",
              "rounded-2xl border border-border/50",
              "bg-muted/50",
              "text-foreground shadow-sm",
              "group-hover:scale-105 group-hover:shadow-sm",
              "transition-all duration-300",
            )}
          >
            {icon}
          </div>

          {/* Badge */}
          {badge && (
            <div
              className={cn(
                "px-3 py-1 text-xs font-medium tracking-wide",
                "rounded-full border border-border/50",
                "bg-muted/50 text-muted-foreground",
              )}
            >
              {badge}
            </div>
          )}
        </div>

        {/* Title & Description */}
        <div className="space-y-2 mb-6">
          <h3 className="text-xl font-bold tracking-tight text-foreground transition-colors duration-200">
            {title}
          </h3>
          <p className="text-muted-foreground leading-relaxed">{description}</p>
        </div>

        {/* Action */}
        <div className="mt-auto space-y-4">
          {(actionLabel || onAction) && (
            <Button
              variant={comingSoon ? "ghost" : "outline"}
              size="lg"
              className={cn(
                "w-full justify-between mt-6",
                comingSoon &&
                  "cursor-not-allowed hover:bg-transparent text-muted-foreground border-dashed border",
                !comingSoon && "hover:bg-muted hover:text-foreground",
              )}
              onClick={onAction}
              disabled={comingSoon}
            >
              <span className="font-semibold">{actionLabel}</span>
              {!comingSoon && (
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
