/**
 * Minimal fetch wrapper for the real backend (module `utilisateurs`/`auth` and
 * its necessary dependencies only — e.g. reading `familles` for the
 * self-registration form's family picker). Every other module in this app
 * still runs on the mock data layer in `src/data/mock` / `src/services/api`.
 */

const BASE_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? "http://localhost:5000/api/v1";

export interface ApiErrorBody {
  success: false;
  message: string;
  error?: { code?: string; details?: unknown };
}

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly details?: unknown;

  constructor(status: number, message: string, code?: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

let authToken: string | null = null;

/** Called by useAuthStore whenever the token changes (login, auto-login, logout, rehydration). */
export function setApiAuthToken(token: string | null): void {
  authToken = token;
}

/**
 * Registered once by useAuthStore (see that file) — lets this module trigger
 * a session refresh without importing the store directly (would be circular:
 * the store already imports `apiRequest`/`setApiAuthToken` from here).
 * Resolves `true` once a fresh access token has been set via
 * `setApiAuthToken`, `false` if the refresh itself failed (refresh token
 * missing/expired too — the store logs the user out in that case).
 */
type RefreshHandler = () => Promise<boolean>;
let refreshHandler: RefreshHandler | null = null;
let refreshInFlight: Promise<boolean> | null = null;

export function setRefreshHandler(handler: RefreshHandler | null): void {
  refreshHandler = handler;
}

/** Never more than one refresh in flight — several requests can land a 401
 * from the same expired access token at once, and each one calling
 * POST /auth/refresh independently would be both wasteful and racy. Every
 * caller awaits this same promise instead. */
function refreshOnce(): Promise<boolean> {
  if (!refreshHandler) return Promise.resolve(false);
  if (!refreshInFlight) {
    refreshInFlight = refreshHandler().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

/** Endpoints that must never trigger a refresh-and-retry themselves — trying
 * to refresh a session in response to a 401 from `/auth/refresh` itself (an
 * expired/invalid refresh token) would recurse forever. */
const AUTH_ENDPOINTS_SANS_RETRY = new Set(["/auth/refresh", "/auth/connexion", "/auth/inscription"]);

/**
 * Human, French fallback text — used ONLY when the backend response has no
 * usable `message` of its own (normally it always does; this is a last-resort
 * safety net, never a replacement for the backend's own business messages).
 * Every caller across the app already does `err instanceof ApiError ?
 * err.message : "<fallback>"`, so fixing the message here is what every form
 * inherits automatically — no component needs to change.
 */
const FALLBACK_MESSAGE_BY_STATUS: Record<number, string> = {
  400: "Certaines informations envoyées ne sont pas valides. Merci de vérifier le formulaire.",
  401: "Votre session a expiré. Veuillez vous reconnecter.",
  403: "Vous n'avez pas l'autorisation d'effectuer cette action.",
  404: "La ressource demandée est introuvable.",
  409: "Cette information existe déjà. Vérifiez les données saisies.",
};
const DEFAULT_FALLBACK_MESSAGE = "Une erreur inattendue s'est produite. Veuillez réessayer dans quelques instants.";
const NETWORK_ERROR_MESSAGE = "Impossible de contacter le serveur. Vérifiez votre connexion et réessayez.";

function fallbackMessageForStatus(status: number): string {
  return FALLBACK_MESSAGE_BY_STATUS[status] ?? DEFAULT_FALLBACK_MESSAGE;
}

/** `fetch` itself throws (no network, DNS failure, CORS, ...) before any
 * HTTP response exists — never let that raw `TypeError` (e.g. "Failed to
 * fetch") reach a caller; every network failure becomes the same `ApiError`
 * every caller already knows how to display. */
async function fetchOrThrowNetworkError(input: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(input, init);
  } catch {
    throw new ApiError(0, NETWORK_ERROR_MESSAGE, "NETWORK_ERROR");
  }
}

async function parseJsonSafe(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return undefined;
  }
}

function throwApiError(res: Response, json: unknown): never {
  const body = json as ApiErrorBody | undefined;
  throw new ApiError(
    res.status,
    body?.message ?? fallbackMessageForStatus(res.status),
    body?.error?.code,
    body?.error?.details,
  );
}

/**
 * `_retriedAfterRefresh` is internal — never passed by callers — it just
 * stops a request that still 401s right after a successful refresh from
 * looping back into another refresh attempt.
 */
export async function apiRequest<T>(
  path: string,
  options: { method?: string; body?: unknown } = {},
  _retriedAfterRefresh = false,
): Promise<T> {
  const hadToken = authToken !== null;
  const res = await fetchOrThrowNetworkError(`${BASE_URL}${path}`, {
    method: options.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  const json = await parseJsonSafe(res);
  if (!res.ok) {
    // A 401 while a (now presumably expired) access token was attached is
    // silently healed here: refresh once, retry the exact same request, and
    // the caller never even sees the failure — this is what keeps an active
    // user from ever hitting an "invalid/expired token" error mid-session.
    if (res.status === 401 && hadToken && !_retriedAfterRefresh && !AUTH_ENDPOINTS_SANS_RETRY.has(path)) {
      const rafraichi = await refreshOnce();
      if (rafraichi) return apiRequest<T>(path, options, true);
    }
    throwApiError(res, json);
  }
  return json as T;
}

/**
 * Same as `apiRequest`, but never attaches the current session's token —
 * reserved for genuinely global data that must never be narrowed by who's
 * asking. `GET /familles` in particular is scoped to the connected membre's
 * own family "clan" when a token is attached (see
 * `famille.service.ts::resoudreUniversFamilial` côté backend) — a real,
 * deliberate RBAC feature for browsing "Familles", but wrong for a
 * village-wide statistic (see stats.ts::getFamilyBreakdown). This doesn't
 * expose anything a logged-out visitor couldn't already see by calling the
 * same endpoint themselves — it just always requests that same public view.
 */
export async function apiRequestPublic<T>(path: string): Promise<T> {
  const res = await fetchOrThrowNetworkError(`${BASE_URL}${path}`, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });
  const json = await parseJsonSafe(res);
  if (!res.ok) throwApiError(res, json);
  return json as T;
}

/**
 * Uploads a photo file to the real backend (`POST /uploads/photo`, public —
 * no auth required, since self-registration attaches photos to père/mère/
 * fratrie/conjoint/enfant before any compte exists) and returns the URL to
 * store in a personne's `photo` field. Separate from `apiRequest`: multipart
 * form data, never JSON-stringified, and the browser sets its own
 * `Content-Type` (with the multipart boundary) — setting one manually here
 * would break the upload.
 */
export async function uploadPhotoReel(file: File): Promise<string> {
  const formData = new FormData();
  formData.append("photo", file);
  const res = await fetchOrThrowNetworkError(`${BASE_URL}/uploads/photo`, {
    method: "POST",
    headers: authToken ? { Authorization: `Bearer ${authToken}` } : undefined,
    body: formData,
  });

  const json = await parseJsonSafe(res);
  if (!res.ok) throwApiError(res, json);
  return (json as { url: string }).url;
}
