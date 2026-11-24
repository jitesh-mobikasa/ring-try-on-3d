import { chromium } from 'playwright';
const ORIGIN = 'http://localhost:8811';
// Variants: metal × stone × shape × carat × size; price depends on metal + carat; one combination sold out, one missing
const metals = ['18k Yellow Gold', 'Platinum'], stones = ['Diamond', 'Sapphire'], shapes = ['Oval', 'Round'], carats = ['1 ct', '2 ct'], sizes = ['6', '7'];
const variants = []; let id = 1;
for (const m of metals) for (const st of stones) for (const sh of shapes) for (const c of carats) for (const z of sizes) {
  if (st === 'Sapphire' && sh === 'Round' && c === '2 ct') continue;                 // combination that doesn't exist
  variants.push({ id: id++, price: 100000 + (m === 'Platinum' ? 40000 : 0) + (c === '2 ct' ? 300000 : 0), compareAt: 0,
    available: !(m === 'Platinum' && st === 'Sapphire' && z === '7'), options: [m, st, sh, c, z], image: null });
}
const data = {
  productTitle: 'Lara Ring', currency: 'USD', locale: 'en', selected: 1,
  names: { metal: 'Metal', stone: 'Stone', shape: 'Shape', carat: 'Carat', size: 'Size' }, afterAdd: 'stay',
  options: [['Metal', metals], ['Stone', stones], ['Shape', shapes], ['Carat', carats], ['Size', sizes]].map(([name, values]) => ({ name, values })),
  variants, engraving: { max: 20, fee: { id: 999, price: 5000 } },
};
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="/extensions/tryon-theme/assets/configurator.css"></head><body style="font-family:system-ui;max-width:560px;margin:20px auto;padding:0 16px">
<h1>Lara Ring</h1>
<form action="/cart/add" method="post"><input type="hidden" name="id" value="1"></form>
<div class="rc" data-rc style="--rc-accent:#1f1a17;--rc-radius:6px">
  <div class="rc__price" data-rc-price></div><div class="rc__options" data-rc-options></div>
  <div class="rc__group rc__engrave"><label class="rc__label" for="e">Engraving (+$50.00)</label>
    <input id="e" class="rc__input" type="text" data-rc-engrave maxlength="20">
    <div class="rc__hint"><span data-rc-engrave-msg></span><span data-rc-engrave-count>0 / 20</span></div></div>
  <button type="button" class="rc__add" data-rc-add>Add to cart</button><div class="rc__status" data-rc-status hidden></div>
  <script type="application/json" data-rc-data>${JSON.stringify(data)}</script>
</div>
<script>window.Shopify = { routes: { root: '/' } };</script>
<script src="/extensions/tryon-theme/assets/configurator.js"></script></body></html>`;

const results = []; const check = (n, ok, x = '') => results.push(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? '  — ' + x : ''}`);
process.on('exit', () => console.log(results.join('\n')));
const browser = await chromium.launch({ executablePath: process.env.CHROME });
const page = await browser.newPage({ viewport: { width: 1200, height: 1000 } });
const errors = []; page.on('pageerror', e => errors.push(e.message));
let cart = null;
await page.route(`${ORIGIN}/pdp.html*`, r => r.fulfill({ contentType: 'text/html', body: html }));
await page.route(`${ORIGIN}/cart/add.js`, r => { cart = JSON.parse(r.request().postData()); r.fulfill({ contentType: 'application/json', body: '{"items":[]}' }); });
await page.route(`${ORIGIN}/cart.js`, r => r.fulfill({ contentType: 'application/json', body: '{"item_count":2}' }));
await page.goto(`${ORIGIN}/pdp.html`);
const price = () => page.locator('[data-rc-price] .rc__now').innerText();
const val = (opt, v) => page.locator(`.rc__val[data-i="${opt}"][data-v="${v}"]`);

check('All 5 options rendered', (await page.locator('.rc__group').count()) === 6, String(await page.locator('.rc__group').count()));
check('Starting price = variant price', (await price()) === '$1,000.00', await price());
check('Metal shows colour swatches', (await page.locator('.rc__values--metal .rc__dot').count()) === 2);
check('Shape shows icons', (await page.locator('.rc__values--shape svg').count()) === 2);
check('Price difference shown next to choices', (await val(0, 'Platinum').innerText()).includes('+$400.00'), await val(0, 'Platinum').innerText());
await val(0, 'Platinum').click();
check('Live price: Platinum → $1,400', (await price()) === '$1,400.00', await price());
await val(3, '2 ct').click();
check('Live price: Platinum + 2 ct → $4,400', (await price()) === '$4,400.00', await price());
check('URL updated with ?variant=', page.url().includes('variant='), page.url());
check('Theme form variant id kept in sync', (await page.locator('form [name=id]').inputValue()) === new URL(page.url()).searchParams.get('variant'));
// impossible combination: Sapphire + Round + 2 ct doesn't exist → picking Round with Sapphire jumps to a valid one
await val(1, 'Sapphire').click(); await val(2, 'Round').click();
const lbl = await page.locator('.rc__options').innerText();
check('Missing combination → nearest valid variant', /Carat: 1 ct/.test(lbl), lbl.split('\n').filter(l => l.includes(':')).join(' | '));
// sold out: Platinum + Sapphire + size 7
await val(2, 'Oval').click();
await page.locator('.rc__select').selectOption('7');
check('Sold-out variant: button disabled, says Sold out', (await page.locator('[data-rc-add]').innerText()) === 'Sold out' && await page.locator('[data-rc-add]').isDisabled());
check('Sold-out size marked in the list', (await page.locator('.rc__select option[value="7"]').innerText()).includes('sold out'));
await page.locator('.rc__select').selectOption('6');
// US / AU sizes
await page.locator('[data-sys="AU"]').click();
check('AU/NZ sizes', (await page.locator('.rc__select option').first().innerText()).startsWith('AU L½'), await page.locator('.rc__select option').first().innerText());
// engraving
await page.locator('[data-rc-engrave]').fill('Forever <3');
check('Engraving: bad characters flagged', await page.locator('[data-rc-engrave].bad').count() === 1);
await page.locator('[data-rc-engrave]').fill('Forever ♥ 2026');
check('Engraving: valid text accepted, counter', (await page.locator('[data-rc-engrave].bad').count()) === 0 && (await page.locator('[data-rc-engrave-count]').innerText()) === '14 / 20');
check('Engraving fee added to live price', (await price()) === '$1,450.00', await price());
await page.screenshot({ path: new URL('./output/c1-configurator.png', import.meta.url).pathname, fullPage: true });
await page.locator('[data-rc-add]').click(); await page.waitForTimeout(500);
const [ring, fee] = cart?.items || [];
check('Cart: ring variant + Engraving property', ring && ring.properties.Engraving === 'Forever ♥ 2026' && String(ring.id) === new URL(page.url()).searchParams.get('variant'), JSON.stringify(ring));
check('Cart: engraving fee product added', fee && fee.id === 999 && fee.properties.For === 'Lara Ring', JSON.stringify(fee));
check('"Added to your cart" message', (await page.locator('[data-rc-status]').innerText()).includes('Added to your cart'));
// mobile
await page.setViewportSize({ width: 390, height: 844 });
check('Mobile: no sideways scroll', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
await page.screenshot({ path: new URL('./output/c2-configurator-mobile.png', import.meta.url).pathname, fullPage: true });
check('No JavaScript errors', errors.length === 0, errors.join(' | '));
await browser.close();
