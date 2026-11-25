/* The store's products, copied into our database (Product table) so the dashboard never has to call Shopify
   to list, search or filter them.
   - "Sync products" (dashboard button, and automatically the first time) reads every product from Shopify,
     250 per request, and upserts it. Products no longer in Shopify are removed.
   - products/create|update|delete webhooks keep single products up to date in between.
   Only basic info is stored (title, description, type, tags, category, status, main photo). Prices, variants
   and stock are always read live, because they change too often to copy.
   The sync also rebuilds missing try-on records from the product's tryon.asset metafield (e.g. after a
   database reset), so products whose image is already on the store don't show "Not generated". */
import type { AssetView, JewelleryKind, Prisma } from "@prisma/client";
import db from "../db.server";
import { gql, type Admin } from "./graphql.server";
import { detectKind, METAFIELD, type TryOnMetafield } from "./shared";

const PAGE = 250;                         // Shopify's maximum per request
const STUCK_MS = 15 * 60 * 1000;          // a sync "running" longer than this crashed → may start again

interface Node {
  id: string;
  title: string;
  handle: string;
  description: string;
  status: string;
  productType: string;
  tags: string[];
  updatedAt: string;
  category: { fullName: string } | null;
  featuredMedia: { id: string; image?: { url: string; thumb: string } | null } | null;
  metafield?: { jsonValue: Partial<TryOnMetafield> | null } | null;
}

const FIELDS = `id title handle description(truncateAt: 600) status productType tags updatedAt category { fullName }
  featuredMedia { id ... on MediaImage { image { url thumb: url(transform: { maxWidth: 160 }) } } }
  metafield(namespace: "${METAFIELD.namespace}", key: "${METAFIELD.key}") { jsonValue }`;

const toRow = (shop: string, n: Node) => ({
  shop,
  productId: n.id,
  title: n.title,
  handle: n.handle,
  description: n.description ?? "",
  status: n.status,
  productType: n.productType ?? "",
  tags: n.tags ?? [],
  category: n.category?.fullName ?? null,
  thumbUrl: n.featuredMedia?.image?.thumb ?? null,
  mediaId: n.featuredMedia?.id ?? null,
  mediaUrl: n.featuredMedia?.image?.url ?? null,
  detectedKind: detectKind({ category: n.category?.fullName, productType: n.productType, tags: n.tags, title: n.title }),
  shopifyUpdatedAt: new Date(n.updatedAt),
  syncedAt: new Date(),
});

async function save(shop: string, n: Node): Promise<void> {
  const row = toRow(shop, n);
  await db.product.upsert({ where: { shop_productId: { shop, productId: n.id } }, create: row, update: row });
  await restoreAsset(shop, n);
}

/** The product has a try-on image on the store (metafield) but we have no record of it → recreate the record. */
async function restoreAsset(shop: string, n: Node): Promise<void> {
  const t = n.metafield?.jsonValue;
  if (!t?.image) return;
  const exists = await db.tryOnAsset.findUnique({ where: { shop_productId: { shop, productId: n.id } }, select: { id: true } });
  if (exists) return;
  await db.tryOnAsset.create({
    data: {
      shop, productId: n.id, productTitle: n.title,
      status: t.source === "upload" ? "manual" : "ready",
      resultUrl: t.image,
      sourceMediaId: n.featuredMedia?.id ?? null, sourceUrl: n.featuredMedia?.image?.url ?? null,
      scale: t.scale ?? 1, offsetY: t.offsetY ?? 0, enabled: t.enabled !== false,
      view: (t.view ?? "photo") as AssetView,
      ...(t.kind ? { kind: t.kind as JewelleryKind } : {}),
    },
  });
}

/* ---------- full sync ---------- */

export const isSyncing = (s: { syncStartedAt: Date | null } | null) =>
  !!s?.syncStartedAt && Date.now() - s.syncStartedAt.getTime() < STUCK_MS;

/** Starts a full sync in the background (returns at once). false = one is already running. */
export async function startSync(shop: string, admin: Admin): Promise<boolean> {
  const now = new Date();
  // Claim atomically, so two clicks (or two app instances) don't run two syncs
  await db.shop.upsert({ where: { shop }, create: { shop }, update: {} });
  const claimed = await db.shop.updateMany({
    where: { shop, OR: [{ syncStartedAt: null }, { syncStartedAt: { lt: new Date(now.getTime() - STUCK_MS) } }] },
    data: { syncStartedAt: now, syncError: null },
  });
  if (!claimed.count) return false;
  runSync(shop, admin, now).catch(() => {});   // errors are saved on the shop row
  return true;
}

