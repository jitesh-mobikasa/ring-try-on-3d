// Shared by server and admin UI (no secrets here). Uses the database enums as the source of truth.
import type { AssetStatus, AssetView, Plan } from "@prisma/client";

export type { AssetStatus, AssetView, Plan };

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

export interface PlanInfo { key: Plan; name: string; price: number; generations: number; features: string[] }

/** SaaS plans. `generations` = AI try-on images per 30-day period (free cut-outs don't count). */
export const PLANS: Record<Plan, PlanInfo> = {
  free: { key: "free", name: "Free", price: 0, generations: 10, features: ["10 AI try-on images / month", "Unlimited free cut-outs", "Unlimited try-ons"] },
  starter: { key: "starter", name: "Starter", price: 19, generations: 100, features: ["100 AI try-on images / month", "Unlimited try-ons"] },
  pro: { key: "pro", name: "Pro", price: 49, generations: 500, features: ["500 AI try-on images / month", "Priority generation"] },
};

/** Shopify Billing plan names (must match the `billing` keys in shopify.server.ts). */
export const BILLING_PLAN = { starter: "Starter", pro: "Pro" } as const;
export type PaidPlan = keyof typeof BILLING_PLAN;
export const isPaidPlan = (p: string): p is PaidPlan => p in BILLING_PLAN;

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
