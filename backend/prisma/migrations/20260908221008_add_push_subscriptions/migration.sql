-- DropForeignKey
ALTER TABLE `unions` DROP FOREIGN KEY `unions_personne_a_id_fkey`;

-- DropForeignKey
ALTER TABLE `unions` DROP FOREIGN KEY `unions_personne_b_id_fkey`;

-- CreateTable
CREATE TABLE `push_subscriptions` (
    `id` CHAR(36) NOT NULL,
    `endpoint` VARCHAR(500) NOT NULL,
    `p256dh` VARCHAR(255) NOT NULL,
    `auth` VARCHAR(255) NOT NULL,
    `utilisateur_id` INTEGER NOT NULL,
    `user_agent` VARCHAR(500) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `push_subscriptions_endpoint_key`(`endpoint`),
    INDEX `push_subscriptions_utilisateur_id_idx`(`utilisateur_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `push_subscriptions` ADD CONSTRAINT `push_subscriptions_utilisateur_id_fkey` FOREIGN KEY (`utilisateur_id`) REFERENCES `utilisateurs`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `unions` ADD CONSTRAINT `unions_epoux_id_fkey` FOREIGN KEY (`epoux_id`) REFERENCES `personnes`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `unions` ADD CONSTRAINT `unions_epouse_id_fkey` FOREIGN KEY (`epouse_id`) REFERENCES `personnes`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
