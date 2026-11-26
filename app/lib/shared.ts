// Shared by server and admin UI (no secrets here). Uses the database enums as the source of truth.
import type { AssetStatus, AssetView, JewelleryKind } from "@prisma/client";

export type { AssetStatus, AssetView, JewelleryKind };

/* ---------- Ring or bracelet? Detected from what the store already has, no merchant work:
   Shopify category → product type → tags → title, first match wins. Earrings / necklaces = "other" (shop-only).
   Nothing found → ring (what the app always did). The merchant can override it on the product page. */
const KIND_WORDS: [JewelleryKind, RegExp][] = [
  ["other", /\b(earrings?|studs?|hoops?|necklaces?|pendants?|chokers?|anklets?|brooch(es)?)\b/i],
  ["bracelet", /\b(bracelets?|bangles?|cuffs?|wristbands?|tennis bracelet)\b/i],
  ["ring", /\b(rings?|solitaires?|engagement|wedding bands?|eternity bands?|signets?)\b/i],
];
export interface KindSource { category?: string | null; productType?: string | null; tags?: string[] | null; title?: string | null }
export function detectKind(p: KindSource): JewelleryKind {
  for (const text of [p.category, p.productType, (p.tags || []).join(" "), p.title]) {
    if (!text) continue;
    const hit = KIND_WORDS.find(([, re]) => re.test(text));
    if (hit) return hit[0];
  }
  return "ring";
}
export const KIND_LABEL: Record<JewelleryKind, string> = { ring: "Ring", bracelet: "Bracelet", other: "Not ring / bracelet" };

export const METAFIELD = { namespace: "tryon", key: "asset" } as const;

type Tone = "info" | "success" | "warning" | "critical" | "attention" | undefined;

export const STATUS: Record<AssetStatus, { label: string; tone: Tone }> = {
  none: { label: "Not generated", tone: undefined },
  queued: { label: "Queued", tone: "info" },
  processing: { label: "Generating…", tone: "attention" },
  ready: { label: "Ready", tone: "success" },
  manual: { label: "Ready (uploaded)", tone: "success" },
  failed: { label: "Failed", tone: "critical" },
};
export const isBusy = (s: AssetStatus) => s === "queued" || s === "processing";
export const isReady = (s: AssetStatus) => s === "ready" || s === "manual";

/** What the storefront metafield `tryon.asset` holds (read by the theme block → viewer). */
export interface TryOnMetafield {
  kind: "ring" | "bracelet";   // where the viewer puts it: a finger or the wrist
  enabled: boolean;
  view: AssetView;
  image: string | null;
  scale: number;
  offsetY: number;
  source: string | null;
  shownCarat?: number | null;  // rings: carat of the stone in the try-on image (other carats are drawn bigger / smaller from it)
}

/** Encode an object for the viewer's URL hash (#c=…), base64url of UTF-8 JSON. */
export function encodeViewerConfig(o: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(o));
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Numeric id from a Shopify gid ("gid://shopify/Product/123" → "123"). */
export const numericId = (gid: string) => gid.split("/").pop() ?? gid;

/** Ask Shopify's CDN for a resized image. */
export function withWidth(url: string, width: number): string {
  try {
    const u = new URL(url);
    u.searchParams.set("width", String(width));
    return u.toString();
  } catch {
    return url;
  }
}
