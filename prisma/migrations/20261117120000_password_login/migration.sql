-- Username/password login for the single owner (added by insta-autodm).
ALTER TABLE "User" ADD COLUMN "passwordHash" TEXT;
