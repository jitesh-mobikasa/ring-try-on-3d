import type { ActionFunctionArgs } from "@remix-run/node";
/* Mandatory GDPR webhooks. The app stores no customer data, only product images per shop. */
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop } = await authenticate.webhook(request);
  switch (topic) {
    case "CUSTOMERS_DATA_REQUEST":
    case "CUSTOMERS_REDACT":
      break; // no customer data stored
    case "SHOP_REDACT":
      await db.tryOnAsset.deleteMany({ where: { shop } });
      await db.shop.deleteMany({ where: { shop } });
      await db.session.deleteMany({ where: { shop } });
      break;
  }
  return new Response();
};
