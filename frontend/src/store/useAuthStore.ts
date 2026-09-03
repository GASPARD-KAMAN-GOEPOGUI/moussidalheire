import { create } from "zustand";
import { persist } from "zustand/middleware";
import { apiRequest, ApiError, setApiAuthToken, setRefreshHandler } from "@/lib/api-client";
import { onDataChanged } from "@/lib/sync-bus";
import { getPerson } from "@/services/api/people";

export interface AuthUtilisateur {
  id: number;
  uuid: string;
  identifiant: string;
  /** Facultatif côté backend (voir `Personne.email`/`Utilisateur.email` dans
   * schema.prisma) — `null` pour un compte sans e-mail renseigné. */
  email: string | null;
  personneId: number;
  role: "membre" | "admin";
  /** Only present after `/auth/moi` has resolved (see `verifySession`) — not
   * returned by `/auth/connexion`/self-registration, which never need it. */
  personneUuid?: string;
}

interface AuthUser {
  name: string;
  /** L'e-mail du compte quand il en a un, sinon son identifiant de connexion
   * (matricule ou identifiant choisi) — toujours une valeur affichable. */
  email: string;
}

interface ConnexionResponse {
  success: true;
  message: string;
  utilisateur: AuthUtilisateur;
  token: string;
  refreshToken: string;
}

interface MoiResponse {
  success: true;
  message: string;
  utilisateur: AuthUtilisateur;
}

interface RafraichirResponse {
  success: true;
  message: string;
  token: string;
  refreshToken: string;
}

interface AuthStore {
  token: string | null;
  /** Long-lived companion to `token` — the only credential `refreshSession`
   * needs. Persisted alongside everything else in this store (see `persist`
   * below), never sent with ordinary requests (only `token` is). */
  refreshToken: string | null;
  utilisateur: AuthUtilisateur | null;
  isAuthenticated: boolean;
  user: AuthUser | null;
  /** Real credential-based login — used on every login after the first. */
  login: (identifiant: string, motDePasse: string) => Promise<void>;
  /** Adopts a token+refreshToken+utilisateur already issued by the backend
   * (e.g. right after self-registration) without a second round-trip through
   * /auth/connexion — this is what gives the user direct access to their
   * space post-inscription. */
  loginWithToken: (
    token: string,
    refreshToken: string,
    utilisateur: AuthUtilisateur,
    nom?: string,
    prenom?: string,
  ) => void;
  logout: () => void;
  /** Validates the persisted token is still good (GET /auth/moi) — called once
   * by RequireAuth on mount so a stale/expired localStorage token doesn't grant
   * phantom access. Returns false and logs out if the token is no longer valid
   * (and the refresh attempt `apiRequest` makes under the hood also failed). */
  verifySession: () => Promise<boolean>;
  /** Exchanges `refreshToken` for a fresh `token`+`refreshToken` pair (POST
   * /auth/refresh). Registered with `api-client.ts` as its global 401 handler
   * (see the bottom of this file) — normally never called directly by UI
   * code; `apiRequest` invokes it transparently whenever a request 401s, so
   * an active member never sees an "invalid/expired token" error. Logs out
   * and returns false only when the refresh token itself is missing, invalid,
   * expired, or belongs to a now-deactivated account. */
  refreshSession: () => Promise<boolean>;
}

function userFromUtilisateur(utilisateur: AuthUtilisateur, nom?: string, prenom?: string): AuthUser {
  const name = prenom && nom ? `${prenom} ${nom}` : utilisateur.identifiant;
  return { name, email: utilisateur.email ?? utilisateur.identifiant };
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      token: null,
      refreshToken: null,
      utilisateur: null,
      isAuthenticated: false,
      user: null,

      login: async (identifiant, motDePasse) => {
        const res = await apiRequest<ConnexionResponse>("/auth/connexion", {
          method: "POST",
          body: { identifiant, motDePasse },
        });
        setApiAuthToken(res.token);
        set({
          token: res.token,
          refreshToken: res.refreshToken,
          utilisateur: res.utilisateur,
          isAuthenticated: true,
          user: userFromUtilisateur(res.utilisateur),
        });
      },

      loginWithToken: (token, refreshToken, utilisateur, nom, prenom) => {
        setApiAuthToken(token);
        set({
          token,
          refreshToken,
          utilisateur,
          isAuthenticated: true,
          user: userFromUtilisateur(utilisateur, nom, prenom),
        });
      },

      logout: () => {
        setApiAuthToken(null);
        set({ token: null, refreshToken: null, utilisateur: null, isAuthenticated: false, user: null });
      },

      verifySession: async () => {
        const { token } = get();
        if (!token) return false;
        setApiAuthToken(token);
        try {
          const res = await apiRequest<MoiResponse>("/auth/moi");
          set({ utilisateur: res.utilisateur, isAuthenticated: true });
          return true;
        } catch (err) {
          if (err instanceof ApiError && err.status === 401) {
            get().logout();
          }
          return false;
        }
      },

      refreshSession: async () => {
        const { refreshToken } = get();
        if (!refreshToken) return false;
        try {
          const res = await apiRequest<RafraichirResponse>("/auth/refresh", {
            method: "POST",
            body: { refreshToken },
          });
          setApiAuthToken(res.token);
          set({ token: res.token, refreshToken: res.refreshToken });
          return true;
        } catch {
          get().logout();
          return false;
        }
      },
    }),
    {
      name: "moussidalheire-auth",
      onRehydrateStorage: () => (state) => {
        if (state?.token) setApiAuthToken(state.token);
      },
    },
  ),
);

// Lets api-client.ts trigger a silent session refresh on any 401 without
// importing this store directly (this file already imports FROM api-client.ts
// — importing back would be circular). See `refreshSession`'s doc comment.
setRefreshHandler(() => useAuthStore.getState().refreshSession());

/**
 * `user.name`/`user.email` are otherwise only ever computed once, at login
 * (see `userFromUtilisateur` above) — nothing else recomputes them, so
 * editing your own fiche would leave the sidebar/bottom nav showing your old
 * name forever (even surviving a reload, since this store is persisted).
 * Re-derives them from the fiche itself whenever any `personne` changes,
 * anywhere — in this tab (a mutation calls `notifyDataChanged` which invokes
 * this listener directly) or another one (relayed over `BroadcastChannel`).
 * Coarse on purpose: a mutation doesn't reliably carry "this is/isn't the
 * connected user's own uuid" (e.g. `inscrireCoupleReel` creates several
 * personnes at once), so this always re-fetches the connected user's own
 * fiche — one extra GET per personne-mutation, village-scale-acceptable.
 */
onDataChanged((msg) => {
  if (msg.resource !== "personne") return;
  const { utilisateur } = useAuthStore.getState();
  if (!utilisateur?.personneUuid) return;
  void getPerson(utilisateur.personneUuid).then((p) => {
    if (!p) return;
    useAuthStore.setState({
      user: { name: `${p.firstName} ${p.lastName}`, email: utilisateur.email ?? utilisateur.identifiant },
    });
  });
});
