import { useCallback, useEffect, useState } from "react";
import {
  enregistrerAbonnementPush,
  getClePubliquePush,
  supprimerAbonnementPush,
} from "@/services/api/push";
import { base64UrlVersOctets, remplacerAbonnementSiCleObsolete } from "@/lib/push-abonnement";

function verifierCle(pushManager: PushManager) {
  return remplacerAbonnementSiCleObsolete({
    pushManager,
    obtenirClePublique: getClePubliquePush,
    enregistrer: enregistrerAbonnementPush,
    supprimer: supprimerAbonnementPush,
  });
}

/**
 * Vérification de clé du chargement, partagée au niveau du module : une seule
 * par chargement du site. En développement, StrictMode monte deux fois les
 * effets — deux vérifications concurrentes désabonneraient et réabonneraient
 * l'appareil deux fois de suite.
 */
let verificationAuChargement: Promise<unknown> | null = null;

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

  // Au chargement : remplacer un abonnement lié à une ancienne clé VAPID (voir
  // remplacerAbonnementSiCleObsolete), puis relever l'état réel de l'appareil.
  // Ce hook ne vit que dans l'en-tête de l'espace connecté : la session
  // exigée pour réenregistrer l'abonnement est donc bien établie.
  useEffect(() => {
    if (!supporte) return;
    let annule = false;
    void navigator.serviceWorker.ready
      .then(async (registration) => {
        // Sans permission, le navigateur a déjà supprimé tout abonnement :
        // rien à vérifier.
        if (Notification.permission === "granted") {
          verificationAuChargement ??= verifierCle(registration.pushManager).catch(() => {
            // Silencieux : l'état relevé juste après reflète l'issue réelle
            // (au pire « non abonné »), et l'utilisateur peut réactiver.
          });
          await verificationAuChargement;
        }
        return registration.pushManager.getSubscription();
      })
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

      // Un abonnement lié à une ancienne clé ne doit pas être réutilisé tel
      // quel : on attend la vérification du chargement si elle tourne encore,
      // puis on revérifie — elle a pu échouer, faute de réseau par exemple.
      await verificationAuChargement;
      await verifierCle(registration.pushManager);

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
