import { describe, expect, it } from "vitest";
import { chiffresSignificatifs, memeNumero } from "@/utils/telephone";
import { telephoneSchema } from "@/validators/personne.validator";

/**
 * La forme réduite d'un numéro (`chiffresSignificatifs`) est ce qui décide
 * si un membre peut se connecter avec son téléphone — voir
 * auth.service.ts::resoudreUtilisateurPourConnexion. Elle est testée ici sans
 * base de données : c'est une règle de texte, pas une requête.
 */
describe("chiffresSignificatifs", () => {
  it("ramène toutes les écritures d'un même numéro à la même forme", () => {
    const attendu = "620000000";
    for (const ecriture of [
      "620000000",
      "620 00 00 00",
      "+224620000000",
      "+224 620 00 00 00",
      "00224620000000",
      "00224 620-00-00-00",
      "(224) 620.00.00.00",
    ]) {
      expect(chiffresSignificatifs(ecriture)).toBe(attendu);
    }
  });

  it("distingue deux numéros différents", () => {
    expect(chiffresSignificatifs("620000000")).not.toBe(chiffresSignificatifs("620000001"));
  });

  it("ne retire pas un « 224 » de tête qui ne laisserait pas un numéro plausible", () => {
    // 224555 n'est pas l'indicatif suivi d'un numéro : le retirer laisserait
    // trois chiffres, donc la valeur reste entière.
    expect(chiffresSignificatifs("224555")).toBe("224555");
  });

  it("ignore tout ce qui n'est pas un chiffre", () => {
    expect(chiffresSignificatifs("tel : 620-00-00-00 (perso)")).toBe("620000000");
    expect(chiffresSignificatifs("aucun chiffre")).toBe("");
  });
});

describe("memeNumero", () => {
  it("rapproche deux écritures du même numéro", () => {
    expect(memeNumero("620 00 00 00", "+224620000000")).toBe(true);
  });

  it("sépare deux numéros différents", () => {
    expect(memeNumero("620000000", "620000001")).toBe(false);
  });

  it("ne rapproche jamais deux valeurs sans chiffre", () => {
    expect(memeNumero("", "")).toBe(false);
    expect(memeNumero("", "620000000")).toBe(false);
  });
});

/**
 * Le frontend filtre déjà la frappe (`components/shared/PhoneInput.tsx`),
 * mais rien n'empêche un client de poster directement à l'API : c'est ce
 * schéma qui fait autorité.
 */
describe("telephoneSchema", () => {
  it("accepte des chiffres, avec ou sans « + » de tête", () => {
    expect(telephoneSchema.parse("620000000")).toBe("620000000");
    expect(telephoneSchema.parse("+224620000000")).toBe("+224620000000");
  });

  it("stocke la saisie telle quelle, sans indicatif ajouté ni reformatage", () => {
    expect(telephoneSchema.parse("620000000")).toBe("620000000");
  });

  it("refuse les lettres et les caractères spéciaux", () => {
    for (const invalide of [
      "620 00 00 00",
      "620-00-00-00",
      "620.00.00.00",
      "(224)620000000",
      "0620000O00",
      "appelez-moi",
      "224+620000000",
      "+",
    ]) {
      expect(telephoneSchema.safeParse(invalide).success).toBe(false);
    }
  });

  it("refuse une saisie manifestement tronquée", () => {
    expect(telephoneSchema.safeParse("620").success).toBe(false);
  });

  it("refuse un numéro plus long que la colonne", () => {
    expect(telephoneSchema.safeParse(`+${"6".repeat(30)}`).success).toBe(false);
  });

  it("reste facultatif", () => {
    expect(telephoneSchema.parse(undefined)).toBeUndefined();
  });

  it("traite un champ vidé comme « pas de numéro », pas comme un numéro invalide", () => {
    expect(telephoneSchema.parse("")).toBeUndefined();
  });
});
