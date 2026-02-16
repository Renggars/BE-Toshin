/*
  Warnings:

  - You are about to alter the column `status` on the `andon_event` table. The data in that column could be lost. The data in that column will be cast from `VarChar(191)` to `Enum(EnumId(3))`.
  - You are about to drop the column `deskripsi` on the `master_masalah_andon` table. All the data in the column will be lost.
  - You are about to drop the column `is_downtime` on the `master_masalah_andon` table. All the data in the column will be lost.
  - You are about to drop the column `kode_masalah` on the `master_masalah_andon` table. All the data in the column will be lost.
  - You are about to drop the column `waktu_perbaikan` on the `master_masalah_andon` table. All the data in the column will be lost.
  - You are about to alter the column `role` on the `user` table. The data in that column could be lost. The data in that column will be cast from `Enum(EnumId(0))` to `Enum(EnumId(0))`.
  - Added the required column `tanggal` to the `andon_event` table without a default value. This is not possible if the table is not empty.
  - Added the required column `fk_id_jenis_pekerjaan` to the `rencana_produksi` table without a default value. This is not possible if the table is not empty.
  - Made the column `kategori` on table `tipe_disiplin` required. This step will fail if there are existing NULL values in that column.
  - Added the required column `line` to the `user` table without a default value. This is not possible if the table is not empty.
  - Made the column `plant` on table `user` required. This step will fail if there are existing NULL values in that column.

*/
-- DropIndex
DROP INDEX `master_masalah_andon_kode_masalah_key` ON `master_masalah_andon`;

-- DropIndex
DROP INDEX `shift_nama_shift_key` ON `shift`;

-- AlterTable
ALTER TABLE `andon_event` ADD COLUMN `fk_id_shift` INTEGER NULL,
    ADD COLUMN `plant` VARCHAR(191) NULL,
    ADD COLUMN `respon_status` ENUM('ON_TIME', 'OVER_TIME') NULL,
    ADD COLUMN `tanggal` DATE NOT NULL,
    MODIFY `status` ENUM('ACTIVE', 'RESOLVED') NOT NULL DEFAULT 'ACTIVE';

-- AlterTable
ALTER TABLE `master_masalah_andon` DROP COLUMN `deskripsi`,
    DROP COLUMN `is_downtime`,
    DROP COLUMN `kode_masalah`,
    DROP COLUMN `waktu_perbaikan`,
    ADD COLUMN `waktu_perbaikan_menit` INTEGER NULL;

-- AlterTable
ALTER TABLE `mesin` ADD COLUMN `kategori` ENUM('PRESS', 'SECONDARY') NOT NULL DEFAULT 'PRESS';

-- AlterTable
ALTER TABLE `poin_disiplin` ADD COLUMN `fk_id_shift` INTEGER NULL,
    ADD COLUMN `keterangan` TEXT NULL;

-- AlterTable
ALTER TABLE `rencana_produksi` ADD COLUMN `fk_id_jenis_pekerjaan` INTEGER NOT NULL;

-- AlterTable
ALTER TABLE `shift` ADD COLUMN `break_duration` INTEGER NOT NULL DEFAULT 60,
    ADD COLUMN `briefing_duration` INTEGER NOT NULL DEFAULT 10,
    ADD COLUMN `cleaning_duration` INTEGER NOT NULL DEFAULT 10,
    ADD COLUMN `toilet_tolerance_pct` DOUBLE NOT NULL DEFAULT 0.1;

-- AlterTable
ALTER TABLE `tipe_disiplin` MODIFY `kategori` ENUM('PELANGGARAN', 'PENGHARGAAN') NOT NULL;

-- AlterTable
ALTER TABLE `user` ADD COLUMN `line` VARCHAR(191) NOT NULL,
    MODIFY `role` ENUM('PRODUKSI', 'QUALITY', 'MAINTENANCE', 'DIE_MAINT', 'ENGINEERING', 'MARKETING', 'COMMERCIAL', 'PPIC', 'HCPGA', 'WRH_CIBITUNG', 'GA', 'WAREHOUSE', 'PURCHASING', 'HC', 'ACCOUNTING', 'FINANCE', 'ADMIN') NOT NULL DEFAULT 'PRODUKSI',
    MODIFY `point_cycle_start` DATETIME(3) NULL DEFAULT CURRENT_TIMESTAMP(3),
    MODIFY `plant` VARCHAR(191) NOT NULL;

