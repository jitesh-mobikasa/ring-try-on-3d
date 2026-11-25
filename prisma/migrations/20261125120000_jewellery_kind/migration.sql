-- Rings and bracelets: what each product is (detected from Shopify, or chosen by the merchant)
CREATE TYPE "jewellery_kind" AS ENUM ('ring', 'bracelet', 'other');

ALTER TABLE "try_on_assets"
  ADD COLUMN "kind" "jewellery_kind" NOT NULL DEFAULT 'ring',
  ADD COLUMN "kind_manual" BOOLEAN NOT NULL DEFAULT false;
