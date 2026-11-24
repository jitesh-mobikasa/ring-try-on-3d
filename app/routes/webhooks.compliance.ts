import type { ActionFunctionArgs } from "@remix-run/node";
/* Mandatory GDPR webhooks. Customer data stored: looks a logged-in shopper saved in the try-on (SavedLook). */
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, payload } = await authenticate.webhook(request);
  const customerId = String((payload as { customer?: { id?: number | string } })?.customer?.id ?? "");
  switch (topic) {
    case "CUSTOMERS_DATA_REQUEST": {
      // The merchant must hand this to the customer; log what we hold so it can be exported.
      const looks = customerId ? await db.savedLook.findMany({ where: { shop, customerId }, select: { name: true, data: true, createdAt: true } }) : [];
      console.info(`[compliance] data request ${shop} customer ${customerId}: ${looks.length} saved look(s)`, JSON.stringify(looks));
      break;
    }
    case "CUSTOMERS_REDACT":
      if (customerId) await db.savedLook.deleteMany({ where: { shop, customerId } });
      break;
    case "SHOP_REDACT":
      await db.savedLook.deleteMany({ where: { shop } });
      await db.tryOnAsset.deleteMany({ where: { shop } });
      await db.shop.deleteMany({ where: { shop } });
      await db.session.deleteMany({ where: { shop } });
      break;
  }
  return new Response();
};
