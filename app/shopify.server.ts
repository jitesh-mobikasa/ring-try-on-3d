import "@shopify/shopify-app-remix/adapters/node";
import { ApiVersion, AppDistribution, shopifyApp } from "@shopify/shopify-app-remix/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import prisma from "./db.server";
import { ensureDefinition } from "./lib/metafields.server";

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  apiVersion: ApiVersion.October26,
  scopes: process.env.SCOPES?.split(","),
  appUrl: process.env.SHOPIFY_APP_URL || "",
  authPathPrefix: "/auth",
  sessionStorage: new PrismaSessionStorage(prisma),
  distribution: AppDistribution.AppStore,   // Partner-dashboard app (custom OR public distribution both use AppStore + OAuth; ShopifyAdmin = admin-created apps with a fixed token)
  hooks: {
    afterAuth: async ({ session, admin }) => {
      await prisma.shop.upsert({
        where: { shop: session.shop },
        create: { shop: session.shop },
        update: { uninstalledAt: null },
      });
      const errors = await ensureDefinition(admin);
      if (errors.length) console.warn("[tryon] metafield definition:", errors);
    },
  },
  future: { unstable_newEmbeddedAuthStrategy: true },
  ...(process.env.SHOP_CUSTOM_DOMAIN ? { customShopDomains: [process.env.SHOP_CUSTOM_DOMAIN] } : {}),
});

export default shopify;
export const apiVersion = ApiVersion.October26;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;
