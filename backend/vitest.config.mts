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
      // Aucun e-mail réel pendant les tests. Vitest pose ces variables AVANT
      // que `dotenv` ne lise le `.env`, et `dotenv` ne remplace jamais une
      // variable déjà définie : elles restent donc vides, `env.ts` les traite
      // comme absentes, et email.service.ts ne crée aucun transporteur. Sans
      // ça, les tests d'inscription envoyaient de vrais messages depuis le
      // compte SMTP configuré vers des adresses de test inexistantes — des
      // rebonds qui dégradent la réputation du domaine expéditeur. Vérifié
      // par tests/aucun-envoi-externe.test.ts.
      SMTP_HOST: "",
      SMTP_PORT: "",
      SMTP_USER: "",
      SMTP_PASSWORD: "",
      SMTP_FROM: "",
    },
    // Même garantie pour les notifications push : `web-push` est simulé dans
    // tous les fichiers de test. La base locale peut contenir de vrais
    // abonnements (un téléphone de développeur), et la publication d'une
    // actualité notifie tous les abonnés.
    setupFiles: ["tests/setup/aucun-envoi-externe.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
    },
  },
});
