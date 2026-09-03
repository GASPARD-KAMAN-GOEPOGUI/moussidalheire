import type {
  Contact,
  Family,
  FamilyInput,
  Gender,
  Location,
  Person,
  PersonInput,
  ResidencePeriod,
  Union,
  Visibility,
} from "@/types";
import {
  EDUCATION_LEVELS,
  FAMILY_SURNAMES,
  FEMALE_FIRST_NAMES,
  LOCATIONS,
  MALE_FIRST_NAMES,
  NICKNAMES,
  PROFESSIONS,
  VILLAGE_LOCATION,
  createRng,
  pick,
  pickWeightedInt,
} from "./pools";
import { wouldCreateCycle } from "@/lib/genealogy";

const CURRENT_YEAR = 2026;
const VILLAGE_LOCATIONS = LOCATIONS.filter((l) => l.isVillage);
const AWAY_LOCATIONS = LOCATIONS.filter((l) => !l.isVillage);

interface GenContext {
  rng: () => number;
  people: Map<string, Person>;
  unions: Union[];
  idCounter: { n: number };
  matriculeCounter: { n: number };
}

function nextId(ctx: GenContext, prefix: string) {
  ctx.idCounter.n += 1;
  return `${prefix}-${ctx.idCounter.n}`;
}

export const MATRICULE_PREFIX = "MSD";

function formatMatricule(n: number) {
  return `${MATRICULE_PREFIX}-${String(n).padStart(6, "0")}`;
}

function nextMatricule(ctx: GenContext) {
  ctx.matriculeCounter.n += 1;
  return formatMatricule(ctx.matriculeCounter.n);
}

function deceasedRoll(rng: () => number, birthYear: number) {
  const age = CURRENT_YEAR - birthYear;
  if (age < 45) return false;
  if (age < 65) return rng() < 0.12;
  if (age < 80) return rng() < 0.45;
  return rng() < 0.88;
}

function buildResidenceHistory(
  ctx: GenContext,
  birthYear: number,
  isDeceased: boolean,
  deathYear: number | undefined,
  stayBias: number,
): ResidencePeriod[] {
  const { rng } = ctx;
  const segments: ResidencePeriod[] = [];
  const startLoc = pick(rng, VILLAGE_LOCATIONS);
  let cursorYear = birthYear;

  segments.push({
    id: nextId(ctx, "res"),
    location: startLoc,
    startYear: cursorYear,
    current: false,
  });

  const stayed = rng() < stayBias;

  if (!stayed) {
    const steps = pickWeightedInt(rng, 1, 3);
    for (let i = 0; i < steps; i++) {
      const last = segments[segments.length - 1];
      const moveYear = cursorYear + pickWeightedInt(rng, 4, 13);
      last.endYear = moveYear;
      cursorYear = moveYear;
      const nextLoc = pick(rng, AWAY_LOCATIONS);
      segments.push({
        id: nextId(ctx, "res"),
        location: nextLoc,
        startYear: moveYear,
        current: false,
      });
    }

    if (rng() < 0.28) {
      const last = segments[segments.length - 1];
      const returnYear = cursorYear + pickWeightedInt(rng, 3, 10);
      last.endYear = returnYear;
      segments.push({
        id: nextId(ctx, "res"),
        location: pick(rng, VILLAGE_LOCATIONS),
        startYear: returnYear,
        current: false,
      });
    }
  }

  const final = segments[segments.length - 1];
  if (isDeceased && deathYear) {
    final.endYear = deathYear;
    final.current = false;
  } else {
    final.current = true;
  }

  return segments;
}

function buildContact(rng: () => number, isDeceased: boolean): Contact | undefined {
  if (isDeceased) return undefined;
  const roll = rng();
  const visibility: Visibility = roll < 0.5 ? "public" : roll < 0.8 ? "members" : "private";
  return {
    phone: `+224 6${pickWeightedInt(rng, 10000000, 99999999)}`,
    email: rng() < 0.55 ? undefined : `contact${pickWeightedInt(rng, 100, 999)}@example.com`,
    whatsapp: rng() < 0.6 ? `+224 6${pickWeightedInt(rng, 10000000, 99999999)}` : undefined,
    visibility,
  };
}

function randomRegisteredAt(rng: () => number) {
  const daysAgo = rng() < 0.12 ? pickWeightedInt(rng, 0, 45) : pickWeightedInt(rng, 46, 900);
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString();
}

