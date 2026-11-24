# Browser tests

Real-browser (Chromium) tests for the try-on viewer, the theme scripts and the ring configurator.
They run against local files with Shopify's endpoints faked, so no store or dev server is needed.

```bash
npx playwright install chromium   # once
npm run test:e2e                  # all tests
npm run test:e2e -- configurator  # only files whose name contains "configurator"
```

Screenshots and downloaded images are written to `tests/e2e/output/` (not committed).

| File | What it covers |
|---|---|
| `tryon-core.test.mjs` | Ring list paging, drag a ring from the list onto a finger, several rings, swap, left / right hand, remove |
| `load-more.test.mjs` | Loading more rings from the store (`/apps/ring-tryon/products`), no duplicates, add to cart for a later ring |
| `studio.test.mjs` | Tutorial, search + filters, product details, menu drawer, complexion, both hands, download, share link, sign in, My looks (save / open / delete), help, My selections + Buy this look, mobile sheet + swipe row |
| `configurator.test.mjs` | PDP configurator: options, live price, price differences, missing combinations, sold out, US / AU sizes, engraving + fee, cart call, mobile |

**Keep these tests.** When a feature changes, update its test; when a feature is added, add checks for it.
A test prints `PASS` / `FAIL` lines; `run.mjs` exits with code 1 if anything failed.
Note: `studio.test.mjs` opens several tabs with 3D views; on a slow machine the shared-link step can time out — run it again.
