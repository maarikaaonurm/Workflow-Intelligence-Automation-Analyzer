-- Add first/last name. Existing users are backfilled by splitting the display name at the first space.
ALTER TABLE "User" ADD COLUMN "firstName" TEXT, ADD COLUMN "lastName" TEXT;

UPDATE "User"
SET "firstName" = split_part("name", ' ', 1),
    "lastName" = CASE WHEN position(' ' in "name") > 0 THEN substr("name", position(' ' in "name") + 1) ELSE '' END;

ALTER TABLE "User" ALTER COLUMN "firstName" SET NOT NULL, ALTER COLUMN "lastName" SET NOT NULL;
