"""Measure a hand photo for the try-on viewer (rings on fingers, bracelets on the wrist).

  python measure.py hand.json          → out/<name>.json, out/<name>-check.png, out/<name>-hands.js (paste into the viewer)

hand.json:
  { "image": "source/hand_for_bracelet.png", "name": "back",
    "fingers": { "ring": { "R": [x, y], "T": [x, y] }, ... },      R = where a ring sits, T = where the nail starts
    "wrist": { "x": 500, "from": 600, "to": 820 } }                  search band (photo px) for the narrowest point

For each finger it walks R → T in slide steps and records the finger width (profile) and how far the real centre
is from the straight line (centre); `base` = steps from the web up to R. For the wrist it finds the narrowest
row of the arm in the band (that's where a bracelet sits) and records its width and the arm's angle there."""
import json, math, os, sys
import numpy as np
from PIL import Image, ImageDraw

def load_mask(path):
    a = np.asarray(Image.open(path).convert('RGBA')).astype(int)
    rgb, al = a[..., :3], a[..., 3]
    mn, mx = rgb.min(-1), rgb.max(-1)
    return ((mn < 228) | ((mx - mn) > 22)) & (al > 128), a.shape[1], a.shape[0]   # skin = not the white background

def run_at(mask, W, H, cx, cy, px, py, span):
    """The skin run along (px, py) through (cx, cy) that contains / is nearest to the centre → (lo, hi) offsets."""
    offs = np.arange(-span, span + .5, .5)
    xs = np.clip(np.round(cx + px * offs).astype(int), 0, W - 1); ys = np.clip(np.round(cy + py * offs).astype(int), 0, H - 1)
    on = mask[ys, xs]
    if not on.any(): return None
    runs, start = [], None
    for i, v in enumerate(on):
        if v and start is None: start = i
        if (not v or i == len(on) - 1) and start is not None:
            end = i if v else i - 1; runs.append((offs[start], offs[end])); start = None
    return min(runs, key=lambda r: 0 if r[0] <= 0 <= r[1] else min(abs(r[0]), abs(r[1])))

def finger(mask, W, H, R, T, base_max=60, clip=None):
    """clip = max half width (photo px) for a finger pressed against a neighbour (no white gap to measure)."""
    dx, dy = T[0] - R[0], T[1] - R[1]; L = math.hypot(dx, dy)
    d = (dx / L, dy / L); p = (-d[1], d[0])
    rot = math.degrees(math.atan2(d[0], -d[1]))
    cl = (lambda r: (max(r[0], -clip), min(r[1], clip))) if clip else (lambda r: r)
    r0 = cl(run_at(mask, W, H, R[0], R[1], *p, 120)); w0 = r0[1] - r0[0]
    s = (w0 / 2) / 19                                     # one slide step = geo.w / 19 photo px
    def at(t):
        r = run_at(mask, W, H, R[0] + d[0] * t * s, R[1] + d[1] * t * s, *p, w0 * 1.6)
        r = cl(r) if r else r
        return (r[1] - r[0], (r[0] + r[1]) / 2) if r else (0, 0)
    base = 0
    for t in range(-1, -base_max - 1, -1):              # down to the web (finger widens into the hand)
        w, _ = at(t)
        if w > w0 * 1.18 or w == 0: break
        base += 1
    prof, cent = [], []
    for t in range(-base, int(L / s) + 1):
        w, c = at(t)
        if prof and (w > prof[-1] * 1.2 or w < prof[-1] * .6): w, c = prof[-1], cent[-1]   # touching a neighbour
        prof.append(int(round(w))); cent.append(int(round(c)))
    return dict(geo=dict(x=round(R[0]), y=round(R[1]), rot=round(rot), w=round(w0 / 2)), base=base, profile=prof, centre=cent, tip=[round(T[0]), round(T[1])])

def wrist(mask, W, H, cfg):
    """Narrowest horizontal row of the arm between `from` and `to` → where a bracelet sits."""
    rows = []
    for y in range(cfg['from'], cfg['to'] + 1):
        r = run_at(mask, W, H, cfg['x'], y, 1, 0, 300)
        if r: rows.append((r[1] - r[0], y, cfg['x'] + (r[0] + r[1]) / 2))
    w, y, cx = min(rows)
    # arm direction around the wrist: centre 40 px above vs 40 px below
    up = run_at(mask, W, H, cx, y - 40, 1, 0, 300); dn = run_at(mask, W, H, cx, y + 40, 1, 0, 300)
    cu, cd = cx + (up[0] + up[1]) / 2, cx + (dn[0] + dn[1]) / 2
    rot = math.degrees(math.atan2(cu - cd, 80))
    return dict(x=round(cx), y=y, rot=round(rot), w=round(w / 2), width=round(w))

