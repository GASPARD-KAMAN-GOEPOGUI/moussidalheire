import { describe, expect, it } from "vitest";
import { nettoyerSaisieTelephone, PHONE_RE } from "@/lib/utils";

/**
 * Ce que `PhoneInput` applique à chaque frappe et à chaque collage. La règle
 * est doublée côté backend (`telephoneSchema` dans
 * `validators/personne.validator.ts`, testé dans `tests/telephone.test.ts`) —
 * ici on vérifie qu'un caractère refusé n'atteint jamais le champ.
 */
describe("nettoyerSaisieTelephone", () => {
  it("laisse passer les chiffres", () => {
    expect(nettoyerSaisieTelephone("620000000")).toBe("620000000");
  });

  it("garde le « + » quand il ouvre la saisie", () => {
    expect(nettoyerSaisieTelephone("+224620000000")).toBe("+224620000000");
  });

  it("écarte les lettres", () => {
    expect(nettoyerSaisieTelephone("620abc000")).toBe("620000");
    expect(nettoyerSaisieTelephone("appelez-moi")).toBe("");
  });

  it("écarte espaces, tirets, points et parenthèses", () => {
    expect(nettoyerSaisieTelephone("620 00 00 00")).toBe("620000000");
    expect(nettoyerSaisieTelephone("620-00.00(00)")).toBe("620000000");
  });

  it("n'accepte un « + » qu'en première position", () => {
    expect(nettoyerSaisieTelephone("224+620000000")).toBe("224620000000");
    expect(nettoyerSaisieTelephone("++224620000000")).toBe("+224620000000");
  });

  it("nettoie un collage précédé d'espaces sans perdre le « + »", () => {
    expect(nettoyerSaisieTelephone("  +224 620 00 00 00")).toBe("+224620000000");
  });

  it("ne reformate ni ne complète jamais ce qui reste", () => {
    // Aucun indicatif ajouté, aucun espacement inséré : le numéro part en base
    // exactement tel qu'il a été saisi.
    expect(nettoyerSaisieTelephone("620000000")).toBe("620000000");
    expect(nettoyerSaisieTelephone("+")).toBe("+");
  });

  it("produit une valeur que la validation accepte", () => {
    expect(PHONE_RE.test(nettoyerSaisieTelephone("+224 620 00 00 00"))).toBe(true);
    expect(PHONE_RE.test(nettoyerSaisieTelephone("620 00 00 00"))).toBe(true);
    // Trop court pour être un vrai numéro : filtré à la saisie, refusé à la
    // validation.
    expect(PHONE_RE.test(nettoyerSaisieTelephone("620"))).toBe(false);
  });
});
