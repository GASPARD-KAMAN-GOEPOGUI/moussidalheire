-- AlterTable
ALTER TABLE `personnes` ADD COLUMN `cree_par_utilisateur_id` INTEGER NULL;

-- CreateIndex
CREATE INDEX `personnes_cree_par_utilisateur_id_idx` ON `personnes`(`cree_par_utilisateur_id`);

-- AddForeignKey
ALTER TABLE `personnes` ADD CONSTRAINT `personnes_cree_par_utilisateur_id_fkey` FOREIGN KEY (`cree_par_utilisateur_id`) REFERENCES `utilisateurs`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
