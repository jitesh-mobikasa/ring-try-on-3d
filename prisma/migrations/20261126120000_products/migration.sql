-- AlterTable
ALTER TABLE "shops" ADD COLUMN "products_synced_at" TIMESTAMP(3),
ADD COLUMN "sync_started_at" TIMESTAMP(3),
ADD COLUMN "sync_error" TEXT;

-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "handle" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "product_type" TEXT NOT NULL DEFAULT '',
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "category" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "thumb_url" TEXT,
    "media_id" TEXT,
    "media_url" TEXT,
    "detected_kind" "jewellery_kind" NOT NULL DEFAULT 'ring',
    "shopify_updated_at" TIMESTAMP(3),
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "products_shop_product_id_key" ON "products"("shop", "product_id");
CREATE INDEX "products_shop_detected_kind_idx" ON "products"("shop", "detected_kind");
CREATE INDEX "products_shop_shopify_updated_at_idx" ON "products"("shop", "shopify_updated_at");
