#!/usr/bin/env node
/* Turn a store's test products into a realistic jeweller catalogue for demos: professional names, descriptions
   with metal / stone details, product types, vendor, tags, SEO, a Metal option (18ct Yellow / White / Rose Gold,
   Platinum), bracelet lengths, and realistic prices for every variant. Handles (URLs) are kept.

   Works on any store where this app is installed (uses the app's offline session). DRY RUN by default.
     node tools/demo-catalog.mjs --shop test-xapyjdoy.myshopify.com            (prints the plan)
     node tools/demo-catalog.mjs --shop test-xapyjdoy.myshopify.com --apply    (changes the store)

   Edit CATALOG below for other stores / products (matched by handle; missing handles are skipped). */
import { createRequire } from 'node:module';
const require = createRequire(new URL('../package.json', import.meta.url));
const { PrismaClient } = require('@prisma/client');

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
const SHOP = arg('shop', process.env.SHOP), APPLY = argv.includes('--apply'), API = arg('api', '2026-10');
if (!SHOP || !/\.myshopify\.com$/.test(SHOP)) { console.error('✗ --shop <store>.myshopify.com is required'); process.exit(1); }

/* ---------- price rules (× the product's base price) ---------- */
const METAL = { '18ct Yellow Gold': 1, '18ct White Gold': 1, '18ct Rose Gold': 1, 'Platinum': 1.3 };
const CARAT = { '0.5 ct': .7, '1 ct': 1, '1.5 ct': 1.6, '2 ct': 2.4 };
const LENGTH = { '2.4 (57 mm)': 1, '2.6 (60 mm)': 1.03, '2.8 (64 mm)': 1.06, '16 cm': 1, '17 cm': 1.03, '18 cm': 1.06, '16 CM': 1, '17 CM': 1.03, '18 CM': 1.06 };
const SHAPE = { Teardrop: 1, Marquise: 1.05, Rectangular: 1.1 };
const GOLDS = ['18ct Yellow Gold', '18ct White Gold', '18ct Rose Gold'];

