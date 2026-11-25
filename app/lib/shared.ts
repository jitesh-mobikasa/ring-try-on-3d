// Shared by server and admin UI (no secrets here). Uses the database enums as the source of truth.
import type { AssetStatus, AssetView } from "@prisma/client";

export type { AssetStatus, AssetView };

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
  enabled: boolean;
  view: AssetView;
  image: string | null;
  scale: number;
  offsetY: number;
  source: string | null;
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
