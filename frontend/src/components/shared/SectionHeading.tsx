import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface SectionHeadingProps {
  title: string;
  description?: string;
  viewAllHref?: string;
  viewAllLabel?: string;
  className?: string;
}

export function SectionHeading({ title, description, viewAllHref, viewAllLabel = "Voir tout", className }: SectionHeadingProps) {
  return (
    <div className={cn("flex items-end justify-between gap-4", className)}>
      <div>
        <h2 className="font-display text-xl font-bold tracking-tight text-foreground sm:text-2xl">{title}</h2>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {viewAllHref && (
        <Link
          to={viewAllHref}
          className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-primary transition-colors hover:text-primary/80"
        >
          {viewAllLabel}
          <ArrowRight className="size-3.5" />
        </Link>
      )}
    </div>
  );
}
