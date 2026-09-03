import { Field } from "@/components/shared/FormField";
import { Button } from "@/components/ui/button";

/**
 * "Au village ?" / "En Guinée ?" — the only UI for the simplified geographic
 * situation (`estAuVillage`/`estEnGuinee`, two plain booleans, no lieu/table
 * involved). Never rendered for a deceased person (`estDecede`): geography
 * only concerns the living, per the mission's absolute rule. `estAuVillage`
 * answered "Oui" hides "En Guinée ?" entirely and forces it `true` — a
 * village resident is definitionally in Guinée; that combination can never
 * be recorded any other way from this component.
 */
export function GeographicSituationFields({
  idPrefix,
  estDecede,
  estAuVillage,
  estEnGuinee,
  onChange,
}: {
  idPrefix: string;
  estDecede: boolean;
  estAuVillage: boolean;
  estEnGuinee: boolean;
  onChange: (next: { estAuVillage: boolean; estEnGuinee: boolean }) => void;
}) {
  if (estDecede) return null;

  return (
    <>
      <Field id={`${idPrefix}-estAuVillage`} label="Au village ?">
        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant={estAuVillage ? "default" : "outline"}
            onClick={() => onChange({ estAuVillage: true, estEnGuinee: true })}
          >
            Oui
          </Button>
          <Button
            type="button"
            variant={!estAuVillage ? "default" : "outline"}
            onClick={() => onChange({ estAuVillage: false, estEnGuinee })}
          >
            Non
          </Button>
        </div>
      </Field>
      {!estAuVillage && (
        <Field id={`${idPrefix}-estEnGuinee`} label="En Guinée ?">
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant={estEnGuinee ? "default" : "outline"}
              onClick={() => onChange({ estAuVillage: false, estEnGuinee: true })}
            >
              Oui
            </Button>
            <Button
              type="button"
              variant={!estEnGuinee ? "default" : "outline"}
              onClick={() => onChange({ estAuVillage: false, estEnGuinee: false })}
            >
              Non
            </Button>
          </div>
        </Field>
      )}
    </>
  );
}
