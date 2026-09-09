/// <reference lib="webworker" />

/**
 * Service worker de l'application.
 *
 * Écrit à la main (mode `injectManifest`) plutôt que généré : c'est le seul
 * mode qui permet d'ajouter les listeners `push`/`notificationclick`, en bas
 * de ce fichier. Le reste — précache, repli SPA, polices Google, cache API —
 * reproduit exactement ce que `generateSW` produisait.
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

// ---------------------------------------------------------------------------
// Notifications push
// ---------------------------------------------------------------------------

/** Ce que le backend envoie (voir push.service.ts::ContenuNotification). */
interface ContenuNotification {
  titre: string;
  corps: string;
  url?: string;
}

const TITRE_PAR_DEFAUT = "Moussidalheire";
const CORPS_PAR_DEFAUT = "Une nouveauté vous attend au village.";

/**
 * Le contenu vient du réseau : il peut être absent, ne pas être du JSON, ou
 * ne pas avoir la forme attendue. Comme l'abonnement est en `userVisibleOnly`,
 * on doit afficher une notification dans tous les cas — un `push` qui n'en
 * affiche aucune fait révoquer l'abonnement par le navigateur, silencieusement.
 * D'où ces valeurs de repli plutôt qu'un `throw`.
 */
function lireContenu(data: PushMessageData | null): ContenuNotification {
  if (!data) return { titre: TITRE_PAR_DEFAUT, corps: CORPS_PAR_DEFAUT };
  try {
    const brut = data.json() as Partial<ContenuNotification>;
    return {
      titre: typeof brut.titre === "string" && brut.titre ? brut.titre : TITRE_PAR_DEFAUT,
      corps: typeof brut.corps === "string" && brut.corps ? brut.corps : CORPS_PAR_DEFAUT,
      url: typeof brut.url === "string" ? brut.url : undefined,
    };
  } catch {
    // Charge utile en texte brut : on l'affiche telle quelle plutôt que de
    // perdre l'information.
    const texte = data.text();
    return { titre: TITRE_PAR_DEFAUT, corps: texte || CORPS_PAR_DEFAUT };
  }
}

self.addEventListener("push", (event) => {
  const contenu = lireContenu(event.data);

  // `waitUntil` maintient le service worker en vie le temps de l'affichage :
  // sans lui, le navigateur peut l'arrêter avant que la notification n'existe.
  event.waitUntil(
    self.registration.showNotification(contenu.titre, {
      body: contenu.corps,
      icon: "/pwa-192x192.png",
      badge: "/pwa-192x192.png",
      // Transporte la destination jusqu'au clic, `notificationclick` n'ayant
      // accès à rien d'autre.
      data: { url: contenu.url ?? "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const donnees = event.notification.data as { url?: string } | undefined;
  // Chemin relatif, jamais une URL absolue reconstruite : il est résolu
  // contre la portée du service worker, ce qui évite toute dépendance à
  // `self.location.origin` et les adresses malformées qui en découlent.
  const chemin = donnees?.url ?? "/";

  event.waitUntil(
    (async () => {
      try {
        const fenetres = await self.clients.matchAll({
          type: "window",
          // Indispensable : sans cette option, les onglets non contrôlés par
          // cette version du service worker sont invisibles, et on ouvrirait
          // une fenêtre de plus alors que l'application est déjà ouverte.
          includeUncontrolled: true,
        });

        for (const fenetre of fenetres) {
          if (new URL(fenetre.url).origin !== self.location.origin) continue;
          try {
            await fenetre.focus();
            // `navigate()` n'existe pas partout et rejette sur une fenêtre non
            // contrôlée. On l'essaie sans en dépendre : la fenêtre est déjà au
            // premier plan, c'est l'essentiel.
            if ("navigate" in fenetre) {
              await fenetre.navigate(chemin).catch(() => undefined);
            }
            return;
          } catch {
            // Cette fenêtre refuse le focus : on tente la suivante plutôt que
            // d'abandonner tout le traitement.
          }
        }

        await self.clients.openWindow(chemin);
      } catch {
        // Ne jamais laisser ce handler rejeter. Un rejet rend la main au
        // navigateur, qui applique son propre comportement par défaut — sur
        // Samsung Internet, un message « adresse Web n'est pas valide ».
      }
    })(),
  );
});
