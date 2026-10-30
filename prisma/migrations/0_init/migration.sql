-- CreateTable
CREATE TABLE `contacts` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `email` VARCHAR(191) NOT NULL,
    `firstName` VARCHAR(191) NULL,
    `lastName` VARCHAR(191) NULL,
    `fullName` VARCHAR(191) NULL,
    `phone` VARCHAR(191) NULL,
    `company` VARCHAR(191) NULL,
    `designation` VARCHAR(191) NULL,
    `industry` VARCHAR(191) NULL,
    `website` VARCHAR(191) NULL,
    `country` VARCHAR(191) NULL,
    `city` VARCHAR(191) NULL,
    `address` VARCHAR(191) NULL,
    `linkedin` VARCHAR(191) NULL,
    `twitter` VARCHAR(191) NULL,
    `facebook` VARCHAR(191) NULL,
    `whatsapp` VARCHAR(191) NULL,
    `sms` VARCHAR(191) NULL,
    `notes` TEXT NULL,
    `source` VARCHAR(191) NULL,
    `status` ENUM('subscribed', 'unsubscribed', 'bounced', 'complained') NOT NULL DEFAULT 'subscribed',
    `blocked` BOOLEAN NOT NULL DEFAULT false,
    `userId` VARCHAR(191) NOT NULL,
    `tags` VARCHAR(191) NULL,
    `ownerId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `contacts_email_key`(`email`),
    INDEX `contacts_status_idx`(`status`),
    INDEX `contacts_company_idx`(`company`),
    INDEX `contacts_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `folders` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `brevoId` INTEGER NULL,
    `userId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `folders_brevoId_key`(`brevoId`),
    INDEX `folders_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `lists` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `brevoId` INTEGER NULL,
    `userId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NULL DEFAULT 'list',
    `folderId` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `lists_brevoId_key`(`brevoId`),
    INDEX `lists_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `contact_lists` (
    `contactId` INTEGER NOT NULL,
    `listId` INTEGER NOT NULL,

    INDEX `contact_lists_listId_idx`(`listId`),
    PRIMARY KEY (`contactId`, `listId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `campaigns` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `subject` VARCHAR(191) NOT NULL,
    `fromName` VARCHAR(191) NOT NULL,
    `fromEmail` VARCHAR(191) NOT NULL,
    `replyToEmail` TEXT NULL,
    `replyToName` VARCHAR(191) NULL,
    `replyToListId` INTEGER NULL,
    `previewText` VARCHAR(191) NULL,
    `userId` VARCHAR(191) NOT NULL,
    `templateHtml` LONGTEXT NOT NULL,
    `audienceType` ENUM('list', 'segment') NOT NULL,
    `audienceId` INTEGER NOT NULL,
    `audienceListIds` TEXT NULL,
    `excludeListIds` TEXT NULL,
    `individualEmails` LONGTEXT NULL,
    `skipUnengaged` BOOLEAN NOT NULL DEFAULT false,
    `status` ENUM('draft', 'scheduled', 'sending', 'sent', 'paused') NOT NULL DEFAULT 'draft',
    `scheduledAt` DATETIME(3) NULL,
    `sentAt` DATETIME(3) NULL,
    `totalRecipients` INTEGER NOT NULL DEFAULT 0,
    `leaseOwner` VARCHAR(191) NULL,
    `leaseUntil` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `campaigns_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `email_events` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `email` VARCHAR(191) NOT NULL,
    `campaignId` INTEGER NULL,
    `eventType` ENUM('sent', 'delivered', 'opened', 'clicked', 'bounced', 'complained', 'unsubscribed', 'rejected', 'rendering_failure', 'delayed') NOT NULL,
    `url` VARCHAR(2000) NULL,
    `userAgent` VARCHAR(500) NULL,
    `dedupKey` VARCHAR(255) NULL,
    `timestamp` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `email_events_dedupKey_key`(`dedupKey`),
    INDEX `email_events_email_idx`(`email`),
    INDEX `email_events_campaignId_eventType_idx`(`campaignId`, `eventType`),
    INDEX `email_events_eventType_idx`(`eventType`),
    INDEX `email_events_timestamp_idx`(`timestamp`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `campaign_recipients` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `campaignId` INTEGER NOT NULL,
    `contactId` INTEGER NULL,
    `email` VARCHAR(191) NOT NULL,
    `status` ENUM('queued', 'sent', 'failed', 'skipped') NOT NULL DEFAULT 'queued',
    `error` VARCHAR(500) NULL,
    `sentAt` DATETIME(3) NULL,

    INDEX `campaign_recipients_campaignId_status_idx`(`campaignId`, `status`),
    UNIQUE INDEX `campaign_recipients_campaignId_email_key`(`campaignId`, `email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `automations` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `trigger` VARCHAR(191) NULL,
    `userId` VARCHAR(191) NOT NULL,
    `stepsJson` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `automations_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `contact_automations` (
    `contactId` INTEGER NOT NULL,
    `automationId` INTEGER NOT NULL,
    `enrolledAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`contactId`, `automationId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `companies` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `brevoId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `domain` VARCHAR(191) NULL,
    `owner` VARCHAR(191) NULL,
    `phoneNumber` VARCHAR(191) NULL,
    `revenue` DOUBLE NULL,
    `industry` VARCHAR(191) NULL,
    `numberOfEmployees` INTEGER NULL,
    `numberOfContacts` INTEGER NOT NULL DEFAULT 0,
    `linkedContactsIds` JSON NULL,
    `userId` VARCHAR(191) NOT NULL,
    `linkedDealsIds` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `companies_brevoId_key`(`brevoId`),
    INDEX `companies_name_idx`(`name`),
    INDEX `companies_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `segments` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `brevoId` INTEGER NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `segmentType` VARCHAR(191) NULL,
    `userId` VARCHAR(191) NOT NULL,
    `contactCount` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `segments_brevoId_key`(`brevoId`),
    INDEX `segments_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `templates` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `subject` VARCHAR(191) NULL,
    `contentHtml` LONGTEXT NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `previewText` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `templates_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `senders` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `senders_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `email_domains` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `domain` VARCHAR(191) NOT NULL,
    `verificationStatus` VARCHAR(191) NOT NULL DEFAULT 'Unverified',
    `dkimStatus` VARCHAR(191) NOT NULL DEFAULT 'Unverified',
    `dkimEnabled` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `email_domains_domain_key`(`domain`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `lists` ADD CONSTRAINT `lists_folderId_fkey` FOREIGN KEY (`folderId`) REFERENCES `folders`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `contact_lists` ADD CONSTRAINT `contact_lists_contactId_fkey` FOREIGN KEY (`contactId`) REFERENCES `contacts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `contact_lists` ADD CONSTRAINT `contact_lists_listId_fkey` FOREIGN KEY (`listId`) REFERENCES `lists`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `contact_automations` ADD CONSTRAINT `contact_automations_contactId_fkey` FOREIGN KEY (`contactId`) REFERENCES `contacts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `contact_automations` ADD CONSTRAINT `contact_automations_automationId_fkey` FOREIGN KEY (`automationId`) REFERENCES `automations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

