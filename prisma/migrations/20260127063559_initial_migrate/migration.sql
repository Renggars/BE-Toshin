/*
  Warnings:

  - You are about to drop the column `createdAt` on the `user` table. All the data in the column will be lost.
  - You are about to drop the column `email` on the `user` table. All the data in the column will be lost.
  - You are about to drop the column `password` on the `user` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `user` table. All the data in the column will be lost.
  - You are about to drop the column `username` on the `user` table. All the data in the column will be lost.
  - You are about to alter the column `role` on the `user` table. The data in that column could be lost. The data in that column will be cast from `Enum(EnumId(0))` to `Enum(EnumId(0))`.
  - You are about to drop the `category` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `menu` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `order` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `orderitem` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[uid_nfc]` on the table `user` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `fk_id_divisi` to the `user` table without a default value. This is not possible if the table is not empty.
  - Added the required column `nama` to the `user` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE `menu` DROP FOREIGN KEY `Menu_categoryId_fkey`;

-- DropForeignKey
ALTER TABLE `order` DROP FOREIGN KEY `Order_cashierId_fkey`;

-- DropForeignKey
ALTER TABLE `orderitem` DROP FOREIGN KEY `OrderItem_menuId_fkey`;

-- DropForeignKey
ALTER TABLE `orderitem` DROP FOREIGN KEY `OrderItem_orderId_fkey`;

-- DropIndex
DROP INDEX `User_email_key` ON `user`;

-- AlterTable
ALTER TABLE `user` DROP COLUMN `createdAt`,
    DROP COLUMN `email`,
    DROP COLUMN `password`,
    DROP COLUMN `updatedAt`,
    DROP COLUMN `username`,
    ADD COLUMN `current_point` INTEGER NOT NULL DEFAULT 100,
    ADD COLUMN `fk_id_divisi` INTEGER NOT NULL,
    ADD COLUMN `foto_profile` VARCHAR(191) NULL,
    ADD COLUMN `nama` VARCHAR(191) NOT NULL,
    ADD COLUMN `point_cycle_start` DATETIME(3) NULL,
    ADD COLUMN `status` VARCHAR(191) NULL DEFAULT 'active',
    ADD COLUMN `suspended_until` DATETIME(3) NULL,
    ADD COLUMN `uid_nfc` VARCHAR(191) NULL,
    MODIFY `role` ENUM('OPERATOR', 'SUPERVISOR', 'ENGINEERING', 'MAINTENANCE') NOT NULL DEFAULT 'OPERATOR';

-- DropTable
DROP TABLE `category`;

-- DropTable
DROP TABLE `menu`;

-- DropTable
DROP TABLE `order`;

-- DropTable
DROP TABLE `orderitem`;

-- CreateTable
CREATE TABLE `divisi` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nama_divisi` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `divisi_nama_divisi_key`(`nama_divisi`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `attendance` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `fk_id_user` INTEGER NOT NULL,
    `fk_id_rencana_produksi` INTEGER NOT NULL,
    `jam_tap` DATETIME(3) NOT NULL,
    `tanggal` DATE NOT NULL,
    `is_terlambat` BOOLEAN NOT NULL DEFAULT false,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `mesin` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nama_mesin` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `mesin_nama_mesin_key`(`nama_mesin`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `produk` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nama_produk` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `produk_nama_produk_key`(`nama_produk`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `jenis_pekerjaan` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nama_pekerjaan` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `jenis_pekerjaan_nama_pekerjaan_key`(`nama_pekerjaan`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `target` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `fk_jenis_pekerjaan` INTEGER NOT NULL,
    `fk_produk` INTEGER NOT NULL,
    `total_target` INTEGER NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `shift` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `tipe_shift` VARCHAR(191) NOT NULL,
    `nama_shift` VARCHAR(191) NOT NULL,
    `jam_masuk` VARCHAR(191) NOT NULL,
    `jam_keluar` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `shift_nama_shift_key`(`nama_shift`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `rencana_produksi` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `fk_id_user` INTEGER NOT NULL,
    `fk_id_mesin` INTEGER NOT NULL,
    `fk_id_produk` INTEGER NOT NULL,
    `fk_id_shift` INTEGER NOT NULL,
    `fk_id_target` INTEGER NOT NULL,
    `tanggal` DATE NOT NULL,
    `keterangan` TEXT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `tipe_disiplin` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `kode` VARCHAR(191) NOT NULL,
    `nama_tipe_disiplin` VARCHAR(191) NOT NULL,
    `poin` INTEGER NOT NULL,
    `kategori` VARCHAR(191) NULL,

    UNIQUE INDEX `tipe_disiplin_kode_key`(`kode`),
    UNIQUE INDEX `tipe_disiplin_nama_tipe_disiplin_key`(`nama_tipe_disiplin`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `poin_disiplin` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `poin_berubah` INTEGER NOT NULL,
    `status_level` VARCHAR(191) NOT NULL,
    `fk_id_operator` INTEGER NOT NULL,
    `fk_id_staff` INTEGER NOT NULL,
    `fk_tipe_disiplin` INTEGER NOT NULL,
    `tanggal` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `user_uid_nfc_key` ON `user`(`uid_nfc`);

-- AddForeignKey
ALTER TABLE `user` ADD CONSTRAINT `user_fk_id_divisi_fkey` FOREIGN KEY (`fk_id_divisi`) REFERENCES `divisi`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `attendance` ADD CONSTRAINT `attendance_fk_id_user_fkey` FOREIGN KEY (`fk_id_user`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `attendance` ADD CONSTRAINT `attendance_fk_id_rencana_produksi_fkey` FOREIGN KEY (`fk_id_rencana_produksi`) REFERENCES `rencana_produksi`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `target` ADD CONSTRAINT `target_fk_produk_fkey` FOREIGN KEY (`fk_produk`) REFERENCES `produk`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `target` ADD CONSTRAINT `target_fk_jenis_pekerjaan_fkey` FOREIGN KEY (`fk_jenis_pekerjaan`) REFERENCES `jenis_pekerjaan`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `rencana_produksi` ADD CONSTRAINT `rencana_produksi_fk_id_user_fkey` FOREIGN KEY (`fk_id_user`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `rencana_produksi` ADD CONSTRAINT `rencana_produksi_fk_id_mesin_fkey` FOREIGN KEY (`fk_id_mesin`) REFERENCES `mesin`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `rencana_produksi` ADD CONSTRAINT `rencana_produksi_fk_id_produk_fkey` FOREIGN KEY (`fk_id_produk`) REFERENCES `produk`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `rencana_produksi` ADD CONSTRAINT `rencana_produksi_fk_id_shift_fkey` FOREIGN KEY (`fk_id_shift`) REFERENCES `shift`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `rencana_produksi` ADD CONSTRAINT `rencana_produksi_fk_id_target_fkey` FOREIGN KEY (`fk_id_target`) REFERENCES `target`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `poin_disiplin` ADD CONSTRAINT `poin_disiplin_fk_id_operator_fkey` FOREIGN KEY (`fk_id_operator`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `poin_disiplin` ADD CONSTRAINT `poin_disiplin_fk_id_staff_fkey` FOREIGN KEY (`fk_id_staff`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `poin_disiplin` ADD CONSTRAINT `poin_disiplin_fk_tipe_disiplin_fkey` FOREIGN KEY (`fk_tipe_disiplin`) REFERENCES `tipe_disiplin`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
