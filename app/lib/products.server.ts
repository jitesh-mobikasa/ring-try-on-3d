/* Live reads from Shopify. The dashboard list and "Generate all" use our own copy (app/lib/catalog.server.ts,
   "Sync products"); this file only holds the product page's extra details. */
import { gql, type Admin } from "./graphql.server";

/** Extra details for the product page (store link + a price for the preview). */
export async function productStoreInfo(admin: Admin, productId: string): Promise<{ url: string | null; price: number }> {
  const { product } = await gql<{ product: { onlineStoreUrl: string | null; variants: { nodes: { price: string }[] } } | null }>(
    admin,
    `#graphql
    query V($id: ID!) { product(id: $id) { onlineStoreUrl variants(first: 1) { nodes { price } } } }`,
    { id: productId },
  );
  return { url: product?.onlineStoreUrl ?? null, price: Number(product?.variants.nodes[0]?.price ?? 0) };
}
