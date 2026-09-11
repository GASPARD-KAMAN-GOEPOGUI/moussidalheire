-- Moteur InnoDB impose explicitement. Prisma n'ecrit aucun ENGINE et laisse
-- le serveur choisir : sur un serveur dont le moteur par defaut est MyISAM,
-- cette table serait creee en MyISAM et sa cle etrangere (ON DELETE CASCADE)
-- ignoree sans aucune erreur. Ajoute a la main avant la premiere
-- application, donc sans effet sur l'empreinte enregistree.

-- AlterTable
ALTER TABLE `utilisateurs` ADD COLUMN `mot_de_passe_modifie_le` DATETIME(3) NULL;

-- CreateTable
CREATE TABLE `password_reset_tokens` (
    `id` CHAR(36) NOT NULL,
    `utilisateur_id` INTEGER NOT NULL,
    `code_hash` VARCHAR(255) NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `tentatives` INTEGER NOT NULL DEFAULT 0,
    `utilise_a` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `password_reset_tokens_utilisateur_id_idx`(`utilisateur_id`),
    PRIMARY KEY (`id`)
) ENGINE = InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `password_reset_tokens` ADD CONSTRAINT `password_reset_tokens_utilisateur_id_fkey` FOREIGN KEY (`utilisateur_id`) REFERENCES `utilisateurs`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
