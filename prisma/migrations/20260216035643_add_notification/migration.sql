/*
  Warnings:

  - You are about to alter the column `durasi_menit` on the `andon_downtime_shift` table. The data in that column could be lost. The data in that column will be cast from `Int` to `Double`.
  - You are about to drop the column `catatan` on the `andon_event` table. All the data in the column will be lost.
  - You are about to alter the column `durasi_downtime` on the `andon_event` table. The data in that column could be lost. The data in that column will be cast from `Int` to `Double`.
  - You are about to alter the column `kategori` on the `master_masalah_andon` table. The data in that column could be lost. The data in that column will be cast from `VarChar(191)` to `Enum(EnumId(4))`.
  - A unique constraint covering the columns `[fk_id_rph]` on the table `laporan_realisasi_produksi` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `fk_id_rph` to the `laporan_realisasi_produksi` table without a default value. This is not possible if the table is not empty.
  - Made the column `email` on table `user` required. This step will fail if there are existing NULL values in that column.
  - Made the column `password` on table `user` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE `andon_downtime_shift` ADD COLUMN `fk_id_rph` INTEGER NULL,
    MODIFY `durasi_menit` DOUBLE NOT NULL;

-- AlterTable
ALTER TABLE `andon_event` DROP COLUMN `catatan`,
    ADD COLUMN `fk_id_rph_closed` INTEGER NULL,
    ADD COLUMN `fk_id_rph_opened` INTEGER NULL,
    ADD COLUMN `is_late` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `late_menit` DOUBLE NULL,
    ADD COLUMN `total_duration_menit` DOUBLE NULL,
    ADD COLUMN `waktu_repair` DATETIME(3) NULL,
    MODIFY `status` ENUM('ACTIVE', 'IN_REPAIR', 'RESOLVED') NOT NULL DEFAULT 'ACTIVE',
    MODIFY `durasi_downtime` DOUBLE NULL;

-- AlterTable
ALTER TABLE `laporan_realisasi_produksi` ADD COLUMN `fk_id_rph` INTEGER NOT NULL;

-- AlterTable
ALTER TABLE `master_masalah_andon` MODIFY `kategori` ENUM('MAINTENANCE', 'QUALITY', 'DIE_MAINT', 'PRODUKSI', 'PLAN_DOWNTIME') NOT NULL;

-- AlterTable
ALTER TABLE `oee` ADD COLUMN `ideal_cycle_time` DOUBLE NULL;

-- AlterTable
ALTER TABLE `rencana_produksi` ADD COLUMN `end_time` DATETIME(3) NULL,
    ADD COLUMN `start_time` DATETIME(3) NULL,
    ADD COLUMN `status` ENUM('PLANNED', 'WAITING_START', 'ACTIVE', 'CLOSED') NOT NULL DEFAULT 'PLANNED';

-- AlterTable
ALTER TABLE `user` MODIFY `email` VARCHAR(191) NOT NULL,
    MODIFY `password` VARCHAR(191) NOT NULL;

-- CreateTable
CREATE TABLE `andon_call` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `fk_id_mesin` INTEGER NOT NULL,
    `fk_id_shift` INTEGER NULL,
    `fk_id_operator` INTEGER NOT NULL,
    `fk_id_target_divisi` INTEGER NOT NULL,
    `target_divisi` ENUM('MAINTENANCE', 'QUALITY', 'PRODUKSI', 'DIE_MAINT') NOT NULL,
    `waktu_call` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `status` ENUM('WAITING', 'CONVERTED', 'CANCELLED') NOT NULL DEFAULT 'WAITING',
    `converted_event` INTEGER NULL,
    `tanggal` DATE NOT NULL,
    `plant` VARCHAR(191) NULL,

    INDEX `andon_call_status_idx`(`status`),
    INDEX `andon_call_target_divisi_idx`(`target_divisi`),
    INDEX `andon_call_fk_id_target_divisi_idx`(`fk_id_target_divisi`),
    INDEX `andon_call_tanggal_idx`(`tanggal`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `notification` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `fk_id_user` INTEGER NOT NULL,
    `tipe` ENUM('RPH_ASSIGNED', 'ANDON_CALL', 'ANDON_RESOLVED') NOT NULL,
    `judul` VARCHAR(191) NOT NULL,
    `pesan` TEXT NOT NULL,
    `is_read` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `notification_fk_id_user_idx`(`fk_id_user`),
    INDEX `notification_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `andon_event_status_waktu_trigger_fk_id_mesin_idx` ON `andon_event`(`status`, `waktu_trigger`, `fk_id_mesin`);

-- CreateIndex
CREATE UNIQUE INDEX `laporan_realisasi_produksi_fk_id_rph_key` ON `laporan_realisasi_produksi`(`fk_id_rph`);

-- CreateIndex
CREATE INDEX `laporan_realisasi_produksi_created_at_idx` ON `laporan_realisasi_produksi`(`created_at`);

-- AddForeignKey
ALTER TABLE `andon_downtime_shift` ADD CONSTRAINT `andon_downtime_shift_fk_id_rph_fkey` FOREIGN KEY (`fk_id_rph`) REFERENCES `rencana_produksi`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `laporan_realisasi_produksi` ADD CONSTRAINT `laporan_realisasi_produksi_fk_id_rph_fkey` FOREIGN KEY (`fk_id_rph`) REFERENCES `rencana_produksi`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `andon_call` ADD CONSTRAINT `andon_call_fk_id_mesin_fkey` FOREIGN KEY (`fk_id_mesin`) REFERENCES `mesin`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `andon_call` ADD CONSTRAINT `andon_call_fk_id_operator_fkey` FOREIGN KEY (`fk_id_operator`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `andon_call` ADD CONSTRAINT `andon_call_fk_id_shift_fkey` FOREIGN KEY (`fk_id_shift`) REFERENCES `shift`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `andon_call` ADD CONSTRAINT `andon_call_converted_event_fkey` FOREIGN KEY (`converted_event`) REFERENCES `andon_event`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `andon_call` ADD CONSTRAINT `andon_call_fk_id_target_divisi_fkey` FOREIGN KEY (`fk_id_target_divisi`) REFERENCES `divisi`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `notification` ADD CONSTRAINT `notification_fk_id_user_fkey` FOREIGN KEY (`fk_id_user`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