async function runSync(shop: string, admin: Admin, started: Date): Promise<void> {
  try {
    let after: string | null = null;
    do {
      const d: { products: { nodes: Node[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } } } = await gql(admin, `#graphql
        query SyncProducts($first: Int!, $after: String) {
          products(first: $first, after: $after) { nodes { ${FIELDS} } pageInfo { hasNextPage endCursor } }
        }`, { first: PAGE, after });
      for (const n of d.products.nodes) await save(shop, n);
      after = d.products.pageInfo.hasNextPage ? d.products.pageInfo.endCursor : null;
    } while (after);
    // Not seen in this sync = deleted in Shopify
    await db.product.deleteMany({ where: { shop, syncedAt: { lt: started } } });
    await db.shop.update({ where: { shop }, data: { syncStartedAt: null, productsSyncedAt: new Date() } });
  } catch (e) {
    console.error("[sync]", shop, e);
    await db.shop.update({ where: { shop }, data: { syncStartedAt: null, syncError: String((e as Error)?.message ?? e).slice(0, 300) } });
  }
}

/* ---------- single product (webhooks) ---------- */

export async function syncOne(shop: string, admin: Admin, productId: string): Promise<void> {
  const d = await gql<{ product: Node | null }>(admin, `#graphql
    query SyncProduct($id: ID!) { product(id: $id) { ${FIELDS} } }`, { id: productId });
  if (d.product) await save(shop, d.product);
  else await db.product.deleteMany({ where: { shop, productId } });
}

export const removeProduct = (shop: string, productId: string) => db.product.deleteMany({ where: { shop, productId } });

/* ---------- dashboard list (from our database) ---------- */

export type TryOnFilter = "all" | "none" | "ready" | "busy" | "failed" | "stale";
export interface ListFilters { q?: string; kind?: "all" | JewelleryKind; tryon?: TryOnFilter; status?: "all" | "ACTIVE" | "DRAFT" | "ARCHIVED"; page?: number }
export const PAGE_SIZE = 25;

export async function listFromDb(shop: string, f: ListFilters) {
  const and: Prisma.ProductWhereInput[] = [{ shop }];
  if (f.q) and.push({ OR: [{ title: { contains: f.q, mode: "insensitive" } }, { handle: { contains: f.q, mode: "insensitive" } },
    { productType: { contains: f.q, mode: "insensitive" } }, { tags: { has: f.q } }] });
  if (f.status && f.status !== "all") and.push({ status: f.status });

  // Kind: the merchant's choice (TryOnAsset.kindManual) wins over what was detected
  if (f.kind && f.kind !== "all") {
    const manual = await db.tryOnAsset.findMany({ where: { shop, kindManual: true }, select: { productId: true, kind: true } });
    and.push({ OR: [
      { detectedKind: f.kind, productId: { notIn: manual.map((m) => m.productId) } },
      { productId: { in: manual.filter((m) => m.kind === f.kind).map((m) => m.productId) } },
    ] });
  }

  // Try-on status lives in TryOnAsset
  if (f.tryon && f.tryon !== "all") {
    const ids = async (where: Prisma.TryOnAssetWhereInput) =>
      (await db.tryOnAsset.findMany({ where: { shop, ...where }, select: { productId: true } })).map((a) => a.productId);
    if (f.tryon === "none") and.push({ productId: { notIn: await ids({ status: { not: "none" } }) } });
    if (f.tryon === "ready") and.push({ productId: { in: await ids({ status: { in: ["ready", "manual"] } }) } });
    if (f.tryon === "busy") and.push({ productId: { in: await ids({ status: { in: ["queued", "processing"] } }) } });
    if (f.tryon === "failed") and.push({ productId: { in: await ids({ status: "failed" }) } });
    if (f.tryon === "stale") {
      const rows = await db.tryOnAsset.findMany({ where: { shop, status: "ready", sourceMediaId: { not: null } }, select: { productId: true, sourceMediaId: true } });
      const prods = await db.product.findMany({ where: { shop, productId: { in: rows.map((r) => r.productId) } }, select: { productId: true, mediaId: true } });
      const media = new Map(prods.map((p) => [p.productId, p.mediaId]));
      and.push({ productId: { in: rows.filter((r) => media.get(r.productId) && media.get(r.productId) !== r.sourceMediaId).map((r) => r.productId) } });
    }
  }

  const where = { AND: and };
  const page = Math.max(1, f.page || 1);
  const [total, rows] = await Promise.all([
    db.product.count({ where }),
    db.product.findMany({ where, orderBy: [{ shopifyUpdatedAt: "desc" }, { id: "asc" }], skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
  ]);
  return { total, page, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)), rows };
}