const li = rows => `<ul>${rows.map(([k, v]) => `<li><strong>${k}:</strong> ${v}</li>`).join('')}</ul>`;
const CATALOG = [
  { handle: 'diamon-malborun', title: 'Malborun Oval Solitaire Engagement Ring', type: 'Engagement Ring', base: 4850,
    metals: Object.keys(METAL), tags: ['engagement', 'solitaire', 'oval', 'diamond', 'bridal'],
    seo: 'An oval diamond solitaire on a slender 1.8 mm band, hand-finished in 18ct gold or platinum.',
    html: `<p>A timeless oval solitaire. The elongated oval centre stone is held in four fine claws above a slender, softly rounded band, letting the diamond sit low and catch light from every side.</p>` +
      li([['Centre stone', 'Oval diamond, F–G colour, VS clarity, IGI certified'], ['Setting', 'Four-claw basket, hidden halo-free profile'], ['Band', '1.8 mm, comfort fit'], ['Metal', '18ct Yellow, White or Rose Gold, or Platinum'], ['Made', 'Handcrafted to order in 4–6 weeks'], ['Includes', 'Certificate, lifetime warranty, free resizing within 60 days']]) },
  { handle: 'carat-lens', title: 'Celeste Sapphire Halo Ring', type: 'Sapphire Ring', base: 3250,
    metals: Object.keys(METAL), tags: ['sapphire', 'halo', 'round', 'coloured stone', 'engagement'],
    seo: 'A royal blue round sapphire framed by a double halo of brilliant diamonds.',
    html: `<p>A vivid royal blue sapphire framed by a double halo of brilliant-cut diamonds, for a ring with presence and colour. A classic for engagements and milestone birthdays alike.</p>` +
      li([['Centre stone', 'Round blue sapphire, Ceylon origin, heat-treated'], ['Halo', '42 round brilliant diamonds, approx. 0.30 ct total'], ['Band', '2.0 mm, polished'], ['Metal', '18ct Yellow, White or Rose Gold, or Platinum'], ['Made', 'Handcrafted to order in 4–6 weeks'], ['Includes', 'Gemstone report, lifetime warranty']]) },
  { handle: 'ashoka-moti-ring', title: 'Ashoka Heritage Signet Ring', type: 'Signet Ring', base: 1950,
    metals: Object.keys(METAL), tags: ['signet', 'heritage', 'men', 'statement', 'emerald'],
    seo: 'A bold heritage signet with an engraved emblem on emerald, framed by sapphire accents.',
    html: `<p>A bold heritage signet: an engraved emblem rests on a polished emerald face, framed by rows of blue sapphires and a hand-textured shank.</p>` +
      li([['Centre', 'Engraved emblem on natural emerald, approx. 1 ct'], ['Accents', '16 round blue sapphires'], ['Shank', '6 mm, hand-textured'], ['Metal', '18ct Yellow, White or Rose Gold, or Platinum'], ['Made', 'Handcrafted to order in 5–7 weeks']]) },
  { handle: 'diamond-ring', title: 'Aria Fancy-Cut Diamond Ring', type: 'Engagement Ring', base: 2950,
    renameOption: { from: 'Ring size', to: 'Size', values: { '1': '5', '2': '6', '2.5': '7', '3.25': '8' } },
    tags: ['engagement', 'diamond', 'fancy cut', 'pear', 'marquise'],
    seo: 'A fancy-cut diamond ring in your choice of pear, marquise or emerald-cut shape.',
    html: `<p>Choose your favourite fancy shape — pear, marquise or emerald cut — set on a fine polished band that keeps every eye on the diamond.</p>` +
      li([['Centre stone', 'Pear, marquise or emerald-cut diamond, G colour, VS2 clarity, IGI certified'], ['Setting', 'Low-profile claws'], ['Band', '1.8 mm'], ['Metal', '18ct Yellow Gold'], ['Sizes', 'US 5–8 (other sizes on request)']]) },
  { handle: 'bracelets', title: 'Celestine Diamond Station Bracelet', type: 'Bracelet', base: 1690,
    metals: GOLDS, lengths: ['16 cm', '17 cm', '18 cm'], tags: ['bracelet', 'diamond', 'chain', 'station', 'everyday'],
    seo: 'A fine gold chain bracelet with pavé diamond stations and a central halo motif.',
    html: `<p>Delicate and luminous: a fine trace chain set with three pavé diamond stations, the centre one a round halo motif. Made to be worn every day, alone or stacked.</p>` +
      li([['Diamonds', '31 round brilliant diamonds, approx. 0.25 ct total, G/H VS'], ['Chain', '1.2 mm trace chain, lobster clasp, adjuster ring'], ['Length', '16, 17 or 18 cm'], ['Metal', '18ct Yellow, White or Rose Gold']]) },
  { handle: 'silver-bracelets', title: 'Lumière Diamond Tennis Bracelet', type: 'Tennis Bracelet', base: 3950,
    metals: ['18ct White Gold', '18ct Yellow Gold', 'Platinum'], lengths: ['16 cm', '17 cm', '18 cm'], tags: ['tennis bracelet', 'diamond', 'classic', 'gift'],
    seo: 'A classic line of round brilliant diamonds in four-claw settings, with a hidden box clasp.',
    html: `<p>The classic tennis bracelet: a continuous line of matched round brilliant diamonds, each in its own four-claw setting, with a hidden box clasp and double safety catch.</p>` +
      li([['Diamonds', '52 round brilliant diamonds, approx. 2.00 ct total, G colour, VS clarity'], ['Setting', 'Four-claw, flexible links'], ['Clasp', 'Hidden box clasp with figure-eight safety'], ['Length', '16, 17 or 18 cm'], ['Metal', '18ct White or Yellow Gold, or Platinum']]) },
  { handle: 'kangan', title: 'Kangan Textured Gold Bangle', type: 'Bangle', base: 2250,
    metals: ['18ct Yellow Gold', '18ct Rose Gold'], tags: ['bangle', 'kangan', 'kada', 'heritage', 'gold'],
    seo: 'A heritage kangan with a hand-faceted, diamond-cut texture in solid 18ct gold.',
    html: `<p>A modern take on the traditional kangan: a solid bangle with a hand-faceted, diamond-cut texture that catches the light as you move.</p>` +
      li([['Profile', '8 mm wide, knife-edge centre'], ['Finish', 'Hand diamond-cut texture'], ['Bangle size', '2.4 (57 mm), 2.6 (60 mm) or 2.8 (64 mm) inner diameter — the bangle slides over the hand'], ['Metal', 'Solid 18ct Yellow or Rose Gold'], ['Weight', 'Approx. 14 g']]) },
];

