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
- [x] Personalisation — skin tone ✅ · zoom / rotate ✅ · **one hand + Left / Right** ✅. Hand photo now `hand_for_bracelet.png` (hand + wrist + forearm, for rings AND bracelets); fingers + wrist measured with `tools/hand-measure`.
- [x] My Selections panel ("Selected" tab) — both hands, image, finger, size, metal, price, total, edit / add / remove, count badge
- [x] **Buy This Look** — every ring on both hands in ONE cart call; sold-out rings skipped and reported; "Worn on" on each order line
- [x] Add to cart per ring
- [x] Mobile layout — hand on top, bottom sheet you drag up / down (3 heights), swipeable ring row
- [x] Stone size slider (visual only)
- [x] Ring sizes **US only everywhere** (try-on + PDP configurator) — AU/NZ removed on request (2026-11-25)

### Bracelets (in scope since 2026-11-25)

- [x] **Two hand photos** (2026-11-25): **Rings** tab → close-up hand (`Gemini_Generated_Image_rp1ifgrp1ifgrp1i (6).png`, rings look bigger); **Bracelets** tab → hand + wrist (`hand_for_bracelet.png`, wrist at y 744, 178 px wide). Photo follows the switch; rings re-fitted to each photo; downloads / saved-look pictures use the wrist photo when a bracelet is on. Data: `tools/hand-measure/ring-hand.json`, `bracelet-hand.json`
- [ ] `tests/e2e/poses.test.mjs` still expects one hand (`back`) — update when tests are done
- [x] Ring / bracelet **detection** (Shopify category → product type → tags → title; earrings / necklaces = shop-only). Stored per product (`kind`, `kind_manual`), migration `20261125120000_jewellery_kind`
- [x] Dashboard: **Type** column (Ring / Bracelet, "(auto)" when detected) + **All / Rings / Bracelets** filter
- [x] Product page: **Type** dropdown (Auto / Ring / Bracelet / Not a ring or bracelet); warns if the image was made for the other type
- [x] **Bracelet AI prompt** (front half as worn, left → right, motif in the middle, clasp hidden) — `app/lib/openai.server.ts`
- [ ] **Test the bracelet prompt** on 3–5 real bracelets (needs `TRYON_GENERATOR=openai`) → review results together
- [x] Theme block: **Bracelets collection (handle)** text setting, default `bracelets` (app blocks allow only one collection picker) (rings and bracelets can be in different collections); "Try it on" also on bracelet pages (bracelet starts on the wrist); bracelet-only stores work (no ring drawn)
- [x] Admin product page: **Preview on the wrist** for bracelets
- [ ] **Not run in a browser yet** — test on the store, then add browser tests (`tests/e2e`)
- [x] Draw a bracelet on the wrist (try-on image wrapped round the wrist, sized from the measured wrist; plain band if no image yet); drag it up / down the wrist; tap it to edit
- [x] Wrist drop zone: dragging a bracelet card highlights the wrist ("Wrist" / "Replace bracelet"); drop anywhere on the hand → wrist
- [x] **Rings / Bracelets** switch in the drawer (search, filters, paging per list); bracelet options: metal + **Length**; "Add bracelet to cart"; Remove bracelet
- [x] Left / right: each hand keeps its own bracelet
- [x] Fix (2026-11-25): **Details** shows the bracelet in Bracelets mode (was always the ring); bracelets list their Lengths instead of ring sizes; "Try it on" in Details puts a bracelet on the wrist
- [x] **Ring is optional** (2026-11-25): opening from a bracelet page shows only the bracelet; "Remove ring" leaves just the bracelet; tap / drag a ring to add one back. Drawer title, search placeholder and the hint under the hand follow Rings / Bracelets
- [x] Bracelets in My Selections ("Wrist"), Buy This Look (one cart call, "Worn on: Right wrist", Length), save / share / download, My Looks, both hands
- [x] PDP configurator: **Length** option name setting (block renamed "Jewellery configurator"); store cart matches bracelets on metal + Length

### Look & feel

- [x] **Professional UI pass** (2026-11-25): "Powered by AMARA" removed; neutral stone / ink palette (no pink); one type scale; left-aligned headings; quiet icon rail with a thin active bar; Rings / Bracelets switch at the top of the drawer; cleaner cards, chips and inputs; black primary buttons; icon buttons on the canvas (Left / Right top-left, menu + close top-right, zoom + rotate bottom-right); skin-tone slider moved off the canvas (☰ menu → Complexion); messages placed below the toolbar. Desktop + mobile checked by screenshot, no JS errors

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

