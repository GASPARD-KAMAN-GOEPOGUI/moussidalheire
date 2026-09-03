import { Globe, Lock, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { Visibility } from "@/types";
import { cn } from "@/lib/utils";

const CONFIG: Record<Visibility, { label: string; icon: typeof Globe; variant: "success" | "accent" | "muted" }> = {
  public: { label: "Public", icon: Globe, variant: "success" },
  members: { label: "Membres", icon: Users, variant: "accent" },
  private: { label: "Privé", icon: Lock, variant: "muted" },
};

export function ConfidentialityBadge({ visibility, className }: { visibility: Visibility; className?: string }) {
  const { label, icon: Icon, variant } = CONFIG[visibility];
  return (
    <Badge variant={variant} className={cn("gap-1", className)}>
      <Icon className="size-3" />
      {label}
    </Badge>
  );
}
