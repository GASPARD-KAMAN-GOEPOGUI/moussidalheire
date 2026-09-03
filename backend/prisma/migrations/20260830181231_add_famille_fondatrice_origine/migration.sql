-- AlterTable
ALTER TABLE `familles` ADD COLUMN `est_fondatrice_origine` BOOLEAN NOT NULL DEFAULT false;

-- AddForeignKey
ALTER TABLE `utilisateurs` ADD CONSTRAINT `utilisateurs_personne_id_fkey` FOREIGN KEY (`personne_id`) REFERENCES `personnes`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `personnes` ADD CONSTRAINT `personnes_famille_id_fkey` FOREIGN KEY (`famille_id`) REFERENCES `familles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `personnes` ADD CONSTRAINT `personnes_branche_id_fkey` FOREIGN KEY (`branche_id`) REFERENCES `branches`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `personnes` ADD CONSTRAINT `personnes_pere_id_fkey` FOREIGN KEY (`pere_id`) REFERENCES `personnes`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `personnes` ADD CONSTRAINT `personnes_mere_id_fkey` FOREIGN KEY (`mere_id`) REFERENCES `personnes`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `familles` ADD CONSTRAINT `familles_ancetre_id_fkey` FOREIGN KEY (`ancetre_id`) REFERENCES `personnes`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `familles` ADD CONSTRAINT `familles_famille_parente_id_fkey` FOREIGN KEY (`famille_parente_id`) REFERENCES `familles`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `unions` ADD CONSTRAINT `unions_personne_a_id_fkey` FOREIGN KEY (`personne_a_id`) REFERENCES `personnes`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `unions` ADD CONSTRAINT `unions_personne_b_id_fkey` FOREIGN KEY (`personne_b_id`) REFERENCES `personnes`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `residences_personnes` ADD CONSTRAINT `residences_personnes_personne_id_fkey` FOREIGN KEY (`personne_id`) REFERENCES `personnes`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `residences_personnes` ADD CONSTRAINT `residences_personnes_lieu_id_fkey` FOREIGN KEY (`lieu_id`) REFERENCES `lieux`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `actualites` ADD CONSTRAINT `actualites_famille_id_fkey` FOREIGN KEY (`famille_id`) REFERENCES `familles`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `actualites_personnes` ADD CONSTRAINT `actualites_personnes_actualite_id_fkey` FOREIGN KEY (`actualite_id`) REFERENCES `actualites`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `actualites_personnes` ADD CONSTRAINT `actualites_personnes_personne_id_fkey` FOREIGN KEY (`personne_id`) REFERENCES `personnes`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `branches` ADD CONSTRAINT `branches_famille_id_fkey` FOREIGN KEY (`famille_id`) REFERENCES `familles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `personnes_etiquettes` ADD CONSTRAINT `personnes_etiquettes_personne_id_fkey` FOREIGN KEY (`personne_id`) REFERENCES `personnes`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `personnes_etiquettes` ADD CONSTRAINT `personnes_etiquettes_etiquette_id_fkey` FOREIGN KEY (`etiquette_id`) REFERENCES `etiquettes`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
