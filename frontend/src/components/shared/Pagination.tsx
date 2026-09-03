import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PaginationProps {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
}

export function Pagination({ page, totalPages, onChange }: PaginationProps) {
  if (totalPages <= 1) return null;

  const pages = Array.from({ length: totalPages }, (_, i) => i + 1).filter(
    (p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1,
  );

  return (
    <div className="flex items-center justify-center gap-1.5">
      <Button variant="outline" size="icon-sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        <ChevronLeft />
      </Button>
      {pages.map((p, i) => (
        <div key={p} className="flex items-center gap-1.5">
          {i > 0 && p - pages[i - 1] > 1 && <span className="px-1 text-sm text-muted-foreground">…</span>}
          <Button
            variant={p === page ? "default" : "outline"}
            size="icon-sm"
            onClick={() => onChange(p)}
            className="text-xs"
          >
            {p}
          </Button>
        </div>
      ))}
      <Button variant="outline" size="icon-sm" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>
        <ChevronRight />
      </Button>
    </div>
  );
}