def check_image(img, out, data):
    im = Image.open(img).convert('RGB'); d = ImageDraw.Draw(im)
    for f, m in data['fingers'].items():
        g = m['geo']; r = math.radians(g['rot']); dv = (math.sin(r), -math.cos(r)); p = (math.cos(r), math.sin(r)); s = g['w'] / 19
        for i, (w, c) in enumerate(zip(m['profile'], m['centre'])):
            t = i - m['base']
            if t % 6: continue
            cx, cy = g['x'] + dv[0] * t * s + p[0] * c, g['y'] + dv[1] * t * s + p[1] * c
            col = (0, 160, 0) if t == 0 else (0, 90, 255) if t > 0 else (255, 140, 0)
            d.line([(cx - p[0] * w / 2, cy - p[1] * w / 2), (cx + p[0] * w / 2, cy + p[1] * w / 2)], fill=col, width=3 if t == 0 else 1)
        d.ellipse([g['x'] - 5, g['y'] - 5, g['x'] + 5, g['y'] + 5], outline=(255, 0, 0), width=2); d.text((g['x'] + 7, g['y']), f, fill=(200, 0, 0))
    if 'wrist' in data:
        w = data['wrist']; d.line([(w['x'] - w['w'], w['y']), (w['x'] + w['w'], w['y'])], fill=(200, 0, 200), width=4)
        d.text((w['x'] + w['w'] + 6, w['y'] - 6), 'wrist', fill=(200, 0, 200))
    im.save(out)

def viewer_js(name, label, data, fit):
    order = ['pinky', 'ring', 'middle', 'index', 'thumb']; F = data['fingers']
    g = ', '.join(f"{f}:{{ x:{F[f]['geo']['x']}, y:{F[f]['geo']['y']}, rot:{F[f]['geo']['rot']}, w:{F[f]['geo']['w']} }}" for f in order)
    t = ', '.join(f"{f}:[{F[f]['tip'][0]}, {F[f]['tip'][1]}]" for f in order)
    b = ', '.join(f"{f}:{F[f]['base']}" for f in order)
    pr = ',\n    '.join(f"{f}:{json.dumps(F[f]['profile'], separators=(',', ':'))}" for f in order)
    ce = ',\n    '.join(f"{f}:{json.dumps(F[f]['centre'], separators=(',', ':'))}" for f in order)
    w = data.get('wrist')
    wrist = f"\n    wrist:{{ x:{w['x']}, y:{w['y']}, rot:{w['rot']}, w:{w['w']} }},   // narrowest point of the arm: where a bracelet sits (w = half width, photo px)" if w else ''
    return f"""const HANDS = {{
  {name}:{{ name:'{label}', src:window.HAND_SRCS?.{name}, crop:{{ x:0, y:0, w:1024, h:1024 }}, fit:{fit}, depth:18,
    geo:{{ {g} }},{wrist}
    tips:{{ {t} }},
    base:{{ {b} }},
    profile:{{
    {pr} }},
    centre:{{
    {ce} }} }},
}};
"""

if __name__ == '__main__':
    here = os.path.dirname(os.path.abspath(__file__)); cfg_path = sys.argv[1]
    cfg = json.load(open(cfg_path)); img = os.path.join(os.path.dirname(os.path.abspath(cfg_path)), cfg['image'])
    mask, W, H = load_mask(img)
    data = {'fingers': {f: finger(mask, W, H, v['R'], v['T'], base_max=v.get('base_max', 60), clip=v.get('clip')) for f, v in cfg['fingers'].items()}}
    if 'wrist' in cfg: data['wrist'] = wrist(mask, W, H, cfg['wrist'])
    out = os.path.join(here, 'out'); os.makedirs(out, exist_ok=True); n = cfg.get('name', 'hand')
    json.dump(data, open(f'{out}/{n}.json', 'w'))
    check_image(img, f'{out}/{n}-check.png', data)
    open(f'{out}/{n}-hands.js', 'w').write(viewer_js(n, cfg.get('label', 'Hand'), data, cfg.get('fit', '{ s:.6, dx:3, dy:10 }')))
    for f, m in data['fingers'].items():
        print(f, m['geo'], 'base', m['base'], 'len', len(m['profile']), 'w@R', m['profile'][m['base']], 'max', max(m['profile'][m['base']:]))
    if 'wrist' in data: print('wrist', data['wrist'])
    print('→', f'{out}/{n}-check.png')
