/* App proxy: https://<store>/apps/ring-tryon/viewer → this route.
   Serves the try-on viewer on the store's own domain (nothing for merchants to configure).
   Its scripts / images still load from this app via <base href>. */
import fs from "node:fs/promises";
import path from "node:path";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";

const isProd = process.env.NODE_ENV === "production";
let cached: string | null = null;

/* The viewer page, from disk where the app runs as a normal Node server (laptop, AWS EC2 / ECS / Beanstalk), else from
   the app's own URL (serverless hosts like Vercel serve public/ from a CDN, it isn't on the function's disk). */
async function readViewer(appUrl: string): Promise<string> {
  try {
    return await fs.readFile(path.join(process.cwd(), "public", "viewer", "index.html"), "utf8");
  } catch {
    const res = await fetch(`${appUrl}/viewer/index.html`);
    if (!res.ok) throw new Error(`viewer ${res.status}`);
    return res.text();
  }
}

async function viewerHtml(): Promise<string> {
  if (cached && isProd) return cached;
  const appUrl = (process.env.SHOPIFY_APP_URL || "").replace(/\/$/, "");
  const html = await readViewer(appUrl);
  const base = `${appUrl}/viewer/`;
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
