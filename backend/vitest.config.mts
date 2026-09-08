import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Ces suites sont des tests d'intégration qui frappent tous la même base
    // `villagedb` réelle. Vitest exécute les fichiers en parallèle par défaut :
    // deux fichiers peuvent alors créer et nettoyer des lignes liées au même
    // moment. Tant que la base n'avait aucune clé étrangère, ces collisions
    // passaient inaperçues ; depuis que l'intégrité référentielle est appliquée
    // (comme en production), elles font échouer des tests au hasard selon
    // l'ordonnancement. L'exécution séquentielle est la seule garantie
    // d'isolement tant qu'une base par worker n'existe pas.
    fileParallelism: false,
    env: {
      NODE_ENV: "test",
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
    },
  },
});