interface CreatePersonInput {
  firstName: string;
  lastName: string;
  gender: Gender;
  birthYear: number;
  familyId: string;
  generation: number;
  branch: string;
  fatherId?: string;
  motherId?: string;
  stayBias?: number;
  notable?: string;
}

function createPerson(ctx: GenContext, input: CreatePersonInput): Person {
  const { rng } = ctx;
  const isDeceased = deceasedRoll(rng, input.birthYear);
  const deathYear = isDeceased
    ? Math.min(CURRENT_YEAR, input.birthYear + pickWeightedInt(rng, 58, 92))
    : undefined;
  const residenceHistory = buildResidenceHistory(ctx, input.birthYear, isDeceased, deathYear, input.stayBias ?? 0.4);
  // Mirrors the real `estAuVillage`/`estEnGuinee` simplification — derived
  // here from the same mock résidence data rather than a separate roll, so
  // village/Guinée/étranger breakdowns stay consistent across the mock layer.
  const currentResidence = residenceHistory.find((r) => r.current);
  const isInVillage = !!currentResidence?.location.isVillage;
  const isInGuinea = isInVillage || currentResidence?.location.country === "Guinée";

  const person: Person = {
    id: nextId(ctx, "p"),
    matricule: nextMatricule(ctx),
    firstName: input.firstName,
    lastName: input.lastName,
    nickname: rng() < 0.18 ? pick(rng, NICKNAMES) : undefined,
    gender: input.gender,
    photoUrl: undefined,
    birthYear: input.birthYear,
    birthPlace: VILLAGE_LOCATION.city,
    isDeceased,
    deathYear,
    maritalStatus: "celibataire",
    familyId: input.familyId,
    generation: input.generation,
    branch: input.branch,
    fatherId: input.fatherId,
    motherId: input.motherId,
    spouseIds: [],
    childrenIds: [],
    siblingIds: [],
    residenceHistory,
    isInVillage,
    isInGuinea,
    profession: isDeceased && rng() < 0.4 ? undefined : pick(rng, PROFESSIONS),
    educationLevel: pick(rng, EDUCATION_LEVELS),
    bio: undefined,
    roleInVillage: input.notable,
    contact: buildContact(rng, isDeceased),
    visibility: rng() < 0.7 ? "public" : rng() < 0.85 ? "members" : "private",
    isActive: true,
    tags: [],
    registeredAt: randomRegisteredAt(rng),
  };

  const portraitIndex = pickWeightedInt(rng, 0, 98);
  person.photoUrl = `https://randomuser.me/api/portraits/${person.gender === "male" ? "men" : "women"}/${portraitIndex}.jpg`;

  const livesAbroad = person.residenceHistory[person.residenceHistory.length - 1].current &&
    person.residenceHistory[person.residenceHistory.length - 1].location.country !== "Guinée";
  if (livesAbroad) person.tags?.push("Diaspora");
  if (input.notable) person.tags?.push("Notable");

  ctx.people.set(person.id, person);
  return person;
}

function marryIn(
  ctx: GenContext,
  partner: Person,
  familyId: string,
  branch: string,
): Person {
  const { rng } = ctx;
  const gender: Gender = partner.gender === "male" ? "female" : "male";
  const firstName = gender === "male" ? pick(rng, MALE_FIRST_NAMES) : pick(rng, FEMALE_FIRST_NAMES);
  const lastName = pick(rng, FAMILY_SURNAMES.filter((s) => s !== partner.lastName));
  const birthYear = partner.birthYear! + pickWeightedInt(rng, -4, 4);

  const spouse = createPerson(ctx, {
    firstName,
    lastName,
    gender,
    birthYear,
    familyId,
    generation: partner.generation,
    branch,
    stayBias: 0.3,
  });

  spouse.spouseIds.push(partner.id);
  partner.spouseIds.push(spouse.id);

  const isWidowed = spouse.isDeceased || partner.isDeceased;
  const union: Union = {
    id: nextId(ctx, "u"),
    spouseIds: [partner.id, spouse.id],
    status: isWidowed ? "widowed" : "married",
    startYear: Math.max(partner.birthYear! , spouse.birthYear!) + pickWeightedInt(rng, 20, 27),
    childrenIds: [],
  };
  ctx.unions.push(union);

  if (!partner.isDeceased) partner.maritalStatus = isWidowed ? "veuf" : "marie";
  if (!spouse.isDeceased) spouse.maritalStatus = isWidowed ? "veuf" : "marie";

  return spouse;
}

