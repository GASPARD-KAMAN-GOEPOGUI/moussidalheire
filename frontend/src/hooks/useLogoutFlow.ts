import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "@/store/useAuthStore";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";

/**
 * Déconnexion, avec une confirmation quand l'appareil est hors ligne.
 *
 * Se déconnecter hors ligne est une impasse : `logout` purge `api-cache` (voir
 * useAuthStore), donc les fiches consultables disparaissent, et se reconnecter
 * exige un appel réseau à `/auth/connexion` — impossible sans connexion.
 * L'utilisateur se retrouve devant une application vide dont il ne peut plus
 * sortir. En ligne, rien ne change : la déconnexion part immédiatement.
 *
 * Partagé entre Sidebar et BottomNav pour que les deux points de sortie se
 * comportent à l'identique.
 */
export function useLogoutFlow() {
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();
  const online = useOnlineStatus();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const executerDeconnexion = useCallback(async () => {
    setConfirmOpen(false);
    await logout();
    navigate("/connexion", { replace: true });
  }, [logout, navigate]);

  const demanderDeconnexion = useCallback(() => {
    if (online) {
      void executerDeconnexion();
      return;
    }
    setConfirmOpen(true);
  }, [online, executerDeconnexion]);

  return {
    /** À brancher sur le bouton/menu de déconnexion. */
    demanderDeconnexion,
    /** Confirme et déconnecte réellement. */
    executerDeconnexion,
    confirmOpen,
    setConfirmOpen,
  };
}
