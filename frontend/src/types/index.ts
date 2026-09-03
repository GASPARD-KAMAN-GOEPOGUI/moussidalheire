export type Gender = "male" | "female";

export type Visibility = "public" | "members" | "private";

export type MaritalStatus = "celibataire" | "marie" | "divorce" | "veuf";

export interface Location {
  id: string;
  country: string;
  city: string;
  region?: string;
  district?: string;
  isVillage?: boolean;
  lat?: number;
  lng?: number;
}

export interface ResidencePeriod {
  id: string;
  location: Location;
  startYear?: number;
  endYear?: number;
  current: boolean;
}

export interface Contact {
  phone?: string;
  email?: string;
  whatsapp?: string;
  visibility: Visibility;
}

export type UnionStatus = "married" | "divorced" | "widowed" | "partner";

export interface Union {
  id: string;
  spouseIds: string[];
  status: UnionStatus;
  startYear?: number;
  endYear?: number;
  childrenIds: string[];
}

export interface Person {
  id: string;
  matricule: string;
  firstName: string;
  lastName: string;
  nickname?: string;
  gender: Gender;
  photoUrl?: string;
  birthYear?: number;
  birthDate?: string;
  birthPlace?: string;
  isDeceased: boolean;
  deathYear?: number;
  maritalStatus?: MaritalStatus;

  familyId: string;
  generation: number;
  branch: string;

  fatherId?: string;
  motherId?: string;
  spouseIds: string[];
  childrenIds: string[];
  siblingIds: string[];

  residenceHistory: ResidencePeriod[];
  /** Situation géographique simplifiée — deux booléens, jamais pertinents
   * pour une personne décédée (voir GeographicSituationFields). `isInVillage`
   * true implique toujours `isInGuinea` true. */
  isInVillage: boolean;
  isInGuinea: boolean;

  profession?: string;
  educationLevel?: string;
  bio?: string;
  roleInVillage?: string;
  contact?: Contact;
  visibility: Visibility;
  isActive: boolean;
  tags?: string[];
  registeredAt: string;
  /** Reflète la règle de modification appliquée réellement côté backend
   * (propre fiche, ou personne créée par l'utilisateur connecté, ou admin) —
   * pour afficher/masquer le bouton "Modifier", jamais pour appliquer la
   * sécurité elle-même (voir personne.service.ts::peutModifierPersonne côté
   * backend, seule source de vérité). `undefined` quand non fourni (listes) :
   * ne pas afficher le bouton dans ce cas-là non plus, jamais par défaut. */
  canEdit?: boolean;
}

export interface PersonInput {
  firstName: string;
  lastName: string;
  nickname?: string;
  gender: Gender;
  photoUrl?: string;
  birthYear?: number;
  birthDate?: string;
  birthPlace?: string;
  isDeceased: boolean;
  deathYear?: number;
  maritalStatus?: MaritalStatus;
  isInVillage: boolean;
  isInGuinea: boolean;
  familyId: string;
  generation: number;
  branch?: string;
  fatherId?: string;
  motherId?: string;
  spouseId?: string;
  profession?: string;
  educationLevel?: string;
  bio?: string;
  roleInVillage?: string;
  contactPhone?: string;
  contactEmail?: string;
  contactWhatsapp?: string;
  contactVisibility: Visibility;
  address?: string;
  currentCity?: string;
  currentCountry?: string;
  currentDistrict?: string;
  visibility: Visibility;
}

export interface SimplePersonInput {
  firstName: string;
  lastName: string;
}

export interface Family {
  id: string;
  name: string;
  ancestorId: string;
  description: string;
  history?: string;
  coverImageUrl?: string;
  motto?: string;
}

export interface FamilyInput {
  surname: string;
  founderFirstName: string;
  founderGender: Gender;
  founderPhotoUrl?: string;
  founderBirthDate?: string;
  founderBirthPlace?: string;
  founderMaritalStatus?: MaritalStatus;
  founderProfession?: string;
  founderBio?: string;
  founderIsDeceased?: boolean;
  founderDeathYear?: number;
  description?: string;
  motto?: string;
  coverImageUrl?: string;
}

/** A catégorie d'actualité — dynamic, admin-creatable (`categories_actualites`
 * on the backend), not a fixed union anymore. `id` is the category's uuid. */
export interface NewsCategoryRef {
  id: string;
  nom: string;
  slug: string;
}

export interface NewsItem {
  id: string;
  title: string;
  category: NewsCategoryRef;
  coverImageUrl?: string;
  excerpt: string;
  content: string;
  authorName: string;
  publishedAt: string;
  relatedFamilyId?: string;
  featured?: boolean;
  /** Soft-delete state (`deletedAt` on the backend) — false once an admin
   * has "désactivé" this actualité; it still loads by id (for the
   * réactiver flow) but drops out of the public list. */
  isActive: boolean;
}

export interface NewsInput {
  title: string;
  /** The category's uuid — resolved to the backend's numeric id in
   * `services/api/news.ts::createNews`. */
  categoryId: string;
  coverImageUrl?: string;
  excerpt: string;
  content: string;
  authorName: string;
  relatedFamilyId?: string;
  featured?: boolean;
}

export interface VillageStats {
  totalPopulation: number;
  totalFamilies: number;
  totalGenerations: number;
  livingInVillage: number;
  livingElsewhereInCountry: number;
  livingAbroad: number;
  newThisMonth: number;
  deceasedRecorded: number;
}