function haveChildren(
  ctx: GenContext,
  father: Person,
  mother: Person,
  familyId: string,
  branch: string,
  count: number,
): Person[] {
  const { rng } = ctx;
  const union = ctx.unions.find(
    (u) => u.spouseIds.includes(father.id) && u.spouseIds.includes(mother.id),
  );
  const baseYear = (union?.startYear ?? Math.max(father.birthYear!, mother.birthYear!) + 22);
  const children: Person[] = [];
  let cursor = baseYear + pickWeightedInt(rng, 1, 3);

  for (let i = 0; i < count; i++) {
    const gender: Gender = rng() < 0.5 ? "male" : "female";
    const firstName = gender === "male" ? pick(rng, MALE_FIRST_NAMES) : pick(rng, FEMALE_FIRST_NAMES);
    const child = createPerson(ctx, {
      firstName,
      lastName: father.lastName,
      gender,
      birthYear: Math.min(cursor, CURRENT_YEAR - 1),
      familyId,
      generation: father.generation + 1,
      branch,
      fatherId: father.id,
      motherId: mother.id,
      stayBias: father.generation + 1 <= 1 ? 0.5 : 0.35,
    });
    children.push(child);
    father.childrenIds.push(child.id);
    mother.childrenIds.push(child.id);
    if (union) union.childrenIds.push(child.id);
    cursor += pickWeightedInt(rng, 2, 4);
  }

  children.forEach((c) => {
    c.siblingIds = children.filter((x) => x.id !== c.id).map((x) => x.id);
  });

  return children;
}

interface FamilyBuildResult {
  family: Family;
  people: Person[];
}

function buildFamily(
  ctx: GenContext,
  surname: string,
  familyId: string,
  maxGeneration: number,
  ancestorBirthYear: number,
): FamilyBuildResult {
  const { rng } = ctx;

  const ancestorGender: Gender = rng() < 0.5 ? "male" : "female";
  const patriarch = createPerson(ctx, {
    firstName: ancestorGender === "male" ? pick(rng, MALE_FIRST_NAMES) : pick(rng, FEMALE_FIRST_NAMES),
    lastName: surname,
    gender: ancestorGender,
    birthYear: ancestorBirthYear,
    familyId,
    generation: 0,
    branch: "Lignée fondatrice",
    stayBias: 0.85,
    notable: "Fondateur·rice de la famille",
  });

  const matriarch = marryIn(ctx, patriarch, familyId, "Lignée fondatrice");
  matriarch.roleInVillage = "Doyenne de la famille";
  matriarch.tags?.push("Notable");

  const father = patriarch.gender === "male" ? patriarch : matriarch;
  const mother = patriarch.gender === "male" ? matriarch : patriarch;

  const gen0Count = pickWeightedInt(rng, 3, 6);
  const gen1 = haveChildren(ctx, father, mother, familyId, "Lignée fondatrice", gen0Count);

  function recurse(parents: Person[], generation: number) {
    if (generation > maxGeneration) return;
    for (const person of parents) {
      const willMarry = rng() < (generation <= 2 ? 0.82 : 0.6);
      if (!willMarry) continue;
      const spouse = marryIn(ctx, person, familyId, person.branch);
      const dad = person.gender === "male" ? person : spouse;
      const mom = person.gender === "male" ? spouse : person;

      const maxKids = generation === 1 ? 5 : generation === 2 ? 4 : 3;
      const minKids = generation >= maxGeneration ? 0 : 1;
      const kidCount = generation + 1 > maxGeneration ? 0 : pickWeightedInt(rng, minKids, maxKids);
      if (kidCount === 0) continue;

      const nextGen = haveChildren(ctx, dad, mom, familyId, person.branch, kidCount);
      recurse(nextGen, generation + 1);
    }
  }

  recurse(gen1, 1);

  const allPeople = Array.from(ctx.people.values()).filter((p) => p.familyId === familyId);

  const family: Family = {
    id: familyId,
    name: `Famille ${surname}`,
    ancestorId: patriarch.id,
    description: `La famille ${surname} est l'une des lignées fondatrices de ${VILLAGE_LOCATION.city}, implantée depuis plusieurs générations.`,
    history: `Fondée par ${patriarch.firstName} ${patriarch.lastName}${patriarch.isDeceased ? " (†" + patriarch.deathYear + ")" : ""} et ${matriarch.firstName} ${matriarch.lastName}, la famille ${surname} compte aujourd'hui ${allPeople.length} membres répartis sur ${maxGeneration + 1} générations, entre le village et la diaspora.`,
    motto: undefined,
  };

  return { family, people: allPeople };
}

