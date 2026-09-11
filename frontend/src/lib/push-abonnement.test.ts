import { beforeEach, describe, expect, it, vi } from "vitest";
import { base64UrlVersOctets, remplacerAbonnementSiCleObsolete } from "./push-abonnement";

/** Clé publique VAPID factice : point P-256 non compressé (0x04 + 64 octets). */
function cleVapid(remplissage: number): string {
  const octets = [0x04, ...new Array<number>(64).fill(remplissage)];
  return btoa(String.fromCharCode(...octets))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

const ANCIENNE_CLE = cleVapid(1);
const NOUVELLE_CLE = cleVapid(2);

function octetsDe(cle: BufferSource | string | null | undefined): Uint8Array {
  if (!cle || typeof cle === "string") throw new Error("clé attendue sous forme d'octets");
  return ArrayBuffer.isView(cle)
    ? new Uint8Array(cle.buffer, cle.byteOffset, cle.byteLength)
    : new Uint8Array(cle);
}

/**
 * PushManager factice, fidèle au navigateur sur le point qui compte ici :
 * `subscribe()` avec une clé différente échoue tant que l'abonnement
 * précédent n'a pas été désabonné.
 */
class FauxPushManager {
  actuel: PushSubscription | null = null;
  private compteur = 0;

  getSubscription = vi.fn(async () => this.actuel);

  subscribe = vi.fn(async (options?: PushSubscriptionOptionsInit) => {
    const cle = octetsDe(options?.applicationServerKey);
    if (this.actuel) {
      const cleActuelle = new Uint8Array(this.actuel.options.applicationServerKey!);
      if (cleActuelle.some((octet, i) => octet !== cle[i])) {
        throw new DOMException("clé différente d'un abonnement existant", "InvalidStateError");
      }
      return this.actuel;
    }
    this.compteur += 1;
    this.actuel = this.creer(`https://push.example/abonnement-${this.compteur}`, cle);
    return this.actuel;
  });

  creer(endpoint: string, cle: Uint8Array | null): PushSubscription {
    const abonnement = {
      endpoint,
      options: { applicationServerKey: cle ? cle.slice().buffer : null, userVisibleOnly: true },
      unsubscribe: vi.fn(async () => {
        if (this.actuel === abonnement) this.actuel = null;
        return true;
      }),
    } as unknown as PushSubscription;
    return abonnement;
  }
}

describe("remplacerAbonnementSiCleObsolete", () => {
  let pushManager: FauxPushManager;
  let enregistrer: ReturnType<typeof vi.fn<(abonnement: PushSubscription) => Promise<void>>>;
  let supprimer: ReturnType<typeof vi.fn<(endpoint: string) => Promise<void>>>;
  let obtenirClePublique: ReturnType<typeof vi.fn<() => Promise<string>>>;

  const verifier = () =>
    remplacerAbonnementSiCleObsolete({ pushManager, obtenirClePublique, enregistrer, supprimer });

  beforeEach(() => {
    pushManager = new FauxPushManager();
    enregistrer = vi.fn(async () => undefined);
    supprimer = vi.fn(async () => undefined);
    obtenirClePublique = vi.fn(async () => NOUVELLE_CLE);
  });

  it("remplace automatiquement un abonnement lié à une ancienne clé", async () => {
    const ancien = pushManager.creer(
      "https://push.example/ancien",
      base64UrlVersOctets(ANCIENNE_CLE),
    );
    pushManager.actuel = ancien;

    await expect(verifier()).resolves.toBe("remplace");

    // L'ancien est désabonné, et retiré du backend.
    expect(ancien.unsubscribe).toHaveBeenCalledOnce();
    expect(supprimer).toHaveBeenCalledWith("https://push.example/ancien");

    // Le nouvel abonnement porte la clé du serveur…
    const nouveau = pushManager.actuel as PushSubscription | null;
    expect(nouveau).not.toBeNull();
    expect(nouveau!.endpoint).not.toBe("https://push.example/ancien");
    expect(new Uint8Array(nouveau!.options.applicationServerKey!)).toEqual(
      base64UrlVersOctets(NOUVELLE_CLE),
    );
    expect(pushManager.subscribe).toHaveBeenCalledWith(
      expect.objectContaining({ userVisibleOnly: true }),
    );

    // … et c'est bien lui qui est enregistré auprès du backend.
    expect(enregistrer).toHaveBeenCalledExactlyOnceWith(nouveau);
  });

  it("ne touche pas à un abonnement déjà lié à la clé du serveur", async () => {
    const actuel = pushManager.creer("https://push.example/actuel", base64UrlVersOctets(NOUVELLE_CLE));
    pushManager.actuel = actuel;

    await expect(verifier()).resolves.toBe("a-jour");

    expect(actuel.unsubscribe).not.toHaveBeenCalled();
    expect(pushManager.subscribe).not.toHaveBeenCalled();
    expect(enregistrer).not.toHaveBeenCalled();
    expect(supprimer).not.toHaveBeenCalled();
  });

  it("n'abonne jamais un appareil qui ne l'était pas, sans même interroger le serveur", async () => {
    await expect(verifier()).resolves.toBe("aucun-abonnement");

    expect(obtenirClePublique).not.toHaveBeenCalled();
    expect(pushManager.subscribe).not.toHaveBeenCalled();
  });

  it("s'abstient quand le navigateur ne dit pas avec quelle clé l'abonnement a été créé", async () => {
    const actuel = pushManager.creer("https://push.example/actuel", null);
    pushManager.actuel = actuel;

    await expect(verifier()).resolves.toBe("cle-inconnue");

    expect(actuel.unsubscribe).not.toHaveBeenCalled();
    expect(pushManager.subscribe).not.toHaveBeenCalled();
  });

  it("si l'enregistrement échoue, l'appareil ne reste pas abonné à l'insu du serveur", async () => {
    pushManager.actuel = pushManager.creer(
      "https://push.example/ancien",
      base64UrlVersOctets(ANCIENNE_CLE),
    );
    enregistrer.mockRejectedValue(new Error("réseau indisponible"));

    await expect(verifier()).rejects.toThrow("réseau indisponible");

    expect(pushManager.actuel).toBeNull();
  });

  it("un échec de suppression de l'ancien endpoint n'empêche pas le remplacement", async () => {
    pushManager.actuel = pushManager.creer(
      "https://push.example/ancien",
      base64UrlVersOctets(ANCIENNE_CLE),
    );
    supprimer.mockRejectedValue(new Error("401"));

    await expect(verifier()).resolves.toBe("remplace");
    expect(enregistrer).toHaveBeenCalledOnce();
  });
});
