/* Try-on image pipeline. Nothing runs automatically — the merchant clicks Generate.
   - enqueue():      mark a product "queued" (dashboard "Generate" / "Generate all").
   - processQueue(): picks queued products one by one and generates their image.
   - startWorker():  runs processQueue every few seconds inside the app server (also picks up jobs left by a restart). */
import type { JewelleryKind, Shop, TryOnAsset } from "@prisma/client";
import db from "../db.server";
import { unauthenticated } from "../shopify.server";
import { errorMessage, NonRetryable } from "./errors";
import { deleteFile, uploadPng } from "./files.server";
import { currentView, generateTryOnImage, usesAI } from "./generator.server";
import { gql, type Admin } from "./graphql.server";
import { writeAssetMetafield } from "./metafields.server";
import { detectKind } from "./shared";

const MAX_ATTEMPTS = 3;
const STUCK_MS = 10 * 60 * 1000;         // a "processing" job older than this crashed mid-way → retry
const PERIOD_MS = 30 * 24 * 3600 * 1000; // counting period for the optional AI image limit
// No plans / billing (custom app). Optional safety cap on OpenAI cost: AI_MONTHLY_LIMIT=200 in the server env.
// Unset or 0 = no limit. Free cut-outs (TRYON_GENERATOR=local) never count.
const AI_MONTHLY_LIMIT = Number(process.env.AI_MONTHLY_LIMIT) || 0;
const POLL_MS = 15_000;

/** A product as the pipeline needs it: its main photo is the source of the try-on image. */
export interface ProductRef {
  id: string;            // gid://shopify/Product/…
  title: string;
  mediaId: string | null;
  mediaUrl: string | null;
  detectedKind: JewelleryKind; // ring / bracelet / other, from Shopify category, type, tags, title
}

/** The kind the product is treated as: the merchant's choice if set, else what was detected. */
export const effectiveKind = (product: ProductRef, asset?: Pick<TryOnAsset, "kind" | "kindManual"> | null): JewelleryKind =>
  asset?.kindManual ? asset.kind : product.detectedKind;

/* ---------- shop + optional AI limit ---------- */

export async function getShop(shop: string): Promise<Shop> {
  let s = await db.shop.upsert({ where: { shop }, create: { shop }, update: {} });
  if (Date.now() - s.periodStart.getTime() > PERIOD_MS) {
    s = await db.shop.update({ where: { shop }, data: { usedThisPeriod: 0, periodStart: new Date() } });
  }
  return s;
}

export async function quotaLeft(shop: string): Promise<number> {
  if (!AI_MONTHLY_LIMIT) return Infinity;
  const s = await getShop(shop);
  return Math.max(0, AI_MONTHLY_LIMIT - s.usedThisPeriod);
}

/* ---------- queue ---------- */

export async function enqueue(shop: string, product: ProductRef, { force = false } = {}): Promise<TryOnAsset> {
  const { id: productId, title, mediaId, mediaUrl } = product;
  const where = { shop_productId: { shop, productId } };
  const existing = await db.tryOnAsset.findUnique({ where });

  if (existing && !force) {
    if (existing.status === "manual") return existing;                                      // merchant's own image wins
    if (existing.status === "queued" || existing.status === "processing") return existing;
    if (existing.status === "ready" && existing.sourceMediaId === mediaId) return existing;  // same photo → nothing to do
  }

  const fail = (error: string) => db.tryOnAsset.upsert({
    where,
    create: { shop, productId, productTitle: title, sourceMediaId: mediaId, sourceUrl: mediaUrl, status: "failed", error },
    update: { productTitle: title, status: "failed", error },
  });
  if (!mediaId || !mediaUrl) return fail("Product has no photo");
  const kind = effectiveKind(product, existing);
  if (kind === "other") return fail("Not a ring or bracelet. Change the type on the product page if this is wrong.");
  if (usesAI() && (await quotaLeft(shop)) <= 0) return fail("Monthly AI image limit reached (AI_MONTHLY_LIMIT)");

  const row = await db.tryOnAsset.upsert({
    where,
    create: { shop, productId, productTitle: title, sourceMediaId: mediaId, sourceUrl: mediaUrl, status: "queued", kind },
    update: { productTitle: title, sourceMediaId: mediaId, sourceUrl: mediaUrl, status: "queued", error: null, attempts: 0, kind },
  });
  kick();
  return row;
}

/* ---------- pause / resume / cancel (dashboard) ---------- */

export async function setPaused(shop: string, paused: boolean): Promise<void> {
  await db.shop.upsert({ where: { shop }, create: { shop, queuePaused: paused }, update: { queuePaused: paused } });
  if (!paused) kick();
}

