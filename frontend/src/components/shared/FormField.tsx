import type { ReactNode } from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export function Field({
  id,
  label,
  required,
  error,
  /** "error" (défaut) pour un vrai échec de validation (format invalide,
   * recherche en échec) ; "info" pour une simple indication que l'étape
   * n'est pas encore complétée (champ requis pas encore rempli). */
  errorTone = "error",
  className,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  error?: string;
  errorTone?: "error" | "info";
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={className}>
      <Label htmlFor={id} className={cn("mb-1.5 flex items-center gap-1")}>
        {label}
        {required && <span className="text-destructive">*</span>}
      </Label>
      {children}
      {error && (
        <p className={cn("mt-1 text-xs", errorTone === "info" ? "text-info" : "text-destructive")}>{error}</p>
      )}
    </div>
  );
}
