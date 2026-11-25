process.on('exit', () => { if (typeof results !== 'undefined') console.log(results.join('\n')); });
import { chromium } from 'playwright';
import fs from 'node:fs';
const ORIGIN = 'http://localhost:8811', OUT = new URL('./output/', import.meta.url).pathname;
const img = i => `${ORIGIN}/public/viewer/products/metal-${'YWRP'[i % 4]}.png`;
const prod = i => ({
  productId: 1000 + i, title: i === 2 ? 'Sapphire Halo' : `Ring ${i + 1}`, handle: `ring-${i + 1}`, url: `${ORIGIN}/products/ring-${i + 1}`,
  image: img(i), images: [img(i), img(i + 1), img(i + 2)], description: `Handcrafted ring number ${i + 1}. 18 ct gold.`, type: 'Engagement ring',
  options: ['Size'], tryon: null,
  variants: [6, 7].map(s => ({ id: 50000 + i * 10 + s, price: 300 - i * 10, available: i !== 4, options: [String(s)] })),
});
const host = (customer) => `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/extensions/tryon-theme/assets/tryon.css"></head><body>
<div class="ring-tryon"><button data-ring-tryon-open data-viewer="${ORIGIN}/public/viewer/index.html">Try it on</button>
<script type="application/json" data-ring-tryon-product>${JSON.stringify({
  currentId: 1000, customer, shopName: 'Test Jewels', currency: 'USD', locale: 'en',
  settings: { metalOption: 'Metal', sizeOption: 'Size', afterAdd: 'stay' }, collection: null,
  products: Array.from({ length: 8 }, (_, i) => prod(i)),
})}</script></div>
<script>window.Shopify = { country: 'US', routes: { root: '/' } };</script>
<script src="/extensions/tryon-theme/assets/tryon.js"></script></body></html>`;

