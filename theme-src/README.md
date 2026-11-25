# Storefront scripts (readable source)

Edit the scripts **here**, not in `extensions/tryon-theme/assets/`.

| Source | Built to | What it does |
|---|---|---|
| `tryon.js` | `extensions/tryon-theme/assets/tryon.js` | "Try it on" button: opens the viewer, add to cart, Buy this look, loading more rings, share / login links |
| `configurator.js` | `extensions/tryon-theme/assets/configurator.js` | PDP ring configurator: options, live price, engraving, add to cart |

`npm run build:theme` minifies them into the extension (Shopify's theme check wants app block scripts under 10 KB).
`npm run deploy` runs it automatically first. Run it yourself before `npm run dev` / tests after editing.
