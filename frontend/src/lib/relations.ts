import type { Person } from "@/types";

export function findPath(fromId: string, toId: string, people: Person[]): string[] | null {
  if (fromId === toId) return [fromId];

  const byId = new Map(people.map((p) => [p.id, p] as const));
  const adjacency = new Map<string, Set<string>>();

  const link = (a?: string, b?: string) => {
    if (!a || !b || !byId.has(a) || !byId.has(b)) return;
    if (!adjacency.has(a)) adjacency.set(a, new Set());
    if (!adjacency.has(b)) adjacency.set(b, new Set());
    adjacency.get(a)!.add(b);
    adjacency.get(b)!.add(a);
  };

  for (const p of people) {
    link(p.id, p.fatherId);
    link(p.id, p.motherId);
    p.spouseIds.forEach((sid) => link(p.id, sid));
    p.childrenIds.forEach((cid) => link(p.id, cid));
  }

  const visited = new Set<string>([fromId]);
  const queue: string[] = [fromId];
  const parent = new Map<string, string>();

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current === toId) {
      const path: string[] = [toId];
      let cursor = toId;
      while (parent.has(cursor)) {
        cursor = parent.get(cursor)!;
        path.push(cursor);
      }
      return path.reverse();
    }
    for (const neighbor of adjacency.get(current) ?? []) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        parent.set(neighbor, current);
        queue.push(neighbor);
      }
    }
  }

  return null;
}