-- CreateTable
CREATE TABLE `andon_downtime_shift` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `fk_id_andon` INTEGER NOT NULL,
    `fk_id_shift` INTEGER NOT NULL,
    `fk_id_mesin` INTEGER NOT NULL,
    `waktu_start` DATETIME(3) NOT NULL,
    `waktu_end` DATETIME(3) NOT NULL,
    `durasi_menit` INTEGER NOT NULL,
    `tanggal` DATE NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `andon_downtime_shift_tanggal_idx`(`tanggal`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `laporan_realisasi_produksi` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `tanggal` DATE NOT NULL,
    `fk_id_mesin` INTEGER NOT NULL,
    `fk_id_shift` INTEGER NOT NULL,
    `fk_id_operator` INTEGER NOT NULL,
    `no_kanagata` VARCHAR(191) NOT NULL,
    `no_lot` VARCHAR(191) NOT NULL,
    `qty_ok` INTEGER NOT NULL DEFAULT 0,
    `qty_ng_prev` INTEGER NOT NULL DEFAULT 0,
    `qty_ng_proses` INTEGER NOT NULL DEFAULT 0,
    `qty_rework` INTEGER NOT NULL DEFAULT 0,
    `qty_total_prod` INTEGER NOT NULL DEFAULT 0,
    `loading_time` DOUBLE NOT NULL DEFAULT 0,
    `cycle_time` DOUBLE NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `status_lrp` VARCHAR(191) NOT NULL DEFAULT 'SUBMITTED',

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `lrp_log` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `fk_id_lrp` INTEGER NOT NULL,
    `waktu_start` DATETIME(3) NOT NULL,
    `waktu_end` DATETIME(3) NOT NULL,
    `durasi_menit` DOUBLE NOT NULL,
    `kode_jam_kerja` ENUM('A', 'D', 'B1', 'B2', 'B3', 'B4', 'C') NOT NULL,
    `kategori_downtime` ENUM('PLAN_DOWNTIME', 'RUNTIME', 'BREAKDOWN') NOT NULL,
    `keterangan` TEXT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `andon_event_fk_id_shift_idx` ON `andon_event`(`fk_id_shift`);

-- CreateIndex
CREATE INDEX `andon_event_tanggal_idx` ON `andon_event`(`tanggal`);

-- CreateIndex
CREATE INDEX `andon_event_plant_idx` ON `andon_event`(`plant`);

-- CreateIndex
CREATE INDEX `andon_event_waktu_trigger_idx` ON `andon_event`(`waktu_trigger`);

-- CreateIndex
CREATE INDEX `andon_event_status_idx` ON `andon_event`(`status`);

-- AddForeignKey
ALTER TABLE `rencana_produksi` ADD CONSTRAINT `rencana_produksi_fk_id_jenis_pekerjaan_fkey` FOREIGN KEY (`fk_id_jenis_pekerjaan`) REFERENCES `jenis_pekerjaan`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `poin_disiplin` ADD CONSTRAINT `poin_disiplin_fk_id_shift_fkey` FOREIGN KEY (`fk_id_shift`) REFERENCES `shift`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `andon_event` ADD CONSTRAINT `andon_event_fk_id_shift_fkey` FOREIGN KEY (`fk_id_shift`) REFERENCES `shift`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `andon_downtime_shift` ADD CONSTRAINT `andon_downtime_shift_fk_id_andon_fkey` FOREIGN KEY (`fk_id_andon`) REFERENCES `andon_event`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `andon_downtime_shift` ADD CONSTRAINT `andon_downtime_shift_fk_id_shift_fkey` FOREIGN KEY (`fk_id_shift`) REFERENCES `shift`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `andon_downtime_shift` ADD CONSTRAINT `andon_downtime_shift_fk_id_mesin_fkey` FOREIGN KEY (`fk_id_mesin`) REFERENCES `mesin`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `laporan_realisasi_produksi` ADD CONSTRAINT `laporan_realisasi_produksi_fk_id_shift_fkey` FOREIGN KEY (`fk_id_shift`) REFERENCES `shift`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `laporan_realisasi_produksi` ADD CONSTRAINT `laporan_realisasi_produksi_fk_id_operator_fkey` FOREIGN KEY (`fk_id_operator`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `laporan_realisasi_produksi` ADD CONSTRAINT `laporan_realisasi_produksi_fk_id_mesin_fkey` FOREIGN KEY (`fk_id_mesin`) REFERENCES `mesin`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lrp_log` ADD CONSTRAINT `lrp_log_fk_id_lrp_fkey` FOREIGN KEY (`fk_id_lrp`) REFERENCES `laporan_realisasi_produksi`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
