/* Ring configurator (theme app extension block "Ring configurator").
   Renders the product's options as jewellery pickers, keeps a valid variant selected, shows the live price,
   validates the engraving and adds ring (+ optional engraving fee) to the cart in one call. */
(() => {
  if (window.__ringConfigurator) return; window.__ringConfigurator = true;

  const norm = s => String(s ?? '').toLowerCase().trim();
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // US → AU/NZ ring sizes (letters)
  const AU = { '3': 'F', '3.5': 'G', '4': 'H', '4.5': 'I', '5': 'J½', '5.5': 'K½', '6': 'L½', '6.5': 'M½', '7': 'N½', '7.5': 'O½', '8': 'P½', '8.5': 'Q½', '9': 'R½', '9.5': 'S½', '10': 'T½', '10.5': 'U½', '11': 'V½', '11.5': 'W½', '12': 'X½' };
  const METAL_SWATCH = [['rose', '#e7b4a0'], ['white', '#e9ecef'], ['platinum', '#dfe3e7'], ['silver', '#d9dcdf'], ['yellow', '#e8c766'], ['gold', '#e8c766']];
  const STONE_SWATCH = [['diamond', '#ffffff'], ['sapphire', '#2f55e0'], ['emerald', '#19b46a'], ['ruby', '#d8203a'], ['pink', '#ff9db8'],
    ['champagne', '#f3cf8a'], ['morganite', '#f5b5a8'], ['aquamarine', '#7fd4e6'], ['black', '#222222'], ['amethyst', '#9b59d0'], ['yellow', '#f6d55c']];
  const SHAPE_SVG = {
    round: '<circle cx="12" cy="12" r="8"/>',
    oval: '<ellipse cx="12" cy="12" rx="6" ry="9"/>',
    princess: '<rect x="5" y="5" width="14" height="14"/>',
    square: '<rect x="5" y="5" width="14" height="14"/>',
    cushion: '<rect x="5" y="5" width="14" height="14" rx="4"/>',
    emerald: '<path d="M8 4h8l3 3v10l-3 3H8l-3-3V7z"/>',
    radiant: '<path d="M8 4h8l3 3v10l-3 3H8l-3-3V7z"/>',
    pear: '<path d="M12 3c4 5 6 8 6 11a6 6 0 0 1-12 0c0-3 2-6 6-11z"/>',
    marquise: '<path d="M12 3c5 4 5 14 0 18c-5-4-5-14 0-18z"/>',
    heart: '<path d="M12 20s-7-4.4-7-9.3A4 4 0 0 1 12 8a4 4 0 0 1 7 2.7C19 15.6 12 20 12 20z"/>',
  };
  const pickColour = (list, v) => (list.find(([w]) => norm(v).includes(w)) || [])[1];
  const ENGRAVE_OK = /^[A-Za-z0-9 .,&'!?\-♥]*$/;

  function init(root) {
    let data;
    try { data = JSON.parse(root.querySelector('[data-rc-data]').textContent.replace(/<!--[\s\S]*?-->/g, '')); }
    catch (e) { console.warn('[Ring configurator] bad data', e); return; }
    const opts = data.options, variants = data.variants;
    if (!variants.length) return;
    const kindOf = name => Object.keys(data.names).find(k => norm(data.names[k]) === norm(name)) || 'other';
    const money = cents => new Intl.NumberFormat(data.locale || undefined, { style: 'currency', currency: data.currency }).format(cents / 100);
    let sel = (variants.find(v => v.id === data.selected) || variants.find(v => v.available) || variants[0]).options.slice();
    let sizeSys = 'US';

    const match = s => variants.find(v => v.options.every((o, i) => o === s[i]));
    // Best variant when option i changes to value: keep as many other choices as possible, prefer the ones the
    // shopper picked most recently, then in stock.
    const recent = [];                                   // option indexes, most recent last
    function choose(i, value) {
      const want = sel.slice(); want[i] = value;
      recent.splice(recent.indexOf(i) >>> 0, recent.includes(i) ? 1 : 0); recent.push(i);
      const exact = match(want); if (exact) return exact.options.slice();
      const weight = k => 1 + (recent.indexOf(k) + 1) * .01;            // later picks count a little more
      const score = v => v.options.reduce((n, o, k) => n + (o === want[k] ? weight(k) : 0), 0) + (v.available ? .005 : 0);
      return variants.filter(v => v.options[i] === value).sort((a, b) => score(b) - score(a))[0]?.options.slice() || sel;
    }
    // For option i, value: what would the price / stock be (other choices kept)?
    const probe = (i, value) => { const s = sel.slice(); s[i] = value; return match(s); };

    const optionsBox = root.querySelector('[data-rc-options]');
    function render() {
      const v = match(sel) || variants[0];
      optionsBox.innerHTML = opts.map((o, i) => {
        const kind = kindOf(o.name);
        const label = `<div class="rc__label">${esc(o.name)}: <b>${esc(kind === 'size' ? sizeText(sel[i]) : sel[i])}</b></div>`;
        if (kind === 'size') {
          return `<div class="rc__group">${label}<div class="rc__row">
            <select class="rc__select" data-i="${i}" aria-label="${esc(o.name)}">${o.values.map(val => {
              const p = probe(i, val); return `<option value="${esc(val)}" ${val === sel[i] ? 'selected' : ''} ${p ? '' : 'disabled'}>${esc(sizeText(val))}${p && !p.available ? ' (sold out)' : ''}</option>`;
            }).join('')}</select>
            <div class="rc__seg" role="group" aria-label="Size system"><button type="button" data-sys="US" class="${sizeSys === 'US' ? 'on' : ''}">US</button><button type="button" data-sys="AU" class="${sizeSys === 'AU' ? 'on' : ''}">AU/NZ</button></div>
          </div></div>`;
        }
        return `<div class="rc__group">${label}<div class="rc__values rc__values--${kind}" role="radiogroup" aria-label="${esc(o.name)}">${o.values.map(val => {
          const p = probe(i, val), on = val === sel[i], d = p && !on ? p.price - v.price : 0;
          let ico = '';
          if (kind === 'metal') ico = `<i class="rc__dot" style="background:${pickColour(METAL_SWATCH, val) || '#ddd'}"></i>`;
          if (kind === 'stone') ico = `<i class="rc__dot" style="background:${pickColour(STONE_SWATCH, val) || '#eee'}"></i>`;
          if (kind === 'shape') { const k = Object.keys(SHAPE_SVG).find(s => norm(val).includes(s)); if (k) ico = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true">${SHAPE_SVG[k]}</svg>`; }
          return `<button type="button" role="radio" aria-checked="${on}" class="rc__val ${on ? 'on' : ''} ${p && !p.available ? 'out' : ''}" data-i="${i}" data-v="${esc(val)}" ${p ? '' : 'data-missing'}>
            ${ico}<span>${esc(val)}</span>${d ? `<small>${d > 0 ? '+' : '−'}${money(Math.abs(d))}</small>` : ''}${p && !p.available ? '<small>Sold out</small>' : ''}</button>`;
        }).join('')}</div></div>`;
      }).join('');
      optionsBox.querySelectorAll('.rc__val').forEach(b => b.onclick = () => set(+b.dataset.i, b.dataset.v));
      optionsBox.querySelectorAll('.rc__select').forEach(s => s.onchange = () => set(+s.dataset.i, s.value));
      optionsBox.querySelectorAll('[data-sys]').forEach(b => b.onclick = () => { sizeSys = b.dataset.sys; render(); });
      update(v);
    }
    function sizeText(val) {
      const us = String(val).replace(/^us\s*/i, '').trim();
      return sizeSys === 'AU' && AU[us] ? `AU ${AU[us]}` : /^\d/.test(us) ? `US ${us}` : val;
    }
    function set(i, value) { sel = choose(i, value); render(); }

    const priceEl = root.querySelector('[data-rc-price]'), addBtn = root.querySelector('[data-rc-add]');
    const engrave = root.querySelector('[data-rc-engrave]');
    const engraveText = () => (engrave?.value || '').trim();
    function update(v = match(sel)) {
      const fee = data.engraving?.fee && engraveText() ? data.engraving.fee.price : 0;
      const total = v.price + fee;
      priceEl.innerHTML = `<span class="rc__now">${money(total)}</span>${v.compareAt > v.price ? ` <s class="rc__was">${money(v.compareAt + fee)}</s>` : ''}`
        + (fee ? ` <span class="rc__muted">incl. engraving ${money(fee)}</span>` : '');
      if (addBtn) { addBtn.disabled = !v.available; addBtn.textContent = v.available ? `Add to cart · ${money(total)}` : 'Sold out'; }
      // keep the page in sync: URL, theme's own product form, featured image, other scripts
      try { const u = new URL(location.href); u.searchParams.set('variant', v.id); history.replaceState(history.state, '', u); } catch {}
      document.querySelectorAll('form[action*="/cart/add"] [name="id"]').forEach(inp => { inp.value = v.id; });
      root.dispatchEvent(new CustomEvent('ring-configurator:change', { bubbles: true, detail: { variant: v, engraving: engraveText() } }));
    }

    if (engrave) {
      const msg = root.querySelector('[data-rc-engrave-msg]'), count = root.querySelector('[data-rc-engrave-count]');
      engrave.addEventListener('input', () => {
        const ok = ENGRAVE_OK.test(engrave.value);
        engrave.classList.toggle('bad', !ok);
        msg.textContent = ok ? "Letters, numbers, spaces and . , & ' ! ? - ♥" : 'Please use only letters, numbers, spaces and . , & \' ! ? - ♥';
        count.textContent = `${engrave.value.length} / ${data.engraving.max}`;
        update();
      });
    }

    const status = root.querySelector('[data-rc-status]');
    addBtn?.addEventListener('click', async () => {
      const v = match(sel), text = engraveText();
      if (!v?.available) return;
      if (engrave && !ENGRAVE_OK.test(engrave.value)) { engrave.focus(); return; }
      const props = {}; if (text) props.Engraving = text;
      const items = [{ id: v.id, quantity: 1, properties: props }];
      if (text && data.engraving?.fee) items.push({ id: data.engraving.fee.id, quantity: 1, properties: { For: data.productTitle, _engraving_for: String(v.id) } });
      addBtn.disabled = true; addBtn.textContent = 'Adding…';
      try {
        const root2 = window.Shopify?.routes?.root || '/';
        const res = await fetch(root2 + 'cart/add.js', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ items }) });
        const body = await res.json();
        if (!res.ok) throw new Error(body.description || body.message || 'Could not add to cart');
        if (data.afterAdd === 'cart') { location.href = root2 + 'cart'; return; }
        status.hidden = false; status.className = 'rc__status ok';
        status.innerHTML = `Added to your cart${text ? ` with engraving “${esc(text)}”` : ''}. <a href="${root2}cart">View cart</a>`;
        document.dispatchEvent(new CustomEvent('cart:refresh', { bubbles: true }));
        try {
          const n = (await (await fetch(root2 + 'cart.js')).json()).item_count;
          document.querySelectorAll('[data-cart-count], .cart-count, .cart-count-bubble span:first-child, .cart__count').forEach(el => { if (/^\s*\d*\s*$/.test(el.textContent)) el.textContent = n; });
        } catch {}
      } catch (e) {
        status.hidden = false; status.className = 'rc__status err'; status.textContent = e.message;
      } finally { update(); }
    });

    render();
  }

  const boot = () => document.querySelectorAll('[data-rc]').forEach(el => { if (!el.__rc) { el.__rc = true; init(el); } });
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', boot) : boot();
  document.addEventListener('shopify:section:load', boot);   // theme editor
})();
