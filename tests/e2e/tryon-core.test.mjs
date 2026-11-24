import { chromium } from 'playwright';
const OUT = new URL('./output/', import.meta.url).pathname;
const BASE = 'http://localhost:8811/public/viewer/index.html';
const img = k => `http://localhost:8811/public/viewer/products/metal-${k}.png`;
const products = Array.from({ length: 20 }, (_, i) => ({
  key: String(1000 + i), title: `Test Ring ${i + 1}`, image: img('YWRP'[i % 4]), price: 100 + i, url: null, tryon: null,
  available: i !== 3, metal: 'Y',
}));
const looks = [
  { name: 'Bridal stack', items: [{ key: '1000', finger: 'ring', available: true }, { key: '1001', finger: 'middle', available: true }] },
  { name: 'Trio with sold-out', items: [{ key: '1002', finger: 'index', available: true }, { key: '1003', finger: 'pinky', available: false }, { key: '1004', finger: 'ring', available: true }] },
  { name: 'All sold out', items: [{ key: '1003', finger: 'ring', available: false }] },
];
const cfg = { currency: 'USD', locale: 'en', origin: 'http://localhost:8811', current: '1000', products, looks };
const hash = Buffer.from(JSON.stringify(cfg)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const results = [];
const check = (name, ok, extra = '') => { results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`); };

const browser = await chromium.launch({ executablePath: process.env.CHROME, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
// the first-visit tutorial would cover the screen; these tests are about other things
await page.addInitScript(() => { try { localStorage.setItem('ringTryonTour', '1'); } catch {} });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
// Test-only hook: expose module state (not written to the repo)
await page.route('**/index.html*', async route => {
  const res = await route.fetch(); let body = await res.text();
  body = body.replace('renderer.setAnimationLoop(frame);', 'window.__t = { state, geo, P2L, toScreen, LOOKS }; renderer.setAnimationLoop(frame);');
  await route.fulfill({ response: res, body });
});
await page.goto(`${BASE}#c=${hash}`);
await page.waitForFunction(() => window.__t && !document.getElementById('loading'), null, { timeout: 30000 });
await page.waitForTimeout(500);

const S = () => page.evaluate(() => ({ finger: __t.state.finger, pid: __t.state.pid, side: __t.state.side, worn: Object.fromEntries(Object.entries(__t.state.worn).map(([f, r]) => [f, r.pid])) }));
const fingerXY = f => page.evaluate(f => {
  const g = __t.geo(f), p = __t.toScreen(__t.P2L(g.x, g.y)), r = document.getElementById('view').getBoundingClientRect();
  return { x: r.left + p.x, y: r.top + p.y };
}, f);

// 1. Tabs
check('Looks tab hidden', await page.isHidden('#tabLooks'));
check('Rings panel open', await page.isVisible('#panelShop'));

// 2. Lazy loading
let n = await page.locator('#shopList .ringcard').count();
check('First page shows 12 rings', n === 12, `got ${n}`);
check('"Loading more" marker present', await page.isVisible('#shopMore'));
await page.locator('#shopList').evaluate(el => el.scrollTop = el.scrollHeight);
await page.waitForTimeout(600);
await page.locator('#shopList').evaluate(el => el.scrollTop = el.scrollHeight);
await page.waitForTimeout(600);
n = await page.locator('#shopList .ringcard').count();
check('Scrolling loads the rest (20)', n === 20, `got ${n}`);
check('Sold-out ring labelled', (await page.locator('#shopList .ringcard').nth(3).innerText()).includes('Sold out'));
await page.locator('#shopList').evaluate(el => el.scrollTop = 0);

// 3. Drag from drawer onto middle finger
let s0 = await S();
const card = page.locator('#shopList .ringcard').nth(1); const cb = await card.boundingBox();
const mid = await fingerXY('middle');
await page.mouse.move(cb.x + cb.width / 2, cb.y + cb.height / 2); await page.mouse.down();
await page.mouse.move(cb.x + 40, cb.y + 40, { steps: 5 });
await page.mouse.move(mid.x, mid.y, { steps: 15 });
check('Drag ghost shown while dragging', await page.isVisible('.dragghost'));
await page.screenshot({ path: OUT + '1-drag-dropzones.png' });
await page.mouse.up(); await page.waitForTimeout(300);
let s = await S();
check('Dropped ring lands on middle finger', s.finger === 'middle' && s.pid === 's1001', JSON.stringify(s));
check('First ring stays on ring finger', s.worn.ring === s0.pid, JSON.stringify(s.worn));
check('"On your hand" chips show 2 rings', (await page.locator('#wornList .wornchip').count()) === 2);
await page.screenshot({ path: OUT + '2-two-rings.png' });

// 4. Tap chip → edit that ring
await page.locator('#wornList .wornchip[data-f="ring"] span').click(); await page.waitForTimeout(200);
s = await S();
check('Tapping chip makes it the active ring', s.finger === 'ring' && s.worn.middle === 's1001', JSON.stringify(s));

// 5. Drag a ring on the hand onto the other finger → swap
const rf = await fingerXY('ring'); const mf = await fingerXY('middle');
const before = await S();
await page.mouse.move(rf.x, rf.y); await page.mouse.down();
await page.mouse.move(rf.x + 5, rf.y - 5, { steps: 3 });
await page.mouse.move(mf.x, mf.y, { steps: 20 });
await page.mouse.up(); await page.waitForTimeout(300);
s = await S();
check('Drag ring onto occupied finger swaps them', s.finger === 'middle' && s.pid === before.pid && s.worn.ring === 's1001', JSON.stringify(s));

// 6. Left / right
// Each hand has its own rings: a new hand starts with the ring being edited; switching back restores the other hand.
await page.click('.sideseg [data-side="left"]'); await page.waitForTimeout(400);
s = await S();
check('Left hand selected', s.side === 'left' && (await page.locator('.sideseg [data-side="left"]').getAttribute('class')).includes('on'));
check('Left hand starts with just the edited ring', Object.keys(s.worn).length === 0 && s.finger === 'middle', JSON.stringify(s));
await page.screenshot({ path: OUT + '3-left-hand.png' });
await page.click('.sideseg [data-side="right"]'); await page.waitForTimeout(300);
s = await S();
check('Right hand keeps both rings', s.side === 'right' && Object.keys(s.worn).length === 1, JSON.stringify(s));

// 7. Remove a ring
await page.locator('#wornList .wornchip[data-f="ring"] .x').click(); await page.waitForTimeout(200);
s = await S();
check('✕ removes ring, chips hide with 1 ring', Object.keys(s.worn).length === 0 && await page.locator('#wornList').isHidden(), JSON.stringify(s));

check('No JavaScript errors', errors.length === 0, errors.slice(0, 3).join(' || '));
console.log(results.join('\n'));
await browser.close();
