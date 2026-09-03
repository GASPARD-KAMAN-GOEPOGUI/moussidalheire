import { MapPin, Home } from "lucide-react";
import type { ResidencePeriod } from "@/types";
import { formatYearRange } from "@/lib/utils";
import { cn } from "@/lib/utils";

export function ResidenceTimeline({ history }: { history: ResidencePeriod[] }) {
  if (history.length === 0) return null;

  return (
    <ol className="relative space-y-6 border-l border-dashed border-border pl-6">
      {history.map((period) => (
        <li key={period.id} className="relative">
          <span
            className={cn(
              "absolute -left-[1.72rem] flex size-6 items-center justify-center rounded-full border-2 border-background text-white",
              period.current ? "bg-primary" : "bg-muted-foreground/60",
            )}
          >
            {period.location.isVillage ? <Home className="size-3" /> : <MapPin className="size-3" />}
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-display font-semibold text-foreground">
              {period.location.city}
              {period.location.district && (
                <span className="font-normal text-muted-foreground"> · {period.location.district}</span>
              )}
            </p>
            {period.current && (
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                Résidence actuelle
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            {period.location.region ? `${period.location.region}, ` : ""}
            {period.location.country}
          </p>
          <p className="mt-0.5 text-xs font-medium text-muted-foreground">
            {formatYearRange(period.startYear, period.endYear, period.current)}
          </p>
        </li>
      ))}
    </ol>
  );
}
