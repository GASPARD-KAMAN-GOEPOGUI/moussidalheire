-- AlterTable
ALTER TABLE `familles` ADD COLUMN `famille_parente_id` INTEGER NULL;

-- CreateIndex
CREATE INDEX `familles_famille_parente_id_idx` ON `familles`(`famille_parente_id`);







-- AddForeignKey
ALTER TABLE `familles` ADD CONSTRAINT `familles_famille_parente_id_fkey` FOREIGN KEY (`famille_parente_id`) REFERENCES `familles`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;










