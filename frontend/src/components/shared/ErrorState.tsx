import { AlertTriangle, RefreshCw, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ErrorStateProps {
  title?: string;
  description?: string;
  onRetry?: () => void;
  /**
   * `destructive` (défaut) : quelque chose a mal tourné côté serveur, le rouge
   * est mérité. `neutral` : la donnée manque sans que rien ne soit cassé —
   * typiquement une coupure réseau, où l'utilisateur n'a rien à se reprocher
   * et où un cadre rouge alarme pour rien.
   */
  variant?: "destructive" | "neutral";
}

export function ErrorState({
  title = "Une erreur est survenue",
  description = "Impossible de charger ces données pour le moment. Veuillez réessayer.",
  onRetry,
  variant = "destructive",
}: ErrorStateProps) {
  const neutre = variant === "neutral";
  const Icon = neutre ? WifiOff : AlertTriangle;

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-xl border px-6 py-16 text-center",
        neutre ? "border-border bg-muted/40" : "border-destructive/20 bg-destructive/5",
      )}
    >
      <div
        className={cn(
          "flex size-14 items-center justify-center rounded-full",
          neutre ? "bg-muted text-muted-foreground" : "bg-destructive/10 text-destructive",
        )}
      >
        <Icon className="size-6" />
      </div>
      <div className="space-y-1">
        <h3 className="font-display text-base font-semibold text-foreground">{title}</h3>
        <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
      </div>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RefreshCw />
          Réessayer
        </Button>
      )}
    </div>
  );
}
