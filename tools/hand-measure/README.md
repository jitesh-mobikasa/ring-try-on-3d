# Hand measure

Measures a hand photo for the try-on viewer: where a ring sits on each finger, the finger's width and centre line
along its length (for real-size ring fit), where the nail starts, and the wrist (where a bracelet sits).

```bash
python3 -m venv .venv && .venv/bin/pip install pillow numpy      # once
.venv/bin/python measure.py ring-hand.json       # close-up hand: rings (HANDS.ring)
.venv/bin/python measure.py bracelet-hand.json   # hand + wrist: bracelets (HANDS.bracelet)
```
The try-on shows the ring photo in the **Rings** tab and the bracelet photo in the **Bracelets** tab.

Outputs in `out/` (not committed):
- `<name>-check.png`: the photo with the measurements drawn on it. **Always look at it.**
  Green = ring position, blue = how far a ring can slide, orange = down to the web, purple = wrist.
- `<name>-hands.js`: the `const HANDS = { … }` block to paste into `public/viewer/index.html`.

`hand.json`:
- `fingers.<name>.R`: where a ring sits (just above the web); `T` = where the nail starts.
- `clip` (optional): max half width for a finger pressed against its neighbour (no white gap between them).
- `base_max` (optional): limit for how far below `R` the finger's base is searched.
- `wrist`: `x` and a `from` / `to` band (photo px). The narrowest row of the arm in that band is the bracelet spot.

To put the photos themselves in the viewer: save them as JPEG (quality 90) into `public/viewer/hands.js` as `window.HAND_SRCS.ring` / `.bracelet`
(it is embedded so the viewer can read its pixels on the store's domain).
