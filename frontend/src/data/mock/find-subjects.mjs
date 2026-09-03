import { MOCK_PEOPLE, MOCK_FAMILIES } from "./generator.ts";

const byId = new Map(MOCK_PEOPLE.map((p) => [p.id, p]));

function fullName(p) {
  return `${p.firstName} ${p.lastName}`;
}

// 1) Person with 2+ spouses
const multiSpouse = MOCK_PEOPLE.filter((p) => p.spouseIds.length >= 2 && p.isActive);
console.log("=== PERSONNES AVEC 2+ CONJOINTS ===");
for (const p of multiSpouse.slice(0, 5)) {
  console.log(
    `${p.id} | ${fullName(p)} | famille=${p.familyId} | conjoints=${p.spouseIds.map((sid) => fullName(byId.get(sid))).join(", ")}`,
  );
}

// 2) Person with children AND grandchildren, father+mother known, at least 1 spouse
console.log("\n=== PERSONNES AVEC ENFANTS + PETITS-ENFANTS + PERE + MERE + CONJOINT ===");
const withDescendants = MOCK_PEOPLE.filter((p) => {
  if (!p.fatherId || !p.motherId || p.spouseIds.length === 0 || p.childrenIds.length === 0) return false;
  const hasGrandchild = p.childrenIds.some((cid) => (byId.get(cid)?.childrenIds.length ?? 0) > 0);
  return hasGrandchild && p.isActive;
});
for (const p of withDescendants.slice(0, 5)) {
  console.log(
    `${p.id} | ${fullName(p)} | famille=${p.familyId} | pere=${fullName(byId.get(p.fatherId))} | mere=${fullName(byId.get(p.motherId))} | enfants=${p.childrenIds.length} | petits-enfants=${p.childrenIds.reduce((s, cid) => s + (byId.get(cid)?.childrenIds.length ?? 0), 0)}`,
  );
}

// 3) For scenario 8 (anti-cycle): pick one candidate from above, list its father, mother, children, grandchildren ids/names
if (withDescendants.length > 0) {
  const p = withDescendants[0];
  console.log(`\n=== DETAIL POUR ANTI-CYCLE (sujet: ${fullName(p)} / ${p.id}) ===`);
  console.log(`Père actuel: ${fullName(byId.get(p.fatherId))} (${p.fatherId})`);
  console.log(`Mère actuelle: ${fullName(byId.get(p.motherId))} (${p.motherId})`);
  console.log(`Famille: ${p.familyId}`);
  for (const cid of p.childrenIds) {
    const c = byId.get(cid);
    console.log(`  Enfant: ${fullName(c)} (${c.id}) genre=${c.gender}`);
    for (const gcid of c.childrenIds) {
      const gc = byId.get(gcid);
      console.log(`    Petit-enfant: ${fullName(gc)} (${gc.id}) genre=${gc.gender}`);
    }
  }
  // list other same-family, same-gender candidates for father replacement (excluding cycle-causing ones)
  const familyMales = MOCK_PEOPLE.filter((x) => x.familyId === p.familyId && x.gender === "male" && x.id !== p.id && x.isActive);
  console.log(`\nHommes de la même famille (candidats "nouveau père" possibles): ${familyMales.length}`);
  for (const m of familyMales.slice(0, 8)) console.log(`  ${fullName(m)} (${m.id}) gen=${m.generation}`);
}

// 4) A person to use as "new spouse to add" - someone not married, active, opposite gender pool exists
console.log("\n=== FAMILLES (pour navigation) ===");
for (const f of MOCK_FAMILIES) console.log(`${f.id} -> ${f.name}`);

console.log("\n=== ETAT ACTUEL DE Fabé Lamah (p-6) ===");
const fabe = byId.get("p-6");
console.log(`Conjoint(s) actuel(s): ${fabe.spouseIds.map((sid) => `${fullName(byId.get(sid))} (${sid})`).join(", ")}`);
console.log(`Generation: ${fabe.generation} | Branche: ${fabe.branch}`);

console.log("\n=== CANDIDATE NOUVELLE EPOUSE (femme active, jamais mariée à Fabé) ===");
const femaleCandidates = MOCK_PEOPLE.filter(
  (p) => p.isActive && p.gender === "female" && p.id !== "p-6" && !fabe.spouseIds.includes(p.id) && p.spouseIds.length === 0,
);
for (const f of femaleCandidates.slice(0, 5)) console.log(`${f.id} | ${fullName(f)} | famille=${f.familyId}`);

console.log("\n=== ETAT ACTUEL DE Emmanuel Lamah (p-9), pour test changement de mère ===");
const emmanuel = byId.get("p-9");
console.log(`Père: ${fullName(byId.get(emmanuel.fatherId))} (${emmanuel.fatherId})`);
console.log(`Mère: ${fullName(byId.get(emmanuel.motherId))} (${emmanuel.motherId})`);
console.log(`Enfants: ${emmanuel.childrenIds.map((cid) => fullName(byId.get(cid))).join(", ")}`);
for (const cid of emmanuel.childrenIds) {
  const c = byId.get(cid);
  for (const gcid of c.childrenIds) console.log(`  Petit-enfant via ${fullName(c)}: ${fullName(byId.get(gcid))} (${gcid})`);
}
const femalesInFamily = MOCK_PEOPLE.filter(
  (p) => p.familyId === emmanuel.familyId && p.gender === "female" && p.id !== emmanuel.id && p.isActive,
);
console.log(`Femmes de la même famille (candidates "nouvelle mère"): `);
for (const f of femalesInFamily.slice(0, 8)) console.log(`  ${fullName(f)} (${f.id}) gen=${f.generation}`);
