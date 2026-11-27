# Deploying the Ring Try-On app

The same code runs on **Vercel** (now, for the House of Hamara demo) and on **AWS** (later). The host is chosen only by
environment variables — no code changes when moving.

| | Vercel (demo) | AWS (later: EC2 / ECS / App Runner / Elastic Beanstalk) |
|---|---|---|
| Runs as | serverless functions | an always-on Node server (`npm start`) |
| Build command | `npm run vercel-build` (Vercel uses it automatically) | `npm ci && npm run build`, then `npx prisma migrate deploy` |
| Database | Neon Postgres (Vercel → Storage → Marketplace → Neon) | RDS Postgres (or any Postgres) |
| `DATABASE_URL` | Neon **pooled** URL (`…-pooler…`, add `&pgbouncer=true&connection_limit=1`) | the database URL |
| `DIRECT_URL` | Neon **direct** URL (used for migrations only) | leave empty |
| `WORKER` | `off` — no AI image generation on Vercel (demo uses existing images) | `on` — generator / "Generate all" work as on the laptop |
| Viewer page (`/apps/ring-tryon/viewer`) | read from the app's own URL (public/ is on Vercel's CDN) | read from disk |

## Environment variables (both hosts)

| Name | Value |
|---|---|
| `SHOPIFY_API_KEY` / `SHOPIFY_API_SECRET` | Partner Dashboard → the app → **API credentials** (the `ring-try-on` app, client id in `shopify.app.ring-try-on.toml`) |
| `SHOPIFY_APP_URL` | the public URL, e.g. `https://ring-try-on.vercel.app` (no trailing slash) |
| `SCOPES` | `read_products,write_products,read_files,write_files,write_app_proxy` |
| `DATABASE_URL`, `DIRECT_URL`, `WORKER` | see the table above |
| `OPENAI_API_KEY`, `OPENAI_IMAGE_MODEL`, `TRYON_GENERATOR`, `AI_MONTHLY_LIMIT` | only needed where images are generated (AWS / laptop) |
| `NODE_ENV` | `production` |

## Vercel — step by step (demo)

1. **Database**: Vercel project → Storage → Marketplace → **Neon** → create. Copy the pooled and the direct URL.
2. **Copy the current data** (store session, try-on images list, products, saved looks) from the laptop into Neon:
   ```bash
   pg_dump --no-owner --no-acl "postgresql://jitesh@localhost:5432/ring_tryon" > ring_tryon.sql
   psql "<NEON DIRECT URL>" < ring_tryon.sql
   ```
   (Without this the app still works after reinstalling it on the store, but the try-on images list is empty.)
3. **Import the GitHub repo** in Vercel (Add New → Project → `ring-try-on-3d`). Framework: **Remix** (detected).
   Build command: leave the default (`vercel-build` from package.json).
4. **Environment variables**: set everything from the tables above (`WORKER=off`). Deploy.
5. **Point Shopify at Vercel**: in `shopify.app.ring-try-on.toml` replace every `https://example.com` / tunnel URL with
   the Vercel URL (`application_url`, `[auth] redirect_urls`, `[app_proxy] url` = `<url>/proxy`), then
   `npm run deploy` (pushes the app config + theme extension to Shopify).
6. **Test on house-of-hamara-demo**: open a ring product → Try it on, stack rings, metal values, My looks, share link,
   Add to cart. Admin: open the app from the store admin.

## AWS — later

Same steps, with: an always-on server (`npm ci && npm run build && npx prisma migrate deploy && npm start`, port `PORT`
or 3000 behind a load balancer with HTTPS), RDS Postgres as `DATABASE_URL`, `DIRECT_URL` empty, `WORKER=on`, and the
OpenAI variables if images are generated there. Then step 5 with the AWS URL. Run **one** instance of the server (the
image queue runs inside it) or one dedicated worker with `WORKER=on` and the web instances with `WORKER=off`.
