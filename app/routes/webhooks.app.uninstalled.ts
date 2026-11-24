import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, session } = await authenticate.webhook(request);
  if (session) await db.session.deleteMany({ where: { shop } });
  // Keep the shop's assets for 48h in case they reinstall; shop/redact (compliance) deletes everything.
  await db.shop.updateMany({ where: { shop }, data: { uninstalledAt: new Date() } });
  await db.tryOnAsset.updateMany({ where: { shop, status: { in: ["queued", "processing"] } }, data: { status: "none" } });
  return new Response();
};
