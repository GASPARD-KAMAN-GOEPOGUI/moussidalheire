import { ImagePlus, Pencil } from "lucide-react";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { cn } from "@/lib/utils";

const MAX_SIZE_MB = 5;

/**
 * Wide click-to-upload cover photo picker — deliberately does NOT upload on
 * selection. It only holds the chosen `File` (with an instant local preview
 * via `URL.createObjectURL`) and hands it to the caller through `onChange`;
 * the real `POST /uploads/photo` upload only happens once the caller's form
 * is actually submitted (see `AddNewsDialog::handleSubmit`) — cancelling the
 * form after picking a photo must never leave an orphaned file on the server.
 *
 * `existingUrl` is shown when editing an actualité that already has a saved
 * cover image and no new file has been picked yet — it's a real, already-
 * uploaded URL, so it's displayed directly (no blob preview needed); picking
 * a new file overrides it in the UI, but the caller decides in its own
 * submit handler whether to keep `existingUrl` or upload the new `value`.
 */
export function CoverImageField({
  value,
  onChange,
  existingUrl,
}: {
  value: File | null;
  onChange: (file: File) => void;
  existingUrl?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");

  useEffect(() => {
    if (!value) {
      setPreviewUrl("");
      return;
    }
    const url = URL.createObjectURL(value);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [value]);

  const displaySrc = previewUrl || existingUrl || "";

  function handleFile(e: ChangeEvent<HTMLInputElement>) {
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
    onChange(file);
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className={cn(
          "group relative flex aspect-[21/9] w-full items-center justify-center overflow-hidden rounded-lg border-2 border-dashed border-border bg-muted/50 transition-colors hover:border-primary/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          displaySrc && "border-solid",
        )}
        aria-label={displaySrc ? "Modifier la photo de couverture" : "Ajouter une photo de couverture"}
      >
        {displaySrc ? (
          <>
            <img src={displaySrc} alt="Aperçu de la photo de couverture" className="size-full object-cover" />
            <span className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-opacity group-hover:bg-black/40 group-hover:opacity-100">
              <span className="flex items-center gap-1.5 rounded-full bg-background/90 px-3 py-1.5 text-xs font-medium text-foreground">
                <Pencil className="size-3.5" />
                Modifier
              </span>
            </span>
          </>
        ) : (
          <div className="flex flex-col items-center gap-1.5 text-muted-foreground">
            <ImagePlus className="size-6" />
            <span className="text-xs font-medium">Ajouter une photo de couverture</span>
            <span className="text-[11px]">JPG, PNG ou WebP, 5 Mo max. Envoyée à la publication.</span>
          </div>
        )}
      </button>
      {error && <p className="mt-1.5 text-xs text-destructive">{error}</p>}
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handleFile}
      />
    </div>
  );
}
