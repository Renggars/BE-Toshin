/*
  Warnings:

  - The values [WAITING_START] on the enum `rencana_produksi_status` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the `lrp_log` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `produksi_log` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `no_reg` to the `laporan_realisasi_produksi` table without a default value. This is not possible if the table is not empty.
  - Made the column `waktu_perbaikan_menit` on table `master_masalah_andon` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE `lrp_log` DROP FOREIGN KEY `lrp_log_fk_id_lrp_fkey`;

-- DropForeignKey
ALTER TABLE `produksi_log` DROP FOREIGN KEY `produksi_log_fk_id_mesin_fkey`;

-- DropForeignKey
ALTER TABLE `produksi_log` DROP FOREIGN KEY `produksi_log_fk_id_operator_fkey`;

-- DropForeignKey
ALTER TABLE `produksi_log` DROP FOREIGN KEY `produksi_log_fk_id_shift_fkey`;

-- AlterTable
ALTER TABLE `andon_event` ADD COLUMN `kategori` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `laporan_realisasi_produksi` ADD COLUMN `counter_end` INTEGER NULL,
    ADD COLUMN `counter_start` INTEGER NULL,
    ADD COLUMN `no_reg` VARCHAR(191) NOT NULL;

-- AlterTable
ALTER TABLE `master_masalah_andon` MODIFY `waktu_perbaikan_menit` INTEGER NOT NULL;

-- AlterTable
ALTER TABLE `poin_disiplin` ADD COLUMN `bukti_foto` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `rencana_produksi` MODIFY `status` ENUM('PLANNED', 'ACTIVE', 'CLOSED') NOT NULL DEFAULT 'PLANNED';

-- AlterTable
ALTER TABLE `user` ADD COLUMN `no_reg` VARCHAR(191) NULL;

-- DropTable
DROP TABLE `lrp_log`;

-- DropTable
DROP TABLE `produksi_log`;
