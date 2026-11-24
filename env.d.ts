/// <reference types="vite/client" />
/// <reference types="@remix-run/node" />

declare namespace NodeJS {
  interface ProcessEnv {
    NODE_ENV: "development" | "production" | "test";
    SHOPIFY_API_KEY?: string;
    SHOPIFY_API_SECRET?: string;
    SHOPIFY_APP_URL?: string;
    SCOPES?: string;
    SHOP_CUSTOM_DOMAIN?: string;
    DATABASE_URL: string;
    OPENAI_API_KEY?: string;
    OPENAI_IMAGE_MODEL?: string;
    OPENAI_IMAGE_QUALITY?: string;
    /** "local" (free background removal, default) or "openai" (AI redraws the ring from above first) */
    TRYON_GENERATOR?: "local" | "openai";
    /** "false" only in production — otherwise Shopify billing creates test charges */
    BILLING_TEST?: string;
    /** "off" disables the in-process background worker */
    WORKER?: string;
  }
}

// eslint-disable-next-line no-var
declare var prismaGlobal: import("@prisma/client").PrismaClient | undefined;
// eslint-disable-next-line no-var
declare var __tryonWorker: ReturnType<typeof setInterval> | undefined;
