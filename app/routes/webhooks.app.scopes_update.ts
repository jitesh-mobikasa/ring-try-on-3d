import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { payload, session } = await authenticate.webhook(request);
  if (session) await db.session.update({ where: { id: session.id }, data: { scope: String(payload.current) } });
  return new Response();
};
