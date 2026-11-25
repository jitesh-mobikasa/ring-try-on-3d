# Ring Try-On: Shopify app

The merchant adds a ring product with a photo. The app uses OpenAI to make a **transparent try-on image** from it,
**once**, and saves it in Shopify. Shoppers click **Try it on** on the product page and see that exact ring on a hand,
then switch rings, pick metal and size, and add to cart.

## How it works

```
Merchant clicks "Generate" (one product) or "Generate all missing" in the app
   ▼
Queue (DB: TryOnAsset.status = queued)
   │  background worker in the app server
   ▼
OpenAI images/edits (gpt-image-1, background=transparent)  →  sharp trims the margins
   ▼
Shopify Files (Content → Files)  →  product metafield  tryon.asset = { image, scale, offsetY, enabled, source }
   ▼
Theme block reads the metafield → "Try it on" → viewer at https://<store>/apps/ring-tryon/viewer (app proxy)
```

**Only when the merchant clicks.** Nothing is generated automatically. A product is processed again only when the
merchant clicks *Regenerate* (the dashboard shows **"Photo changed"** when the main photo is newer than the try-on image). Every try-on after that just loads the saved PNG from Shopify's CDN: no AI and no cost.

| Where | What is stored |
|---|---|
| **Shopify Files** | The try-on PNG (merchant's own storage and CDN) |
| **Product metafield `tryon.asset`** (JSON, storefront-readable) | Image URL + fit (scale, offsetY) + on/off. The theme reads this. |
| **App database** (`TryOnAsset`, `Shop`) | Status per product (none / queued / processing / ready / failed / manual), errors, retries, source photo id, plan, monthly usage |

### Status per product
`none` → `queued` → `processing` → `ready`, or `failed` (with the reason; retried automatically up to 3×).
`manual` = the merchant uploaded their own PNG; Regenerate replaces it only when clicked.
The dashboard shows **"Photo changed"** when the main photo is newer than the try-on image.

## Tech stack
TypeScript (strict) · Remix + Vite · Shopify App Remix + Polaris · PostgreSQL + Prisma · sharp · OpenAI Images API · three.js viewer

## Folder structure

```
ring-try-on/
├── app/
│   ├── shopify.server.ts          Shopify auth, install hook (creates the metafield definition)
│   ├── db.server.ts               Prisma client (PostgreSQL)
│   ├── components/
│   │   └── CompareModal.tsx       photo vs try-on image, side by side
│   ├── lib/
│   │   ├── shared.ts              statuses, small helpers (server + browser)
│   │   ├── graphql.server.ts      typed Shopify Admin GraphQL helper
│   │   ├── products.server.ts     products read live from Shopify
│   │   ├── jobs.server.ts         queue, worker, quota, retries
│   │   ├── generator.server.ts    photo → transparent try-on PNG (free cut-out or AI)
│   │   ├── openai.server.ts       OpenAI: redraw the ring seen from above
│   │   ├── cutout.server.ts       free background removal
│   │   ├── files.server.ts        upload to / delete from Shopify Files
│   │   ├── metafields.server.ts   tryon.asset metafield
│   │   └── errors.ts              NonRetryable (fail fast, don't spend on retries)
│   └── routes/
│       ├── app._index.tsx         dashboard: products, status, Generate / Regenerate / Generate all
│       ├── app.products.$id.tsx   product: compare, live preview on the hand, fit sliders, own PNG upload
│       ├── app.setup.tsx          one-click "add block to theme"
│       ├── proxy.viewer.ts        app proxy → serves the viewer on the store's domain
│       └── webhooks.*.ts          products, delete, uninstall, scopes, GDPR compliance
├── public/viewer/                 the try-on viewer (hand photo + three.js); image mode + 3D fallback
├── extensions/tryon-theme/        theme app extension: "Ring try-on" block + storefront script
├── prisma/                        schema (Postgres enums for status / view / plan) + migrations
├── docker-compose.yml             local PostgreSQL
└── shopify.app.toml               scopes, webhooks, app proxy
```

## Run it locally
1. `npm install`
2. Copy `.env.example` → `.env` and fill in `OPENAI_API_KEY` (server-only; shoppers never see it).
3. PostgreSQL: `npm run db:up` (Docker), or point `DATABASE_URL` at your own Postgres.
4. `npm run db:migrate` creates the tables.
5. `npm run config:link`: create or pick the app in your Partner account.
6. `npm run dev -- --store your-dev-store.myshopify.com`: starts the app with a tunnel and live-reloads the theme extension.
7. In the app: **Theme setup → Add block in theme editor** → Save.
8. Open **Products** in the app → **Generate** on a ring → **Ready**.
9. Open the product in the store → **Try it on**.

| Script | What it does |
|---|---|
| `npm run dev` | Run the app on a development store |
| `npm run typecheck` | TypeScript check (strict) |
| `npm run build` | Production build |
| `npm run db:migrate` | Create / apply a migration after editing `prisma/schema.prisma` |
| `npm run db:deploy` | Apply migrations in production |
| `npm run db:studio` | Browse the database |
| `npm run deploy` | Publish app config, webhooks, app proxy and theme extension |

## Go live (production)
- Host the app on a server that stays running (Fly.io, Render, Railway, a VPS…), because the background worker lives in the app process.
- Create a hosted PostgreSQL database and set `DATABASE_URL`; run `npm run db:deploy`.
- Env: `SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET`, `SHOPIFY_APP_URL`, `SCOPES`, `OPENAI_API_KEY`, `DATABASE_URL`, `TRYON_GENERATOR`, optional `AI_MONTHLY_LIMIT`.
- `npm run deploy` pushes the app config, webhooks, app proxy and theme extension.

## AI image limit (optional)
No plans or billing: this is a custom app for one client. To cap OpenAI cost, set `AI_MONTHLY_LIMIT` (AI images per 30 days,
e.g. `200`) on the server. Unset = no limit. Free cut-outs (`TRYON_GENERATOR=local`) never count. Shopper try-ons are unlimited.

## Fine-tuning the look
- **Prompt:** `PROMPT` in `app/lib/openai.server.ts` asks for a top-down ring, band left-to-right, on white (the free cut-out then removes the white).
- **Size / position per product:** the sliders on the product page, previewed live on the hand.
- **Global size:** `R * 2.35` in `imageRing()` in `public/viewer/index.html`.
- **Model / quality:** `OPENAI_IMAGE_MODEL`, `OPENAI_IMAGE_QUALITY` env vars.