interface VillageDataset {
  people: Person[];
  families: Family[];
  peopleById: Map<string, Person>;
  familiesById: Map<string, Family>;
  unions: Union[];
}

function generate(): VillageDataset {
  const ctx: GenContext = {
    rng: createRng(1337),
    people: new Map(),
    unions: [],
    idCounter: { n: 0 },
    matriculeCounter: { n: 0 },
  };

  const families: Family[] = [];
  const ancestorBirthYears = [1922, 1931, 1928, 1935, 1919, 1940];

  FAMILY_SURNAMES.forEach((surname, idx) => {
    const familyId = `fam-${surname.toLowerCase()}`;
    const maxGeneration = idx === 0 ? 4 : 3;
    const { family } = buildFamily(ctx, surname, familyId, maxGeneration, ancestorBirthYears[idx]);
    families.push(family);
  });

  const people = Array.from(ctx.people.values());
  const peopleById = ctx.people;
  const familiesById = new Map(families.map((f) => [f.id, f] as const));

  return { people, families, peopleById, familiesById, unions: ctx.unions };
}

export const VILLAGE_DATASET = generate();
export const MOCK_PEOPLE = VILLAGE_DATASET.people;
export const MOCK_FAMILIES = VILLAGE_DATASET.families;
export const MOCK_UNIONS = VILLAGE_DATASET.unions;

/**
 * The generated dataset otherwise lives only in memory and would be lost on
 * every full page navigation. This persists admin edits (create/update/
 * deactivate) to localStorage and replays them over the deterministic seed
 * on startup, so demo data survives reloads without a real backend.
 */
const STORAGE_KEY = "moussidalheire-people-v1";
const DATA_VERSION = 2;

function loadPersistedPeople(): Person[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { version: number; people: Person[] };
    if (parsed.version !== DATA_VERSION || !Array.isArray(parsed.people)) return null;
    return parsed.people;
  } catch {
    return null;
  }
}

function persistPeople() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: DATA_VERSION, people: MOCK_PEOPLE }));
  } catch {
    // Storage full or unavailable — edits simply won't survive a reload.
  }
}

(function hydrateFromStorage() {
  const persisted = loadPersistedPeople();
  if (!persisted || persisted.length < VILLAGE_DATASET.people.length) return;
  VILLAGE_DATASET.people.length = 0;
  VILLAGE_DATASET.people.push(...persisted);
  VILLAGE_DATASET.peopleById.clear();
  for (const p of persisted) VILLAGE_DATASET.peopleById.set(p.id, p);
})();

/** Same localStorage replay strategy as people, kept in a separate key/version since the two collections evolve independently. */
const FAMILIES_STORAGE_KEY = "moussidalheire-families-v1";
const FAMILIES_DATA_VERSION = 1;

function loadPersistedFamilies(): Family[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(FAMILIES_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { version: number; families: Family[] };
    if (parsed.version !== FAMILIES_DATA_VERSION || !Array.isArray(parsed.families)) return null;
    return parsed.families;
  } catch {
    return null;
  }
}

function persistFamilies() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      FAMILIES_STORAGE_KEY,
      JSON.stringify({ version: FAMILIES_DATA_VERSION, families: MOCK_FAMILIES }),
    );
  } catch {
    // Storage full or unavailable — edits simply won't survive a reload.
  }
}

(function hydrateFamiliesFromStorage() {
  const persisted = loadPersistedFamilies();
  if (!persisted || persisted.length < VILLAGE_DATASET.families.length) return;
  VILLAGE_DATASET.families.length = 0;
  VILLAGE_DATASET.families.push(...persisted);
  VILLAGE_DATASET.familiesById.clear();
  for (const f of persisted) VILLAGE_DATASET.familiesById.set(f.id, f);
})();

export function getPersonById(id: string): Person | undefined {
  return VILLAGE_DATASET.peopleById.get(id);
}

export function getPersonByMatricule(matricule: string): Person | undefined {
  const normalized = matricule.trim().toUpperCase();
  return MOCK_PEOPLE.find((p) => p.matricule.toUpperCase() === normalized);
}

function nextAvailableMatricule(): string {
  let max = 0;
  for (const p of MOCK_PEOPLE) {
    const match = /^[A-Z]+-(\d+)$/.exec(p.matricule ?? "");
    if (match) max = Math.max(max, Number(match[1]));
  }
  return formatMatricule(max + 1);
}

export function getFamilyById(id: string): Family | undefined {
  return VILLAGE_DATASET.familiesById.get(id);
}

let customIdCounter = 0;