/** Counts for the summary cards (all products, ignoring the filters). */
export async function catalogCounts(shop: string) {
  const [products, kinds, manual] = await Promise.all([
    db.product.count({ where: { shop } }),
    db.product.groupBy({ by: ["detectedKind"], where: { shop }, _count: true }),
    db.tryOnAsset.findMany({ where: { shop, kindManual: true }, select: { productId: true, kind: true } }),
  ]);
  const byKind: Record<JewelleryKind, number> = { ring: 0, bracelet: 0, other: 0 };
  kinds.forEach((k) => (byKind[k.detectedKind] = k._count));
  if (manual.length) {   // move products the merchant re-typed
    const det = await db.product.findMany({ where: { shop, productId: { in: manual.map((m) => m.productId) } }, select: { productId: true, detectedKind: true } });
    const d = new Map(det.map((p) => [p.productId, p.detectedKind]));
    manual.forEach((m) => { const was = d.get(m.productId); if (was && was !== m.kind) { byKind[was]--; byKind[m.kind]++; } });
  }
  return { products, byKind };
}

/* ---------- bulk generate ---------- */

export type BulkKind = "all" | "ring" | "bracelet";

/** Products that "Generate all" would queue: a ring or bracelet (merchant's choice wins), has a photo,
    not archived, and no try-on image yet (ready, uploaded, queued, generating and failed ones are skipped —
    failed ones are retried one by one, so a broken photo doesn't cost money again and again). */
export async function bulkCandidates(shop: string, kind: BulkKind) {
  const assets = await db.tryOnAsset.findMany({ where: { shop }, select: { productId: true, status: true, kind: true, kindManual: true } });
  const asset = new Map(assets.map((a) => [a.productId, a]));
  const rows = await db.product.findMany({
    where: { shop, mediaUrl: { not: null }, mediaId: { not: null }, status: { not: "ARCHIVED" } },
    select: { productId: true, title: true, mediaId: true, mediaUrl: true, detectedKind: true },
    orderBy: { shopifyUpdatedAt: "desc" },
  });
  return rows.filter((r) => {
    const a = asset.get(r.productId);
    if (a && a.status !== "none") return false;
    const k = a?.kindManual ? a.kind : r.detectedKind;
    return k !== "other" && (kind === "all" || k === kind);
  }).map((r) => {
    const a = asset.get(r.productId);
    return { id: r.productId, title: r.title, mediaId: r.mediaId, mediaUrl: r.mediaUrl, detectedKind: r.detectedKind,
      kind: (a?.kindManual ? a.kind : r.detectedKind) as JewelleryKind };
  });
}

export async function bulkCounts(shop: string): Promise<Record<BulkKind, number>> {
  const all = await bulkCandidates(shop, "all");
  const ring = all.filter((p) => p.kind === "ring").length;
  return { all: all.length, ring, bracelet: all.length - ring };
}

/* A bulk run queues its products in the background for a few seconds. "Cancel" bumps the shop's run number,
   so a run that is still queueing stops (this server only; the queue rows themselves are cleared in the DB). */
const runs = new Map<string, number>();
export const stopBulk = (shop: string) => runs.set(shop, (runs.get(shop) ?? 0) + 1);
export function queueInBackground(shop: string, list: ProductLike[], enqueue: (shop: string, p: ProductLike) => Promise<unknown>): void {
  const run = runs.get(shop) ?? 0;
  (async () => {
    for (const p of list) {
      if ((runs.get(shop) ?? 0) !== run) break;   // cancelled
      await enqueue(shop, p).catch((e) => console.error("[bulk]", p.id, e));
    }
  })();
}
type ProductLike = { id: string; title: string; mediaId: string | null; mediaUrl: string | null; detectedKind: JewelleryKind };

/** Chosen rows (checkboxes) → products to queue: same rules as "Generate all", except failed ones are retried. */
export async function selectedCandidates(shop: string, ids: string[]) {
  const [rows, assets] = await Promise.all([
    db.product.findMany({ where: { shop, productId: { in: ids } } }),
    db.tryOnAsset.findMany({ where: { shop, productId: { in: ids } }, select: { productId: true, status: true, kind: true, kindManual: true } }),
  ]);
  const asset = new Map(assets.map((a) => [a.productId, a]));
  return rows.filter((r) => {
    const a = asset.get(r.productId);
    if (!r.mediaUrl || !r.mediaId) return false;
    if (a && ["queued", "processing", "manual"].includes(a.status)) return false;
    return (a?.kindManual ? a.kind : r.detectedKind) !== "other";
  }).map((r) => ({ id: r.productId, title: r.title, mediaId: r.mediaId, mediaUrl: r.mediaUrl, detectedKind: r.detectedKind }));
}
