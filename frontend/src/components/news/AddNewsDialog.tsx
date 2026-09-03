import { Check, Newspaper } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Field } from "@/components/shared/FormField";
import { CoverImageField } from "@/components/families/CoverImageField";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createNews, updateNews } from "@/services/api/news";
import { listNewsCategories } from "@/services/api/categories-actualites";
import { listFamilies, type FamilySummary } from "@/services/api/families";
import { ApiError, uploadPhotoReel } from "@/lib/api-client";
import { messageChampsInvalides } from "@/lib/api-error-fields";
import { useAuthStore } from "@/store/useAuthStore";
import type { NewsCategoryRef, NewsItem } from "@/types";

const NONE = "__none__";

function formFromNews(editing: NewsItem | null | undefined) {
  return {
    title: editing?.title ?? "",
    categoryId: editing?.category.id ?? "",
    coverImagePhoto: null as File | null,
    coverImageExistingUrl: editing?.coverImageUrl ?? "",
    excerpt: editing?.excerpt ?? "",
    content: editing?.content ?? "",
    relatedFamilyId: editing?.relatedFamilyId ?? "",
    featured: editing?.featured ?? false,
  };
}

/** Publishes a new article to the village's news feed, or edits an existing
 * one when `editing` is given (any connected member can do either — the
 * backend's `PUT` requires the same `requireAuth` as `POST`, no ownership
 * restriction exists). */
