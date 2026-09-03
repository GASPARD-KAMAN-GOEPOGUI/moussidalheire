import { Badge } from "@/components/ui/badge";
import type { NewsCategoryRef } from "@/types";

const VARIANTS = ["default", "accent", "success", "destructive", "secondary"] as const;

/** Categories are dynamic (admin-creatable) — no color comes from the
 * backend, so the badge variant is derived deterministically from the
 * category's slug (same category always renders the same color, without
 * needing a `couleur` column). */
function variantFor(slug: string): (typeof VARIANTS)[number] {
  let hash = 0;
  for (let i = 0; i < slug.length; i++) hash = (hash * 31 + slug.charCodeAt(i)) >>> 0;
  return VARIANTS[hash % VARIANTS.length]!;
}

export function NewsCategoryBadge({ category }: { category: NewsCategoryRef }) {
  return <Badge variant={variantFor(category.slug)}>{category.nom}</Badge>;
}
