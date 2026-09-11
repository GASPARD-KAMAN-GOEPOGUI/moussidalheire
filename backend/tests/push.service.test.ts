import { beforeEach, describe, expect, it, vi } from "vitest";
import webpush, { WebPushError } from "web-push";
import * as pushRepository from "@/repositories/push-subscription.repository";
import { envoyerATous } from "@/services/push.service";

// web-push est déjà simulé pour toute la suite (tests/setup) ; le dépôt l'est
// ici pour ne dépendre d'aucune base.
vi.mock("@/repositories/push-subscription.repository");

const ABONNEMENT = {
  id: "00000000-0000-0000-0000-000000000001",
  endpoint: "https://push.example/abonnement-1",
  p256dh: "p256dh",
  auth: "auth",
  utilisateurId: 1,
  userAgent: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

/** Erreur telle que web-push la lève quand le service push refuse l'envoi.
 * La classe est simulée : son constructeur ne renseigne rien, d'où
 * l'affectation explicite du code. */
function refusDuServicePush(statusCode: number): WebPushError {
  return Object.assign(new WebPushError("refus", statusCode, {}, "", ABONNEMENT.endpoint), {
    statusCode,
  });
}

describe("push.service — purge des abonnements inutilisables", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(pushRepository.listerTous).mockResolvedValue([ABONNEMENT]);
  });

  it.each([
    [401, "clé VAPID différente (Mozilla)"],
    [403, "clé VAPID différente (FCM)"],
    [404, "abonnement introuvable"],
    [410, "abonnement expiré"],
  ])("purge l'abonnement sur une erreur %i (%s)", async (statusCode) => {
    vi.mocked(webpush.sendNotification).mockRejectedValue(refusDuServicePush(statusCode));

    const bilan = await envoyerATous({ titre: "Titre", corps: "Corps" });

    expect(pushRepository.supprimerParEndpoint).toHaveBeenCalledWith(ABONNEMENT.endpoint);
    expect(bilan).toEqual({ envoyes: 0, echecs: 1, purges: 1 });
  });

  it.each([429, 500, 503])(
    "conserve l'abonnement sur une erreur temporaire %i",
    async (statusCode) => {
      vi.mocked(webpush.sendNotification).mockRejectedValue(refusDuServicePush(statusCode));

      const bilan = await envoyerATous({ titre: "Titre", corps: "Corps" });

      expect(pushRepository.supprimerParEndpoint).not.toHaveBeenCalled();
      expect(bilan).toEqual({ envoyes: 0, echecs: 1, purges: 0 });
    },
  );

  it("conserve l'abonnement sur une erreur réseau, sans code HTTP", async () => {
    vi.mocked(webpush.sendNotification).mockRejectedValue(new Error("ECONNRESET"));

    await envoyerATous({ titre: "Titre", corps: "Corps" });

    expect(pushRepository.supprimerParEndpoint).not.toHaveBeenCalled();
  });
});
