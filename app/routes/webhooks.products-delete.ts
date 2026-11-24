import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { deleteFile } from "../lib/files.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, payload, admin } = await authenticate.webhook(request);
  const productId = `gid://shopify/Product/${payload.id}`;
  const asset = await db.tryOnAsset.findUnique({ where: { shop_productId: { shop, productId } } });
  if (asset) {
    if (admin && asset.resultFileId) await deleteFile(admin, asset.resultFileId);
    await db.tryOnAsset.delete({ where: { id: asset.id } });
  }
  return new Response();
};
