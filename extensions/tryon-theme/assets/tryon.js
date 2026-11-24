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
      metal: (p._metalIdx >= 0 && metalOf(first?.options[p._metalIdx])) || 'Y',
      metalPrices: Object.keys(metalPrices).length ? metalPrices : null,
      metalImages: Object.keys(metalImages).length ? metalImages : null,
    };
  }

  function findVariant(p, msg) {
    const sizeMatch = v => {
      if (p._sizeIdx < 0) return true;
      const val = norm(v.options[p._sizeIdx]).replace(/^(us|uk|au)\s*/, '');
      return val === norm(msg.sizeUS) || val === norm(msg.sizeAU) || val.split(/[\s/]+/).includes(norm(msg.sizeUS));
    };
    const metalMatch = v => p._metalIdx < 0 || metalOf(v.options[p._metalIdx]) === msg.metal;
    const all = p.variants;
    return all.find(v => v.available && metalMatch(v) && sizeMatch(v))
        || all.find(v => metalMatch(v) && sizeMatch(v))
        || all.find(v => v.available && metalMatch(v))
        || (p._metalIdx < 0 && p._sizeIdx < 0 ? all[0] : null);
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
    frame.allow = 'camera; fullscreen; clipboard-write';
    frame.src = viewerUrl.split('#')[0] + '#c=' + encode({
      currency: data.currency, locale: data.locale, origin: location.origin,
      current: String(data.currentId), products: viewerProducts, looks: parseLooks(s.looks, products),
      hasMore: !!data.collection?.more,
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

  /* The viewer scrolled past the rings it has: fetch the next page of the block's collection from the app
     (app proxy, same domain) and remember the products so add-to-cart can match their variants. */
  async function more() {
    const c = current.data.collection;
    if (!c || current.done) return reply({ type: 'more', products: [], done: true });
    if (current.loading) return;
    current.loading = true;
    const ctx = current;
    try {
      const u = new URL('/apps/ring-tryon/products', location.origin);
      u.searchParams.set('collection', c.handle);
      if (ctx.cursor) u.searchParams.set('after', ctx.cursor); else u.searchParams.set('offset', c.offset || 0);
      if (window.Shopify?.country) u.searchParams.set('country', window.Shopify.country);
      const res = await fetch(u, { headers: { Accept: 'application/json' } });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Could not load more rings');
      if (ctx !== current) return;                                  // try-on was closed meanwhile
      ctx.cursor = body.cursor; ctx.done = !body.hasMore;
      const fresh = (body.products || []).filter(p => !ctx.byKey[String(p.productId)]);
      fresh.forEach(p => { ctx.byKey[String(p.productId)] = p; });
      reply({ type: 'more', products: fresh.map(p => prepare(p, ctx.data.settings || {})), done: ctx.done });
    } catch (e) {
      if (ctx === current) reply({ type: 'more', products: [], done: false, error: e.message });
    } finally { ctx.loading = false; }
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
    else if (e.data.type === 'goto') {
      const root = window.Shopify?.routes?.root || '/';
      location.href = e.data.to === 'checkout' ? '/checkout' : root + 'cart';
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
