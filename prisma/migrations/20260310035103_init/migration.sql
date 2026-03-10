-- CreateTable
CREATE TABLE `divisi` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nama_divisi` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `divisi_nama_divisi_key`(`nama_divisi`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `role` ENUM('PRODUKSI', 'QUALITY', 'MAINTENANCE', 'DIE_MAINT', 'ENGINEERING', 'MARKETING', 'COMMERCIAL', 'PPIC', 'HCPGA', 'WRH_CIBITUNG', 'GA', 'WAREHOUSE', 'PURCHASING', 'HC', 'ACCOUNTING', 'FINANCE', 'SUPERVISOR', 'ADMIN') NOT NULL DEFAULT 'PRODUKSI',
    `current_point` INTEGER NOT NULL DEFAULT 100,
    `fk_id_divisi` INTEGER NOT NULL,
    `foto_profile` VARCHAR(191) NULL,
    `nama` VARCHAR(191) NOT NULL,
    `point_cycle_start` DATETIME(3) NULL DEFAULT CURRENT_TIMESTAMP(3),
    `status` VARCHAR(191) NULL DEFAULT 'active',
    `suspended_until` DATETIME(3) NULL,
    `uid_nfc` VARCHAR(191) NULL,
    `email` VARCHAR(191) NOT NULL,
    `password` VARCHAR(191) NOT NULL,
    `plant` VARCHAR(191) NOT NULL,
    `line` VARCHAR(191) NOT NULL,
    `no_reg` VARCHAR(191) NULL,

    UNIQUE INDEX `user_uid_nfc_key`(`uid_nfc`),
    UNIQUE INDEX `user_email_key`(`email`),
    INDEX `user_fk_id_divisi_fkey`(`fk_id_divisi`),
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

    INDEX `attendance_fk_id_rencana_produksi_fkey`(`fk_id_rencana_produksi`),
    INDEX `attendance_fk_id_user_fkey`(`fk_id_user`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `mesin` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nama_mesin` VARCHAR(191) NOT NULL,
    `kategori` ENUM('PROGRESIVE_TRANSFER', 'FINE_BLANKING', 'SECONDARY', 'PRESS', 'TACI') NOT NULL DEFAULT 'PRESS',

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
    `ideal_cycle_time` DOUBLE NULL,

    INDEX `target_fk_jenis_pekerjaan_fkey`(`fk_jenis_pekerjaan`),
    INDEX `target_fk_produk_fkey`(`fk_produk`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `shift` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `tipe_shift` VARCHAR(191) NOT NULL,
    `nama_shift` VARCHAR(191) NOT NULL,
    `jam_masuk` VARCHAR(191) NOT NULL,
    `jam_keluar` VARCHAR(191) NOT NULL,
    `break_duration` INTEGER NOT NULL DEFAULT 60,
    `briefing_duration` INTEGER NOT NULL DEFAULT 10,
    `cleaning_duration` INTEGER NOT NULL DEFAULT 10,
    `toilet_tolerance_pct` DOUBLE NOT NULL DEFAULT 0.1,

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
    `fk_id_jenis_pekerjaan` INTEGER NOT NULL,
    `end_time` DATETIME(3) NULL,
    `start_time` DATETIME(3) NULL,
    `status` ENUM('PLANNED', 'ACTIVE', 'CLOSED') NOT NULL DEFAULT 'PLANNED',

    INDEX `rencana_produksi_fk_id_jenis_pekerjaan_fkey`(`fk_id_jenis_pekerjaan`),
    INDEX `rencana_produksi_fk_id_mesin_fkey`(`fk_id_mesin`),
    INDEX `rencana_produksi_fk_id_produk_fkey`(`fk_id_produk`),
    INDEX `rencana_produksi_fk_id_shift_fkey`(`fk_id_shift`),
    INDEX `rencana_produksi_fk_id_target_fkey`(`fk_id_target`),
    INDEX `rencana_produksi_fk_id_user_fkey`(`fk_id_user`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `tipe_disiplin` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `kode` VARCHAR(191) NOT NULL,
    `nama_tipe_disiplin` VARCHAR(191) NOT NULL,
    `poin` INTEGER NOT NULL,
    `kategori` ENUM('PELANGGARAN', 'PENGHARGAAN') NOT NULL,

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
    `fk_id_shift` INTEGER NULL,
    `bukti_foto` VARCHAR(191) NULL,
    `keterangan` TEXT NULL,

    INDEX `poin_disiplin_fk_id_operator_fkey`(`fk_id_operator`),
    INDEX `poin_disiplin_fk_id_shift_fkey`(`fk_id_shift`),
    INDEX `poin_disiplin_fk_id_staff_fkey`(`fk_id_staff`),
    INDEX `poin_disiplin_fk_tipe_disiplin_fkey`(`fk_tipe_disiplin`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `master_masalah_andon` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nama_masalah` VARCHAR(191) NOT NULL,
    `kategori` ENUM('MAINTENANCE', 'QUALITY', 'DIE_MAINT', 'PRODUKSI', 'PLAN_DOWNTIME') NOT NULL,
    `waktu_perbaikan_menit` INTEGER NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `andon_event` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `fk_id_mesin` INTEGER NOT NULL,
    `fk_id_masalah` INTEGER NOT NULL,
    `fk_id_operator` INTEGER NULL,
    `status` ENUM('ACTIVE', 'IN_REPAIR', 'RESOLVED') NOT NULL DEFAULT 'ACTIVE',
    `waktu_trigger` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `waktu_resolved` DATETIME(3) NULL,
    `durasi_downtime` DOUBLE NULL,
    `resolved_by` INTEGER NULL,
    `fk_id_shift` INTEGER NULL,
    `plant` VARCHAR(191) NULL,
    `respon_status` ENUM('ON_TIME', 'OVER_TIME') NULL,
    `tanggal` DATE NOT NULL,
    `kategori` VARCHAR(191) NULL,
    `waktu_repair` DATETIME(3) NULL,
    `fk_id_rph_closed` INTEGER NULL,
    `fk_id_rph_opened` INTEGER NULL,
    `is_late` BOOLEAN NOT NULL DEFAULT false,
    `late_menit` DOUBLE NULL,
    `total_duration_menit` DOUBLE NULL,

    INDEX `andon_event_status_waktu_trigger_fk_id_mesin_idx`(`status`, `waktu_trigger`, `fk_id_mesin`),
    INDEX `andon_event_fk_id_shift_idx`(`fk_id_shift`),
    INDEX `andon_event_tanggal_idx`(`tanggal`),
    INDEX `andon_event_plant_idx`(`plant`),
    INDEX `andon_event_waktu_trigger_idx`(`waktu_trigger`),
    INDEX `andon_event_status_idx`(`status`),
    INDEX `andon_event_fk_id_masalah_fkey`(`fk_id_masalah`),
    INDEX `andon_event_fk_id_mesin_fkey`(`fk_id_mesin`),
    INDEX `andon_event_fk_id_operator_fkey`(`fk_id_operator`),
    INDEX `andon_event_resolved_by_fkey`(`resolved_by`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `andon_downtime_shift` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `fk_id_andon` INTEGER NOT NULL,
    `fk_id_shift` INTEGER NOT NULL,
    `fk_id_mesin` INTEGER NOT NULL,
    `waktu_start` DATETIME(3) NOT NULL,
    `waktu_end` DATETIME(3) NOT NULL,
    `durasi_menit` DOUBLE NOT NULL,
    `tanggal` DATE NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `fk_id_rph` INTEGER NULL,

    INDEX `andon_downtime_shift_tanggal_idx`(`tanggal`),
    INDEX `andon_downtime_shift_fk_id_andon_fkey`(`fk_id_andon`),
    INDEX `andon_downtime_shift_fk_id_mesin_fkey`(`fk_id_mesin`),
    INDEX `andon_downtime_shift_fk_id_shift_fkey`(`fk_id_shift`),
    INDEX `andon_downtime_shift_fk_id_rph_fkey`(`fk_id_rph`),
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
    `ideal_cycle_time` DOUBLE NULL,

    INDEX `oee_fk_id_shift_fkey`(`fk_id_shift`),
    UNIQUE INDEX `oee_fk_id_mesin_tanggal_fk_id_shift_key`(`fk_id_mesin`, `tanggal`, `fk_id_shift`),
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
    `no_reg` VARCHAR(191) NOT NULL,
    `counter_start` INTEGER NULL,
    `counter_end` INTEGER NULL,
    `fk_id_rph` INTEGER NOT NULL,

    UNIQUE INDEX `laporan_realisasi_produksi_fk_id_rph_key`(`fk_id_rph`),
    INDEX `laporan_realisasi_produksi_fk_id_mesin_fkey`(`fk_id_mesin`),
    INDEX `laporan_realisasi_produksi_fk_id_operator_fkey`(`fk_id_operator`),
    INDEX `laporan_realisasi_produksi_fk_id_shift_fkey`(`fk_id_shift`),
    INDEX `laporan_realisasi_produksi_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `andon_call` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `fk_id_mesin` INTEGER NOT NULL,
    `fk_id_shift` INTEGER NULL,
    `fk_id_operator` INTEGER NOT NULL,
    `waktu_call` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `status` ENUM('WAITING', 'CONVERTED', 'CANCELLED') NOT NULL DEFAULT 'WAITING',
    `converted_event` INTEGER NULL,
    `tanggal` DATE NOT NULL,
    `plant` VARCHAR(191) NULL,
    `target_divisi` ENUM('MAINTENANCE', 'QUALITY', 'PRODUKSI', 'DIE_MAINT') NOT NULL,
    `fk_id_target_divisi` INTEGER NOT NULL,

    INDEX `andon_call_status_idx`(`status`),
    INDEX `andon_call_target_divisi_idx`(`target_divisi`),
    INDEX `andon_call_fk_id_target_divisi_idx`(`fk_id_target_divisi`),
    INDEX `andon_call_tanggal_idx`(`tanggal`),
    INDEX `andon_call_converted_event_fkey`(`converted_event`),
    INDEX `andon_call_fk_id_mesin_fkey`(`fk_id_mesin`),
    INDEX `andon_call_fk_id_operator_fkey`(`fk_id_operator`),
    INDEX `andon_call_fk_id_shift_fkey`(`fk_id_shift`),
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

-- AddForeignKey
ALTER TABLE `user` ADD CONSTRAINT `user_fk_id_divisi_fkey` FOREIGN KEY (`fk_id_divisi`) REFERENCES `divisi`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `attendance` ADD CONSTRAINT `attendance_fk_id_rencana_produksi_fkey` FOREIGN KEY (`fk_id_rencana_produksi`) REFERENCES `rencana_produksi`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `attendance` ADD CONSTRAINT `attendance_fk_id_user_fkey` FOREIGN KEY (`fk_id_user`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `target` ADD CONSTRAINT `target_fk_jenis_pekerjaan_fkey` FOREIGN KEY (`fk_jenis_pekerjaan`) REFERENCES `jenis_pekerjaan`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `target` ADD CONSTRAINT `target_fk_produk_fkey` FOREIGN KEY (`fk_produk`) REFERENCES `produk`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `rencana_produksi` ADD CONSTRAINT `rencana_produksi_fk_id_jenis_pekerjaan_fkey` FOREIGN KEY (`fk_id_jenis_pekerjaan`) REFERENCES `jenis_pekerjaan`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `rencana_produksi` ADD CONSTRAINT `rencana_produksi_fk_id_mesin_fkey` FOREIGN KEY (`fk_id_mesin`) REFERENCES `mesin`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `rencana_produksi` ADD CONSTRAINT `rencana_produksi_fk_id_produk_fkey` FOREIGN KEY (`fk_id_produk`) REFERENCES `produk`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `rencana_produksi` ADD CONSTRAINT `rencana_produksi_fk_id_shift_fkey` FOREIGN KEY (`fk_id_shift`) REFERENCES `shift`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `rencana_produksi` ADD CONSTRAINT `rencana_produksi_fk_id_target_fkey` FOREIGN KEY (`fk_id_target`) REFERENCES `target`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `rencana_produksi` ADD CONSTRAINT `rencana_produksi_fk_id_user_fkey` FOREIGN KEY (`fk_id_user`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `poin_disiplin` ADD CONSTRAINT `poin_disiplin_fk_id_operator_fkey` FOREIGN KEY (`fk_id_operator`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `poin_disiplin` ADD CONSTRAINT `poin_disiplin_fk_id_shift_fkey` FOREIGN KEY (`fk_id_shift`) REFERENCES `shift`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `poin_disiplin` ADD CONSTRAINT `poin_disiplin_fk_id_staff_fkey` FOREIGN KEY (`fk_id_staff`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `poin_disiplin` ADD CONSTRAINT `poin_disiplin_fk_tipe_disiplin_fkey` FOREIGN KEY (`fk_tipe_disiplin`) REFERENCES `tipe_disiplin`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `andon_event` ADD CONSTRAINT `andon_event_fk_id_masalah_fkey` FOREIGN KEY (`fk_id_masalah`) REFERENCES `master_masalah_andon`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `andon_event` ADD CONSTRAINT `andon_event_fk_id_mesin_fkey` FOREIGN KEY (`fk_id_mesin`) REFERENCES `mesin`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `andon_event` ADD CONSTRAINT `andon_event_fk_id_operator_fkey` FOREIGN KEY (`fk_id_operator`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `andon_event` ADD CONSTRAINT `andon_event_fk_id_shift_fkey` FOREIGN KEY (`fk_id_shift`) REFERENCES `shift`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `andon_event` ADD CONSTRAINT `andon_event_resolved_by_fkey` FOREIGN KEY (`resolved_by`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `andon_downtime_shift` ADD CONSTRAINT `andon_downtime_shift_fk_id_andon_fkey` FOREIGN KEY (`fk_id_andon`) REFERENCES `andon_event`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `andon_downtime_shift` ADD CONSTRAINT `andon_downtime_shift_fk_id_mesin_fkey` FOREIGN KEY (`fk_id_mesin`) REFERENCES `mesin`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `andon_downtime_shift` ADD CONSTRAINT `andon_downtime_shift_fk_id_rph_fkey` FOREIGN KEY (`fk_id_rph`) REFERENCES `rencana_produksi`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `andon_downtime_shift` ADD CONSTRAINT `andon_downtime_shift_fk_id_shift_fkey` FOREIGN KEY (`fk_id_shift`) REFERENCES `shift`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `oee` ADD CONSTRAINT `oee_fk_id_mesin_fkey` FOREIGN KEY (`fk_id_mesin`) REFERENCES `mesin`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `oee` ADD CONSTRAINT `oee_fk_id_shift_fkey` FOREIGN KEY (`fk_id_shift`) REFERENCES `shift`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `laporan_realisasi_produksi` ADD CONSTRAINT `laporan_realisasi_produksi_fk_id_mesin_fkey` FOREIGN KEY (`fk_id_mesin`) REFERENCES `mesin`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `laporan_realisasi_produksi` ADD CONSTRAINT `laporan_realisasi_produksi_fk_id_operator_fkey` FOREIGN KEY (`fk_id_operator`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `laporan_realisasi_produksi` ADD CONSTRAINT `laporan_realisasi_produksi_fk_id_rph_fkey` FOREIGN KEY (`fk_id_rph`) REFERENCES `rencana_produksi`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `laporan_realisasi_produksi` ADD CONSTRAINT `laporan_realisasi_produksi_fk_id_shift_fkey` FOREIGN KEY (`fk_id_shift`) REFERENCES `shift`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `andon_call` ADD CONSTRAINT `andon_call_converted_event_fkey` FOREIGN KEY (`converted_event`) REFERENCES `andon_event`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `andon_call` ADD CONSTRAINT `andon_call_fk_id_mesin_fkey` FOREIGN KEY (`fk_id_mesin`) REFERENCES `mesin`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `andon_call` ADD CONSTRAINT `andon_call_fk_id_operator_fkey` FOREIGN KEY (`fk_id_operator`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `andon_call` ADD CONSTRAINT `andon_call_fk_id_shift_fkey` FOREIGN KEY (`fk_id_shift`) REFERENCES `shift`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `andon_call` ADD CONSTRAINT `andon_call_fk_id_target_divisi_fkey` FOREIGN KEY (`fk_id_target_divisi`) REFERENCES `divisi`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `notification` ADD CONSTRAINT `notification_fk_id_user_fkey` FOREIGN KEY (`fk_id_user`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
