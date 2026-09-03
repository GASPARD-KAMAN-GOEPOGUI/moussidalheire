import { describe, expect, it } from "vitest";
import { rendre } from "@/utils/templateRenderer";

/**
 * Tests contre les vrais templates sous `template/emails/` (jamais des
 * fixtures séparées) : `partials/compte-cree-row.html` est petit, stable, et
 * sert déjà en production (voir email.service.ts) — le tester directement
 * couvre à la fois le renderer et la non-régression du template réel.
 */
describe("templateRenderer", () => {
  it("TEST 1 — charge correctement un template existant", () => {
    const html = rendre("partials/compte-cree-row.html", {
      role: "Père",
      nom_complet: "Amadou Diallo",
      matricule_affichage: "(MSD-000042)",
      identifiant: "amadou@example.com",
      mot_de_passe: "MotDePasse123",
    });

    expect(html.length).toBeGreaterThan(0);
    expect(html).toContain("<tr>");
  });

  it("charge une erreur claire pour un template inexistant, plutôt qu'un résultat silencieusement vide", () => {
    expect(() => rendre("partials/ce-template-n-existe-pas.html", {})).toThrow();
  });

  it("TEST 2 — {{cle}} devient la valeur fournie", () => {
    const html = rendre("partials/compte-cree-row.html", {
      role: "Mère",
      nom_complet: "Fatou Diallo",
      matricule_affichage: "",
      identifiant: "MSD-000043",
      mot_de_passe: "Secret456",
    });

    expect(html).toContain("Mère");
    expect(html).toContain("Fatou Diallo");
    expect(html).toContain("MSD-000043");
    expect(html).toContain("Secret456");
  });

  it("TEST 3 — le HTML final n'est jamais vide et reste un fragment cohérent", () => {
    const html = rendre("layouts/base.html", {
      application: "Moussidalheire",
      annee: "2026",
      apercu: "Aperçu",
      logo_cid: "logo-test",
      content: "<p>Contenu de test</p>",
    });

    expect(html.length).toBeGreaterThan(0);
    expect(html).toContain("<!doctype html>");
    expect(html).toContain("Moussidalheire");
    expect(html).toContain("<p>Contenu de test</p>");
  });

  it("TEST 4 — une donnée utilisateur est échappée HTML avant insertion ({{cle}})", () => {
    const html = rendre("partials/compte-cree-row.html", {
      role: "Enfant",
      nom_complet: "<script>alert(1)</script>",
      matricule_affichage: "",
      identifiant: "MSD-000044",
      mot_de_passe: "Secret789",
    });

    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  it("{{{cle}}} insère la valeur telle quelle, sans échappement — réservé au HTML déjà composé", () => {
    const html = rendre("auth/recap-comptes-crees.html", {
      lignes: "<tr><td>déjà du HTML</td></tr>",
    });

    expect(html).toContain("<tr><td>déjà du HTML</td></tr>");
  });

  it("une clé absente des données devient une chaîne vide, jamais une erreur", () => {
    expect(() => rendre("partials/compte-cree-row.html", { role: "Père" })).not.toThrow();
    const html = rendre("partials/compte-cree-row.html", { role: "Père" });
    expect(html).toContain("Père");
  });
});
