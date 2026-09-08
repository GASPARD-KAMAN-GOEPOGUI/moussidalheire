import { ApiError } from "@/lib/api-client";
import { ErrorState } from "@/components/shared/ErrorState";

interface DataErrorStateProps {
  error: Error;
  onRetry?: () => void;
}

/**
 * `ErrorState` alimenté par l'erreur remontée par `useAsync`.
 *
 * Distingue la coupure réseau du reste : hors ligne, l'utilisateur n'a rien à
 * réparer et le message doit le dire, là où un 404 ou un 500 appelle un
 * message tout autre. `api-client.ts` marque toute panne de `fetch` d'un code
 * `NETWORK_ERROR` — c'est ce qui rend la distinction possible ici.
 */
export function DataErrorState({ error, onRetry }: DataErrorStateProps) {
  const horsLigne = error instanceof ApiError && error.code === "NETWORK_ERROR";

  if (horsLigne) {
    return (
      <ErrorState
        variant="neutral"
        title="Vous êtes hors connexion"
        description="Ces informations n'ont pas encore été enregistrées pour la consultation hors ligne. Reconnectez-vous à Internet, puis réessayez."
        onRetry={onRetry}
      />
    );
  }

  return (
    <ErrorState
      title="Une erreur est survenue"
      // Les messages d'`ApiError` sont déjà rédigés en français et destinés à
      // l'utilisateur (voir `FALLBACK_MESSAGE_BY_STATUS`). Une erreur JS
      // quelconque, elle, n'a rien à faire à l'écran : on retombe sur le texte
      // par défaut d'`ErrorState`.
      description={error instanceof ApiError ? error.message : undefined}
      onRetry={onRetry}
    />
  );
}
