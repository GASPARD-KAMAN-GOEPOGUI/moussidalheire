-- Écrite à la main plutôt que générée par `prisma migrate dev` : le diff
-- automatique de Prisma aurait DROP + ADD ces colonnes (perte des 5 lignes
-- existantes), faute de pouvoir demander confirmation en environnement non
-- interactif. `RENAME COLUMN` préserve les données réelles.

-- RenameColumn
ALTER TABLE `unions`
  RENAME COLUMN `personne_a_id` TO `epoux_id`,
  RENAME COLUMN `personne_b_id` TO `epouse_id`;

-- RenameIndex
ALTER TABLE `unions`
  DROP INDEX `unions_personne_a_id_idx`,
  DROP INDEX `unions_personne_b_id_idx`;

ALTER TABLE `unions`
  ADD INDEX `unions_epoux_id_idx` (`epoux_id`),
  ADD INDEX `unions_epouse_id_idx` (`epouse_id`);
