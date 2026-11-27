# Ring Try-On — Task Tracker

Source: *Try-On Studio & Customisable PDP — Feature List* (5 Nov 2026, House of Hamara).
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

- [x] **Professional UI pass** (2026-11-25): "Powered by HAMARA" removed; neutral stone / ink palette (no pink); one type scale; left-aligned headings; quiet icon rail with a thin active bar; Rings / Bracelets switch at the top of the drawer; cleaner cards, chips and inputs; black primary buttons; icon buttons on the canvas (Left / Right top-left, menu + close top-right, zoom + rotate bottom-right); skin-tone slider moved off the canvas (☰ menu → Complexion); messages placed below the toolbar. Desktop + mobile checked by screenshot, no JS errors

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
- [x] **Decided: custom app, House of Hamara only** (2026-11-25) — no App Store listing / review / de-branding needed
- [x] Code: stays `distribution: AppDistribution.AppStore` — correct for Partner-dashboard custom apps too (OAuth). *(`ShopifyAdmin` is for admin-created apps with a fixed token; tried it 2026-11-25, it crashed dev — reverted.)* Custom vs public is chosen only in the Partner Dashboard.
- [ ] Partner Dashboard → app → **Distribution → Custom distribution** → enter House of Hamara's `xxx.myshopify.com` → copy the install link (can't be undone)
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
- [x] ~~Bracelets worn on the hand~~ — **reverted 2026-11-26**: bracelets are generated like rings again (bracelet image alone); only the wrist fitting in the viewer was kept. (Was: TRYON_GENERATOR=openai): OpenAI gets our bracelet hand photo + the product photo + a wrist-only mask and puts the bracelet ON the wrist; we keep only the changed wrist area (bracelet + shadow) as a transparent layer (`app/lib/worn.server.ts`, view `worn`, migration `20261126150000_asset_view_worn`); the try-on lays it on the hand exactly where it was made (no sliding for these)
- [x] Wrist-fit calculation for non-worn bracelet images: width = measured wrist width (× length looseness × admin scale), wrapped over the front half of the wrist (foreshortened + shaded sides), slight smile, contact shadow, cut to the arm outline; still draggable along the wrist
- [x] Fix: zoom button zooms to the wrist for bracelets (did nothing since bracelets are drawn as a layer)
- [x] Kada / bangle fit: rigid bands (thick in the image) are 12 % wider than the wrist and keep their sides just outside the arm (small gap), stronger shadow; chains still hug the wrist (cut to the arm)
- [x] Bracelet **size (length)**: option found by name (Length / Size / Bracelet size / Wrist size, or values like "18 cm", '7"') and never used as a ring size; fit from real cm vs the model's 15.5 cm wrist (17 cm = comfortable; longer → wider + lower); "Size (length)" pills + fit note (snug / comfortable / loose)
- [x] "How it works" has ring and bracelet versions (bracelet page → bracelet steps), updated for single-product mode, skin slider and no ☰ menu
- [x] Admin dashboard polish for the demo: title "Virtual Try-On", 4 stat cards (Products / Rings / Bracelets / Try-on ready with progress bar; ring + bracelet cards filter the list), table = Product (photo + name + short description) · Type (Ring / Bracelet + Auto-detected / Set by you) · Try-on image (thumb + status) · Store status · Generate / Regenerate; no horizontal scroll
- [x] New bracelet photo: lifestyle portrait (`Minimalist Beauty Portrait with Gentle Touch.png`, 1024 px in hands.js): grey background + face kept (`keepBg`), wrist at (520, 593) rot 25° half width 103, bracelet rotated across the arm, chains clipped to the arm by skin colour, Skin slider hidden on this photo, no rings drawn on it
- [x] "On you" tab and the QR code card hidden (CSS only, code kept)
- [x] New ring photo: `Minimalist Hand Product Portrait.png` (1254 → 1024 px, in hands.js); measured with tools/hand-measure (ring-hand.json → out/ring-check.png): ring spots just above each web, slide ranges, finger widths / centre lines → HANDS.ring
- [x] Wrist drop zone hidden (`SHOW_WRIST_ZONE = false` in the viewer; dragging / tapping the bracelet still works)
- [x] Skin slider: recolours only the skin pixels (nails / background untouched), keeps highlights; no more tint on the whole hand. Real per-tone photos still to come (waiting for the generated tone images)
- [x] Skin slider keeps the **nails** natural: the nail area is found from the measured fingers (from where the nail starts to the fingertip), not by colour; `hands.js?v=` bumped so browsers load the new photos
- [x] **Real skin-tone photos** for the ring hand: 3 versions (medium, brown, deep) made from our photo with gpt-image-2 (same pose), aligned to the original (IoU 0.95–0.97), in hands.js `HAND_SRCS.ringTones`; the Skin slider shows the nearest real photo (stops 15 / 45 / 72 / 100), recolouring only as a fallback
- [x] **Smooth skin-tone transition** (2026-11-26, lead feedback: hand pose visibly changed / photos switching when moving the Skin slider): dropped the separate AI tone photos (fingers didn't line up). One photo for every tone, only the skin pixels recoloured, with colour factors measured from the real tone photos (medium, brown, deep). hands.js 936K → 452K. Checked and approved
- [x] **Centre stone by carat** (like Brilliant Earth), replacing the "Stone size %" slider: the ring's Carat variant option (block setting "Centre stone carat option name", or values like "1 ct" / "1 1/2 carat") → "Centre Stone" pills with real price per metal × carat, sold-out marked, "≈ 6.5 mm across" note; the stone on the hand is drawn at real size (width ∝ ∛carat from the carat in the photo); carat goes to the cart (variant match) and into saved / shared looks. Admin product page: "Carat of the centre stone in the product photo" (`shown_carat`, migration `20261126160000_shown_carat`, metafield `shownCarat`). % slider kept behind `STONE_PERCENT` (off)
- [x] Store (test): **Carat** option added to the 4 rings by `tools/add-carat.mjs` (0.5 / 1 / 1.5 / 2 ct, price × 0.7 / 1 / 1.6 / 2.4, "continue selling" on, photo carat = 1). Reusable on any store with the app installed: `npm run add-carat -- --shop <store>.myshopify.com` (dry run) then `--apply`; options `--values`, `--multipliers`, `--base`, `--photo-carat`, `--products`, `--option-name`, `--keep-stock-policy` (see the top of `tools/add-carat.mjs`)
- [x] Fix: try-on crashed on start (showed the built-in demo page) once a ring had Carat variants — stone size limits were used before they were defined; moved up. Checked in headless Chrome: try-on opens, carat pills, $7.00 at 1 ct, no errors
- [x] Demo catalogue on the test store (`tools/demo-catalog.mjs`, `npm run demo-catalog -- --shop … [--apply]`): jeweller names, descriptions with stone / metal details, product types, vendor House of Hamara, tags, SEO, **Metal** option (18ct Yellow / White / Rose Gold, Platinum), bracelet **Length** 16/17/18 cm, realistic prices for every variant (base × metal × carat × length × shape), continue selling on. Aria ring keeps "Ring size" (linked to Shopify category data, can't be renamed)
- [x] Left hand for bracelets: its own portrait (`Left Hand (2).png` → 1024 px, `HAND_SRCS.braceletLeft`), not mirrored; wrist (648, 735), arm tilt −30°, half width 105; the bracelet is re-fitted when switching hands. Checked in headless Chrome (Left shows the new photo, no errors)
- [x] Right hand for bracelets: `Right Hand (1).png` (matching the left-hand photo) → `HAND_SRCS.bracelet`; wrist (586, 735), arm tilt 27°, half width 106
- [x] Bracelet alignment on the new portraits: wrist spots moved to the narrowest part of the wrist (right 547,800 · left 702,810), kada 7 % wider than the wrist (was 12 %). Checked by rendering the kangan on both photos in headless Chrome
- [x] Bracelet curve per hand photo (`wrist.curve`): the portraits' forearm comes towards the camera, so the bracelet is drawn as an oval front (30 % curve, was a flat 10 %) — now wraps round the wrist. Checked by rendering the kangan on both hands
- [x] Bracelet position D (chosen from a rendered comparison): right (556, 785) 13°, left (694, 795) −15°
- [x] **Bangle sizes** by inner diameter (Indian 2.2–2.10 = 54–67 mm, or "60 mm"), not cm: try-on reads them (`bangleMM`), "Bangle size" label, fit note (snug / comfortable / loose, mm inside), looser drawing for bigger sizes; kangan on the test store → "Bangle size: 2.4 (57 mm) / 2.6 (60 mm) / 2.8 (64 mm)"; chain bracelets stay Length in cm
- [x] Bangles / cuffs: back half of the loop drawn (darker, hidden behind the wrist), ends fade and darken as they turn away instead of a hard cut. Checked with the "gold bangles" cuff and the kangan
- [x] White diamonds no longer cut out: on a pure white AI backdrop the cut-out only removes near-perfect white (tolerance 6, was 28) → tennis bracelet stones stay solid (tested: 35 % → 53 % of the band kept, all stones). gpt-image-2 can't return a transparent background (tried; falls back automatically). Bracelet prompt: clasp must not appear. Rigid bangle = by name / type (bangle, kada, kangan, cuff), not image shape
- [x] **Wrist measured live on the photo** (`measureWrist`): real arm edges → centre + width, arm angle from two cross-sections, settles in 4 passes; the bracelet is fitted edge to edge. Works for any model photo from a rough wrist point (tested: a 0°, off-centre start lands on the same fit). README in tools/hand-measure
- [x] Bracelets: default spot lower on the wrist (where the shopper placed it); **default size = best fit for the model's wrist** (bangle ≈ 60 mm → 2.6, chain ≈ 17 cm), the shopper can change it; **metal choice recolours the bracelet** (rose / white gold / platinum tones, stones kept); soft highlight along the band + darker lower edge. Constants moved up so the start-up can't crash. Checked: yellow vs rose render, default 2.6 selected
- [ ] Regenerate **Lumière** and **Celestine** to get solid stones (strict cut-out is bracelets only; rings unchanged)
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
- [x] **My looks across product pages** (2026-11-26, found in the client demo): a look saved on a bracelet page showed "These pieces are no longer available" on a ring page (only that page's products are loaded). Now the viewer asks the store for the missing pieces by id first (`ensureProducts` in public/viewer/index.html → theme script `byKeys` → `/apps/ring-tryon/products?ids=…`), for My looks and shared look links; add to cart works for them too. Real cause on the demo store: it is password-protected, so Shopify returns onlineStoreUrl = null and the proxy dropped every product (also hit "load more"); now an active + published product falls back to /products/<handle>. Checked on house-of-hamara-demo: works
- [ ] **Carat changes only the stone, not the band** (2026-11-26, client demo feedback: at 2 ct the band next to the stone got thicker). The old radial "lens" magnified a circle wider than the stone. Now `stoneBox()` finds the stone in each try-on image (columns much taller than the band) and the shader resizes only that ellipse, drawn over the unchanged band; a smaller stone gets the band continued at its own thickness. Signet rings (Ashoka: face as wide as the band area) are not resized. Stone area = rounded square (covers the corner prongs); the image's faint glow is left out of the resized stone (its cut edges showed as dotted lines on dark skin). Checked in a browser at 0.5 / 1 / 2 ct (Malborun, Celeste, Ashoka); check on house-of-hamara-demo, then tick
- [ ] **Default hand = Left** (2026-11-26): viewer starts on the left hand, toggle highlights Left; poses test picks each side itself
- [ ] **Bracelet "shadow" removed** (2026-11-26): the dark back half of a bangle showed through over pale skin as a grey strip (now always hidden across the arm's width); the turned-away ends were darkened with near-black (looked grey) → lighter, warm shading; contact shadow on the skin removed completely (still showed as a grey smudge under the tennis bracelet). Checked in a browser (Kangan, gold bangles, Celestine)
- [ ] e2e: 1 check fails ("One hand photo only") and load-more / poses / studio / tryon-core crash — same on the last commit, so not caused by today's changes; to fix
- [ ] **No demo page flash when opening the try-on** (2026-11-26): the viewer's built-in demo shop page (logo, "Demo – open another product", Lara Oval) showed inside the try-on window until the 3D scene had loaded (body.embed was set at the end of the script). Now an inline script in <head> marks the page as embedded as soon as the URL has #c=…, so it is hidden before anything is drawn. Check on house-of-hamara-demo, then tick
- [ ] **One try-on image per metal** (2026-11-26): picking another metal didn't change the piece on the hand (rings were never recoloured; bracelets only from yellow gold, so white → yellow did nothing). Now generating a product also reads its variants: each metal with its own variant photo gets its own AI try-on image (the metal in the main photo reuses the main image). Stored in try_on_assets.metal_images (migration 20261126170000_metal_images) and in the metafield as metalImages { Y: url, … }; snippet + app proxy pass it on; the viewer uses that metal's image (no recolouring), else the main image as before. Costs 1 OpenAI image per extra metal. Existing products need a Regenerate to get them. Check on Lumière (3 metals), then tick
- [ ] **Ring size follows the finger** (2026-11-26): the active ring gets the best size for the finger it's on (`autoSize`, uses `bestSize`), on every placement / move; a size the shopper picks in the dropdown is kept (cfg.sizeManual). Checked: ring US 6, index 8.5, middle 7.5, pinky 5
- [ ] **Shared look links with a bracelet** (2026-11-26): a shared bracelet look opened on a ring page stayed on the close-up ring photo (no wrist) → bracelet not drawn. Now a shared link switches to the right photo like "Open" in My looks (`showLookHand`); message says "pieces", not "rings". Checked in a browser with the Celestine look on the Malborun page; check the real link on house-of-hamara-demo, then tick
- [ ] **Ring stacking** (2026-11-26, branch feature/ring_stack): up to 3 rings on one finger (STACK_MAX), each 2.6 mm above the one below (STACK_MM, in the finger's slide steps). A ring dropped / tapped onto a finger with rings stacks on top; a full finger replaces its top ring (new ring) or swaps (moved ring). Parked rings keyed "ring", "ring~1", "ring~2" (state.slot = the active one's), so fit / size / drawing still use the plain finger. Removing a ring closes the gap. Labels "Ring finger · 2 of 3" in chips, Selected and cart lines; drop zones "Stack (n)" / "Replace top ring". Looks + share links keep the stack order. Test: tests/e2e/stack.test.mjs. Check drag-and-drop by hand on house-of-hamara-demo, then tick
- [ ] **"Try more rings" on ring product pages** (2026-11-26): the store's rings (hidden on product pages before) under the buttons as a 2-column list (tap = stack on the current finger, drag = any finger), loading more as you scroll. No dropdown. Bracelet pages: switched off (MORE_PICK_BRACELETS = false; one bracelet at a time). My looks on a product page lists only the matching kind (ring looks on ring pages, bracelet looks on bracelet pages). No collection on the block → collections.all (theme) / every active product (app proxy, handle "all"); only products with a try-on image are listed
- [ ] **My looks: newest first, never stale** (2026-11-26): a just-saved look didn't show (list request could come from a cache) → GET /looks uses cache:'no-store' + a unique ?t=, and the viewer sorts newest first
- [ ] **Skin tone saved with looks** (2026-11-26): looks / share links store t = skin tone (0–100) and restore it on open (old looks keep the current tone)
