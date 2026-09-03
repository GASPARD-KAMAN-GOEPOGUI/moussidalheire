-- AlterTable: `personnes.telephone` and `personnes.email` become unique
-- when present (NULL never conflicts with NULL under a MySQL UNIQUE index),
-- so two fiches can never share the same phone number or e-mail — including
-- fiches with no linked utilisateur account (père/mère/fratrie/conjoint
-- created on the fly during self-registration).
CREATE UNIQUE INDEX `personnes_telephone_key` ON `personnes`(`telephone`);

CREATE UNIQUE INDEX `personnes_email_key` ON `personnes`(`email`);
