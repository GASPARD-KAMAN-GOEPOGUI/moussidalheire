import { useEffect, useState } from "react";

/**
 * État de connexion du navigateur, tenu à jour par les événements
 * `online`/`offline`.
 *
 * Attention à ce que `navigator.onLine` signifie réellement : « une interface
 * réseau est active », pas « le serveur répond ». Il reste `true` derrière un
 * portail captif ou quand le backend est tombé. C'est donc un indice à
 * afficher, jamais une condition dont dépendrait une décision — l'échec réel
 * d'une requête (`ApiError` de code `NETWORK_ERROR`) reste la seule source de
 * vérité.
 */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(() =>
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );

  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return online;
}
