/**
 * `applicationServerKey` n'accepte pas la clé en base64url : il lui faut les
 * octets bruts. Cette conversion est le passage obligé de toute implémentation
 * Web Push — sans elle, `subscribe()` échoue sur une erreur peu parlante.
 */
// Le type de retour est explicitement adossé à un `ArrayBuffer` : depuis
// TypeScript 6, un `Uint8Array` générique peut reposer sur un
// `SharedArrayBuffer`, que `applicationServerKey` n'accepte pas.
export function base64UrlVersOctets(base64Url: string): Uint8Array<ArrayBuffer> {
  const remplissage = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + remplissage).replace(/-/g, "+").replace(/_/g, "/");
  const binaire = atob(base64);
  const octets = new Uint8Array(new ArrayBuffer(binaire.length));
  for (let i = 0; i < binaire.length; i += 1) octets[i] = binaire.charCodeAt(i);
  return octets;
}

function memesOctets(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((octet, i) => octet === b[i]);
}

export type ResultatVerificationCle =
  /** Aucun abonnement sur cet appareil : rien à faire. On n'abonne jamais
   * quelqu'un qui ne l'a pas demandé. */
  | "aucun-abonnement"
  /** L'abonnement est lié à la clé actuelle du serveur. */
  | "a-jour"
  /** Le navigateur ne dit pas avec quelle clé l'abonnement a été créé. On
   * s'abstient : se réabonner à chaque chargement, faute de pouvoir
   * comparer, ferait tourner les endpoints sans raison. */
  | "cle-inconnue"
  /** L'abonnement était lié à une ancienne clé : il a été remplacé. */
  | "remplace";

export interface DependancesVerificationCle {
  pushManager: Pick<PushManager, "getSubscription" | "subscribe">;
  /** Appelée seulement si un abonnement existe : un appareil non abonné ne
   * déclenche aucune requête. */
  obtenirClePublique: () => Promise<string>;
  enregistrer: (abonnement: PushSubscription) => Promise<void>;
  supprimer: (endpoint: string) => Promise<void>;
}

/**
 * Remplace l'abonnement de cet appareil s'il a été créé avec une autre clé
 * VAPID que celle du serveur — typiquement après une rotation de clés.
 *
 * Un tel abonnement est définitivement inutilisable : le service push refuse
 * tout envoi signé avec la nouvelle clé (401/403, et le backend le purge
 * alors). Sans ce remplacement, l'appareil se croirait abonné sans plus
 * jamais rien recevoir.
 *
 * Désabonner PUIS réabonner : le navigateur refuse un `subscribe()` avec une
 * clé différente tant que l'ancien abonnement existe.
 *
 * L'ordre des étapes garantit qu'un échec à n'importe quel moment laisse un
 * état cohérent — appareil non abonné, backend sans ligne morte — plutôt
 * qu'un appareil qui se croirait abonné à l'insu du serveur. L'utilisateur
 * voit alors la cloche « Activer » et peut simplement réessayer.
 */
export async function remplacerAbonnementSiCleObsolete({
  pushManager,
  obtenirClePublique,
  enregistrer,
  supprimer,
}: DependancesVerificationCle): Promise<ResultatVerificationCle> {
  const existant = await pushManager.getSubscription();
  if (!existant) return "aucun-abonnement";

  const cleAbonnement = existant.options.applicationServerKey;
  if (!cleAbonnement) return "cle-inconnue";

  const cleServeur = base64UrlVersOctets(await obtenirClePublique());
  if (memesOctets(new Uint8Array(cleAbonnement), cleServeur)) return "a-jour";

  // 1. L'ancien endpoint est mort quoi qu'il arrive ensuite : on le retire
  //    du backend tout de suite. Au mieux : s'il reste, le backend le purgera
  //    au premier envoi (410).
  const ancienEndpoint = existant.endpoint;
  await existant.unsubscribe();
  await supprimer(ancienEndpoint).catch(() => undefined);

  // 2. Nouvel abonnement. S'il échoue, l'appareil reste simplement non abonné.
  const nouveau = await pushManager.subscribe({
    // Obligatoire sur Chrome : s'engage à ce que chaque push donne lieu à une
    // notification visible. Un push silencieux serait rejeté.
    userVisibleOnly: true,
    applicationServerKey: cleServeur,
  });

  // 3. Enregistrement. S'il échoue, on défait l'abonnement plutôt que de
  //    laisser l'appareil abonné sans que le serveur le sache.
  try {
    await enregistrer(nouveau);
  } catch (erreur) {
    await nouveau.unsubscribe().catch(() => undefined);
    throw erreur;
  }
  return "remplace";
}
