/**
 * Moves focus to the first field flagged in `errors`, in `order` — called
 * right after a step/submit validation fails so the user lands directly on
 * what needs fixing instead of hunting for it among several messages.
 * `idFor` maps a logical field name (the `errors` key) to the DOM id of its
 * input, since forms don't always name the two identically (e.g. "prenom" →
 * "new-prenom"). Silently does nothing if no listed field is in error, or if
 * its input isn't rendered (e.g. hidden behind a not-yet-chosen option).
 */
export function focusFirstError(
  errors: Record<string, string>,
  order: readonly string[],
  idFor: (field: string) => string,
): void {
  for (const field of order) {
    if (!errors[field]) continue;
    const el = document.getElementById(idFor(field));
    if (el instanceof HTMLElement) {
      el.focus();
      return;
    }
  }
}
