import { Camera, Loader2, Pencil, User } from "lucide-react";
import { useRef, useState, type ChangeEvent } from "react";
import { ApiError, uploadPhotoReel } from "@/lib/api-client";
import { cn, initials } from "@/lib/utils";

const MAX_SIZE_MB = 5;

/**
 * Circular, click-to-upload profile photo picker — sits above a registration
 * form's fields. `value` is a real backend URL (`POST /uploads/photo`, see
 * `uploadPhotoReel`), never a base64 data URL: the `photo` column is capped
 * at 500 caractères (personne.validator.ts) — a data URL for any real photo
 * blows past that and would be rejected. An instant local preview
 * (`URL.createObjectURL`) covers the upload's brief round-trip; `onChange`
 * only fires once the real URL comes back. When `prenom`/`nom` are given and
 * no photo is set, the preview falls back to that person's initials instead
 * of the generic silhouette icon (used when creating père/mère/fratrie/
 * conjoint/enfant on the fly — see NouvellePersonneFields). Callers that
 * don't pass them keep the original generic-icon fallback, unchanged.
 */
export function ProfilePhotoField({
  value,
  onChange,
  prenom,
  nom,
}: {
  value: string;
  onChange: (url: string) => void;
  prenom?: string;
  nom?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState("");
  const [uploading, setUploading] = useState(false);

  async function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Veuillez choisir un fichier image.");
      return;
    }
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      setError(`L'image ne doit pas dépasser ${MAX_SIZE_MB} Mo.`);
      return;
    }
    setError("");
    setPreview(URL.createObjectURL(file));
    setUploading(true);
    try {
      const url = await uploadPhotoReel(file);
      onChange(url);
      setPreview("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Le téléversement a échoué. Réessayez.");
      setPreview("");
    } finally {
      setUploading(false);
    }
  }

  const displaySrc = preview || value;

  return (
    <div className="flex flex-col items-center gap-2 pb-2">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="group relative size-28 shrink-0 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-wait"
        aria-label={displaySrc ? "Modifier la photo de profil" : "Ajouter une photo de profil"}
      >
        <div
          className={cn(
            "flex size-full items-center justify-center overflow-hidden rounded-full border-2 border-dashed border-border bg-muted/50 transition-colors group-hover:border-primary/50",
            displaySrc && "border-solid",
          )}
        >
          {displaySrc ? (
            <img src={displaySrc} alt="Aperçu de la photo de profil" className="size-full object-cover" />
          ) : prenom || nom ? (
            <span className="text-2xl font-semibold text-muted-foreground">{initials(prenom, nom)}</span>
          ) : (
            <User className="size-9 text-muted-foreground" />
          )}
        </div>
        <span className="absolute bottom-0 right-0 flex size-9 items-center justify-center rounded-full border-2 border-card bg-primary text-primary-foreground shadow-sm transition-transform group-hover:scale-105">
          {uploading ? <Loader2 className="size-4 animate-spin" /> : displaySrc ? <Pencil className="size-4" /> : <Camera className="size-4" />}
        </span>
      </button>

      <div className="text-center">
        <p className="text-xs font-medium text-foreground">
          {uploading ? "Téléversement…" : displaySrc ? "Modifier la photo" : "Ajouter une photo"}
        </p>
        <p className="text-[11px] text-muted-foreground">Facultatif · JPG, PNG ou WebP, 5 Mo max.</p>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}

      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleFile} disabled={uploading} />
    </div>
  );
}
