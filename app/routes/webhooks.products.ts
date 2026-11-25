/* products/create + products/update
   Keeps our copy of the product (Product table, used by the dashboard) up to date, and the product title on
   its try-on record. Nothing is generated automatically — the merchant clicks "Generate" in the app.
   (A changed photo shows as "Photo changed" in the dashboard, so the merchant can Regenerate.) */
import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { syncOne } from "../lib/catalog.server";
import type { Admin } from "../lib/graphql.server";

interface ProductPayload { admin_graphql_api_id?: string; title?: string }

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, payload, admin } = await authenticate.webhook(request);
  const { admin_graphql_api_id: productId, title } = payload as ProductPayload;
  if (!productId) return new Response();
  if (title) {
    await db.tryOnAsset.updateMany({
      where: { shop, productId, NOT: { productTitle: title } },
      data: { productTitle: title },
    });
  }
  // Re-read the product (one small query) so category and the main photo are exact.
  // A failure is fine: the next "Sync products" fixes it, and Shopify would retry on an error status.
  if (admin) await syncOne(shop, admin as unknown as Admin, productId).catch((e) => console.error("[webhook products]", e));
  return new Response();
};
