// Ring stacks: up to 3 rings on one finger (placed just above each other), a full finger replaces its top ring,
// removing a ring closes the gap, and a saved / shared look puts the whole stack back in the same order.
// Product page ("Try more pieces"): tapping a ring card stacks it on the current finger.
import { chromium } from 'playwright';
const ORIGIN = 'http://localhost:8811';
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
  body = body.replace('renderer.setAnimationLoop(frame);',
    'window.__t = { state, setTone, placeNew, removeRing, lookData, applyLookData, stackLabel, handRings, STACK_MAX }; renderer.setAnimationLoop(frame);');
  await route.fulfill({ response: res, body });
});
await page.goto(`${ORIGIN}/public/viewer/index.html#c=${hash}`);
await page.waitForFunction(() => window.__t && !document.getElementById('loading'), null, { timeout: 30000 });
await page.waitForTimeout(500);

// [label, product key, slide] of every ring on the hand on screen, base of each finger first
const rings = () => page.evaluate(() => __t.handRings(__t.state.side).filter(r => r[0] !== 'wrist')
  .map(([k, pid, , slide]) => [__t.stackLabel(k), pid.replace(/^s/, ''), slide]));

// Product page: the "Try more pieces" list, tap = stack on the current finger
check('Product page shows "Try more pieces"', await page.locator('#morePick .ringcard').count() >= 3);
await page.click('#morePick .ringcard[data-id="s1001"]'); await page.waitForTimeout(300);
await page.click('#morePick .ringcard[data-id="s1002"]'); await page.waitForTimeout(300);
let r = await rings();
check('Tapping 2 ring cards stacks them: 3 rings on the ring finger', r.length === 3 && r.every(x => x[0].startsWith('Ring finger · ')), JSON.stringify(r));
check('Stacked rings sit above each other, in order', r[0][2] < r[1][2] && r[1][2] < r[2][2], JSON.stringify(r.map(x => x[2])));
check('Stack labels count from the base', r.map(x => x[0]).join('|') === 'Ring finger · 1 of 3|Ring finger · 2 of 3|Ring finger · 3 of 3');

await page.evaluate(() => __t.placeNew('s1003', 'ring'));
r = await rings();
check('Full finger: the top ring is replaced, still 3 rings', r.length === 3 && r[2][1] === '1003', JSON.stringify(r));

await page.evaluate(() => __t.placeNew('s1001', 'middle'));
r = await rings();
check('Another finger still takes its own ring', r.some(x => x[0] === 'Middle finger' && x[1] === '1001'), JSON.stringify(r));

const before = await rings();
const middle = await page.evaluate(() => __t.handRings(__t.state.side).find(([k]) => __t.stackLabel(k) === 'Ring finger · 2 of 3')[0]);
await page.evaluate(k => __t.removeRing(k), middle);
r = (await rings()).filter(x => x[0].startsWith('Ring finger'));
const ringBefore = before.filter(x => x[0].startsWith('Ring finger'));
check('Removing a ring closes the gap in the stack', r.length === 2 && Math.abs(r[1][2] - ringBefore[1][2]) < .01, JSON.stringify(r));

const look = await page.evaluate(() => __t.lookData());
const saved = await rings();
await page.evaluate(d => __t.applyLookData(d), look);
const back = await rings();
check('A saved / shared look puts the stack back in the same order',
  JSON.stringify(back.map(x => [x[0], x[1]])) === JSON.stringify(saved.map(x => [x[0], x[1]])), JSON.stringify({ saved, back }));

// the skin tone is saved with the look and comes back with it
await page.evaluate(() => { __t.setTone(80); });
const toned = await page.evaluate(() => __t.lookData());
await page.evaluate(() => { __t.setTone(10); });
await page.evaluate(d => __t.applyLookData(d), toned);
check('A look keeps the skin tone it was saved with', toned.t === 80 && await page.evaluate(() => Math.round(__t.state.tone)) === 80, JSON.stringify({ saved: toned.t, now: await page.evaluate(() => __t.state.tone) }));

check('No page errors', !errors.length, errors.join(' | '));
await browser.close();
