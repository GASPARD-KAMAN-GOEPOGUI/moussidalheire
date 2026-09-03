-- AlterTable: add the new boolean column first, backfill it from the
-- existing date column, THEN drop the date column — never lose the
-- information for the (few) rows that already had a date_deces set.
ALTER TABLE `personnes` ADD COLUMN `est_decede` BOOLEAN NOT NULL DEFAULT false;

UPDATE `personnes` SET `est_decede` = true WHERE `date_deces` IS NOT NULL;

ALTER TABLE `personnes` DROP COLUMN `date_deces`;
