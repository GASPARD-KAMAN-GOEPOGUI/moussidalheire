import { useCallback, useEffect, useState } from "react";
import {
  enregistrerAbonnementPush,
  getClePubliquePush,
  supprimerAbonnementPush,
} from "@/services/api/push";

/**
 * `applicationServerKey` n'accepte pas la clé en base64url : il lui faut les
 * octets bruts. Cette conversion est le passage obligé de toute implémentation
 * Web Push — sans elle, `subscribe()` échoue sur une erreur peu parlante.
 */
// Le type de retour est explicitement adossé à un `ArrayBuffer` : depuis
// TypeScript 6, un `Uint8Array` générique peut reposer sur un
// `SharedArrayBuffer`, que `applicationServerKey` n'accepte pas.
function base64UrlVersOctets(base64Url: string): Uint8Array<ArrayBuffer> {
  const remplissage = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + remplissage).replace(/-/g, "+").replace(/_/g, "/");
  const binaire = window.atob(base64);
  const octets = new Uint8Array(new ArrayBuffer(binaire.length));
  for (let i = 0; i < binaire.length; i += 1) octets[i] = binaire.charCodeAt(i);
  return octets;
}

export type EtatPermission = NotificationPermission | "indisponible";

/**
 * Abonnement de cet appareil aux notifications push.
 *
 * Trois états à ne pas confondre :
 * - `supporte` : le navigateur expose les API nécessaires. Sur iOS, `PushManager`
 *   n'existe que si l'application a été ajoutée à l'écran d'accueil — un Safari
 *   ordinaire ne peut tout simplement pas recevoir de notifications.
 * - `permission` : la réponse de l'utilisateur à l'invite du navigateur.
 * - `abonne` : un abonnement existe réellement pour cet appareil. Distinct de
 *   la permission : elle peut être accordée sans qu'aucun abonnement n'existe
 *   (autre appareil, désabonnement, cache effacé).
 */
export function usePushNotifications() {
  const [supporte] = useState(
    () =>
      typeof window !== "undefined" &&
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window,
  );
  const [permission, setPermission] = useState<EtatPermission>(() =>
    typeof window !== "undefined" && "Notification" in window
      ? Notification.permission
      : "indisponible",
  );
  const [abonne, setAbonne] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  // État initial : l'appareil est-il déjà abonné ?
  useEffect(() => {
    if (!supporte) return;
    let annule = false;
    void navigator.serviceWorker.ready
      .then((registration) => registration.pushManager.getSubscription())
      .then((abonnement) => {
        if (!annule) setAbonne(abonnement !== null);
      })
      .catch(() => {
        // Service worker indisponible : on reste sur "non abonné", l'action
        // d'activation remontera une erreur explicite si l'utilisateur essaie.
      });
    return () => {
      annule = true;
    };
  }, [supporte]);

  const activer = useCallback(async (): Promise<void> => {
    if (!supporte) return;
    setEnCours(true);
    setErreur(null);
    try {
      // Doit partir d'un geste utilisateur, sinon le navigateur refuse
      // l'invite sans même l'afficher.
      const reponse = await Notification.requestPermission();
      setPermission(reponse);
      if (reponse !== "granted") {
        setEnCours(false);
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      const clePublique = await getClePubliquePush();

      // Réutilise l'abonnement existant s'il y en a un : `subscribe()` sur un
      // abonnement déjà actif renvoie le même, mais mieux vaut ne pas
      // solliciter le service push pour rien.
      const existant = await registration.pushManager.getSubscription();
      const abonnement =
        existant ??
        (await registration.pushManager.subscribe({
          // Obligatoire sur Chrome : s'engage à ce que chaque push donne lieu
          // à une notification visible. Un push silencieux serait rejeté.
          userVisibleOnly: true,
          applicationServerKey: base64UrlVersOctets(clePublique),
        }));

      await enregistrerAbonnementPush(abonnement);
      setAbonne(true);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "L'activation a échoué.");
    } finally {
      setEnCours(false);
    }
  }, [supporte]);

  const desactiver = useCallback(async (): Promise<void> => {
    if (!supporte) return;
    setEnCours(true);
    setErreur(null);
    try {
      const registration = await navigator.serviceWorker.ready;
      const abonnement = await registration.pushManager.getSubscription();
      if (abonnement) {
        // Le backend d'abord : si l'ordre était inversé et que l'appel
        // échouait, la ligne resterait en base avec un endpoint devenu mort,
        // et on continuerait d'émettre vers le vide.
        await supprimerAbonnementPush(abonnement.endpoint);
        await abonnement.unsubscribe();
      }
      setAbonne(false);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "La désactivation a échoué.");
    } finally {
      setEnCours(false);
    }
  }, [supporte]);

  return { supporte, permission, abonne, enCours, erreur, activer, desactiver };
}
