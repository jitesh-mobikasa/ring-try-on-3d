#!/usr/bin/env node
/* Add a "Carat" (centre stone) option to a store's ring products, price every carat from the current price, and
   tell the try-on which carat the product photo shows.

   Works on any store where this app is installed (uses the app's saved offline session from the database).
   DRY RUN by default: it only prints what it would do. Add --apply to change the store.

   Examples
     node tools/add-carat.mjs --shop house-of-hamara.myshopify.com
     node tools/add-carat.mjs --shop house-of-hamara.myshopify.com --apply
     node tools/add-carat.mjs --shop x.myshopify.com --values "0.5 ct,1 ct,1.5 ct,2 ct" --multipliers "0.7,1,1.6,2.4" --apply
     node tools/add-carat.mjs --shop x.myshopify.com --products diamond-ring,carat-lens --apply     (only these handles)

   Options
     --shop <store>.myshopify.com   store (required, or env SHOP)
     --apply                        really change the store (otherwise dry run)
     --values "a,b,c"               carat option values            default "0.5 ct,1 ct,1.5 ct,2 ct"
     --multipliers "x,y,z"          price × for each value          default "0.7,1,1.6,2.4"   (1 = the current price)
     --base "1 ct"                  which value keeps the current price; default = the value with multiplier 1
     --photo-carat 1                carat shown in the product photo (try-on real size); 0 = leave unset   default 1
     --option-name Carat            name of the option              default "Carat"
     --products h1,h2               only these product handles (default: every product the app sees as a ring)
     --keep-stock-policy            don't switch new variants to "continue selling when out of stock"
     --api 2026-10                  Admin API version

   Products are taken from the app's product list (run "Sync products" in the app first). Rings that already have
   an option with "carat" in its name are skipped, so running it twice is safe. */
import { createRequire } from 'node:module';

const require = createRequire(new URL('../package.json', import.meta.url));
const { PrismaClient } = require('@prisma/client');

/* ---------- arguments ---------- */
const argv = process.argv.slice(2);
const flag = name => argv.includes(`--${name}`);
const arg = (name, def) => { const i = argv.indexOf(`--${name}`); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : def; };
const list = s => String(s).split(',').map(x => x.trim()).filter(Boolean);

const SHOP = arg('shop', process.env.SHOP);
const APPLY = flag('apply');
const VALUES = list(arg('values', '0.5 ct,1 ct,1.5 ct,2 ct'));
const MULTS = list(arg('multipliers', '0.7,1,1.6,2.4')).map(Number);
const OPTION = arg('option-name', 'Carat');
const PHOTO_CT = Number(arg('photo-carat', '1'));
const ONLY = arg('products') ? list(arg('products')) : null;
const KEEP_POLICY = flag('keep-stock-policy');
const API = arg('api', '2026-10');

const die = msg => { console.error(`✗ ${msg}`); process.exit(1); };
if (!SHOP || !/\.myshopify\.com$/.test(SHOP)) die('--shop <store>.myshopify.com is required');
if (!VALUES.length || VALUES.length !== MULTS.length || MULTS.some(m => !(m > 0))) die('--values and --multipliers must have the same number of entries (multipliers > 0)');
const BASE = arg('base', VALUES[MULTS.indexOf(1)] ?? VALUES[0]);
if (!VALUES.includes(BASE)) die(`--base "${BASE}" is not one of the values`);
const baseMult = MULTS[VALUES.indexOf(BASE)];
const factor = v => MULTS[VALUES.indexOf(v)] / baseMult;   // price of value v = current price × factor

/* ---------- Shopify ---------- */
const db = new PrismaClient();
const sess = await db.session.findUnique({ where: { id: `offline_${SHOP}` } });
if (!sess?.accessToken) { await db.$disconnect(); die(`no app session for ${SHOP} — install the app on that store and open it once in Shopify admin`); }
if (!/write_products/.test(sess.scope || '')) console.warn('! the app session has no write_products scope; changes will fail');

async function gql(query, variables) {
  const r = await fetch(`https://${SHOP}/admin/api/${API}/graphql.json`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': sess.accessToken },
    body: JSON.stringify({ query, variables }),
  });
  if (r.status === 429) { await new Promise(res => setTimeout(res, 2000)); return gql(query, variables); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.errors) throw new Error(`Shopify ${r.status}: ${JSON.stringify(j.errors || j).slice(0, 400)}`);
  return j.data;
}
const userErrors = (label, errs) => { if (errs?.length) throw new Error(`${label}: ${errs.map(e => e.message).join('; ')}`); };

const PRODUCT = `query P($id: ID!) { product(id: $id) { id title handle
  options { name optionValues { name } }
  variants(first: 250) { nodes { id price inventoryPolicy selectedOptions { name value } } }
  metafield(namespace: "tryon", key: "asset") { jsonValue } } }`;

