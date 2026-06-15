-- CreateTable
CREATE TABLE `app_version` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `platform` VARCHAR(191) NOT NULL,
    `version` VARCHAR(50) NOT NULL,
    `build_number` INTEGER NOT NULL,
    `release_date` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `download_url` VARCHAR(500) NOT NULL,
    `release_notes` TEXT NOT NULL,
    `force_update` BOOLEAN NOT NULL DEFAULT false,
    `min_version` VARCHAR(50) NOT NULL,
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `app_version_platform_key`(`platform`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
