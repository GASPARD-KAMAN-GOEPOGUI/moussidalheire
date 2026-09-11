import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `nodemailer` est mocké ici (contrairement à auth.service.test.ts, qui
 * mocke `@/services/email.service` tout entier) pour tester ce module lui-
 * même : que le HTML réellement rendu par le renderer arrive bien jusqu'à
 * `sendMail` (TEST 5), et que l'envoi existant continue de fonctionner
 * après l'introduction des templates (TEST 6, régression).
 */
/**
 * Configuration SMTP propre à ce fichier. La suite neutralise SMTP pour tous
 * les tests (vitest.config.mts) ; ce fichier-ci a au contraire besoin d'un
 * transporteur, puisqu'il vérifie ce qui arrive à `sendMail`. Avant, il
 * s'appuyait sur le `.env` du développeur : il échouait sur toute machine sans
 * SMTP configuré. Les valeurs sont fictives — `nodemailer` est simulé — et le
 * domaine `.invalid`, réservé, garantit que rien ne pourrait partir même si
 * la simulation sautait. Posées avant l'import du service (`vi.hoisted`),
 * retirées en fin de fichier pour ne pas contaminer les suivants.
 */
vi.hoisted(() => {
  vi.stubEnv("SMTP_HOST", "smtp.invalid");
  vi.stubEnv("SMTP_PORT", "587");
  vi.stubEnv("SMTP_USER", "test@smtp.invalid");
  vi.stubEnv("SMTP_PASSWORD", "fictif");
});

afterAll(() => {
  vi.unstubAllEnvs();
});

const { sendMailMock, createTransportMock } = vi.hoisted(() => {
  const sendMailMock = vi.fn().mockResolvedValue(undefined);
  const createTransportMock = vi.fn(() => ({ sendMail: sendMailMock }));
  return { sendMailMock, createTransportMock };
});

vi.mock("nodemailer", () => ({
  default: { createTransport: () => createTransportMock() },
}));

import * as emailService from "@/services/email.service";

describe("email.service", () => {
  beforeEach(() => {
    sendMailMock.mockClear();
  });

  it("TEST 5 — envoyerEmailBienvenue transmet à sendMail le HTML réellement rendu (pas juste du texte)", async () => {
    await emailService.envoyerEmailBienvenue({
      destinataire: "test@example.com",
      prenom: "Amadou",
      identifiant: "amadou@example.com",
      motDePasse: "MotDePasse123",
    });

    expect(sendMailMock).toHaveBeenCalledTimes(1);
    const appel = sendMailMock.mock.calls[0]?.[0];
    expect(appel.to).toBe("test@example.com");
    expect(typeof appel.text).toBe("string");
    expect(appel.text).toContain("MotDePasse123");
    expect(typeof appel.html).toBe("string");
    expect(appel.html).toContain("<!doctype html>");
    expect(appel.html).toContain("Amadou");
    expect(appel.html).toContain("MotDePasse123");
  });

  it("TEST 6 — régression : l'envoi joint toujours le logo officiel et le système d'envoi continue de fonctionner", async () => {
    await emailService.envoyerEmailBienvenue({
      destinataire: "test@example.com",
      prenom: "Amadou",
      identifiant: "amadou@example.com",
      motDePasse: "MotDePasse123",
    });

    expect(sendMailMock).toHaveBeenCalledTimes(1);
    const appel = sendMailMock.mock.calls[0]?.[0];
    expect(appel.attachments).toEqual([
      expect.objectContaining({ filename: "logo.jpeg", cid: expect.any(String) as unknown as string }),
    ]);
    expect(appel.html).toContain(`cid:${appel.attachments[0].cid}`);
  });

  it("envoyerEmailInscriptionComplete inclut le récapitulatif dans le HTML quand des personnes ont été créées", async () => {
    await emailService.envoyerEmailInscriptionComplete({
      destinataire: "membre@example.com",
      prenom: "Amadou",
      identifiant: "amadou@example.com",
      motDePasse: "MotDePasse123",
      comptesCrees: [
        {
          role: "Père",
          nomComplet: "Ibrahima Diallo",
          matricule: "MSD-000002",
          identifiant: "MSD-000002",
          motDePasseTemporaire: "AutreMotDePasse",
        },
      ],
    });

    const appel = sendMailMock.mock.calls[sendMailMock.mock.calls.length - 1]?.[0];
    expect(appel.html).toContain("Ibrahima Diallo");
    expect(appel.html).toContain("AutreMotDePasse");
    expect(appel.html).toContain("Personnes également enregistrées");
  });

  it("envoyerEmailInscriptionComplete n'affiche aucun récapitulatif quand personne d'autre n'a été créé", async () => {
    await emailService.envoyerEmailInscriptionComplete({
      destinataire: "membre@example.com",
      prenom: "Amadou",
      identifiant: "amadou@example.com",
      motDePasse: "MotDePasse123",
      comptesCrees: [],
    });

    const appel = sendMailMock.mock.calls[sendMailMock.mock.calls.length - 1]?.[0];
    expect(appel.html).not.toContain("Personnes également enregistrées");
  });
});