export function AddNewsDialog({
  open,
  onOpenChange,
  onCreated,
  editing,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: () => void;
  editing?: NewsItem | null;
}) {
  const navigate = useNavigate();
  // Jamais saisi manuellement : l'auteur d'une actualité est toujours celui
  // ou celle qui la publie (ou, en édition, reste l'auteur d'origine — voir
  // handleSubmit — un·e admin qui corrige l'actualité de quelqu'un d'autre
  // n'en devient pas l'auteur pour autant).
  const authorDefault = useAuthStore((s) => s.user?.name) ?? "";
  const [form, setForm] = useState(() => formFromNews(editing));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState<NewsItem | null>(null);
  const [categories, setCategories] = useState<NewsCategoryRef[]>([]);
  const [families, setFamilies] = useState<FamilySummary[]>([]);

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setCreated(null);
    // Categories/families must land in state BEFORE the form's `categoryId`/
    // `relatedFamilyId` are set to an edited item's existing value — Radix
    // Select can fail to resolve a value's displayed label if it's set
    // before the matching `SelectItem` has ever existed in the tree (e.g.
    // the very first render, when both lists are still empty).
    Promise.all([
      listNewsCategories().catch(() => []),
      listFamilies().catch(() => []),
    ]).then(([cats, fams]) => {
      setCategories(cats);
      setFamilies(fams);
      setForm(formFromNews(editing));
    });
  }, [open, editing]);

  const set = <K extends keyof ReturnType<typeof formFromNews>>(
    key: K,
    value: ReturnType<typeof formFromNews>[K],
  ) => setForm((f) => ({ ...f, [key]: value }));

  function validate(): boolean {
    const next: Record<string, string> = {};
    if (!form.title.trim()) next.title = "Le titre est requis.";
    if (!form.categoryId) next.categoryId = "La catégorie est requise.";
    if (!form.excerpt.trim()) next.excerpt = "Le résumé est requis.";
    if (!form.content.trim()) next.content = "Le contenu de l'article est requis.";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setSaving(true);
    try {
      // Uploaded only now, right before actually saving — picking a photo
      // then cancelling the dialog must never leave an orphaned file on the
      // server (see CoverImageField's doc comment). If editing and no new
      // photo was picked, the already-saved URL is kept as-is (no re-upload).
      let coverImageUrl = form.coverImageExistingUrl || undefined;
      if (form.coverImagePhoto) {
        try {
          coverImageUrl = await uploadPhotoReel(form.coverImagePhoto);
        } catch (err) {
          setErrors((prev) => ({
            ...prev,
            coverImage: err instanceof ApiError ? err.message : "Le téléversement de l'image a échoué.",
          }));
          return;
        }
      }
      const input = {
        title: form.title.trim(),
        categoryId: form.categoryId,
        coverImageUrl,
        excerpt: form.excerpt.trim(),
        content: form.content.trim(),
        authorName: editing?.authorName ?? authorDefault,
        relatedFamilyId: form.relatedFamilyId || undefined,
        featured: form.featured,
      };
      if (editing) {
        // Editing happens from the article's own detail page — showing a
        // "voir l'actualité" confirmation screen makes no sense there (the
        // user is already looking at it). Close immediately and let the
        // caller refresh instead.
        await updateNews(editing.id, input);
        onCreated?.();
        onOpenChange(false);
      } else {
        const news = await createNews(input);
        setCreated(news);
        onCreated?.();
      }
    } catch (err) {
      // Never fail silently — without this, an unexpected error left the
      // dialog looking like nothing happened (button just reverts).
      setErrors((prev) => ({
        ...prev,
        form: messageChampsInvalides(err) ?? (err instanceof ApiError ? err.message : "Une erreur est survenue. Réessayez."),
      }));
    } finally {
      setSaving(false);
    }
  }

  function handleOpenChange(next: boolean) {
    onOpenChange(next);
  }

  function viewArticle() {
    if (!created) return;
    handleOpenChange(false);
    navigate(`/actualites/${created.id}`);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl">
        {!created ? (
          <>
            <DialogHeader>
              <DialogTitle>{editing ? "Modifier l'actualité" : "Publier une actualité"}</DialogTitle>
              <DialogDescription>
                {editing
                  ? "Les changements sont visibles immédiatement pour tout le village."
                  : "Partagez une annonce, un événement ou une nouvelle avec le village."}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} noValidate className="space-y-5">
              <div>
                <CoverImageField
                  value={form.coverImagePhoto}
                  existingUrl={form.coverImageExistingUrl}
                  onChange={(file) => {
                    set("coverImagePhoto", file);
                    setErrors((prev) => {
                      const { coverImage: _coverImage, ...rest } = prev;
                      return rest;
                    });
                  }}
                />
                {errors.coverImage && <p className="mt-1.5 text-xs text-destructive">{errors.coverImage}</p>}
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field id="news-title" label="Titre" required error={errors.title} className="sm:col-span-2">
                  <Input id="news-title" value={form.title} onChange={(e) => set("title", e.target.value)} />
                </Field>

                <Field
                  id="news-category"
                  label="Catégorie"
                  required
                  error={errors.categoryId}
                  className="sm:col-span-2"
                >
                  <Select value={form.categoryId} onValueChange={(v) => set("categoryId", v)}>
                    <SelectTrigger id="news-category">
                      <SelectValue placeholder="Choisir une catégorie" />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.nom}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>

                <Field id="news-excerpt" label="Résumé" required error={errors.excerpt} className="sm:col-span-2">
                  <textarea
                    id="news-excerpt"
                    value={form.excerpt}
                    onChange={(e) => set("excerpt", e.target.value)}
                    rows={2}
                    placeholder="Une ou deux phrases affichées sur la carte de l'actualité."
                    className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </Field>
                <Field id="news-content" label="Contenu" required error={errors.content} className="sm:col-span-2">
                  <textarea
                    id="news-content"
                    value={form.content}
                    onChange={(e) => set("content", e.target.value)}
                    rows={6}
                    placeholder="Le corps complet de l'article."
                    className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </Field>

                <Field id="news-family" label="Famille concernée (optionnel)" className="sm:col-span-2">
                  <Select
                    value={form.relatedFamilyId || NONE}
                    onValueChange={(v) => set("relatedFamilyId", v === NONE ? "" : v)}
                  >
                    <SelectTrigger id="news-family">
                      <SelectValue placeholder="Non renseignée" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>Non renseignée</SelectItem>
                      {families.map((f) => (
                        <SelectItem key={f.id} value={f.id}>
                          {f.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>

                <div className="flex items-center gap-2 sm:col-span-2">
                  <Checkbox
                    id="news-featured"
                    checked={form.featured}
                    onCheckedChange={(c) => set("featured", c === true)}
                  />
                  <Label htmlFor="news-featured" className="font-normal">
                    Mettre en avant à la une
                  </Label>
                </div>
              </div>

              {errors.form && (
                <p role="alert" className="text-sm text-destructive">
                  {errors.form}
                </p>
              )}
              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
                  Annuler
                </Button>
                <Button type="submit" disabled={saving}>
                  <Newspaper />
                  {saving
                    ? editing
                      ? "Enregistrement…"
                      : "Publication…"
                    : editing
                      ? "Enregistrer les modifications"
                      : "Publier l'actualité"}
                </Button>
              </div>
            </form>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Check className="size-5 text-success" />
                Actualité publiée
              </DialogTitle>
              <DialogDescription>
                « {created.title} » est maintenant visible dans les actualités du village.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
                Fermer
              </Button>
              <Button type="button" onClick={viewArticle}>
                Voir l'actualité
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
