-- My Looks: looks saved by logged-in shoppers in the try-on
CREATE TABLE "saved_looks" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "thumbnail" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "saved_looks_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "saved_looks_shop_customer_id_created_at_idx" ON "saved_looks"("shop", "customer_id", "created_at");
