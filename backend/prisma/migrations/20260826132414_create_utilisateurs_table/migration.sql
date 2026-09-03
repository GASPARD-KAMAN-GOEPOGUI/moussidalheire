-- CreateTable
CREATE TABLE `utilisateurs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `uuid` CHAR(36) NOT NULL,
    `identifiant` VARCHAR(50) NOT NULL,
    `email` VARCHAR(191) NULL,
    `mot_de_passe_hash` VARCHAR(255) NOT NULL,
    `personne_id` INTEGER NULL,
    `actif` BOOLEAN NOT NULL DEFAULT true,
    `supprime` BOOLEAN NOT NULL DEFAULT false,
    `supprime_le` DATETIME(3) NULL,
    `dernier_acces` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `utilisateurs_uuid_key`(`uuid`),
    UNIQUE INDEX `utilisateurs_identifiant_key`(`identifiant`),
    UNIQUE INDEX `utilisateurs_email_key`(`email`),
    INDEX `utilisateurs_personne_id_idx`(`personne_id`),
    INDEX `utilisateurs_actif_idx`(`actif`),
    INDEX `utilisateurs_supprime_actif_idx`(`supprime`, `actif`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
