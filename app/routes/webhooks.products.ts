/* products/create + products/update
   Nothing is generated automatically — the merchant clicks "Generate" in the app.
   This only keeps the product title in the dashboard up to date.
   (A changed photo shows as "Photo changed" in the dashboard, so the merchant can Regenerate.) */
import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import db from "../db.server";

interface ProductPayload { admin_graphql_api_id?: string; title?: string }

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, payload } = await authenticate.webhook(request);
  const { admin_graphql_api_id: productId, title } = payload as ProductPayload;
  if (productId && title) {
    await db.tryOnAsset.updateMany({
      where: { shop, productId, NOT: { productTitle: title } },
      data: { productTitle: title },
    });
  }
  return new Response();
};