function buildContactFromInput(input: PersonInput): Contact | undefined {
  if (!input.contactPhone && !input.contactEmail && !input.contactWhatsapp) return undefined;
  return {
    phone: input.contactPhone || undefined,
    email: input.contactEmail || undefined,
    whatsapp: input.contactWhatsapp || undefined,
    visibility: input.contactVisibility,
  };
}

function buildResidenceFromInput(input: PersonInput): ResidencePeriod[] {
  const hasCity = !!input.currentCity?.trim();
  const hasAddress = !!input.address?.trim();
  if (!hasCity && !hasAddress) return [];

  const city = hasCity ? input.currentCity!.trim() : VILLAGE_LOCATION.city;
  const isVillage = city.toLowerCase() === VILLAGE_LOCATION.city.toLowerCase();
  const location: Location = isVillage
    ? { ...VILLAGE_LOCATION, district: input.currentDistrict?.trim() || input.address?.trim() || VILLAGE_LOCATION.district }
    : {
        id: `loc-custom-${++customIdCounter}`,
        city,
        country: input.currentCountry?.trim() || "Guinée",
        district: input.currentDistrict?.trim() || input.address?.trim() || undefined,
        isVillage: false,
      };
  return [
    {
      id: `res-custom-${++customIdCounter}`,
      location,
      startYear: input.birthYear,
      current: true,
    },
  ];
}

function unlinkParent(childId: string, parentId?: string) {
  if (!parentId) return;
  const parent = VILLAGE_DATASET.peopleById.get(parentId);
  if (parent) parent.childrenIds = parent.childrenIds.filter((id) => id !== childId);
}

function linkParent(childId: string, parentId?: string) {
  if (!parentId) return;
  const parent = VILLAGE_DATASET.peopleById.get(parentId);
  if (parent && !parent.childrenIds.includes(childId)) parent.childrenIds.push(childId);
}

function linkSpouse(personId: string, spouseId?: string) {
  if (!spouseId) return;
  const spouse = VILLAGE_DATASET.peopleById.get(spouseId);
  if (spouse && !spouse.spouseIds.includes(personId)) spouse.spouseIds.push(personId);
}

/**
 * Formally records a union between two people who already exist in the census —
 * e.g. a mother picked for a new child who wasn't yet linked to the father. Unlike
 * linkSpouse (one-directional, used when the new record already carries its own
 * spouseIds), both sides here are pre-existing, so both need updating.
 */
export function linkSpouses(aId: string, bId: string): void {
  const a = VILLAGE_DATASET.peopleById.get(aId);
  const b = VILLAGE_DATASET.peopleById.get(bId);
  if (!a || !b) return;
  if (!a.spouseIds.includes(bId)) a.spouseIds.push(bId);
  if (!b.spouseIds.includes(aId)) b.spouseIds.push(aId);
  persistPeople();
}

/** Removes a recorded union between two people on both sides — neither person is deleted, only the spouseIds pointers. */
export function unlinkSpouses(aId: string, bId: string): void {
  const a = VILLAGE_DATASET.peopleById.get(aId);
  const b = VILLAGE_DATASET.peopleById.get(bId);
  if (!a || !b) return;
  a.spouseIds = a.spouseIds.filter((sid) => sid !== bId);
  b.spouseIds = b.spouseIds.filter((sid) => sid !== aId);
  persistPeople();
}

function refreshSiblings(personId: string, fatherId?: string, motherId?: string) {
  if (!fatherId && !motherId) return;
  const siblings = MOCK_PEOPLE.filter(
    (p) =>
      p.id !== personId &&
      ((fatherId && p.fatherId === fatherId) || (motherId && p.motherId === motherId)),
  );
  const person = VILLAGE_DATASET.peopleById.get(personId);
  if (!person) return;
  person.siblingIds = siblings.map((s) => s.id);
  siblings.forEach((s) => {
    if (!s.siblingIds.includes(personId)) s.siblingIds.push(personId);
  });
}

function collectDescendantIds(personId: string): string[] {
  const result: string[] = [];
  const stack = [personId];
  const seen = new Set<string>();
  while (stack.length) {
    const id = stack.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    const person = VILLAGE_DATASET.peopleById.get(id);
    if (!person) continue;
    result.push(id);
    stack.push(...person.childrenIds);
  }
  return result;
}

/**
 * Shifts a person's generation/branch to the given values and cascades the same shift through
 * their whole existing descendant subtree — needed because "ajouter un parent" can be inserted
 * above someone who already has children, whose own generation/branch is derived from theirs.
 * A descendant's branch is only replaced if it still matched the ancestor's old branch, so a
 * manually diverged branch further down the tree isn't silently overwritten.
 */
