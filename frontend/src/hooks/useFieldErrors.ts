import { useCallback, useState } from "react";

/**
 * Per-field validation-error state shared by every hand-rolled form in the
 * app (no external validation library — see NewMemberDialog, the first form
 * to establish this pattern). `clearError` is what keeps an error message
 * honest: called from a field's `onChange`, it removes that field's message
 * the instant the value changes, so a correction is never left sitting next
 * to a now-stale "invalide"/"requis" from a previous attempt.
 */
export function useFieldErrors() {
  const [errors, setErrors] = useState<Record<string, string>>({});

  const clearError = useCallback((field: string) => {
    setErrors((prev) => {
      if (!(field in prev)) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }, []);

  const setError = useCallback((field: string, message: string) => {
    setErrors((prev) => ({ ...prev, [field]: message }));
  }, []);

  return { errors, setErrors, clearError, setError };
}
