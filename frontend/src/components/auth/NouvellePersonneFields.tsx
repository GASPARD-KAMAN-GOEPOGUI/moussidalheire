import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Field } from "@/components/shared/FormField";
import { PhoneInput } from "@/components/shared/PhoneInput";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ProfilePhotoField } from "./ProfilePhotoField";
import { GeographicSituationFields } from "@/components/people/GeographicSituationFields";
import { MARITAL_STATUS_LABELS } from "@/data/mock/pools";
import { versMajusculesSansAccent } from "@/lib/utils";
import type { NouvellePersonneForm, Sexe, StatutMatrimonial } from "./inscription-types";

/**
 * The field set for a person created on the fly during self-registration
 * (père, mère, fratrie, conjoint, enfant) — this component talks only to its
 * `value`/`onChange` props: no submission logic of its own, no network call.
 * `lockedSexe` disables the sexe selector
 * when the caller already knows it (père must be homme, mère must be femme).
 * `nomHerite`, when given, disables the nom field and forces it to that
 * value — used for the fratrie once the père's nom is known (see
 * NewMemberDialog: everyone in a same famille d'origine shares the père's
 * nom de famille, la mère exceptée).
 */
export function NouvellePersonneFields({
  idPrefix,
  value,
  onChange,
  lockedSexe,
  nomHerite,
  masquerStatutMatrimonial,
  statutMatrimonialOptions,
}: {
  idPrefix: string;
  value: NouvellePersonneForm;
  onChange: (value: NouvellePersonneForm) => void;
  lockedSexe?: Sexe;
  nomHerite?: string;
  /** Hides "Situation matrimoniale" entièrement — utilisé côté mère quand elle
   * forme un couple avec un père déjà renseigné juste à côté : sa situation
   * matrimoniale suit celle du père, jamais ressaisie séparément. */
  masquerStatutMatrimonial?: boolean;
  /** Restreint les choix proposés (ex. exclure "Célibataire" quand on crée un
   * couple : par construction, deux personnes qu'on rattache l'une à l'autre
   * ne peuvent pas être célibataires). Par défaut, tous les statuts. */
  statutMatrimonialOptions?: StatutMatrimonial[];
}) {
  const set = <K extends keyof NouvellePersonneForm>(key: K, v: NouvellePersonneForm[K]) =>
    onChange({ ...value, [key]: v });

  const optionsStatut = statutMatrimonialOptions ?? (Object.keys(MARITAL_STATUS_LABELS) as StatutMatrimonial[]);

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <ProfilePhotoField
          value={value.photo}
          onChange={(dataUrl) => set("photo", dataUrl)}
          prenom={value.prenom}
          nom={nomHerite ?? value.nom}
        />
      </div>
      <Field id={`${idPrefix}-prenom`} label="Prénom" required>
        <Input id={`${idPrefix}-prenom`} value={value.prenom} onChange={(e) => set("prenom", e.target.value)} />
      </Field>
      <Field id={`${idPrefix}-nom`} label="Nom" required>
        <Input
          id={`${idPrefix}-nom`}
          value={nomHerite ?? value.nom}
          onChange={(e) => set("nom", versMajusculesSansAccent(e.target.value))}
          disabled={nomHerite !== undefined}
        />
      </Field>
      <Field id={`${idPrefix}-sexe`} label="Sexe" required>
        <Select value={value.sexe} onValueChange={(v) => set("sexe", v as Sexe)} disabled={!!lockedSexe}>
          <SelectTrigger id={`${idPrefix}-sexe`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="homme">Homme</SelectItem>
            <SelectItem value="femme">Femme</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <Field id={`${idPrefix}-dateNaissance`} label="Date de naissance">
        <Input
          id={`${idPrefix}-dateNaissance`}
          type="date"
          value={value.dateNaissance}
          max={new Date().toISOString().slice(0, 10)}
          onChange={(e) => set("dateNaissance", e.target.value)}
        />
      </Field>
      <Field id={`${idPrefix}-lieuNaissance`} label="Lieu de naissance">
        <Input
          id={`${idPrefix}-lieuNaissance`}
          value={value.lieuNaissance}
          onChange={(e) => set("lieuNaissance", e.target.value)}
        />
      </Field>
      <Field id={`${idPrefix}-profession`} label="Profession">
        <Input id={`${idPrefix}-profession`} value={value.profession} onChange={(e) => set("profession", e.target.value)} />
      </Field>
      <Field id={`${idPrefix}-niveauEtudes`} label="Niveau d'études">
        <Input
          id={`${idPrefix}-niveauEtudes`}
          value={value.niveauEtudes}
          onChange={(e) => set("niveauEtudes", e.target.value)}
        />
      </Field>
      <Field id={`${idPrefix}-telephone`} label="Téléphone">
        <PhoneInput id={`${idPrefix}-telephone`} value={value.telephone} onValueChange={(v) => set("telephone", v)} />
      </Field>
      <Field id={`${idPrefix}-email`} label="E-mail">
        <Input id={`${idPrefix}-email`} type="email" value={value.email} onChange={(e) => set("email", e.target.value)} />
      </Field>
      {!masquerStatutMatrimonial && (
        <Field id={`${idPrefix}-statutMatrimonial`} label="Situation matrimoniale">
          <Select
            value={value.statutMatrimonial}
            onValueChange={(v) => set("statutMatrimonial", v as NouvellePersonneForm["statutMatrimonial"])}
          >
            <SelectTrigger id={`${idPrefix}-statutMatrimonial`}>
              <SelectValue placeholder="Choisir…" />
            </SelectTrigger>
            <SelectContent>
              {optionsStatut.map((v) => (
                <SelectItem key={v} value={v}>
                  {MARITAL_STATUS_LABELS[v]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      )}
      <div className="flex items-center gap-2 sm:col-span-2">
        <Checkbox
          id={`${idPrefix}-estDecede`}
          checked={value.estDecede}
          onCheckedChange={(c) => set("estDecede", c === true)}
        />
        <Label htmlFor={`${idPrefix}-estDecede`} className="font-normal">
          Cette personne est décédée
        </Label>
      </div>
      <GeographicSituationFields
        idPrefix={idPrefix}
        estDecede={value.estDecede}
        estAuVillage={value.estAuVillage}
        estEnGuinee={value.estEnGuinee}
        onChange={(next) => onChange({ ...value, estAuVillage: next.estAuVillage, estEnGuinee: next.estEnGuinee })}
      />
      <Field id={`${idPrefix}-bio`} label="Observations" className="sm:col-span-2">
        <textarea
          id={`${idPrefix}-bio`}
          value={value.bio}
          onChange={(e) => set("bio", e.target.value)}
          rows={2}
          className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </Field>
    </div>
  );
}
