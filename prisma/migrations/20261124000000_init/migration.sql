-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "plan" AS ENUM ('free', 'starter', 'pro');

-- CreateEnum
CREATE TYPE "asset_status" AS ENUM ('none', 'queued', 'processing', 'ready', 'failed', 'manual');

-- CreateEnum
CREATE TYPE "asset_view" AS ENUM ('photo', 'top');

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "is_online" BOOLEAN NOT NULL DEFAULT false,
    "scope" TEXT,
    "expires" TIMESTAMP(3),
    "access_token" TEXT NOT NULL,
    "user_id" BIGINT,
    "first_name" TEXT,
    "last_name" TEXT,
    "email" TEXT,
    "account_owner" BOOLEAN NOT NULL DEFAULT false,
    "locale" TEXT,
    "collaborator" BOOLEAN DEFAULT false,
    "email_verified" BOOLEAN DEFAULT false,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shops" (
    "shop" TEXT NOT NULL,
    "plan" "plan" NOT NULL DEFAULT 'free',
    "used_this_period" INTEGER NOT NULL DEFAULT 0,
    "period_start" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "installed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uninstalled_at" TIMESTAMP(3),

    CONSTRAINT "shops_pkey" PRIMARY KEY ("shop")
);

-- CreateTable
CREATE TABLE "try_on_assets" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "product_title" TEXT NOT NULL DEFAULT '',
    "source_media_id" TEXT,
    "source_url" TEXT,
    "status" "asset_status" NOT NULL DEFAULT 'none',
    "result_file_id" TEXT,
    "result_url" TEXT,
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "scale" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "offset_y" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "view" "asset_view" NOT NULL DEFAULT 'photo',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "try_on_assets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sessions_shop_idx" ON "sessions"("shop");

-- CreateIndex
CREATE INDEX "try_on_assets_shop_status_idx" ON "try_on_assets"("shop", "status");

-- CreateIndex
CREATE INDEX "try_on_assets_status_updated_at_idx" ON "try_on_assets"("status", "updated_at");

-- CreateIndex
CREATE UNIQUE INDEX "try_on_assets_shop_product_id_key" ON "try_on_assets"("shop", "product_id");

