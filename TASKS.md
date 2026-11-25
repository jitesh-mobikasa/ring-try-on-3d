# Ring Try-On — Task Tracker

Source: *Try-On Studio & Customisable PDP — Feature List* (5 Nov 2026, House of Amara).
**Scope: rings only.** Bracelets, wrist snap point and wrist views are out of scope for now.

Legend: `[x]` done · `[ ]` to do · `[~]` partly done · `[-]` built but switched off
Last updated: 2026-11-24

---

## 0. Foundation (done)

- [x] Shopify app: embedded admin, products dashboard, generate / regenerate try-on images (OpenAI or free cut-out)
- [x] Try-on image saved to Shopify Files + `tryon.asset` product metafield
- [x] Theme app extension: "Try it on" block on the product page
- [x] Viewer served on the store's domain through the app proxy (`/apps/ring-tryon/viewer`)
- [x] Add to cart → Shopify cart → checkout → real Shopify order (ring size + metal on the order line)
- [x] GDPR webhooks, uninstall cleanup *(plans + Shopify billing removed 2026-11-25 — custom app)*

---

## 1. Try-On Studio: core features

- [x] Two-column studio: hand canvas + tabbed drawer (Rings / Selected / My looks / On you)
- [x] Drag and drop with snapping onto each finger, real-size fit messages
- [x] Several rings on the hand, one per finger (chips to switch / remove)
- [x] Drag a ring from the drawer onto a finger
- [x] Drop zones highlight while dragging (finger name, "Replace" / "Swap")
- [x] Left / right hand, each hand keeps its own rings
- [x] Ring list loads 12 at a time, then pages from the store's collection (`/apps/ring-tryon/products`)
- [-] Curated look presets with confirmation + in-stock check — built, hidden by choice (see `public/viewer/index.html`, `tabLooks`)
- [x] Personalisation — skin tone ✅ · zoom / rotate ✅ · **one hand + Left / Right** ✅ (new flat hand from the client's Gemini photo, fingers measured for real-size fit). Pose picker **removed on request (2026-11-25)** — just Left / Right.
- [x] My Selections panel ("Selected" tab) — both hands, image, finger, size, metal, price, total, edit / add / remove, count badge
- [x] **Buy This Look** — every ring on both hands in ONE cart call; sold-out rings skipped and reported; "Worn on" on each order line
- [x] Add to cart per ring
- [x] Mobile layout — hand on top, bottom sheet you drag up / down (3 heights), swipeable ring row
- [x] Stone size slider (visual only)
- [x] Ring sizes **US only everywhere** (try-on + PDP configurator) — AU/NZ removed on request (2026-11-25)

## 2. Studio screens and pop-ups

- [x] Studio main screen (canvas + drawer)
- [x] Product detail panel — gallery, description, type, metals, sizes, stock, "View full product page"
- [x] Search and filters — search box, In stock, metal, sort by price (searches the whole collection)
- [x] Menu drawer (☰) — left / right hand, complexion swatches, both hands, save / share / download, help
- [x] View-both-hands pop-up — both hands side by side with their rings, download both
- [x] Open-look — **opens straight away, no confirmation pop-up** (changed on request 2026-11-24; spec listed a confirmation)
- [x] Save-look pop-up (name + picture)
- [x] Share pop-up — link that reopens the same rings, Copy, WhatsApp, Email, native share
- [x] Download — PNG of the hand(s) + list of rings
- [x] Tutorial — 4 steps on first visit, again from the menu / Help
- [x] Help & FAQ pop-up
- [x] My Looks tab — signed-out, empty and list states; open / share / delete
- [x] My Looks: looks with sold-out / unavailable rings say so on the card; Open disabled when none can be put on (was: "nothing happens")
- [x] Messages (toasts) moved to the top of the try-on so the Shopify preview bar / cookie banners can't hide them
- [x] Sign in / sign out through Shopify's normal customer accounts
- [x] Saved looks stored in the app database (`saved_looks`), removed by the customers/redact webhook
- [ ] **Verify on the real store** (`xxx.myshopify.com`, not a preview link): sign in → save → open → share → delete → sign out
- [ ] **Verify on a phone**: press-and-hold drag, bottom sheet, menu, pop-ups

## 3. Customisable PDP configurator

> Decision taken: options are **Shopify variants** (up to 2,048 per product), so price, stock and the order come from Shopify. Engraving = line item property (+ optional "Engraving" fee product).

- [x] "Ring configurator" theme block (`blocks/ring-configurator.liquid`, `assets/configurator.js/.css`)
- [x] Metal (colour swatches)
- [x] Stone colour (colour dots)
- [x] Shape (shape icons)
- [x] Carat (with price difference)
- [x] Ring size (US only), sold-out sizes marked
- [x] Engraving — length limit, allowed characters, counter, on the order line; optional fee product
- [x] Live price as options change (+/− difference next to every choice, compare-at price, engraving fee)
- [x] Missing combinations jump to the nearest valid variant (keeps the latest choices); sold-out → button disabled
- [x] Chosen options reach the cart line and the Shopify order; URL `?variant=` + theme form stay in sync
- [x] Modular sections: Craftsmanship, Materials, Brand story blocks (image / video, text, 3 points, button, colours)
- [~] Two PDP templates — setup guide + one-click "add block" links in the app (**Theme setup** page). *Shopify doesn't let apps create templates; the merchant creates `product.customisable` once (2 minutes).*
- [ ] Set up real products with Metal / Stone / Shape / Carat / Size variants on the store, then check the configurator there

## 4. Before going live

- [x] App name → **ring-try-on** (both `shopify.app*.toml`); deployed as version `ring-try-on-4`
- [x] Storefront scripts under Shopify's 10 KB limit: readable source in `theme-src/`, minified into the extension by `npm run build:theme` (`npm run deploy` runs it first)

- [x] **Update Shopify API version** → 2026-10 (`@shopify/shopify-app-remix` 6, `shopify-api` 15, Prisma 6.19); `collectionByHandle` → `collectionByIdentifier`. Build + typecheck pass. *Restart `npm run dev` after pulling.*
- [x] **Decided: custom app, House of Amara only** (2026-11-25) — no App Store listing / review / de-branding needed
- [x] Code: stays `distribution: AppDistribution.AppStore` — correct for Partner-dashboard custom apps too (OAuth). *(`ShopifyAdmin` is for admin-created apps with a fixed token; tried it 2026-11-25, it crashed dev — reverted.)* Custom vs public is chosen only in the Partner Dashboard.
- [ ] Partner Dashboard → app → **Distribution → Custom distribution** → enter House of Amara's `xxx.myshopify.com` → copy the install link (can't be undone)
- [x] **Plans, billing and the usage section removed** (2026-11-25). Optional OpenAI cost cap: `AI_MONTHLY_LIMIT` env (off by default)
- [ ] Production hosting + PostgreSQL with backups; `prisma migrate deploy` on release
- [ ] OpenAI spending limit (OpenAI dashboard) and/or `AI_MONTHLY_LIMIT` on the server
- [ ] Privacy policy (saved looks, OpenAI image processing) + protected customer data form
- [ ] Error tracking + uptime checks

## 5. Tests (keep them — `tests/e2e/`, `npm run test:e2e`)

- [x] Browser test suite in the repo: try-on core, load more, studio screens, configurator — **93 checks, all passing**
- [x] `npm run test:e2e` runner + README
- [x] `tryon-core.test.mjs` updated for "each hand keeps its own rings" — 17 / 17 pass
- [ ] `poses.test.mjs` — **rewritten for one hand + Left / Right** (no pose picker); not run yet — tests to be covered later
- [ ] `studio.test.mjs` — updated for "Open without confirmation"; **re-run** (`npm run test:e2e -- studio`; its shared-link step is sometimes slow, run again if it times out)

---

## What's left

**Code: done.** Everything left needs the real store, a decision, or an asset from the client.

1. Restart `npm run dev`, then verify on the real store + a phone (section 2)
2. Create the `customisable` template + set up ring variants on the store (section 3)
3. Decide custom vs public app → go-live checklist (section 4)
4. Later: run the browser tests (`npm run test:e2e`); optional: turn curated looks back on
