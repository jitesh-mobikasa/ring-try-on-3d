// Hand: one hand photo (no pose picker — removed on request 2026-11-25), left hand = mirror.
// Every finger takes a ring on both hands, fit messages work, switching left / right keeps each hand's rings.
import { chromium } from 'playwright';
const ORIGIN = 'http://localhost:8811', OUT = new URL('./output/', import.meta.url).pathname;
const products = Array.from({ length: 4 }, (_, i) => ({ key: String(1000 + i), title: `Ring ${i + 1}`, image: `${ORIGIN}/public/viewer/products/metal-${'YWRP'[i]}.png`, price: 100, url: null, tryon: null, available: true, metal: 'Y' }));
const hash = Buffer.from(JSON.stringify({ currency: 'USD', locale: 'en', origin: ORIGIN, current: '1000', products })).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const results = []; const check = (n, ok, x = '') => results.push(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? '  — ' + x : ''}`);
process.on('exit', () => console.log(results.join('\n')));
const browser = await chromium.launch({ executablePath: process.env.CHROME, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
await page.addInitScript(() => { try { localStorage.setItem('ringTryonTour', '1'); } catch {} });
const errors = []; page.on('pageerror', e => errors.push(e.message));
await page.route('**/public/viewer/index.html*', async route => {
  const res = await route.fetch(); let body = await res.text();
  body = body.replace('renderer.setAnimationLoop(frame);', 'window.__t = { state, geo, P2L, toScreen, HANDS, fitStatus }; renderer.setAnimationLoop(frame);');
  await route.fulfill({ response: res, body });
});
await page.goto(`${ORIGIN}/public/viewer/index.html#c=${hash}`);
await page.waitForFunction(() => window.__t && !document.getElementById('loading'), null, { timeout: 30000 });
await page.waitForTimeout(500);

const S = () => page.evaluate(() => ({ side: __t.state.side, finger: __t.state.finger, worn: Object.keys(__t.state.worn) }));
const tapFinger = async f => {
  const p = await page.evaluate(f => { const g = __t.geo(f), s = __t.toScreen(__t.P2L(g.x, g.y)), r = document.getElementById('view').getBoundingClientRect(); return { x: r.left + s.x, y: r.top + s.y }; }, f);
  await page.mouse.click(p.x, p.y); await page.waitForTimeout(150);
};

check('One hand photo only', await page.evaluate(() => Object.keys(__t.HANDS).join(',')) === 'back');
await page.click('#menuBtn'); await page.waitForTimeout(300);
check('Menu has no pose picker, has Left / Right', (await page.locator('#poseList').count()) === 0 && (await page.locator('#drawer [data-side]').count()) === 2);
await page.click('#drawerClose'); await page.waitForTimeout(500);
for (const side of ['right', 'left']) {
  // the left hand is the default since 2026-11-26 → pick each side explicitly
  await page.click(`.sideseg [data-side="${side}"]`); await page.waitForTimeout(400);
  check(`${side} hand active`, (await S()).side === side);
  const ok = [];
  for (const f of ['thumb', 'index', 'middle', 'ring', 'pinky']) { await tapFinger(f); ok.push((await S()).finger === f ? f : `✗${f}`); }
  check(`${side} hand: a ring can be put on every finger`, ok.every(x => !x.startsWith('✗')), ok.join(' '));
  const msg = await page.evaluate(() => __t.fitStatus().msg);
  check(`${side} hand: fit message`, /US \d/.test(msg), msg);
  await tapFinger('ring');
  await page.screenshot({ path: `${OUT}hand-${side}.png` });
}
// right hand: 2 rings → left → back to right: still 2
await page.click('.sideseg [data-side="right"]'); await page.waitForTimeout(300);
const card = await page.locator('#shopList .ringcard').nth(1).boundingBox();
const mid = await page.evaluate(() => { const g = __t.geo('middle'), s = __t.toScreen(__t.P2L(g.x, g.y)), r = document.getElementById('view').getBoundingClientRect(); return { x: r.left + s.x, y: r.top + s.y }; });
await page.mouse.move(card.x + 30, card.y + 30); await page.mouse.down(); await page.mouse.move(card.x + 60, card.y + 60, { steps: 4 });
await page.mouse.move(mid.x, mid.y, { steps: 15 }); await page.mouse.up(); await page.waitForTimeout(300);
const before = await S();
await page.click('.sideseg [data-side="left"]'); await page.waitForTimeout(300);
await page.click('.sideseg [data-side="right"]'); await page.waitForTimeout(300);
const after = await S();
check('Right hand keeps its 2 rings after visiting the left', before.worn.length === 1 && after.worn.join() === before.worn.join() && after.finger === before.finger, JSON.stringify({ before, after }));
check('No JavaScript errors', errors.length === 0, errors.join(' | '));
await browser.close();