- [x] Fix (2026-11-25): saved looks with **sold-out** pieces now open (shown on the hand, just not buyable); Open is disabled only when a piece is no longer in the store's list; cards say "pieces" instead of "rings"

- [x] Fix (2026-11-25): **Open** on a saved look switches to the right photo (bracelet look → hand + wrist photo and Bracelets tab), so the bracelet no longer disappears

- [x] Drawer (2026-11-26): search + filters hidden (code kept); rings / bracelets in a **carousel, 2 at a time**, with ‹ › arrows, swipe, "1–2 of 14"; more load as you reach the end

## Feedback (2026-11-26)
- [x] Opened from a **bracelet** product page → only bracelets (no Rings tab, no ring on the hand; side tab says "Bracelets")
- [x] Bracelet **drop zone**: as soon as a bracelet card is dragged, the wrist photo shows a "Drop on the wrist" zone; it fills in over the photo; drop anywhere on the photo puts it on the wrist
- [x] Ring "gets stuck" size rule **commented out** (`stopOf` in the viewer): every size slides down to the base; fit messages no longer say "stuck"

- [x] **Single-product try-on**: from a product page it shows only that product (no Rings/Bracelets tabs, no carousel, nothing extra loaded); `SINGLE` flag in the viewer turns the carousel back on

- [x] Kada / bracelet **drop zone** in single-product mode: dragging the bracelet shows the wrist band it can slide along; after "Remove bracelet" the wrist stays marked ("Tap to put the bracelet on") and a tap puts it back

- [x] Single-product mode: **Remove bracelet / Remove ring** links hidden; **Left ↔ Right** keeps the piece on (moves to the other hand) instead of starting an empty hand

- [x] ☰ menu button hidden (drawer code kept); **How it works** + **Help** buttons under Save / Share / Download; **skin tone** as a vertical slider on the left edge of the hand view (drag up = lighter, down = deeper); "View both hands" is no longer reachable (was only in the menu)

- [x] Fix: bracelet / kangan try-on image is drawn **flat as generated** (was wrapped round a cylinder again + stone lens → squeezed sides, smeared pattern, lost rim); ~10 % wider than the wrist

- [x] Bracelet AI prompt v2: camera exactly level, only the outer front face (no top rim / inside / opening), straight edges, soft daylight → **Regenerate** bracelets to apply
- [ ] Regenerate kangan + bracelets and compare; then decide on contact shadow / lighting / size tweaks in the viewer

## Product sync (2026-11-26)
- [x] `Product` table (basic info only: title, handle, description, type, tags, category, status, main photo, detected kind) + migration `20261126120000_products`; prices / variants / stock stay live
- [x] **Sync products** button on the dashboard (all products, 250 per request, in the background; deleted products removed); runs automatically the first time; "Last synced …" + error banner
- [x] Webhooks `products/create|update` re-read the product into the table; `products/delete` and `shop/redact` remove it
- [x] Sync rebuilds missing try-on records from the product's `tryon.asset` metafield (images already on the store)
- [x] Dashboard reads from our database: filters **Type** (All / Rings / Bracelets / Other), **Try-on** (Not generated / Ready / Generating / Failed / Photo changed), **Status** (Active / Draft / Archived), search (title, handle, type, tag), page numbers, product + kind counts
- [x] Fix: `sessions` table gets `refresh_token` / `refresh_token_expires` (migration `20261126130000_session_refresh_token`), needed by the Shopify library to save the login
- [x] **Generate all** button (dashboard): confirmation with counts (all / only rings / only bracelets), time estimate and OpenAI cost warning + monthly limit; picks products from our database, answers at once, queues in the background; skips ready / uploaded / generating / failed / archived / no photo / Other
- [x] **Checkboxes** in the product table → "Generate selected (N)" (also regenerates ready / failed ones; skips no photo, Other, uploaded, already generating)
- [x] **Pause / Resume / Cancel all waiting** banner while anything is queued (`shops.queue_paused`, migration `20261126140000_queue_paused`); the image in progress finishes, cancelled ones go back to Not generated at no cost
- [ ] Try it on the dev store: open the app → first sync runs → filters → Generate → edit a product in Shopify → it updates
- [ ] Browser tests for the dashboard (later)

## What's left

**Code: done.** Everything left needs the real store, a decision, or an asset from the client.

1. Restart `npm run dev`, then verify on the real store + a phone (section 2)
2. Create the `customisable` template + set up ring variants on the store (section 3)
3. Decide custom vs public app → go-live checklist (section 4)
4. Later: run the browser tests (`npm run test:e2e`); optional: turn curated looks back on
