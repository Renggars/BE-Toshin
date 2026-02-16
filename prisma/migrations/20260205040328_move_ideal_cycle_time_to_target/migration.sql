/*
  Warnings:

  - You are about to drop the column `ideal_cycle_time` on the `mesin` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE `mesin` DROP COLUMN `ideal_cycle_time`;

-- AlterTable
ALTER TABLE `target` ADD COLUMN `ideal_cycle_time` DOUBLE NULL;
