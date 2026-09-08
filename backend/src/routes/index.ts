import { Router } from "express";
import { healthRouter } from "@/routes/health.routes";
import { authRouter } from "@/routes/auth.routes";
import { utilisateursRouter } from "@/routes/utilisateurs.routes";
import { personneRouter } from "@/routes/personne.routes";
import { familleRouter } from "@/routes/famille.routes";
import { unionRouter } from "@/routes/union.routes";
import { lieuRouter } from "@/routes/lieu.routes";
import { residencePersonneRouter } from "@/routes/residence-personne.routes";
import { actualiteRouter } from "@/routes/actualite.routes";
import { brancheRouter } from "@/routes/branche.routes";
import { categorieActualiteRouter } from "@/routes/categorie-actualite.routes";
import { uploadRouter } from "@/routes/upload.routes";
import { pushRouter } from "@/routes/push.routes";

/**
 * All API routes are versioned under /api/v1 (mounted in app.ts).
 *
 * Complete, with real business rules and tests: `utilisateurs`, `personnes`,
 * `auth`, `familles` (hiérarchie fondatrice/relative), `unions`,
 * `actualites`/`categories-actualites`, `lieux`/`residences-personnes`
 * (résidence actuelle d'une personne, au plus une à la fois — voir
 * residence-personne.service.ts). Some routers below remain generic CRUD
 * plumbing only (no business rules yet) — they exist so each can be
 * completed on top of this architecture, one at a time.
 */
export const v1Router = Router();

v1Router.use("/health", healthRouter);
v1Router.use("/auth", authRouter);
v1Router.use("/utilisateurs", utilisateursRouter);
v1Router.use("/personnes", personneRouter);
v1Router.use("/familles", familleRouter);
v1Router.use("/unions", unionRouter);
v1Router.use("/lieux", lieuRouter);
v1Router.use("/residences-personnes", residencePersonneRouter);
v1Router.use("/actualites", actualiteRouter);
v1Router.use("/branches", brancheRouter);
v1Router.use("/categories-actualites", categorieActualiteRouter);
v1Router.use("/uploads", uploadRouter);
v1Router.use("/push", pushRouter);
