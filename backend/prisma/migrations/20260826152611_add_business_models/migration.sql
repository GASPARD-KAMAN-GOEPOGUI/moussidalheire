
-- CreateTable
CREATE TABLE `personnes` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `uuid` CHAR(36) NOT NULL,
    `matricule` VARCHAR(20) NULL,
    `prenom` VARCHAR(100) NOT NULL,
    `nom` VARCHAR(100) NOT NULL,
    `surnom` VARCHAR(100) NULL,
    `sexe` ENUM('homme', 'femme') NOT NULL,
    `photo` VARCHAR(500) NULL,
    `date_naissance` DATE NULL,
    `lieu_naissance` VARCHAR(150) NULL,
    `date_deces` DATE NULL,
    `statut_matrimonial` ENUM('celibataire', 'marie', 'divorce', 'veuf') NULL,
    `profession` VARCHAR(150) NULL,
    `niveau_etudes` VARCHAR(100) NULL,
    `bio` TEXT NULL,
    `telephone` VARCHAR(30) NULL,
    `email` VARCHAR(191) NULL,
    `whatsapp` VARCHAR(30) NULL,
    `visibilite_contacts` ENUM('public', 'membres', 'prive') NOT NULL DEFAULT 'membres',
    `visibilite_profil` ENUM('public', 'membres', 'prive') NOT NULL DEFAULT 'public',
    `actif` BOOLEAN NOT NULL DEFAULT true,
    `generation` INTEGER NOT NULL DEFAULT 0,
    `branche_id` INTEGER NULL,
    `famille_id` INTEGER NOT NULL,
    `pere_id` INTEGER NULL,
    `mere_id` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `personnes_uuid_key`(`uuid`),
    UNIQUE INDEX `personnes_matricule_key`(`matricule`),
    INDEX `personnes_famille_id_idx`(`famille_id`),
    INDEX `personnes_pere_id_idx`(`pere_id`),
    INDEX `personnes_mere_id_idx`(`mere_id`),
    INDEX `personnes_branche_id_idx`(`branche_id`),
    INDEX `personnes_generation_idx`(`generation`),
    INDEX `personnes_actif_idx`(`actif`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `familles` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `uuid` CHAR(36) NOT NULL,
    `nom` VARCHAR(150) NOT NULL,
    `description` TEXT NULL,
    `histoire` TEXT NULL,
    `devise` VARCHAR(200) NULL,
    `image_couverture` VARCHAR(500) NULL,
    `ancetre_id` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `familles_uuid_key`(`uuid`),
    UNIQUE INDEX `familles_ancetre_id_key`(`ancetre_id`),
    INDEX `familles_ancetre_id_idx`(`ancetre_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `unions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `uuid` CHAR(36) NOT NULL,
    `personne_a_id` INTEGER NOT NULL,
    `personne_b_id` INTEGER NOT NULL,
    `statut` ENUM('marie', 'divorce', 'veuf', 'partenaire') NOT NULL,
    `date_debut` DATE NULL,
    `date_fin` DATE NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `unions_uuid_key`(`uuid`),
    INDEX `unions_personne_a_id_idx`(`personne_a_id`),
    INDEX `unions_personne_b_id_idx`(`personne_b_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `lieux` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `uuid` CHAR(36) NOT NULL,
    `pays` VARCHAR(100) NOT NULL,
    `region` VARCHAR(100) NULL,
    `ville` VARCHAR(100) NOT NULL,
    `quartier` VARCHAR(100) NULL,
    `latitude` DECIMAL(9, 6) NULL,
    `longitude` DECIMAL(9, 6) NULL,
    `est_village` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `lieux_uuid_key`(`uuid`),
    INDEX `lieux_ville_idx`(`ville`),
    INDEX `lieux_pays_idx`(`pays`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `residences_personnes` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `uuid` CHAR(36) NOT NULL,
    `personne_id` INTEGER NOT NULL,
    `lieu_id` INTEGER NOT NULL,
    `annee_debut` INTEGER NULL,
    `annee_fin` INTEGER NULL,
    `est_actuelle` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `residences_personnes_uuid_key`(`uuid`),
    INDEX `residences_personnes_personne_id_idx`(`personne_id`),
    INDEX `residences_personnes_lieu_id_idx`(`lieu_id`),
    INDEX `residences_personnes_personne_id_est_actuelle_idx`(`personne_id`, `est_actuelle`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `actualites` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `uuid` CHAR(36) NOT NULL,
    `titre` VARCHAR(200) NOT NULL,
    `categorie` ENUM('annonce', 'evenement', 'ceremonie', 'mariage', 'naissance', 'deces', 'projet', 'reunion', 'general') NOT NULL,
    `image_couverture` VARCHAR(500) NULL,
    `resume` TEXT NOT NULL,
    `contenu` TEXT NOT NULL,
    `auteur` VARCHAR(150) NULL,
    `date_publication` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `mise_en_avant` BOOLEAN NOT NULL DEFAULT false,
    `famille_id` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `actualites_uuid_key`(`uuid`),
    INDEX `actualites_categorie_idx`(`categorie`),
    INDEX `actualites_date_publication_idx`(`date_publication`),
    INDEX `actualites_famille_id_idx`(`famille_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `actualites_personnes` (
    `actualite_id` INTEGER NOT NULL,
    `personne_id` INTEGER NOT NULL,

    INDEX `actualites_personnes_personne_id_idx`(`personne_id`),
    PRIMARY KEY (`actualite_id`, `personne_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `branches` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `uuid` CHAR(36) NOT NULL,
    `famille_id` INTEGER NOT NULL,
    `nom` VARCHAR(150) NOT NULL,
    `description` TEXT NULL,
    `statut` VARCHAR(50) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `branches_uuid_key`(`uuid`),
    INDEX `branches_famille_id_idx`(`famille_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `etiquettes` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `uuid` CHAR(36) NOT NULL,
    `nom` VARCHAR(100) NOT NULL,
    `description` TEXT NULL,
    `statut` VARCHAR(50) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `etiquettes_uuid_key`(`uuid`),
    UNIQUE INDEX `etiquettes_nom_key`(`nom`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `personnes_etiquettes` (
    `personne_id` INTEGER NOT NULL,
    `etiquette_id` INTEGER NOT NULL,

    INDEX `personnes_etiquettes_etiquette_id_idx`(`etiquette_id`),
    PRIMARY KEY (`personne_id`, `etiquette_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `categories_actualites` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `uuid` CHAR(36) NOT NULL,
    `nom` VARCHAR(100) NOT NULL,
    `slug` VARCHAR(100) NOT NULL,
    `description` TEXT NULL,
    `statut` VARCHAR(50) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `categories_actualites_uuid_key`(`uuid`),
    UNIQUE INDEX `categories_actualites_nom_key`(`nom`),
    UNIQUE INDEX `categories_actualites_slug_key`(`slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `utilisateurs_personne_id_key` ON `utilisateurs`(`personne_id`);

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