export function reassignGenerationBranch(personId: string, newGeneration: number, newBranch: string | undefined): void {
  const person = VILLAGE_DATASET.peopleById.get(personId);
  if (!person) return;
  const oldGeneration = person.generation;
  const oldBranch = person.branch;
  const delta = newGeneration - oldGeneration;
  if (delta === 0 && (newBranch === undefined || oldBranch === newBranch)) return;

  for (const id of collectDescendantIds(personId)) {
    const p = VILLAGE_DATASET.peopleById.get(id);
    if (!p) continue;
    if (delta !== 0) p.generation += delta;
    if (newBranch !== undefined && p.branch === oldBranch) p.branch = newBranch;
  }
  persistPeople();
}

/** Sets a second known parent on a child without re-deriving generation/branch — used when the primary parent already fixed those. */
export function linkAdditionalParent(childId: string, parentId: string, parentType: "father" | "mother"): void {
  const child = VILLAGE_DATASET.peopleById.get(childId);
  if (!child) return;
  if (parentType === "father") child.fatherId = parentId;
  else child.motherId = parentId;
  linkParent(childId, parentId);
  refreshSiblings(childId, child.fatherId, child.motherId);
  persistPeople();
}

/**
 * Attaches childId under parentId as father/mother — whether childId is brand new or an
 * existing record being retroactively rattached — and recomputes generation/branch for the
 * whole affected subtree via reassignGenerationBranch.
 */
export function reassignAncestor(childId: string, parentId: string, parentType: "father" | "mother"): void {
  const child = VILLAGE_DATASET.peopleById.get(childId);
  const parent = VILLAGE_DATASET.peopleById.get(parentId);
  if (!child || !parent) return;
  if (parentType === "father") child.fatherId = parentId;
  else child.motherId = parentId;
  linkParent(childId, parentId);
  reassignGenerationBranch(childId, parent.generation + 1, parent.branch);
  refreshSiblings(childId, child.fatherId, child.motherId);
  persistPeople();
}

/** Attaches an already-existing person as targetId's sibling — same parents, same generation/branch/family as the reference. */
export function attachSibling(targetId: string, referenceId: string): void {
  const target = VILLAGE_DATASET.peopleById.get(targetId);
  const reference = VILLAGE_DATASET.peopleById.get(referenceId);
  if (!target || !reference) return;
  target.fatherId = reference.fatherId;
  target.motherId = reference.motherId;
  target.familyId = reference.familyId;
  if (reference.fatherId) linkParent(targetId, reference.fatherId);
  if (reference.motherId) linkParent(targetId, reference.motherId);
  reassignGenerationBranch(targetId, reference.generation, reference.branch);
  refreshSiblings(targetId, target.fatherId, target.motherId);
  persistPeople();
}

/** Registers a brand-new person from the admin form, wiring up parent/spouse back-references. */
export function registerPerson(input: PersonInput): Person {
  const id = `p-custom-${++customIdCounter}`;

  const person: Person = {
    id,
    matricule: nextAvailableMatricule(),
    firstName: input.firstName.trim(),
    lastName: input.lastName.trim(),
    nickname: input.nickname?.trim() || undefined,
    gender: input.gender,
    photoUrl:
      input.photoUrl?.trim() ||
      `https://randomuser.me/api/portraits/${input.gender === "male" ? "men" : "women"}/${(customIdCounter * 7) % 99}.jpg`,
    birthYear: input.birthDate ? new Date(input.birthDate).getFullYear() : input.birthYear,
    birthDate: input.birthDate || undefined,
    birthPlace: input.birthPlace?.trim() || undefined,
    isDeceased: input.isDeceased,
    deathYear: input.isDeceased ? input.deathYear : undefined,
    maritalStatus: input.maritalStatus,
    familyId: input.familyId,
    generation: input.generation,
    branch: input.branch?.trim() || "Nouvelle branche",
    fatherId: input.fatherId || undefined,
    motherId: input.motherId || undefined,
    spouseIds: input.spouseId ? [input.spouseId] : [],
    childrenIds: [],
    siblingIds: [],
    residenceHistory: buildResidenceFromInput(input),
    isInVillage: input.isInVillage,
    isInGuinea: input.isInGuinea,
    profession: input.profession?.trim() || undefined,
    educationLevel: input.educationLevel || undefined,
    bio: input.bio?.trim() || undefined,
    roleInVillage: input.roleInVillage?.trim() || undefined,
    contact: buildContactFromInput(input),
    visibility: input.visibility,
    isActive: true,
    tags: [],
    registeredAt: new Date().toISOString(),
  };

  MOCK_PEOPLE.push(person);
  VILLAGE_DATASET.peopleById.set(id, person);

  linkParent(id, input.fatherId);
  linkParent(id, input.motherId);
  linkSpouse(id, input.spouseId);
  refreshSiblings(id, input.fatherId, input.motherId);

  persistPeople();
  return person;
}

