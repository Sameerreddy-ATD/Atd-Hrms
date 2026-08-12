-- AlterTable
ALTER TABLE `push_subscriptions`
  ADD COLUMN `channel` VARCHAR(16) NOT NULL DEFAULT 'web';

-- CreateIndex
CREATE INDEX `push_subscriptions_channel_idx` ON `push_subscriptions`(`channel`);
