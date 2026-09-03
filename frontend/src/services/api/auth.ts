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
