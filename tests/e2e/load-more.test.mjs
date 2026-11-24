import { chromium } from 'playwright';
const ORIGIN = 'http://localhost:8811';
const prod = i => ({
  productId: 1000 + i, title: `Ring ${i + 1}`, handle: `ring-${i + 1}`, url: `${ORIGIN}/products/ring-${i + 1}`,
  image: `${ORIGIN}/public/viewer/products/metal-${'YWRP'[i % 4]}.png`, options: ['Size'], tryon: null,
  variants: [6, 7].map(s => ({ id: 50000 + i * 10 + s, price: 100 + i, available: i !== 20, options: [String(s)] })),
});
const TOTAL = 50, FIRST = 12;
const host = `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/extensions/tryon-theme/assets/tryon.css"></head><body>
<div class="ring-tryon"><button data-ring-tryon-open data-viewer="${ORIGIN}/public/viewer/index.html">Try it on</button>
<script type="application/json" data-ring-tryon-product>${JSON.stringify({
  currentId: 1000, currency: 'USD', locale: 'en', settings: { metalOption: 'Metal', sizeOption: 'Size', afterAdd: 'stay' },
  collection: { handle: 'rings', offset: FIRST, more: true },
  products: Array.from({ length: FIRST }, (_, i) => prod(i)),
})}</script></div>
<script>window.Shopify = { country: 'US', routes: { root: '/' } };</script>
<script src="/extensions/tryon-theme/assets/tryon.js"></script></body></html>`;

const results = []; const check = (n, ok, x = '') => results.push(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? '  — ' + x : ''}`);
const browser = await chromium.launch({ executablePath: process.env.CHROME, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
// the first-visit tutorial would cover the screen; these tests are about other things
await page.addInitScript(() => { try { localStorage.setItem('ringTryonTour', '1'); } catch {} });
const errors = []; page.on('pageerror', e => errors.push(e.message));
const calls = []; let cartAdd = null;
await page.route(`${ORIGIN}/host.html`, r => r.fulfill({ contentType: 'text/html', body: host }));
await page.route(`${ORIGIN}/apps/ring-tryon/products*`, r => {
  const u = new URL(r.request().url()); calls.push(u.search);
  const start = u.searchParams.get('after') ? Number(u.searchParams.get('after')) : Number(u.searchParams.get('offset'));
  const end = Math.min(TOTAL, start + 12);
  const products = Array.from({ length: end - start }, (_, k) => prod(start + k));
  if (start === FIRST) products.push(prod(0));            // a duplicate must be ignored
  r.fulfill({ contentType: 'application/json', body: JSON.stringify({ products, cursor: end < TOTAL ? String(end) : null, hasMore: end < TOTAL }) });
});
await page.route(`${ORIGIN}/cart/add.js`, r => { cartAdd = JSON.parse(r.request().postData()); r.fulfill({ contentType: 'application/json', body: '{"id":1}' }); });
await page.route(`${ORIGIN}/cart.js`, r => r.fulfill({ contentType: 'application/json', body: '{"item_count":1}' }));

await page.goto(`${ORIGIN}/host.html`);
await page.click('[data-ring-tryon-open]');
const fr = page.frameLocator('iframe.ring-tryon-frame');
await fr.locator('#shopList .ringcard').first().waitFor({ timeout: 30000 });
await page.waitForTimeout(1500);
check('Starts with the 12 rings the page passed in', (await fr.locator('#shopList .ringcard').count()) === 12);

for (let i = 0; i < 12; i++) {
  await fr.locator('#shopList').evaluate(el => el.scrollTop = el.scrollHeight);
  await page.waitForTimeout(350);
  if ((await fr.locator('#shopMore').count()) === 0) break;
}
const n = await fr.locator('#shopList .ringcard').count();
check(`Scrolling loads all ${TOTAL} rings from the store`, n === TOTAL, `got ${n}`);
check('No duplicate rings', new Set(await fr.locator('#shopList .ringcard').evaluateAll(b => b.map(x => x.dataset.id))).size === n);
check('"Loading more" marker gone at the end', (await fr.locator('#shopMore').count()) === 0);
check('First request skips the 12 already shown', calls[0]?.includes('offset=12') && calls[0]?.includes('collection=rings') && calls[0]?.includes('country=US'), calls[0]);
check('Later requests use the cursor', calls.slice(1).every(c => c.includes('after=')), calls.join(' '));
check('Sold-out ring from a later page labelled', (await fr.locator('#shopList .ringcard[data-id="s1020"]').innerText()).includes('Sold out'));

// add a ring that came from a later page to the cart
await fr.locator('#shopList .ringcard[data-id="s1045"]').scrollIntoViewIfNeeded();
await fr.locator('#shopList .ringcard[data-id="s1045"]').click();
await page.waitForTimeout(300);
await fr.locator('#shopCart').click();
await page.waitForTimeout(800);
const id = cartAdd?.items?.[0]?.id;
check('Add to cart works for a ring loaded later (right variant)', id === 50000 + 45 * 10 + 6, JSON.stringify(cartAdd));
check('"Added to your bag" shown', await fr.locator('#addedSheet').isVisible());

// error + retry
await page.unroute(`${ORIGIN}/apps/ring-tryon/products*`);
check('No JavaScript errors', errors.length === 0, errors.join(' || '));
console.log(results.join('\n'));
await page.screenshot({ path: new URL('./output/6-more-loaded.png', import.meta.url).pathname });
await browser.close();
