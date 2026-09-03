-- Backfill: `est_fondatrice_origine` was added with a hardcoded DEFAULT
-- false, so every family that already existed at that time (created before
-- this column existed, all with `famille_parente_id IS NULL`, i.e. genuine
-- founding families) was incorrectly stamped as a non-founding family.
-- Going forward `creer()`/`modifier()` never touch this column once set, so
-- this one-time backfill is the only way to correct pre-existing rows —
-- restated as "the column reflects reality at creation time," and for rows
-- created before the column existed, reality is `famille_parente_id IS NULL`.
UPDATE `familles`
SET `est_fondatrice_origine` = true
WHERE `famille_parente_id` IS NULL;
