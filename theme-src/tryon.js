/* Ring Try-On storefront script (theme app extension).
   Opens the hosted viewer in a full-screen iframe with the current product plus the block's collection,
   and turns the viewer's "add to cart" message into a /cart/add.js call for the matching variant. */
(() => {
  if (window.__ringTryOn) return; window.__ringTryOn = true;

  // Metal key used by the viewer → words that identify it in a variant option value.
  const METAL_WORDS = { R: ['rose'], W: ['white'], P: ['platinum', 'plat'], Y: ['yellow', 'gold'] };
  const norm = s => String(s || '').toLowerCase().trim();
  const metalOf = value => {
    const v = norm(value);
    return ['R', 'W', 'P', 'Y'].find(k => METAL_WORDS[k].some(w => v.includes(w))) || null;
  };

  function readData(btn) {
    const el = btn.closest('.ring-tryon')?.querySelector('[data-ring-tryon-product]');
    // Shopify wraps rendered snippets in <!-- BEGIN/END app snippet --> comments; drop them before parsing.
    try { return JSON.parse(el.textContent.replace(/<!--[\s\S]*?-->/g, '')); } catch (e) { console.warn('[Ring Try-On] bad product JSON', e); return null; }
  }

  // Work out where the metal / size options are for one product, and what the viewer needs to show it.
  function prepare(p, s) {
    const options = (p.options || []).map(norm);
    p._metalIdx = options.indexOf(norm(s.metalOption || 'Metal'));
    p._sizeIdx = options.indexOf(norm(s.sizeOption || 'Size'));
    p._lengthIdx = options.indexOf(norm(s.lengthOption || 'Length'));        // bracelets
    // Rings: centre stone by carat (like the big jewellers) — the "Carat" option, else one whose values read "1 ct" / "1.5 carat"
    p._caratIdx = options.indexOf(norm(s.caratOption || 'Carat'));
    if (p._caratIdx < 0 && p.tryon?.kind !== 'bracelet')
      p._caratIdx = options.findIndex((o, i) => /carat|\bct\b|stone size/.test(o) || p.variants.some(v => /\d\s*(ct|cts|carat)s?\b/i.test(String(v.options[i] || ''))));
    if (p.tryon?.kind === 'bracelet') {
      // Bracelet sizes are lengths, but stores name the option differently ("Length", "Size", "Bracelet size",
      // "Wrist size") → else take an option whose values look like lengths (18 cm, 7", 6.5 in).
      const looksLen = i => p.variants.some(v => /\d\s*(cm|mm|in|inch|inches|")\b|\d\s*"/i.test(String(v.options[i] || '')));
      if (p._lengthIdx < 0) p._lengthIdx = options.findIndex((o, i) => /length|size|wrist/.test(o) || looksLen(i));
      p._sizeIdx = -1;                                                        // never a ring size
    }
    const lengths = p._lengthIdx >= 0 ? [...new Set(p.variants.map(v => v.options[p._lengthIdx]))] : null;
    const carats = p._caratIdx >= 0 ? [...new Set(p.variants.map(v => v.options[p._caratIdx]))] : null;
    // price + stock of each metal × carat (the try-on shows the real price of the chosen stone)
    const combos = carats ? p.variants.map(v => ({ m: p._metalIdx >= 0 ? metalOf(v.options[p._metalIdx]) : null, c: v.options[p._caratIdx], price: v.price, a: v.available })) : null;
    const metalPrices = {}, metalImages = {};
    if (p._metalIdx >= 0) {
      for (const v of p.variants) {
        const k = metalOf(v.options[p._metalIdx]); if (!k) continue;
        if (!(k in metalPrices) || v.price < metalPrices[k]) metalPrices[k] = v.price;
        if (v.image && !metalImages[k]) metalImages[k] = v.image;
      }
    }
    const first = p.variants.find(v => v.available) || p.variants[0];
    return {
      key: String(p.productId), title: p.title, image: p.image, price: first?.price || 0,
      url: p.url, tryon: p.tryon || null, available: p.variants.some(v => v.available),
      description: p.description || '', type: p.type || '', images: p.images || [],
      metal: (p._metalIdx >= 0 && metalOf(first?.options[p._metalIdx])) || 'Y',
      metalPrices: Object.keys(metalPrices).length ? metalPrices : null,
      metalImages: Object.keys(metalImages).length ? metalImages : null,
      kind: p.tryon?.kind === 'bracelet' ? 'bracelet' : 'ring', lengths, carats, combos,
      firstCarat: carats && first ? first.options[p._caratIdx] : null,
    };
  }

  function findVariant(p, msg) {
    const sizeMatch = v => {
      if (p._sizeIdx < 0) return true;
      const val = norm(v.options[p._sizeIdx]).replace(/^(us|uk|au)\s*/, '');
      return val === norm(msg.sizeUS) || val === norm(msg.sizeAU) || val.split(/[\s/]+/).includes(norm(msg.sizeUS));
    };
    const metalMatch = v => p._metalIdx < 0 || metalOf(v.options[p._metalIdx]) === msg.metal;
    // bracelets: the shopper's Length (rings send none)
    const lengthMatch = v => p._lengthIdx < 0 || msg.length == null || norm(v.options[p._lengthIdx]) === norm(msg.length);
    const caratMatch = v => p._caratIdx < 0 || msg.carat == null || norm(v.options[p._caratIdx]) === norm(msg.carat);
    const all = p.variants, ok = v => metalMatch(v) && sizeMatch(v) && lengthMatch(v) && caratMatch(v);
    return all.find(v => v.available && ok(v))
        || all.find(ok)
        || all.find(v => v.available && metalMatch(v) && lengthMatch(v) && caratMatch(v))
        || (p._metalIdx < 0 && p._sizeIdx < 0 ? all.find(v => v.available && lengthMatch(v)) || all[0] : null);
  }

  /* Curated looks from the block setting, one per line: "Name: handle@finger, handle@finger".
     Resolved to the products we already have (with try-on images); each piece carries its stock. */
  const FINGERS = ['thumb', 'index', 'middle', 'ring', 'pinky'];
  function parseLooks(text, products) {
    const byHandle = Object.fromEntries(products.map(p => [norm(p.handle), p]));
    return String(text || '').split(/\r?\n/).map(line => {
      const m = line.match(/^\s*([^:]+):(.+)$/); if (!m) return null;
      const items = m[2].split(',').map(x => {
        const [h, f] = x.split('@').map(norm), p = byHandle[h];
        return p && { key: String(p.productId), finger: FINGERS.includes(f) ? f : 'ring', available: p.variants.some(v => v.available) };
      }).filter(Boolean);
      return items.length ? { name: m[1].trim(), items } : null;
    }).filter(Boolean);
  }

  /* Debug: open any product page with ?tryon_viewer=http://localhost:8800/viewer/ to load the viewer
     from your computer instead of the hosted one (remembered for this tab; ?tryon_viewer=off clears it). */
  function debugViewer() {
    try {
      const q = new URLSearchParams(location.search).get('tryon_viewer');
      if (q === 'off') sessionStorage.removeItem('ringTryonViewer');
      else if (q && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(q)) sessionStorage.setItem('ringTryonViewer', q);
      return sessionStorage.getItem('ringTryonViewer');
    } catch { return null; }
  }

  const encode = obj => btoa(unescape(encodeURIComponent(JSON.stringify(obj))))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  let frame = null, current = null, lastFocus = null;

  function open(btn) {
    const data = readData(btn); if (!data) return;
    const viewerUrl = debugViewer() || btn.dataset.viewer;
    if (!viewerUrl) { console.warn('[Ring Try-On] Set the "Viewer URL" in the block settings.'); return; }
    const s = data.settings || {};
    const products = data.products || [];
    const viewerProducts = products.map(p => prepare(p, s));
    current = { data, byKey: Object.fromEntries(products.map(p => [String(p.productId), p])), origin: new URL(viewerUrl, location.href).origin };
    lastFocus = document.activeElement;

    frame = document.createElement('iframe');
    frame.className = 'ring-tryon-frame';
    frame.title = 'Virtual ring try-on';
    frame.allow = 'camera; fullscreen; clipboard-write; web-share';
    frame.src = viewerUrl.split('#')[0] + '#c=' + encode({
      currency: data.currency, locale: data.locale, origin: location.origin,
      current: String(data.currentId), products: viewerProducts, looks: parseLooks(s.looks, products),
      hasMore: !!data.collection?.more,
      loggedIn: !!data.customer, shopName: data.shopName || '',
      // a shared look (?look=… in the page URL) opens on the hand
      look: new URLSearchParams(location.search).get('look') || null,
      shareUrl: location.origin + location.pathname,
    });
    document.body.appendChild(frame);
    document.documentElement.classList.add('ring-tryon-lock');
    frame.focus();
    track('tryon_opened', { productId: data.currentId });
  }

  function close() {
    frame?.remove(); frame = null; current = null;
    document.documentElement.classList.remove('ring-tryon-lock');
    lastFocus?.focus?.();
  }

  const reply = msg => frame?.contentWindow?.postMessage({ source: 'ring-tryon-host', ...msg }, current.origin);

  async function add(msg) {
    const p = current.byKey[String(msg.productKey)];
    const v = p && findVariant(p, msg);
    if (!v) return reply({ type: 'added', ok: false, error: 'This size / metal is not available' });
    if (!v.available) return reply({ type: 'added', ok: false, error: 'Sorry, this option is sold out' });
    try {
      const root = window.Shopify?.routes?.root || '/';
      const res = await fetch(root + 'cart/add.js', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ items: [{ id: v.id, quantity: 1, properties: msg.properties || {} }] }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.description || body.message || 'Could not add to cart');
      const count = await refreshCart();
      reply({ type: 'added', ok: true, count });
      track('tryon_add_to_cart', { productId: p.productId, variantId: v.id });
      document.dispatchEvent(new CustomEvent('ring-tryon:added', { detail: { variant: v, item: body } }));
      document.dispatchEvent(new CustomEvent('cart:refresh', { bubbles: true }));   // themes that listen for it
      const after = current.data.settings?.afterAdd;
      if (after === 'cart') location.href = root + 'cart';
      else if (after === 'close') close();
    } catch (e) {
      reply({ type: 'added', ok: false, error: e.message });
    }
  }

  /* Products from the app (app proxy, same domain), remembered so add-to-cart can match their variants.
     more(): the viewer scrolled past the rings it has → the next page of the block's collection.
     byKeys(): a saved / shared look has pieces that aren't in this page's list (saved on another product page). */
  async function load(type, params, extra, after) {
    const ctx = current;
    try {
      const u = new URL('/apps/ring-tryon/products', location.origin);
      for (const k in params) u.searchParams.set(k, params[k]);
      if (window.Shopify?.country) u.searchParams.set('country', window.Shopify.country);
      const res = await fetch(u, { headers: { Accept: 'application/json' } });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Could not load products');
      if (ctx !== current) return;                                  // try-on was closed meanwhile
      after?.(body);
      const fresh = (body.products || []).filter(p => !ctx.byKey[String(p.productId)]);
      fresh.forEach(p => { ctx.byKey[String(p.productId)] = p; });
      reply({ type, ...extra(), products: fresh.map(p => prepare(p, ctx.data.settings || {})) });
    } catch (e) {
      if (ctx === current) reply({ type, ...extra(), products: [], error: e.message });
    }
  }

  async function more() {
    const c = current.data.collection, ctx = current;
    if (!c || ctx.done) return reply({ type: 'more', products: [], done: true });
    if (ctx.loading) return;
    ctx.loading = true;
    await load('more', ctx.cursor ? { collection: c.handle, after: ctx.cursor } : { collection: c.handle, offset: c.offset || 0 },
      () => ({ done: ctx.done }), body => { ctx.cursor = body.cursor; ctx.done = !body.hasMore; });
    ctx.loading = false;
  }

  function byKeys(msg) {
    const keys = (msg.keys || []).map(String).filter(k => /^\d+$/.test(k) && !current.byKey[k]).slice(0, 20);
    if (!keys.length) return reply({ type: 'byKeys', req: msg.req, products: [] });
    load('byKeys', { ids: keys.join(',') }, () => ({ req: msg.req }));
  }

  /* "Buy this look": several rings (both hands) in ONE /cart/add.js call. Sold-out / unmatched rings are skipped
     and reported back; the rest are added together. */
  async function addMany(msg) {
    const lines = [], skipped = [];
    for (const it of msg.items || []) {
      const p = current.byKey[String(it.productKey)], v = p && findVariant(p, it);
      if (!v || !v.available) { skipped.push(p ? p.title : 'A ring'); continue; }
      lines.push({ id: v.id, quantity: 1, properties: it.properties || {} });
    }
    if (!lines.length) return reply({ type: 'addedMany', ok: false, error: 'These rings are sold out', skipped });
    try {
      const root = window.Shopify?.routes?.root || '/';
      const res = await fetch(root + 'cart/add.js', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ items: lines }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.description || body.message || 'Could not add to cart');
      const count = await refreshCart();
      reply({ type: 'addedMany', ok: true, added: lines.length, skipped, count });
      track('tryon_buy_look', { rings: lines.length });
      document.dispatchEvent(new CustomEvent('ring-tryon:added', { detail: { items: body.items || [] } }));
      document.dispatchEvent(new CustomEvent('cart:refresh', { bubbles: true }));
    } catch (e) {
      reply({ type: 'addedMany', ok: false, error: e.message, skipped });
    }
  }

  /* Update the theme's cart icon / count without reloading the page. Returns the number of items in the cart. */
  async function refreshCart() {
    const root = window.Shopify?.routes?.root || '/';
    let count = 0;
    try { count = (await (await fetch(root + 'cart.js')).json()).item_count || 0; } catch {}
    try {
      // Dawn and most Online Store 2.0 themes: re-render the cart icon section
      const bubble = document.getElementById('cart-icon-bubble');
      if (bubble) {
        const res = await fetch(root + '?sections=cart-icon-bubble');
        const html = (await res.json())['cart-icon-bubble'];
        const sec = html && new DOMParser().parseFromString(html, 'text/html').querySelector('.shopify-section');
        if (sec) bubble.innerHTML = sec.innerHTML;
      }
    } catch {}
    // Other themes: common count elements
    document.querySelectorAll('[data-cart-count], .cart-count, .cart-count-bubble span:first-child, .cart__count')
      .forEach(el => { if (/^\s*\d*\s*$/.test(el.textContent)) el.textContent = count; });
    return count;
  }

  function track(name, detail) {
    try { window.Shopify?.analytics?.publish?.(name, detail); } catch {}
  }

  window.addEventListener('message', e => {
    if (!current || e.origin !== current.origin || e.data?.source !== 'ring-tryon') return;
    if (e.data.type === 'close') close();
    else if (e.data.type === 'add') add(e.data);
    else if (e.data.type === 'more') more();
    else if (e.data.type === 'byKeys') byKeys(e.data);
    else if (e.data.type === 'addMany') addMany(e.data);
    else if (e.data.type === 'goto') {
      const root = window.Shopify?.routes?.root || '/';
      if (e.data.to === 'login') {
        // back to this product with the try-on open after signing in
        const back = location.pathname + '?tryon=1' + (e.data.look ? '&look=' + encodeURIComponent(e.data.look) : '');
        location.href = root + 'account/login?return_url=' + encodeURIComponent(back);
      } else if (e.data.to === 'logout') {
        location.href = root + 'account/logout';                    // Shopify's normal sign-out
      } else if (e.data.to === 'product' && e.data.url) {
        try { const u = new URL(e.data.url, location.href); if (u.origin === location.origin) location.href = u.href; } catch {}
      } else location.href = e.data.to === 'checkout' ? '/checkout' : root + 'cart';
    }
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && frame) close(); });
  document.addEventListener('click', e => {
    const btn = e.target.closest('[data-ring-tryon-open]');
    if (btn) { e.preventDefault(); open(btn); }
  });

  // QR handoff: the phone opens the product page with ?tryon=1 → open the try-on straight away.
  const autoOpen = () => {
    if (!new URLSearchParams(location.search).has('tryon')) return;
    const btn = document.querySelector('[data-ring-tryon-open]'); if (btn) open(btn);
  };
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', autoOpen) : autoOpen();
})();
