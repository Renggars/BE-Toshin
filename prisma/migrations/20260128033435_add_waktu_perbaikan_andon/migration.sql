/*
  Warnings:

  - Added the required column `waktu_perbaikan` to the `master_masalah_andon` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `master_masalah_andon` ADD COLUMN `waktu_perbaikan` INTEGER NOT NULL;
