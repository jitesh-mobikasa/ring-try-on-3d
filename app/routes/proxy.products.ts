/* App proxy: https://<store>/apps/ring-tryon/products → this route.
   The try-on's ring drawer calls it (through the theme script) to load more rings than the theme block
   passes in. Returns the next page of products from a collection that are on the Online Store and have a
   try-on image, in the same JSON shape as the theme snippet (extensions/tryon-theme/snippets/tryon-product.liquid).

   Query: collection=<handle>  &  after=<cursor> (next page) or offset=<n> (skip the n products the theme
   already rendered)  &  country=<ISO code> (prices in the shopper's market currency). */
import type { LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { gql, type Admin } from "../lib/graphql.server";
import { METAFIELD, type TryOnMetafield } from "../lib/shared";

const WANT = 12;        // rings per response
const BATCH = 25;       // products read from Shopify per round (some have no try-on image and are skipped)
const MAX_ROUNDS = 4;   // keep each request quick; the drawer just asks again

interface Money { amount: string }
interface VariantNode {
  legacyResourceId: string;
  price: string;
  availableForSale: boolean;
  selectedOptions: { value: string }[];
  image: { url: string } | null;
  contextualPricing?: { price: Money } | null;
}
interface ProductNode {
  legacyResourceId: string;
  title: string;
  handle: string;
  onlineStoreUrl: string | null;
  featuredImage: { url: string } | null;
  description: string;
  productType: string;
  images: { nodes: { url: string }[] };
  options: { name: string }[];
  metafield: { jsonValue: Partial<TryOnMetafield> | null } | null;
  variants: { nodes: VariantNode[] };
}
interface Page { nodes: ProductNode[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } }

const productsQuery = (withCountry: boolean) => `#graphql
  query TryOnProducts($handle: String!, $first: Int!, $after: String${withCountry ? ", $country: CountryCode!" : ""}) {
    collectionByIdentifier(identifier: { handle: $handle }) {
      products(first: $first, after: $after, sortKey: COLLECTION_DEFAULT) {
        pageInfo { hasNextPage endCursor }
        nodes {
          legacyResourceId title handle onlineStoreUrl description(truncateAt: 600) productType
          featuredImage { url(transform: { maxWidth: 600 }) }
          images(first: 6) { nodes { url(transform: { maxWidth: 800 }) } }
          options { name }
          metafield(namespace: "${METAFIELD.namespace}", key: "${METAFIELD.key}") { jsonValue }
          variants(first: 100) {
            nodes {
              legacyResourceId price availableForSale
              selectedOptions { value }
              image { url(transform: { maxWidth: 600 }) }
              ${withCountry ? "contextualPricing(context: { country: $country }) { price { amount } }" : ""}
            }
          }
        }
      }
    }
  }`;

// Cursor after the first n products (the ones the theme block already rendered), without loading them.
const skipQuery = `#graphql
  query Skip($handle: String!, $first: Int!) {
    collectionByIdentifier(identifier: { handle: $handle }) { products(first: $first, sortKey: COLLECTION_DEFAULT) { pageInfo { hasNextPage endCursor } } }
  }`;

function toViewer(p: ProductNode) {
  const t = p.metafield?.jsonValue;
  if (!t?.image || t.enabled === false || !p.onlineStoreUrl) return null;   // not tryable / not on the store
  return {
    productId: Number(p.legacyResourceId),
    title: p.title,
    handle: p.handle,
    url: p.onlineStoreUrl,
    image: p.featuredImage?.url ?? null,
    description: p.description,
    type: p.productType,
    images: p.images.nodes.map((i) => i.url),
    options: p.options.map((o) => o.name),
    tryon: { image: t.image, scale: t.scale ?? 1, offsetY: t.offsetY ?? 0, view: t.view ?? "photo" },
    variants: p.variants.nodes.map((v) => ({
      id: Number(v.legacyResourceId),
      price: Number(v.contextualPricing?.price.amount ?? v.price),
      available: v.availableForSale,
      options: v.selectedOptions.map((o) => o.value),
      image: v.image?.url ?? null,
    })),
  };
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json", "Cache-Control": status === 200 ? "public, max-age=60" : "no-store" },
});

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.public.appProxy(request);   // verifies Shopify's signature
  if (!admin) return json({ error: "App is not installed on this store" }, 401);

  const url = new URL(request.url);
  const handle = url.searchParams.get("collection")?.trim();
  if (!handle) return json({ error: "collection is required" }, 400);
  const country = url.searchParams.get("country")?.toUpperCase();
  const withCountry = !!country && /^[A-Z]{2}$/.test(country);
  let after = url.searchParams.get("after") || null;
  const offset = Math.min(250, Math.max(0, Number(url.searchParams.get("offset")) || 0));

  try {
    if (!after && offset > 0) {
      const d = await gql<{ collectionByIdentifier: { products: Page } | null }>(admin as Admin, skipQuery, { handle, first: offset });
      const info = d.collectionByIdentifier?.products.pageInfo;
      if (!info?.hasNextPage) return json({ products: [], cursor: null, hasMore: false });
      after = info.endCursor;
    }

    const products: NonNullable<ReturnType<typeof toViewer>>[] = [];
    let hasMore = true;
    for (let round = 0; round < MAX_ROUNDS && products.length < WANT && hasMore; round++) {
      const d = await gql<{ collectionByIdentifier: { products: Page } | null }>(admin as Admin, productsQuery(withCountry),
        { handle, first: BATCH, after, ...(withCountry ? { country } : {}) });
      const page = d.collectionByIdentifier?.products;
      if (!page) return json({ products: [], cursor: null, hasMore: false });
      for (const node of page.nodes) { const p = toViewer(node); if (p) products.push(p); }
      hasMore = page.pageInfo.hasNextPage;
      after = page.pageInfo.endCursor;
    }
    return json({ products, cursor: hasMore ? after : null, hasMore });
  } catch (e) {
    console.error("[proxy.products]", e);
    return json({ error: "Could not load rings" }, 502);
  }
};
