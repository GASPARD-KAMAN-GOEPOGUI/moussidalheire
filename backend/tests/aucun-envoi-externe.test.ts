import { describe, expect, it, vi } from "vitest";
import webpush from "web-push";
import { env } from "@/config/env";
import { logger } from "@/utils/logger";
import { envoyerEmailBienvenue } from "@/services/email.service";

/**
 * Garde-fou : la suite de tests ne doit jamais rien envoyer vers l'extérieur.
 *
 * Avant ce garde-fou, les tests d'inscription expédiaient de vrais e-mails de
 * bienvenue depuis le compte SMTP du `.env` local vers des adresses de test
 * inexistantes. Les rebonds qui en résultent dégradent la réputation du
 * domaine expéditeur — et donc la délivrabilité des vrais messages.
 *
 * Si l'un de ces tests échoue, c'est que la neutralisation posée dans
 * vitest.config.mts (variables SMTP vidées, `setupFiles`) a sauté.
 */
describe("aucun envoi externe pendant les tests", () => {
  it("ne charge aucune configuration SMTP", () => {
    expect(env.SMTP_HOST).toBeUndefined();
    expect(env.SMTP_PORT).toBeUndefined();
    expect(env.SMTP_USER).toBeUndefined();
    expect(env.SMTP_PASSWORD).toBeUndefined();
  });

  it("le service d'e-mail, appelé pour de vrai, refuse d'envoyer", async () => {
    // Le service n'est PAS simulé dans ce fichier : c'est son comportement
    // réel qui est vérifié. Sans transporteur, il journalise et s'arrête.
    const avertissement = vi.spyOn(logger, "warn");

    await envoyerEmailBienvenue({
      destinataire: "personne@example.com",
      prenom: "Test",
      identifiant: "test",
      motDePasse: "Jamais123",
    });

    expect(avertissement).toHaveBeenCalledWith(
      expect.objectContaining({ destinataire: "personne@example.com" }),
      expect.stringContaining("SMTP non configuré"),
    );
    avertissement.mockRestore();
  });

  it("simule web-push : aucune notification ne part vers FCM ou Mozilla", () => {
    expect(vi.isMockFunction(webpush.sendNotification)).toBe(true);
  });
});
