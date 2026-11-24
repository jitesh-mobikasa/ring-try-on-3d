/* App proxy: https://<store>/apps/ring-tryon/looks → this route. "My Looks" in the try-on.
   Shopify adds logged_in_customer_id to every app proxy request (signed), so only the logged-in shopper
   can see / change their own looks. Not logged in → 401 { login: true } and the viewer shows "Sign in".

   GET                      → { looks: [{ id, name, data, thumbnail, createdAt }] }
   POST { name, data, thumbnail }  → { look }
   POST ?delete=<id>        → { ok: true } */
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import db from "../db.server";

const MAX_LOOKS = 50;                 // per shopper
const MAX_DATA = 20_000;              // bytes of look JSON
const MAX_THUMB = 120_000;            // bytes of thumbnail data URL

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
});

async function who(request: Request) {
  await authenticate.public.appProxy(request);   // verifies Shopify's signature (throws if invalid)
  const url = new URL(request.url);
  return { shop: url.searchParams.get("shop") ?? "", customerId: url.searchParams.get("logged_in_customer_id") || null };
}

const isLook = (d: unknown): d is { v: number; hands: Record<string, unknown[]> } =>
  !!d && typeof d === "object" && typeof (d as { hands?: unknown }).hands === "object";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { shop, customerId } = await who(request);
  if (!customerId) return json({ login: true, looks: [] }, 401);
  const looks = await db.savedLook.findMany({
    where: { shop, customerId }, orderBy: { createdAt: "desc" }, take: MAX_LOOKS,
    select: { id: true, name: true, data: true, thumbnail: true, createdAt: true },
  });
  return json({ looks });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, customerId } = await who(request);
  if (!customerId) return json({ login: true }, 401);

  const params = new URL(request.url).searchParams;
  if (request.method === "DELETE" || params.get("delete")) {      // POST ?delete=<id> (proxies are safest with GET/POST)
    const id = params.get("delete") ?? params.get("id") ?? "";
    await db.savedLook.deleteMany({ where: { id, shop, customerId } });   // only the shopper's own look
    return json({ ok: true });
  }
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let body: { name?: unknown; data?: unknown; thumbnail?: unknown };
  try { body = await request.json(); } catch { return json({ error: "Bad JSON" }, 400); }
  const name = String(body.name ?? "").trim().slice(0, 60) || "My look";
  if (!isLook(body.data) || JSON.stringify(body.data).length > MAX_DATA) return json({ error: "Invalid look" }, 400);
  const thumbnail = typeof body.thumbnail === "string" && body.thumbnail.startsWith("data:image/") && body.thumbnail.length <= MAX_THUMB
    ? body.thumbnail : null;

  if (await db.savedLook.count({ where: { shop, customerId } }) >= MAX_LOOKS) {
    return json({ error: `You can save up to ${MAX_LOOKS} looks. Delete one first.` }, 409);
  }
  const look = await db.savedLook.create({
    data: { shop, customerId, name, data: body.data as object, thumbnail },
    select: { id: true, name: true, data: true, thumbnail: true, createdAt: true },
  });
  return json({ look });
};