/* ---------- Shopify ---------- */
const db = new PrismaClient();
const sess = await db.session.findUnique({ where: { id: `offline_${SHOP}` } });
if (!sess?.accessToken) { console.error(`✗ no app session for ${SHOP} — install the app and open it once`); process.exit(1); }
async function gql(query, variables) {
  const r = await fetch(`https://${SHOP}/admin/api/${API}/graphql.json`, { method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': sess.accessToken }, body: JSON.stringify({ query, variables }) });
  if (r.status === 429) { await new Promise(s => setTimeout(s, 2000)); return gql(query, variables); }
  const j = await r.json().catch(() => ({})); if (!r.ok || j.errors) throw new Error(`Shopify ${r.status}: ${JSON.stringify(j.errors || j).slice(0, 400)}`);
  return j.data;
}
const ue = (label, e) => { if (e?.length) throw new Error(`${label}: ${e.map(x => x.message).join('; ')}`); };
const GET = `query G($h: String!) { productByIdentifier(identifier: { handle: $h }) { id title
  options { id name optionValues { id name } } variants(first: 250) { nodes { id selectedOptions { name value } } } } }`;
const get = async h => (await gql(GET, { h })).productByIdentifier;

console.log(`${APPLY ? 'APPLYING' : 'DRY RUN'} on ${SHOP}\n`);
for (const c of CATALOG) {
  let p;
  try { p = await get(c.handle); } catch (e) { console.log(`✗ ${c.handle}: ${e.message}`); continue; }
  if (!p) { console.log(`- ${c.handle}: not on this store, skipped`); continue; }
  const names = p.options.map(o => o.name);
  const addMetal = c.metals && !names.some(n => /metal/i.test(n));
  const addLength = c.lengths && !names.some(n => /length|size/i.test(n));
  const realOptions = names.filter(n => n !== 'Title').length;
  console.log(`• ${p.title}  →  ${c.title}  [${c.type}]`);
  console.log(`    options: ${names.join(' × ') || '-'}${addMetal ? ` + Metal (${c.metals.length})` : ''}${addLength ? ` + Length (${c.lengths.length})` : ''}${c.renameOption ? ` · rename "${c.renameOption.from}" → "${c.renameOption.to}" (US sizes)` : ''}`);
  if (realOptions + (addMetal ? 1 : 0) + (addLength ? 1 : 0) > 3) { console.log('    ✗ would exceed 3 options, skipped'); continue; }
  if (!APPLY) continue;
  try {
    const u = await gql(`mutation U($p: ProductUpdateInput!) { productUpdate(product: $p) { userErrors { message } } }`,
      { p: { id: p.id, title: c.title, descriptionHtml: c.html, productType: c.type, vendor: 'House of Hamara', tags: c.tags, seo: { title: c.title, description: c.seo } } });
    ue('details', u.productUpdate.userErrors);

    if (c.renameOption) {
      const o = p.options.find(x => x.name === c.renameOption.from);
      if (o) {
        const r = await gql(`mutation R($pid: ID!, $o: OptionUpdateInput!, $v: [OptionValueUpdateInput!]) {
          productOptionUpdate(productId: $pid, option: $o, optionValuesToUpdate: $v) { userErrors { message } } }`,
          { pid: p.id, o: { id: o.id, name: c.renameOption.to }, v: o.optionValues.filter(v => c.renameOption.values[v.name]).map(v => ({ id: v.id, name: c.renameOption.values[v.name] })) });
        // options linked to Shopify's category data (e.g. "Ring size") can't be renamed → keep it, carry on
        if (r.productOptionUpdate.userErrors.length) console.log(`    ! kept "${c.renameOption.from}": ${r.productOptionUpdate.userErrors[0].message}`);
      }
    }
    const add = [];
    if (addMetal) add.push({ name: 'Metal', position: 1, values: c.metals.map(name => ({ name })) });
    if (addLength) add.push({ name: 'Length', ...(addMetal ? { position: 2 } : {}), values: c.lengths.map(name => ({ name })) });
    if (add.length) {
      const a = await gql(`mutation A($pid: ID!, $o: [OptionCreateInput!]!) { productOptionsCreate(productId: $pid, options: $o, variantStrategy: CREATE) { userErrors { message } } }`, { pid: p.id, o: add });
      ue('add options', a.productOptionsCreate.userErrors);
    }

    // every variant: base × metal × carat × length × shape
    const q = await get(c.handle);
    const variants = q.variants.nodes.map(v => {
      let m = 1;
      for (const { value } of v.selectedOptions) m *= METAL[value] ?? CARAT[value] ?? LENGTH[value] ?? SHAPE[value] ?? 1;
      return { id: v.id, price: (Math.round(c.base * m / 5) * 5).toFixed(2), inventoryPolicy: 'CONTINUE' };
    });
    const b = await gql(`mutation B($pid: ID!, $v: [ProductVariantsBulkInput!]!) { productVariantsBulkUpdate(productId: $pid, variants: $v) { userErrors { message } } }`, { pid: p.id, v: variants });
    ue('prices', b.productVariantsBulkUpdate.userErrors);
    const prices = variants.map(v => +v.price);
    console.log(`    ✓ ${variants.length} variants, $${Math.min(...prices).toLocaleString()} – $${Math.max(...prices).toLocaleString()}`);
  } catch (e) { console.log(`    ✗ ${e.message}`); }
}
await db.$disconnect();
