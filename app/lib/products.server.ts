/* Live reads from Shopify. The dashboard list now comes from our own copy (app/lib/catalog.server.ts,
   "Sync products"); listProducts / allProducts are kept for the (disabled) bulk generate. */
import { gql, type Admin } from "./graphql.server";
import type { ProductRef } from "./jobs.server";
import { detectKind } from "./shared";

export interface ProductRow extends ProductRef {
  status: "ACTIVE" | "ARCHIVED" | "DRAFT";
  thumb: string | null;
}
export interface PageInfo { hasNextPage: boolean; hasPreviousPage: boolean; startCursor: string | null; endCursor: string | null }

interface ProductsQuery {
  products: {
    nodes: {
      id: string;
      title: string;
      status: ProductRow["status"];
      productType: string;
      tags: string[];
      category: { fullName: string } | null;
      featuredMedia: { id: string; image?: { url: string; full: string } | null } | null;
    }[];
    pageInfo: PageInfo;
  };
}

const PRODUCTS_QUERY = `#graphql
  query Products($first: Int, $last: Int, $after: String, $before: String, $query: String) {
    products(first: $first, last: $last, after: $after, before: $before, query: $query, sortKey: UPDATED_AT, reverse: true) {
      nodes { id title status productType tags category { fullName } featuredMedia { id ... on MediaImage { image { url(transform: { maxWidth: 160 }) full: url } } } }
      pageInfo { hasNextPage hasPreviousPage startCursor endCursor }
    }
  }`;

export interface ListArgs { query?: string; after?: string | null; before?: string | null; pageSize?: number }

/** One page of products (newest updated first), for the dashboard table. */
export async function listProducts(admin: Admin, { query, after, before, pageSize = 25 }: ListArgs = {}) {
  const data = await gql<ProductsQuery>(admin, PRODUCTS_QUERY, {
    ...(before ? { last: pageSize, before } : { first: pageSize, after: after ?? null }),
    query: query || null,
  });
  const products: ProductRow[] = data.products.nodes.map((n) => ({
    id: n.id,
    title: n.title,
    status: n.status,
    thumb: n.featuredMedia?.image?.url ?? null,
    mediaId: n.featuredMedia?.id ?? null,
    mediaUrl: n.featuredMedia?.image?.full ?? null,
    detectedKind: detectKind({ category: n.category?.fullName, productType: n.productType, tags: n.tags, title: n.title }),
  }));
  return { products, pageInfo: data.products.pageInfo };
}

/** Every product, page by page (for "Generate all missing"). */
export async function* allProducts(admin: Admin): AsyncGenerator<ProductRow[]> {
  let after: string | null = null;
  do {
    const page: Awaited<ReturnType<typeof listProducts>> = await listProducts(admin, { after, pageSize: 100 });
    yield page.products;
    after = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
  } while (after);
}

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
