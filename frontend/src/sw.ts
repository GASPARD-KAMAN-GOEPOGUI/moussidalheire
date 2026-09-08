/// <reference lib="webworker" />

/**
 * Service worker de l'application.
 *
 * Écrit à la main (mode `injectManifest`) plutôt que généré : c'est le seul
 * mode qui permettra d'ajouter les listeners `push`/`notificationclick`.
 * Ce fichier reproduit exactement ce que `generateSW` produisait — précache,
 * repli SPA, polices Google, cache API — sans rien y ajouter pour l'instant.
 */

import { clientsClaim } from "workbox-core";
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
  type PrecacheEntry,
} from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";
import { CacheFirst, NetworkFirst } from "workbox-strategies";
import { ExpirationPlugin } from "workbox-expiration";
import { CacheableResponsePlugin } from "workbox-cacheable-response";

declare const self: ServiceWorkerGlobalScope & {
  // Remplacé au build par la liste des fichiers à précacher.
  __WB_MANIFEST: (PrecacheEntry | string)[];
};

// Équivalent de `registerType: 'autoUpdate'` : la nouvelle version prend la
// main sans attendre la fermeture des onglets ouverts.
self.skipWaiting();
clientsClaim();

precacheAndRoute(self.__WB_MANIFEST);

// Supprime les caches de précache laissés par des versions antérieures de
// Workbox — sans quoi ils s'accumulent dans le stockage du navigateur.
cleanupOutdatedCaches();

// Repli SPA : toute navigation est servie par index.html, React Router prenant
// ensuite le relais côté client. Sans cette route, un rechargement direct sur
// /habitants renverrait un 404 hors ligne.
registerRoute(new NavigationRoute(createHandlerBoundToURL("index.html")));

// Appels API. Callback sur le pathname plutôt qu'une regex sur le domaine :
// en production nginx sert le front et proxifie /api/v1 sur la même origine,
// alors qu'en dev l'API vit sur le port 5000.
registerRoute(
  ({ url }) => url.pathname.startsWith("/api/"),
  new NetworkFirst({
    cacheName: "api-cache",
    // Réseau dégradé (mais pas coupé) : on bascule sur le cache au bout de
    // 3 s au lieu d'attendre le timeout complet du navigateur.
    networkTimeoutSeconds: 3,
    plugins: [
      new ExpirationPlugin({ maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 }),
      new CacheableResponsePlugin({ statuses: [0, 200] }),
    ],
  }),
  // GET seulement : rejouer une réponse POST/PATCH/DELETE depuis le cache
  // ferait croire à une écriture qui n'a jamais eu lieu.
  "GET",
);

// Feuilles de style Google Fonts (CORS, réponse 200).
registerRoute(
  /^https:\/\/fonts\.googleapis\.com\/.*/i,
  new CacheFirst({
    cacheName: "google-fonts-stylesheets",
    plugins: [
      new ExpirationPlugin({ maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 }),
      new CacheableResponsePlugin({ statuses: [0, 200] }),
    ],
  }),
  "GET",
);

// Fichiers de police (réponses opaques, d'où le statut 0).
registerRoute(
  /^https:\/\/fonts\.gstatic\.com\/.*/i,
  new CacheFirst({
    cacheName: "google-fonts-webfonts",
    plugins: [
      new ExpirationPlugin({ maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 }),
      new CacheableResponsePlugin({ statuses: [0, 200] }),
    ],
  }),
  "GET",
);
