/*
  Warnings:

  - A unique constraint covering the columns `[email]` on the table `user` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE `mesin` ADD COLUMN `ideal_cycle_time` DOUBLE NULL;

-- AlterTable
ALTER TABLE `user` ADD COLUMN `email` VARCHAR(191) NULL,
    ADD COLUMN `password` VARCHAR(191) NULL,
    ADD COLUMN `plant` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `master_masalah_andon` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `kode_masalah` VARCHAR(191) NOT NULL,
    `nama_masalah` VARCHAR(191) NOT NULL,
    `kategori` VARCHAR(191) NOT NULL,
    `is_downtime` BOOLEAN NOT NULL DEFAULT true,
    `deskripsi` TEXT NULL,

    UNIQUE INDEX `master_masalah_andon_kode_masalah_key`(`kode_masalah`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `andon_event` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `fk_id_mesin` INTEGER NOT NULL,
    `fk_id_masalah` INTEGER NOT NULL,
    `fk_id_operator` INTEGER NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'ACTIVE',
    `waktu_trigger` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `waktu_resolved` DATETIME(3) NULL,
    `durasi_downtime` INTEGER NULL,
    `catatan` TEXT NULL,
    `resolved_by` INTEGER NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `produksi_log` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `fk_id_mesin` INTEGER NOT NULL,
    `fk_id_shift` INTEGER NOT NULL,
    `fk_id_operator` INTEGER NULL,
    `total_target` INTEGER NOT NULL,
    `total_ok` INTEGER NOT NULL DEFAULT 0,
    `total_ng` INTEGER NOT NULL DEFAULT 0,
    `jam_mulai` DATETIME(3) NOT NULL,
    `jam_selesai` DATETIME(3) NOT NULL,
    `tanggal` DATE NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `oee` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `fk_id_mesin` INTEGER NOT NULL,
    `fk_id_shift` INTEGER NULL,
    `availability` DOUBLE NOT NULL DEFAULT 0,
    `performance` DOUBLE NOT NULL DEFAULT 0,
    `quality` DOUBLE NOT NULL DEFAULT 0,
    `oee_score` DOUBLE NOT NULL DEFAULT 0,
    `loading_time` INTEGER NOT NULL,
    `downtime` INTEGER NOT NULL DEFAULT 0,
    `total_output` INTEGER NOT NULL DEFAULT 0,
    `total_ok` INTEGER NOT NULL DEFAULT 0,
    `tanggal` DATE NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `oee_fk_id_mesin_tanggal_fk_id_shift_key`(`fk_id_mesin`, `tanggal`, `fk_id_shift`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `user_email_key` ON `user`(`email`);

-- AddForeignKey
ALTER TABLE `andon_event` ADD CONSTRAINT `andon_event_fk_id_mesin_fkey` FOREIGN KEY (`fk_id_mesin`) REFERENCES `mesin`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `andon_event` ADD CONSTRAINT `andon_event_fk_id_masalah_fkey` FOREIGN KEY (`fk_id_masalah`) REFERENCES `master_masalah_andon`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `andon_event` ADD CONSTRAINT `andon_event_fk_id_operator_fkey` FOREIGN KEY (`fk_id_operator`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `andon_event` ADD CONSTRAINT `andon_event_resolved_by_fkey` FOREIGN KEY (`resolved_by`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `produksi_log` ADD CONSTRAINT `produksi_log_fk_id_mesin_fkey` FOREIGN KEY (`fk_id_mesin`) REFERENCES `mesin`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `produksi_log` ADD CONSTRAINT `produksi_log_fk_id_shift_fkey` FOREIGN KEY (`fk_id_shift`) REFERENCES `shift`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `produksi_log` ADD CONSTRAINT `produksi_log_fk_id_operator_fkey` FOREIGN KEY (`fk_id_operator`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `oee` ADD CONSTRAINT `oee_fk_id_mesin_fkey` FOREIGN KEY (`fk_id_mesin`) REFERENCES `mesin`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `oee` ADD CONSTRAINT `oee_fk_id_shift_fkey` FOREIGN KEY (`fk_id_shift`) REFERENCES `shift`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
