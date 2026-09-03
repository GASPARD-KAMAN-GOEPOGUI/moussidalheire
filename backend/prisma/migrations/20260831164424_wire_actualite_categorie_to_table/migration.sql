-- Rattache Actualite.categorie (ancien ENUM) à la table categories_actualites,
-- déjà créée mais jusqu'ici non reliée. Ordre défensif : ajouter la colonne FK
-- nullable, peupler categories_actualites avec les 9 valeurs de l'ENUM,
-- reporter chaque actualite existante vers la bonne ligne via l'ancienne
-- valeur categorie, PUIS seulement alors rendre la colonne NOT NULL et
-- supprimer l'ENUM — jamais l'inverse, pour ne perdre l'information d'aucune
-- actualite déjà créée.
ALTER TABLE `actualites` ADD COLUMN `categorie_id` INTEGER NULL;

INSERT IGNORE INTO `categories_actualites` (`uuid`, `nom`, `slug`, `created_at`, `updated_at`)
VALUES
  (UUID(), 'Annonce', 'annonce', NOW(), NOW()),
  (UUID(), 'Événement', 'evenement', NOW(), NOW()),
  (UUID(), 'Cérémonie', 'ceremonie', NOW(), NOW()),
  (UUID(), 'Mariage', 'mariage', NOW(), NOW()),
  (UUID(), 'Naissance', 'naissance', NOW(), NOW()),
  (UUID(), 'Décès', 'deces', NOW(), NOW()),
  (UUID(), 'Projet', 'projet', NOW(), NOW()),
  (UUID(), 'Réunion', 'reunion', NOW(), NOW()),
  (UUID(), 'Général', 'general', NOW(), NOW());

UPDATE `actualites` a
JOIN `categories_actualites` c ON c.`slug` = a.`categorie`
SET a.`categorie_id` = c.`id`;

ALTER TABLE `actualites` MODIFY COLUMN `categorie_id` INTEGER NOT NULL;

ALTER TABLE `actualites` DROP INDEX `actualites_categorie_idx`;
ALTER TABLE `actualites` DROP COLUMN `categorie`;

CREATE INDEX `actualites_categorie_id_idx` ON `actualites`(`categorie_id`);
ALTER TABLE `actualites` ADD CONSTRAINT `actualites_categorie_id_fkey` FOREIGN KEY (`categorie_id`) REFERENCES `categories_actualites`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
