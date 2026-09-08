import { WifiOff } from "lucide-react";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";

/**
 * Bandeau global signalant que l'appareil n'a plus de réseau — donc que tout
 * ce qui s'affiche vient du cache du Service Worker et peut avoir vieilli.
 *
 * Placé sous l'en-tête et `sticky`, il reste visible pendant le défilement :
 * un bandeau qu'on perd au premier scroll laisse l'utilisateur croire que les
 * données sont fraîches.
 */
export function OfflineBanner() {
  const online = useOnlineStatus();

  if (online) return null;

  return (
    <div
      role="status"
      className="sticky top-16 z-10 flex items-center justify-center gap-2 bg-primary px-4 py-2 text-center text-xs font-medium text-primary-foreground sm:text-sm"
    >
      <WifiOff className="size-4 shrink-0" aria-hidden="true" />
      <span>
        Mode hors connexion — les informations affichées peuvent être périmées.
      </span>
    </div>
  );
}