/** Takes every queued product out of the queue (back to "Not generated"). One already generating finishes. */
export async function cancelQueued(shop: string): Promise<number> {
  const r = await db.tryOnAsset.updateMany({ where: { shop, status: "queued" }, data: { status: "none", error: null } });
  return r.count;
}

/* ---------- worker ---------- */

let running = false;

export async function processQueue(): Promise<void> {
  if (running) return;
  running = true;
  try {
    for (;;) {
      // Shops that pressed "Pause": their queued products wait (one already generating still finishes)
      const paused = (await db.shop.findMany({ where: { queuePaused: true }, select: { shop: true } })).map((s) => s.shop);
      const job = await db.tryOnAsset.findFirst({
        where: {
          ...(paused.length ? { shop: { notIn: paused } } : {}),
          OR: [
            { status: "queued" },
            { status: "processing", updatedAt: { lt: new Date(Date.now() - STUCK_MS) } },
          ],
        },
        orderBy: { updatedAt: "asc" },
      });
      if (!job) break;
      // Claim it atomically, so two app instances never process the same product
      const claimed = await db.tryOnAsset.updateMany({
        where: { id: job.id, status: job.status, updatedAt: job.updatedAt },
        data: { status: "processing", attempts: { increment: 1 } },
      });
      if (claimed.count) await runJob(job);
    }
  } finally {
    running = false;
  }
}

async function runJob(job: TryOnAsset): Promise<void> {
  const label = `[tryon] ${job.shop} ${job.productId}`;
  try {
    const { admin } = await unauthenticated.admin(job.shop);

    // Always use the product's CURRENT main photo (it may have changed since queuing)
    const product = await fetchProduct(admin, job.productId);
    if (!product) { await db.tryOnAsset.delete({ where: { id: job.id } }); return; }
    if (!product.mediaUrl) throw new NonRetryable("Product has no photo");

    const kind = effectiveKind(product, job);
    if (kind === "other") throw new NonRetryable("Not a ring or bracelet");
    console.log(label, `generating ${kind}…`);
    const png = await generateTryOnImage(product.mediaUrl, kind);
    const file = await uploadPng(admin, png, {
      filename: `tryon-${job.productId.split("/").pop()}-${Date.now()}.png`,
      alt: `Try-on image: ${product.title}`,
    });
    if (job.resultFileId && job.resultFileId !== file.id) await deleteFile(admin, job.resultFileId);

    const done = await db.tryOnAsset.update({
      where: { id: job.id },
      data: {
        status: "ready", error: null, productTitle: product.title,
        sourceMediaId: product.mediaId, sourceUrl: product.mediaUrl,
        resultFileId: file.id, resultUrl: file.url, view: currentView(kind), kind,
      },
    });
    await writeAssetMetafield(admin, done);
    if (usesAI()) await db.shop.update({ where: { shop: job.shop }, data: { usedThisPeriod: { increment: 1 } } });
    console.log(label, "ready", file.url);
  } catch (e) {
    const message = errorMessage(e);
    console.error(label, "failed:", message);
    const fresh = await db.tryOnAsset.findUnique({ where: { id: job.id } });
    const retry = !!fresh && fresh.attempts < MAX_ATTEMPTS && !(e instanceof NonRetryable)
      && !/limit|safety|rejected/i.test(message);
    await db.tryOnAsset
      .update({ where: { id: job.id }, data: { status: retry ? "queued" : "failed", error: message.slice(0, 500) } })
      .catch(() => undefined);
  }
}

interface ProductQuery {
  product: {
    id: string;
    title: string;
    productType: string;
    tags: string[];
    category: { fullName: string } | null;
    featuredMedia: { id: string; image?: { url: string } | null } | null;
  } | null;
}

export async function fetchProduct(admin: Admin, productId: string): Promise<ProductRef | null> {
  const { product: p } = await gql<ProductQuery>(admin, `#graphql
    query P($id: ID!) {
      product(id: $id) {
        id title productType tags category { fullName }
        featuredMedia { id ... on MediaImage { image { url } } }
      }
    }`, { id: productId });
  if (!p) return null;
  return {
    id: p.id, title: p.title, mediaId: p.featuredMedia?.id ?? null, mediaUrl: p.featuredMedia?.image?.url ?? null,
    detectedKind: detectKind({ category: p.category?.fullName, productType: p.productType, tags: p.tags, title: p.title }),
  };
}

function kick(): void {
  setTimeout(() => processQueue().catch((e) => console.error("[tryon] worker", e)), 50);
}

export function startWorker(): void {
  if (process.env.WORKER === "off" || globalThis.__tryonWorker) return;
  globalThis.__tryonWorker = setInterval(() => processQueue().catch((e) => console.error("[tryon] worker", e)), POLL_MS);
  kick();
}
