import type { Person } from "@/types";

/** Génération 0 = ancêtre identifié explicitement. Sans parent connu et sans ce marquage, la génération reste provisoire (0) — cf. registerMinimalParent, déjà sur cette même convention. */
export function calculateGeneration(parent: Person | undefined, isAncestor: boolean): number {
  if (parent) return parent.generation + 1;
  if (isAncestor) return 0;
  return 0;
}

/** La branche est toujours héritée du parent choisi ; un ancêtre démarre "Lignée fondatrice", comme les patriarches/matriarches générés au démarrage. */
export function calculateBranch(parent: Person | undefined, isAncestor: boolean): string | undefined {
  if (parent) return parent.branch;
  if (isAncestor) return "Lignée fondatrice";
  return undefined;
}

/** Est-ce que cette mère fait déjà partie des unions connues de ce père ? */
export function isKnownUnion(father: Person | undefined, motherId: string): boolean {
  if (!father || !motherId) return true;
  return father.spouseIds.includes(motherId);
}

/** Repère les fiches déjà enregistrées qui pourraient correspondre à la même personne — comparaison simple par nom et, si connue, date de naissance. */
export function detectDuplicates(
  people: Person[],
  firstName: string,
  lastName: string,
  birthDate?: string,
): Person[] {
  const fn = firstName.trim().toLowerCase();
  const ln = lastName.trim().toLowerCase();
  if (!fn || !ln) return [];
  return people.filter((p) => {
    if (p.firstName.trim().toLowerCase() !== fn) return false;
    if (p.lastName.trim().toLowerCase() !== ln) return false;
    if (birthDate && p.birthDate && p.birthDate !== birthDate) return false;
    return true;
  });
}

/**
 * Défense contre un cycle de filiation (A parent de B, B parent de C, C parent de A).
 * Non atteignable lors d'une création (un nouveau membre ne peut pas être l'ancêtre de
 * quelqu'un qui existe déjà) — utile si ces relations sont un jour modifiables après coup.
 */
export function wouldCreateCycle(candidateId: string, proposedParentId: string, people: Person[]): boolean {
  const byId = new Map(people.map((p) => [p.id, p] as const));
  let cursor: Person | undefined = byId.get(proposedParentId);
  const visited = new Set<string>();
  while (cursor) {
    if (cursor.id === candidateId) return true;
    if (visited.has(cursor.id)) return false;
    visited.add(cursor.id);
    cursor = cursor.fatherId ? byId.get(cursor.fatherId) : cursor.motherId ? byId.get(cursor.motherId) : undefined;
  }
  return false;
}
