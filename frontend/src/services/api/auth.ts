import { apiRequest } from "@/lib/api-client";

/**
 * Self-service password change for the currently authenticated utilisateur
 * (`POST /auth/mot-de-passe`) — the bearer token is attached automatically by
 * `apiRequest`, so this always acts on the connected user, never on an id
 * supplied by the caller. Deliberately doesn't ask for the current password:
 * the bearer token alone authorizes the change (see the backend's own
 * auth.service.ts::changerMotDePasse doc comment for the trade-off). Throws
 * `ApiError`: 409 if `nouveauMotDePasse` is identical to the current
 * password, 400 if it doesn't meet the strength rule.
 */
export async function changerMotDePasse(nouveauMotDePasse: string): Promise<void> {
  await apiRequest<{ success: true; message: string }>("/auth/mot-de-passe", {
    method: "POST",
    body: { nouveauMotDePasse },
  });
}

/**
 * `POST /auth/mot-de-passe-oublie`. La réponse est la même que le compte
 * existe ou non : l'interface ne peut donc jamais affirmer qu'un code est
 * parti, seulement qu'il est parti si le compte existe.
 */
export async function demanderCodeReinitialisation(identifiant: string): Promise<void> {
  await apiRequest<{ success: true; message: string }>("/auth/mot-de-passe-oublie", {
    method: "POST",
    body: { identifiant },
  });
}

/** `POST /auth/verifier-code`. Renvoie le jeton temporaire (10 minutes). */
export async function verifierCodeReinitialisation(identifiant: string, code: string): Promise<string> {
  const res = await apiRequest<{ success: true; message: string; jeton: string }>(
    "/auth/verifier-code",
    { method: "POST", body: { identifiant, code } },
  );
  return res.jeton;
}

/** `POST /auth/reinitialiser-mot-de-passe`. Ferme toutes les sessions du compte. */
export async function reinitialiserMotDePasse(jeton: string, nouveauMotDePasse: string): Promise<void> {
  await apiRequest<{ success: true; message: string }>("/auth/reinitialiser-mot-de-passe", {
    method: "POST",
    body: { jeton, nouveauMotDePasse },
  });
}