const results = []; const check = (n, ok, x = '') => results.push(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? '  — ' + x : ''}`);
const browser = await chromium.launch({ executablePath: process.env.CHROME, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 }, acceptDownloads: true });
const errors = [];
let saved = []; let loginHit = null;
await ctx.route(`${ORIGIN}/host.html*`, r => r.fulfill({ contentType: 'text/html', body: host(new URL(r.request().url()).searchParams.has('in')) }));
await ctx.route(`${ORIGIN}/products/**`, r => r.fulfill({ contentType: 'text/html', body: host(false) }));
await ctx.route(`${ORIGIN}/account/login*`, r => { loginHit = r.request().url(); r.fulfill({ contentType: 'text/html', body: 'login' }); });
await ctx.route(`${ORIGIN}/apps/ring-tryon/looks*`, async r => {
  const u = new URL(r.request().url()), m = r.request().method();
  if (m === 'GET') return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ looks: saved }) });
  if (u.searchParams.get('delete')) { saved = saved.filter(l => l.id !== u.searchParams.get('delete')); return r.fulfill({ contentType: 'application/json', body: '{"ok":true}' }); }
  const b = JSON.parse(r.request().postData()); const look = { id: 'L' + (saved.length + 1), createdAt: new Date().toISOString(), ...b };
  saved.unshift(look); r.fulfill({ contentType: 'application/json', body: JSON.stringify({ look }) });
});
await ctx.route(`${ORIGIN}/public/viewer/index.html*`, async route => {
  const res = await route.fetch(); let body = await res.text();
  body = body.replace('renderer.setAnimationLoop(frame);', 'window.__t = { state }; renderer.setAnimationLoop(frame);');
  await route.fulfill({ response: res, body });
});

async function openTryOn(page, url) {
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/favicon|404/.test(m.text())) errors.push(m.text()); });
  await page.bringToFront(); await page.goto(url, { waitUntil: 'domcontentloaded' });
  if (!url.includes('tryon=1')) await page.click('[data-ring-tryon-open]');
  let frame;
  for (let i = 0; i < 300 && !frame; i++) { frame = page.frames().find(f => f.url().includes('/public/viewer/')); if (!frame) await page.waitForTimeout(100); }
  await frame.waitForFunction(() => window.__t && !document.getElementById('loading') && document.querySelector('#shopList .ringcard'), null, { timeout: 30000 });
  await page.waitForTimeout(400);
  return { fr: frame, frame };
}
const S = frame => frame.evaluate(() => {
  const s = __t.state, set = h => h ? { [h.finger]: h.pid, ...Object.fromEntries(Object.entries(h.worn).map(([f, r]) => [f, r.pid])) } : null;
  return { side: s.side, tone: s.tone, cur: set(s), left: set(s.hands.left), right: set(s.hands.right) };
});

// ---------- 1. Tutorial ----------
let page = await ctx.newPage();
let { fr, frame } = await openTryOn(page, `${ORIGIN}/host.html`);
check('Tutorial shows on first visit', await fr.locator('.tour').isVisible());
await page.screenshot({ path: OUT + 's1-tutorial.png' });
for (let i = 0; i < 4; i++) await fr.locator('.tour [data-t="next"]').click();
check('Tutorial closes after 4 steps', (await fr.locator('.tour').count()) === 0);

// ---------- 2. Search & filters ----------
await fr.locator('#findQ').fill('sapphire'); await page.waitForTimeout(400);
let names = await fr.locator('#shopList .ringcard .rn').allInnerTexts();
check('Search finds by name', names.length === 1 && names[0] === 'Sapphire Halo', names.join(','));
await fr.locator('#findQ').fill('zzz'); await page.waitForTimeout(400);
check('No-match message', await fr.locator('.nomatch').isVisible());
await fr.locator('#noMatchClear').click(); await page.waitForTimeout(200);
check('Clear restores all rings', (await fr.locator('#shopList .ringcard').count()) === 8);
await fr.locator('[data-stock]').click(); await page.waitForTimeout(200);
check('"In stock" hides the sold-out ring', (await fr.locator('#shopList .ringcard').count()) === 7);
await fr.locator('[data-sort]').selectOption('low'); await page.waitForTimeout(200);
const prices = (await fr.locator('#shopList .ringcard .rp').allInnerTexts()).map(t => +t.replace(/[^0-9.]/g, ''));
check('Sort price low → high', prices.every((p, i) => !i || prices[i - 1] <= p), prices.join(','));
await fr.locator('[data-clear]').click(); await page.waitForTimeout(200);
await page.screenshot({ path: OUT + 's2-search.png' });

// ---------- 3. Product detail panel ----------
await fr.locator('#pdBtn').click(); await page.waitForTimeout(200);
const pd = await fr.locator('.modal').innerText();
check('Detail panel: description, facts, gallery', pd.includes('Handcrafted ring number 1') && pd.includes('Engagement ring') && pd.includes('In stock') && (await fr.locator('.pd-thumbs button').count()) === 3, pd.slice(0, 80).replace(/\n/g, ' | '));
await fr.locator('.pd-thumbs button').nth(2).click();
check('Gallery thumbnail switches photo', (await fr.locator('#pdMain').getAttribute('src')).endsWith('metal-R.png'));
check('"View full product page" button', await fr.locator('.modal button', { hasText: 'View full product page' }).isVisible());
await page.screenshot({ path: OUT + 's3-details.png' });
await fr.locator('.modal button', { hasText: 'Close' }).click();

// ---------- 4. Menu drawer: complexion, hands ----------
await fr.locator('#menuBtn').click(); await page.waitForTimeout(300);
check('Menu drawer opens', await fr.locator('#drawer.open').isVisible());
await page.screenshot({ path: OUT + 's4-menu.png' });
await fr.locator('#swatches .swatch').nth(4).click();
check('Complexion swatch sets skin tone', (await S(frame)).tone === 80);
// put a 2nd ring on the right hand: tap card 2 → replaces active; use state to place on middle via drag instead
await fr.locator('#drawerClose').click(); await page.waitForTimeout(250);
const mid = await frame.evaluate(() => { const v = document.getElementById('view').getBoundingClientRect(); return { x: v.left + v.width * .5, y: v.top + v.height * .42 }; });
const ifr = await page.locator('iframe.ring-tryon-frame').boundingBox();
const cb = await fr.locator('#shopList .ringcard').nth(1).boundingBox();
await page.mouse.move(ifr.x + cb.x + 30, ifr.y + cb.y + 30); await page.mouse.down();
await page.mouse.move(ifr.x + cb.x + 60, ifr.y + cb.y + 60, { steps: 4 });
await page.mouse.move(ifr.x + mid.x, ifr.y + mid.y, { steps: 15 }); await page.mouse.up(); await page.waitForTimeout(300);
let s = await S(frame);
check('Right hand has 2 rings', Object.keys(s.cur).length === 2, JSON.stringify(s.cur));
await fr.locator('#menuBtn').click(); await page.waitForTimeout(250);
await fr.locator('#drawer [data-side="left"]').click(); await page.waitForTimeout(300);
s = await S(frame);
check('Left hand: own set, starts with the edited ring', s.side === 'left' && Object.keys(s.cur).length === 1 && Object.keys(s.right).length === 2, JSON.stringify(s));
await fr.locator('#drawer [data-side="right"]').click(); await page.waitForTimeout(300);
s = await S(frame);
check('Back to right hand: its 2 rings are kept', s.side === 'right' && Object.keys(s.cur).length === 2 && s.left, JSON.stringify(s));

// ---------- 5. Both hands ----------
await fr.locator('#drawer [data-act="both"]').click(); await page.waitForTimeout(800);
const figs = await fr.locator('.hands2 figure').count();
const capt = await fr.locator('.hands2').innerText();
check('Both-hands pop-up: two hands with their rings', figs === 2 && capt.includes('Left hand') && capt.includes('Right hand') && /Middle finger/.test(capt), capt.replace(/\n/g, ' | '));
const srcs = await fr.locator('.hands2 img').evaluateAll(a => a.map(i => i.src.length));
check('Both hands rendered as images', srcs.every(n => n > 10000), srcs.join(','));
await page.screenshot({ path: OUT + 's5-both-hands.png' });
const [dl2] = await Promise.all([page.waitForEvent('download'), fr.locator('.modal button', { hasText: 'Download' }).click()]);
const p2 = OUT + 'both.png'; await dl2.saveAs(p2);
check('Download both hands (PNG)', dl2.suggestedFilename() === 'my-ring-look.png' && fs.statSync(p2).size > 20000, fs.statSync(p2).size + ' bytes');

// ---------- 6. Download one hand ----------
const [dl] = await Promise.all([page.waitForEvent('download'), fr.locator('.lookbar [data-act="download"]').click()]);
const p1 = OUT + 'one.png'; await dl.saveAs(p1);
check('Download image (PNG)', fs.statSync(p1).size > 20000, fs.statSync(p1).size + ' bytes');

// ---------- 7. Share ----------
await fr.locator('.lookbar [data-act="share"]').click(); await page.waitForTimeout(600);
const link = await fr.locator('#shareLink').inputValue();
check('Share pop-up with link, WhatsApp, Email', link.startsWith(`${ORIGIN}/host.html?tryon=1&look=`) && await fr.locator('.sharelinks a', { hasText: 'WhatsApp' }).isVisible(), link.slice(0, 70));
await page.screenshot({ path: OUT + 's6-share.png' });
const before = await S(frame);
const page2 = await ctx.newPage();
const o2 = await openTryOn(page2, link);
const after = await S(o2.frame);
check('Shared link opens the same rings on both hands', JSON.stringify(after.cur) === JSON.stringify(before.cur) && JSON.stringify(after.left) === JSON.stringify(before.left), JSON.stringify(after));
check('No tutorial when opening a shared look', (await o2.fr.locator('.tour').count()) === 0);
await page2.close(); await page.bringToFront();
await fr.locator('.modal button', { hasText: 'Close' }).click();

// ---------- 8. My Looks — logged out ----------
await fr.locator('#tabMine').click(); await page.waitForTimeout(300);
check('My looks (signed out): sign-in empty state', (await fr.locator('#mineList').innerText()).includes('Sign in to save'));
await page.screenshot({ path: OUT + 's7-mine-signed-out.png' });
await fr.locator('.lookbar [data-act="save"]').count();
await fr.locator('#tabShop').click();
await fr.locator('.lookbar [data-act="save"]').click(); await page.waitForTimeout(200);
check('Save while signed out asks to sign in', (await fr.locator('.modal h3').innerText()) === 'Sign in to save looks');
await fr.locator('.modal button', { hasText: 'Sign in' }).click(); await page.waitForTimeout(800);
check('Sign in goes to store login, returns with the look', !!loginHit && decodeURIComponent(loginHit).includes('return_url=/host.html?tryon=1&look='), loginHit && decodeURIComponent(loginHit).slice(0, 90));
await page.close();

// ---------- 9. My Looks — logged in ----------
page = await ctx.newPage();
({ fr, frame } = await openTryOn(page, `${ORIGIN}/host.html?in=1`));
check('Tutorial not shown again', (await fr.locator('.tour').count()) === 0);
await fr.locator('#tabMine').click(); await page.waitForTimeout(400);
check('My looks (signed in, empty): empty state', (await fr.locator('#mineList').innerText()).includes('No saved looks yet'));
await page.screenshot({ path: OUT + 's8-mine-empty.png' });
await fr.locator('#mineSave').click(); await page.waitForTimeout(600);
await fr.locator('#lookName').fill('Date night');
await page.screenshot({ path: OUT + 's9-save.png' });
await fr.locator('.modal button', { hasText: 'Save' }).click(); await page.waitForTimeout(800);
check('Look saved to the account (with thumbnail)', saved.length === 1 && saved[0].name === 'Date night' && saved[0].thumbnail?.startsWith('data:image/jpeg') && saved[0].data?.hands?.right?.length === 1, JSON.stringify({ n: saved.length, name: saved[0]?.name }));
await page.waitForTimeout(400);
check('My looks lists it', (await fr.locator('.minecard').count()) === 1 && (await fr.locator('.minecard').innerText()).includes('Date night'));
await page.screenshot({ path: OUT + 's10-mine-list.png' });
// change the hand, then open the saved look → confirmation → restored
await fr.locator('#tabShop').click();
await fr.locator('#shopList .ringcard').nth(5).click(); await page.waitForTimeout(300);
await fr.locator('#tabMine').click(); await page.waitForTimeout(400);
await fr.locator('.minecard [data-open]').click(); await page.waitForTimeout(200);
// Open applies the look straight away (no confirmation pop-up — changed on request, 2026-11-24)
check('Open: no confirmation pop-up', (await fr.locator('.modal').count()) === 0);
await page.waitForTimeout(400);
s = await S(frame);
check('Saved look restored', s.cur.ring === 's1000', JSON.stringify(s.cur));
await page.screenshot({ path: OUT + 's11-look-opened.png' });
await fr.locator('#tabMine').click(); await page.waitForTimeout(400);
await fr.locator('.minecard [data-del]').click(); await fr.locator('.modal button', { hasText: 'Delete' }).click(); await page.waitForTimeout(600);
check('Delete removes the look', saved.length === 0 && (await fr.locator('#mineList').innerText()).includes('No saved looks yet'));
// A saved look whose only ring is sold out (product 1004): card says so and Open is disabled (was "nothing happens")
saved = [{ id: 'L9', name: 'Old favourite', createdAt: new Date().toISOString(), thumbnail: null, data: { v: 1, side: 'right', hands: { right: [{ k: '1004', f: 'ring', s: 4, m: 'Y', z: 1 }] } } }];
await fr.locator('#tabShop').click(); await fr.locator('#tabMine').click(); await page.waitForTimeout(500);
check('Unavailable saved look: note shown, Open disabled', (await fr.locator('.minecard').innerText()).includes('sold out or no longer available') && await fr.locator('.minecard [data-open]').isDisabled());
saved = [];

// ---------- 10. Help ----------
await fr.locator('#menuBtn').click(); await page.waitForTimeout(250);
await fr.locator('#drawer [data-act="help"]').click(); await page.waitForTimeout(200);
check('Help & FAQ pop-up', (await fr.locator('.faq details').count()) === 6);
await fr.locator('.modal button', { hasText: 'How it works' }).click(); await page.waitForTimeout(200);
check('Tutorial reopens from Help', await fr.locator('.tour').isVisible());

// ---------- 10b. My selections + Buy this look ----------
let cartBody = null;
await page.route(`${ORIGIN}/cart/add.js`, r => { cartBody = JSON.parse(r.request().postData()); r.fulfill({ contentType: 'application/json', body: '{"items":[]}' }); });
await page.route(`${ORIGIN}/cart.js`, r => r.fulfill({ contentType: 'application/json', body: '{"item_count":3}' }));
await fr.locator('.modal button', { hasText: 'Close' }).click().catch(() => {});
await fr.locator('.tour [data-t="skip"]').click().catch(() => {});
await fr.locator('#tabShop').click(); await page.waitForTimeout(300);
// right hand: put ring 2 on middle (drag), left hand: one ring
const ifr2 = await page.locator('iframe.ring-tryon-frame').boundingBox();
const cb2 = await fr.locator('#shopList .ringcard').nth(2).boundingBox();
const mid2 = await frame.evaluate(() => { const v = document.getElementById('view').getBoundingClientRect(); return { x: v.left + v.width * .5, y: v.top + v.height * .42 }; });
await page.mouse.move(ifr2.x + cb2.x + 30, ifr2.y + cb2.y + 30); await page.mouse.down();
await page.mouse.move(ifr2.x + cb2.x + 60, ifr2.y + cb2.y + 60, { steps: 4 });
await page.mouse.move(ifr2.x + mid2.x, ifr2.y + mid2.y, { steps: 15 }); await page.mouse.up(); await page.waitForTimeout(300);
await fr.locator('.sideseg [data-side="left"]').click(); await page.waitForTimeout(300);
await fr.locator('#tabSel').click(); await page.waitForTimeout(300);
const selTxt = await fr.locator('#selList').innerText();
check('Selections list both hands', (await fr.locator('.selitem').count()) === 3 && selTxt.includes('RIGHT HAND') || selTxt.toLowerCase().includes('right hand'), selTxt.replace(/\n/g, ' | ').slice(0, 160));
check('Selected count badge = 3', (await fr.locator('#selCount').innerText()) === '3');
const tot = await fr.locator('#selTotal').innerText();
check('Total shown', /\$\d/.test(tot), tot);
await page.screenshot({ path: OUT + 's14-selections.png' });
await fr.locator('#buyLook').click(); await page.waitForTimeout(800);
check('Buy this look: one cart call with 3 rings', cartBody?.items?.length === 3 && cartBody.items.every(i => i.properties['Worn on']), JSON.stringify(cartBody?.items?.map(i => [i.id, i.properties['Worn on']])));
check('"3 rings added" confirmation', (await fr.locator('#lookAddedTitle').innerText()).startsWith('3 rings added') && await fr.locator('#lookAdded').isVisible());
await page.screenshot({ path: OUT + 's15-buy-look.png' });
await fr.locator('.selitem [data-rm]').first().click(); await page.waitForTimeout(200);
check('✕ in selections removes a ring', (await fr.locator('.selitem').count()) === 2);

// ---------- 11. Mobile ----------
await page.close(); const mp = await ctx.newPage(); await mp.setViewportSize({ width: 390, height: 844 });
const m = await openTryOn(mp, `${ORIGIN}/host.html?in=1`);
await m.fr.locator('#menuBtn').click(); await mp.waitForTimeout(300);
const dw = await m.fr.locator('#drawer').boundingBox();
check('Mobile: menu drawer fits the screen', dw && dw.width <= 390, JSON.stringify(dw));
await mp.screenshot({ path: OUT + 's12-mobile-menu.png' });
await m.fr.locator('#drawer [data-act="both"]').click(); await mp.waitForTimeout(800);
await mp.screenshot({ path: OUT + 's13-mobile-both.png' });
const noScroll = await m.frame.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
await m.fr.locator('.modal button').last().click().catch(() => {});
const h0 = (await m.fr.locator('#tleft').boundingBox()).height;
const hb = await m.fr.locator('#sheetHandle').boundingBox(); const mf = (await mp.locator('iframe.ring-tryon-frame').boundingBox());
await mp.mouse.move(mf.x + hb.x + hb.width / 2, mf.y + hb.y + 8); await mp.mouse.down();
await mp.mouse.move(mf.x + hb.x + hb.width / 2, mf.y + hb.y - 260, { steps: 10 }); await mp.mouse.up(); await mp.waitForTimeout(400);
const h1 = (await m.fr.locator('#tleft').boundingBox()).height;
check('Mobile: drag the sheet up makes it taller (snaps)', h1 > h0 + 150, `${Math.round(h0)} → ${Math.round(h1)}`);
await mp.screenshot({ path: OUT + 's16-mobile-sheet-tall.png' });
const row = await m.frame.evaluate(() => { const g = document.getElementById('shopList'); return { sw: g.scrollWidth, cw: g.clientWidth, cols: getComputedStyle(g).gridAutoFlow }; });
check('Mobile: rings in a sideways swipe row', row.cols === 'column' && row.sw > row.cw, JSON.stringify(row));
check('Mobile: no sideways scroll', noScroll);

check('No JavaScript errors', errors.length === 0, [...new Set(errors)].slice(0, 4).join(' || '));
await browser.close();
