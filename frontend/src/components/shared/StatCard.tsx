import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatCardProps {
  icon: LucideIcon;
  label: string;
  value: string | number;
  hint?: string;
  accent?: "primary" | "accent" | "success" | "muted";
  className?: string;
}

const accentStyles: Record<NonNullable<StatCardProps["accent"]>, string> = {
  primary: "bg-primary/10 text-primary",
  accent: "bg-accent/10 text-accent",
  success: "bg-success/10 text-success",
  muted: "bg-muted text-muted-foreground",
};

export function StatCard({ icon: Icon, label, value, hint, accent = "primary", className }: StatCardProps) {
  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-xl border border-border bg-card p-5 shadow-sm transition-shadow hover:shadow-md",
        className,
      )}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="mt-1.5 font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            {value}
          </p>
          {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
        </div>
        <div className={cn("flex size-11 shrink-0 items-center justify-center rounded-lg", accentStyles[accent])}>
          <Icon className="size-5" />
        </div>
      </div>
    </div>
  );
}