/* ---------- which products ---------- */
let ids;
if (ONLY) {
  ids = (await db.product.findMany({ where: { shop: SHOP, handle: { in: ONLY } }, select: { productId: true, handle: true } }));
  const missing = ONLY.filter(h => !ids.some(p => p.handle === h));
  if (missing.length) console.warn(`! not in the app's product list (run Sync products?): ${missing.join(', ')}`);
  ids = ids.map(p => p.productId);
} else {
  const [rings, manual] = await Promise.all([
    db.product.findMany({ where: { shop: SHOP, detectedKind: 'ring' }, select: { productId: true } }),
    db.tryOnAsset.findMany({ where: { shop: SHOP, kindManual: true }, select: { productId: true, kind: true } }),
  ]);
  const byManual = new Map(manual.map(m => [m.productId, m.kind]));
  ids = [...new Set([...rings.map(r => r.productId), ...manual.filter(m => m.kind === 'ring').map(m => m.productId)])]
    .filter(id => !byManual.has(id) || byManual.get(id) === 'ring');
}
if (!ids.length) { await db.$disconnect(); die(`no ring products found for ${SHOP} (open the app → Sync products)`); }

console.log(`${APPLY ? 'APPLYING' : 'DRY RUN'} on ${SHOP} — ${ids.length} ring(s)`);
console.log(`Option "${OPTION}": ${VALUES.map(v => `${v} ×${factor(v).toFixed(2)}`).join(', ')}  (current price = ${BASE})` +
  `${PHOTO_CT > 0 ? `; photo carat = ${PHOTO_CT}` : ''}\n`);

/* ---------- per product ---------- */
const done = { changed: 0, skipped: 0, failed: 0 };
for (const id of ids) {
  let p;
  try { ({ product: p } = await gql(PRODUCT, { id })); } catch (e) { console.log(`✗ ${id}: ${e.message}`); done.failed++; continue; }
  if (!p) { console.log(`- ${id}: not found on the store (deleted?)`); done.skipped++; continue; }
  const opts = p.options.map(o => `${o.name} (${o.optionValues.length})`).join(' × ');
  if (p.options.some(o => /carat/i.test(o.name))) { console.log(`- ${p.title}: already has ${opts} — skipped`); done.skipped++; continue; }
  if (p.options.length >= 3) { console.log(`- ${p.title}: already has 3 options (${opts}) — Shopify allows 3, skipped`); done.skipped++; continue; }
  const now = p.variants.nodes.length, after = now * VALUES.length;
  console.log(`• ${p.title}  [${p.handle}]\n    ${opts} — ${now} variant(s) → ${after} with ${OPTION}`);
  if (after > 2048) { console.log('    ✗ more than 2048 variants, skipped'); done.skipped++; continue; }
  if (!APPLY) continue;

  try {
    // current price of every combination of the other options (the default "Title" option is replaced)
    const keyOf = v => v.selectedOptions.filter(o => o.name !== OPTION && o.name !== 'Title').map(o => `${o.name}=${o.value}`).join('|');
    const base = new Map(p.variants.nodes.map(v => [keyOf(v), +v.price]));

    const c = await gql(`mutation C($productId: ID!, $options: [OptionCreateInput!]!) {
      productOptionsCreate(productId: $productId, options: $options, variantStrategy: CREATE) { userErrors { message } } }`,
      { productId: id, options: [{ name: OPTION, values: VALUES.map(name => ({ name })) }] });
    userErrors('add option', c.productOptionsCreate.userErrors);

    const { product: q } = await gql(PRODUCT, { id });
    const variants = q.variants.nodes.map(v => {
      const val = v.selectedOptions.find(o => o.name === OPTION)?.value;
      const b = base.get(keyOf(v)) ?? [...base.values()][0];
      return { id: v.id, price: (Math.round(b * (VALUES.includes(val) ? factor(val) : 1) * 100) / 100).toFixed(2),
        ...(KEEP_POLICY ? {} : { inventoryPolicy: 'CONTINUE' }) };
    });
    const u = await gql(`mutation U($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
      productVariantsBulkUpdate(productId: $productId, variants: $variants) { userErrors { message } } }`, { productId: id, variants });
    userErrors('prices', u.productVariantsBulkUpdate.userErrors);

    if (PHOTO_CT > 0) {
      await db.tryOnAsset.updateMany({ where: { shop: SHOP, productId: id }, data: { shownCarat: PHOTO_CT } });
      const mv = q.metafield?.jsonValue;
      if (mv) {
        const m = await gql(`mutation M($metafields: [MetafieldsSetInput!]!) { metafieldsSet(metafields: $metafields) { userErrors { message } } }`,
          { metafields: [{ ownerId: id, namespace: 'tryon', key: 'asset', type: 'json', value: JSON.stringify({ ...mv, shownCarat: PHOTO_CT }) }] });
        userErrors('try-on metafield', m.metafieldsSet.userErrors);
      }
    }
    console.log(`    ✓ ${variants.length} variants priced${PHOTO_CT > 0 ? `, photo carat ${PHOTO_CT}` : ''}`);
    done.changed++;
  } catch (e) { console.log(`    ✗ ${e.message}`); done.failed++; }
}
console.log(`\n${APPLY ? `Changed ${done.changed}` : `Would change ${ids.length - done.skipped}`}, skipped ${done.skipped}, failed ${done.failed}.` +
  `${APPLY ? '' : '\nRun again with --apply to make the changes.'}`);
await db.$disconnect();
