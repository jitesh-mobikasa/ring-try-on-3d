/* App proxy: https://<store>/apps/ring-tryon/viewer → this route.
   Serves the try-on viewer on the store's own domain (nothing for merchants to configure).
   Its scripts / images still load from this app via <base href>. */
import fs from "node:fs/promises";
import path from "node:path";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";

const isProd = process.env.NODE_ENV === "production";
let cached: string | null = null;

async function viewerHtml(): Promise<string> {
  if (cached && isProd) return cached;
  const html = await fs.readFile(path.join(process.cwd(), "public", "viewer", "index.html"), "utf8");
  const base = `${(process.env.SHOPIFY_APP_URL || "").replace(/\/$/, "")}/viewer/`;
  cached = html.replace("<head>", `<head>\n<base href="${base}">`);
  return cached;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.public.appProxy(request); // verifies Shopify's signature
  return new Response(await viewerHtml(), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": isProd ? "public, max-age=300" : "no-store",
    },
  });
};