/**
 * Creates a bare-bones parent record when the person registering doesn't know
 * their parent's matricule. Placed at generation 0 since their own ancestry
 * is unknown; a matricule is assigned automatically so they can be referenced
 * (and looked up) going forward.
 */
export function registerMinimalParent(firstName: string, lastName: string, gender: Gender, familyId: string): Person {
  return registerPerson({
    firstName,
    lastName,
    gender,
    isDeceased: false,
    isInVillage: true,
    isInGuinea: true,
    familyId,
    generation: 0,
    branch: "Lignée ajoutée manuellement",
    contactVisibility: "private",
    visibility: "members",
  });
}

const DIACRITICS_PATTERN = new RegExp("[̀-ͯ]", "g");

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(DIACRITICS_PATTERN, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function nextAvailableFamilyId(surname: string): string {
  const slug = slugify(surname);
  if (!slug) return ""; // no surname yet — callers must treat this as "not resolved"
  const base = `fam-${slug}`;
  let id = base;
  let n = 2;
  while (VILLAGE_DATASET.familiesById.has(id)) {
    id = `${base}-${n}`;
    n += 1;
  }
  return id;
}

/**
 * Read-only preview of the family id `registerFamily` will assign for this surname — lets the
 * "Créer une famille" form create the founder's spouse(s) under the right family before the
 * family itself exists yet. Pure (no reservation), so it stays correct only as long as the
 * surname doesn't change and no other family is created in between — true for this form's
 * single-operator, single-tab flow.
 */
export function previewFamilyId(surname: string): string {
  return nextAvailableFamilyId(surname);
}

/**
 * Founds a brand-new family lineage from the admin UI: creates its founding
 * ancestor as a generation-0 person (mirroring how the procedural generator
 * seeds each family), then the family record pointing at them.
 */
export function registerFamily(input: FamilyInput): Family {
  const surname = input.surname.trim();
  const familyId = nextAvailableFamilyId(surname);

  const founder = registerPerson({
    firstName: input.founderFirstName.trim(),
    lastName: surname,
    gender: input.founderGender,
    photoUrl: input.founderPhotoUrl,
    birthDate: input.founderBirthDate,
    birthPlace: input.founderBirthPlace,
    maritalStatus: input.founderMaritalStatus,
    profession: input.founderProfession,
    bio: input.founderBio,
    isDeceased: input.founderIsDeceased ?? false,
    deathYear: input.founderDeathYear,
    isInVillage: true,
    isInGuinea: true,
    familyId,
    generation: 0,
    branch: "Lignée fondatrice",
    roleInVillage: "Fondateur·rice de la famille",
    contactVisibility: "members",
    visibility: "public",
  });

  const family: Family = {
    id: familyId,
    name: `Famille ${surname}`,
    ancestorId: founder.id,
    description:
      input.description?.trim() ||
      `La famille ${surname} rejoint le registre du village, fondée par ${founder.firstName} ${founder.lastName}.`,
    coverImageUrl: input.coverImageUrl?.trim() || undefined,
    motto: input.motto?.trim() || undefined,
  };

  MOCK_FAMILIES.push(family);
  VILLAGE_DATASET.familiesById.set(familyId, family);
  persistFamilies();
  return family;
}

/** Applies edits from the admin form to an existing person, re-wiring relations if they changed. */
const CYCLE_ERROR_MESSAGE = "Impossible d'établir cette relation : elle créerait une boucle généalogique.";

/**
 * Applies edits from the admin form. Father/mother changes are routed through reassignAncestor
 * (same primitive AddMemberDialog uses) so generation/branch stay correct for this person AND
 * cascade to their existing descendants — a raw fatherId/motherId overwrite would silently
 * desync the tree. Guarded by wouldCreateCycle before either relation is applied. Note:
 * spouseIds is intentionally untouched here — it's a collection, not a single pointer, and is
 * managed separately via linkSpouses/unlinkSpouses so an edit to an unrelated field can never
 * drop a person's other spouses.
 */
export function editPerson(id: string, input: PersonInput): Person | undefined {
  const person = VILLAGE_DATASET.peopleById.get(id);
  if (!person) return undefined;

  const fatherChanged = person.fatherId !== input.fatherId;
  const motherChanged = person.motherId !== input.motherId;

  if (fatherChanged && input.fatherId && wouldCreateCycle(id, input.fatherId, MOCK_PEOPLE)) {
    throw new Error(CYCLE_ERROR_MESSAGE);
  }
  if (motherChanged && input.motherId && wouldCreateCycle(id, input.motherId, MOCK_PEOPLE)) {
    throw new Error(CYCLE_ERROR_MESSAGE);
  }

  let relationDrivenGenerationBranch = false;

  if (fatherChanged) {
    unlinkParent(id, person.fatherId);
    if (input.fatherId) {
      reassignAncestor(id, input.fatherId, "father");
      relationDrivenGenerationBranch = true;
    } else {
      person.fatherId = undefined;
    }
  }
  if (motherChanged) {
    unlinkParent(id, person.motherId);
    if (input.motherId) {
      reassignAncestor(id, input.motherId, "mother");
      relationDrivenGenerationBranch = true;
    } else {
      person.motherId = undefined;
    }
  }

  person.firstName = input.firstName.trim();
  person.lastName = input.lastName.trim();
  person.nickname = input.nickname?.trim() || undefined;
  person.gender = input.gender;
  if (input.photoUrl?.trim()) person.photoUrl = input.photoUrl.trim();
  person.birthYear = input.birthDate ? new Date(input.birthDate).getFullYear() : input.birthYear;
  person.birthDate = input.birthDate || person.birthDate;
  person.birthPlace = input.birthPlace?.trim() || undefined;
  person.isDeceased = input.isDeceased;
  person.deathYear = input.isDeceased ? input.deathYear : undefined;
  person.maritalStatus = input.maritalStatus ?? person.maritalStatus;
  person.familyId = input.familyId;
  // A father/mother change already recomputed generation/branch (with cascade) via reassignAncestor;
  // the raw form values are only applied when neither relation moved, preserving manual override
  // for compatibility without letting it fight the relation-driven recalculation.
  if (!relationDrivenGenerationBranch) {
    person.generation = input.generation;
    person.branch = input.branch?.trim() || person.branch;
  }
  person.profession = input.profession?.trim() || undefined;
  person.educationLevel = input.educationLevel || undefined;
  person.bio = input.bio?.trim() || undefined;
  person.roleInVillage = input.roleInVillage?.trim() || undefined;
  person.contact = buildContactFromInput(input);
  person.visibility = input.visibility;
  if (input.currentCity?.trim()) {
    person.residenceHistory = [
      ...person.residenceHistory.map((r) => ({ ...r, current: false, endYear: r.endYear ?? input.birthYear })),
      ...buildResidenceFromInput(input),
    ];
  }

  refreshSiblings(id, person.fatherId, person.motherId);

  persistPeople();
  return person;
}

/** Soft enable/disable — keeps genealogical links intact but hides the profile from public listings. */
export function setPersonActive(id: string, active: boolean): Person | undefined {
  const person = VILLAGE_DATASET.peopleById.get(id);
  if (!person) return undefined;
  person.isActive = active;
  persistPeople();
  return person;
}

export function personToInput(person: Person): PersonInput {
  const current = person.residenceHistory.find((r) => r.current);
  return {
    firstName: person.firstName,
    lastName: person.lastName,
    nickname: person.nickname,
    gender: person.gender,
    photoUrl: person.photoUrl,
    birthYear: person.birthYear,
    birthDate: person.birthDate,
    birthPlace: person.birthPlace,
    isDeceased: person.isDeceased,
    deathYear: person.deathYear,
    maritalStatus: person.maritalStatus,
    isInVillage: person.isInVillage,
    isInGuinea: person.isInGuinea,
    familyId: person.familyId,
    generation: person.generation,
    branch: person.branch,
    fatherId: person.fatherId,
    motherId: person.motherId,
    spouseId: person.spouseIds[0],
    profession: person.profession,
    educationLevel: person.educationLevel,
    bio: person.bio,
    roleInVillage: person.roleInVillage,
    contactPhone: person.contact?.phone,
    contactEmail: person.contact?.email,
    contactWhatsapp: person.contact?.whatsapp,
    contactVisibility: person.contact?.visibility ?? "members",
    currentCity: current?.location.city,
    currentCountry: current?.location.country,
    currentDistrict: current?.location.district,
    visibility: person.visibility,
  };
}

export type { Location };
