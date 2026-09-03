import { useState } from "react";
import { Check, Copy, KeyRound, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { CompteAffiche } from "@/components/auth/inscription-types";

function ReadOnlyField({ id, label, value }: { id: string; label: string; value: string }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} value={value} readOnly className="font-mono" />
    </div>
  );
}

function texteCompte(c: CompteAffiche): string {
  const lignes = [
    `Compte de : ${c.nomComplet}`,
    ...(c.matricule ? [`Matricule : ${c.matricule}`] : []),
    `Identifiant : ${c.identifiant}`,
    `Mot de passe temporaire : ${c.motDePasseTemporaire}`,
  ];
  return lignes.join("\n");
}

function texteTous(comptes: CompteAffiche[]): string {
  return comptes.map((c) => `${c.role}\n${texteCompte(c)}`).join("\n\n");
}

async function copier(texte: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texte);
    return true;
  } catch {
    return false;
  }
}

function peutPartagerNavigateur(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.share === "function";
}

function partager(texte: string, titre: string) {
  if (!peutPartagerNavigateur()) return;
  navigator.share({ title: titre, text: texte }).catch(() => {
    /* annulé par la personne, ou API indisponible dans ce contexte — rien à signaler */
  });
}

/**
 * Affiche, une fois après une inscription réussie, tous les comptes
 * réellement créés — la personne principale, et chaque personne créée "à la
 * volée" pendant le formulaire (père, mère, fratrie, conjoint·e·s, enfants).
 * `comptes` ne doit jamais contenir qu'une valeur fabriquée côté client :
 * une personne déjà existante, simplement rattachée à l'inscription, ne
 * reçoit jamais de nouveau compte et n'a donc rien à faire dans cette liste
 * (voir NewMemberDialog::comptesCrees, qui construit cette liste uniquement
 * à partir des `compte` renvoyés par le backend).
 *
 * `onContinue` est requis (pas un simple handler de fermeture) car fermer ce
 * dialogue est ce qui permet à l'appelant de continuer — ex. NewMemberDialog
 * connecte la personne principale immédiatement après.
 */
export function CredentialsDialog({
  open,
  comptes,
  onContinue,
}: {
  open: boolean;
  comptes: CompteAffiche[];
  onContinue: () => void;
}) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  async function handleCopy(key: string, texte: string) {
    if (!(await copier(texte))) return;
    setCopiedKey(key);
    setTimeout(() => setCopiedKey((k) => (k === key ? null : k)), 1500);
  }

  const peutPartager = peutPartagerNavigateur();
  const plusieurs = comptes.length > 1;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onContinue()}>
      <DialogContent hideClose className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="size-5 text-primary" />
            {plusieurs ? `${comptes.length} comptes créés` : "Identifiants de connexion"}
          </DialogTitle>
          <DialogDescription>
            Ces identifiants viennent d'être générés communiquez-les aux personnes concernées. Les mots de passe ne
            seront plus jamais affichés après cet écran.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {comptes.map((c, i) => {
            const key = `${c.identifiant}-${i}`;
            const texte = texteCompte(c);
            return (
              <div key={key} className="space-y-3 rounded-lg border border-border p-3">
                <p className="text-sm font-semibold text-foreground">
                  {c.role} <span className="font-normal text-muted-foreground">· {c.nomComplet}</span>
                </p>
                {c.matricule && (
                  <ReadOnlyField id={`cred-matricule-${key}`} label="Matricule" value={c.matricule} />
                )}
                <ReadOnlyField
                  id={`cred-identifiant-${key}`}
                  label="Identifiant (e-mail ou matricule)"
                  value={c.identifiant}
                />
                <ReadOnlyField
                  id={`cred-password-${key}`}
                  label="Mot de passe temporaire"
                  value={c.motDePasseTemporaire}
                />
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => handleCopy(key, texte)}
                  >
                    {copiedKey === key ? <Check className="text-success" /> : <Copy />}
                    {copiedKey === key ? "Copié" : "Copier"}
                  </Button>
                  {peutPartager && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => partager(texte, `Compte de ${c.nomComplet}`)}
                    >
                      <Share2 />
                      Partager
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {plusieurs && (
          <>
            <Separator />
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => handleCopy("__tout__", texteTous(comptes))}
              >
                {copiedKey === "__tout__" ? <Check className="text-success" /> : <Copy />}
                {copiedKey === "__tout__" ? "Copié" : "Tout copier"}
              </Button>
              {peutPartager && (
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={() => partager(texteTous(comptes), "Comptes créés")}
                >
                  <Share2 />
                  Tout partager
                </Button>
              )}
            </div>
          </>
        )}

        <Button type="button" className="w-full" onClick={onContinue}>
          Continuer
        </Button>
      </DialogContent>
    </Dialog>
  );
}
