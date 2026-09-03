import { Tag } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Field } from "@/components/shared/FormField";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { creerCategorieActualiteReelle } from "@/services/api/categories-actualites";
import { ApiError } from "@/lib/api-client";
import { messageChampsInvalides } from "@/lib/api-error-fields";
import type { NewsCategoryRef } from "@/types";

function slugify(nom: string): string {
  return nom
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Admin-only dialog (see the "+" button next to the category filter chips
 * in `News.tsx`) — creates a new `CategorieActualite` row on the real
 * backend, immediately usable as a filter and in "Publier une actualité". */
export function AddNewsCategoryDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (category: NewsCategoryRef) => void;
}) {
  const [nom, setNom] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  function handleNomChange(value: string) {
    setNom(value);
    setSlug(slugify(value));
  }

  function reset() {
    setNom("");
    setSlug("");
    setDescription("");
    setError("");
  }

  function handleOpenChange(next: boolean) {
    onOpenChange(next);
    if (!next) reset();
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!nom.trim() || !slug.trim()) {
      setError("Le nom et le slug sont requis.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const category = await creerCategorieActualiteReelle({
        nom: nom.trim(),
        slug: slug.trim(),
        ...(description.trim() ? { description: description.trim() } : {}),
      });
      onCreated?.(category);
      handleOpenChange(false);
    } catch (err) {
      setError(messageChampsInvalides(err) ?? (err instanceof ApiError ? err.message : "Impossible de créer la catégorie."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Créer un type d'actualité</DialogTitle>
          <DialogDescription>
            Ajoute une nouvelle catégorie, disponible immédiatement pour filtrer et publier.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <Field id="category-nom" label="Nom" required>
            <Input id="category-nom" value={nom} onChange={(e) => handleNomChange(e.target.value)} />
          </Field>
          <Field id="category-slug" label="Identifiant technique (slug)" required>
            <Input
              id="category-slug"
              value={slug}
              disabled
              placeholder="ex. anniversaire"
              className="bg-muted/60"
            />
            <p className="mt-1 text-xs text-muted-foreground">Généré automatiquement à partir du nom.</p>
          </Field>
          <Field id="category-description" label="Description (optionnel)">
            <Input
              id="category-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </Field>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={saving}>
              <Tag />
              {saving ? "Création…" : "Créer la catégorie"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
