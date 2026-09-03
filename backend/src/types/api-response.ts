/**
 * Every JSON response the API sends — success or failure — follows one of these two
 * shapes. A success body is `{ success, message }` plus whatever fields the endpoint
 * adds at the top level (see health.controller.ts) — there is no `data` wrapper,
 * to match the response shape specified for the API.
 */
export interface ApiSuccess {
  success: true;
  message: string;
}

export interface ApiErrorBody {
  code: string;
  details?: unknown;
}

export interface ApiError {
  success: false;
  message: string;
  error: ApiErrorBody;
}
