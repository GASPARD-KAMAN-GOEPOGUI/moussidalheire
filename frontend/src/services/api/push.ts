import { apiRequest, apiRequestPublic } from "@/lib/api-client";

interface ClePubliqueResponse {
  success: true;
  message: string;
  clePublique: string;
}

/**
 * Clé publique VAPID, servie par le backend plutôt qu'embarquée au build.
 *
 * `apiRequestPublic` et non `apiRequest` : cette route n'exige aucun jeton, et
 * la clé peut être nécessaire avant même que la session soit établie.
 */
export async function getClePubliquePush(): Promise<string> {
  const res = await apiRequestPublic<ClePubliqueResponse>("/push/cle-publique");
  return res.clePublique;
}

/**
 * Transmet l'abonnement au backend. `PushSubscription.toJSON()` produit
 * exactement la forme attendue par la route — endpoint, expirationTime et
 * keys — d'où l'absence de remodelage ici.
 */
export async function enregistrerAbonnementPush(abonnement: PushSubscription): Promise<void> {
  await apiRequest("/push/abonnements", {
    method: "POST",
    body: abonnement.toJSON(),
  });
}

export async function supprimerAbonnementPush(endpoint: string): Promise<void> {
  await apiRequest("/push/abonnements", {
    method: "DELETE",
    body: { endpoint },
  });
}
