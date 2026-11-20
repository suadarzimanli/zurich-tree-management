"""
Pick-design comparison: which map-tap rule identifies the intended tree best
when taps are imprecise? Evaluated on every tree in the Baumkataster with
simulated tap errors (random direction, fixed seed).

Designs
  list r      – show all trees within r metres of the tap (user chooses)
  nearest r   – take the nearest tree within r metres (no choice)
  hybrid r    – nearest tree within r; if the 2nd-nearest is within 1.5x the
                nearest distance, show a short list (sorted by distance)

Metrics per design and tap error e:
  hit        – intended tree is offered (as the single result or in the list)
  one-step   – intended tree is the single result (no list needed)
  wrong      – a single result is shown and it is the wrong tree
  list size  – mean number of trees shown when a list is shown
Output: pick_design.json, pick_design.md
"""
import json, math, pathlib
import numpy as np
from scipy.spatial import cKDTree

HERE = pathlib.Path(__file__).parent
feats = [f for f in json.loads((HERE / 'data' / 'baumkataster.geojson').read_text(encoding='utf-8'))['features']
         if f.get('geometry') and f['geometry'].get('coordinates')]
lon = np.array([f['geometry']['coordinates'][0] for f in feats]); lat = np.array([f['geometry']['coordinates'][1] for f in feats])
T = np.column_stack([(lon - 8.54) * 111_320 * math.cos(math.radians(47.376)), (lat - 47.376) * 110_574])
street = np.array([f['properties'].get('kategorie') == 'Strassenbaum' for f in feats])
tree = cKDTree(T)
rng = np.random.default_rng(20261120)
N = len(T)
idx = np.arange(N)

def evaluate(rule, r, e):
    ang = rng.uniform(0, 2 * math.pi, N)
    taps = T + np.column_stack([np.cos(ang), np.sin(ang)]) * e
    d, nn = tree.query(taps, k=8, distance_upper_bound=r)
    within = np.isfinite(d)
    count = within.sum(axis=1)
    if rule == 'list':
        single = count == 1
        offered = (nn == idx[:, None]).any(axis=1) & within[np.arange(N), :].any(axis=1)
        offered &= ((nn == idx[:, None]) & within).any(axis=1)
        one_step = single & (nn[:, 0] == idx)
        wrong = single & (nn[:, 0] != idx)
        list_size = np.where(count > 1, count, np.nan)
    elif rule == 'nearest':
        single = count >= 1
        one_step = single & (nn[:, 0] == idx)
        offered = one_step
        wrong = single & (nn[:, 0] != idx)
        list_size = np.full(N, np.nan)
    else:  # hybrid
        has2 = within[:, 1]
        close2 = has2 & (d[:, 1] <= 1.5 * d[:, 0] + 0.5)
        show_list = close2
        k_list = np.where(show_list, np.minimum(((d <= 1.5 * d[:, [0]] + 0.5) & within).sum(axis=1), 5), 0)
        in_list = np.array([idx[i] in nn[i, :k_list[i]] for i in range(N)])
        single = (count >= 1) & ~show_list
        one_step = single & (nn[:, 0] == idx)
        wrong = single & (nn[:, 0] != idx)
        offered = one_step | (show_list & in_list)
        list_size = np.where(show_list, k_list, np.nan)
    out = {}
    for name, m in (('all', np.ones(N, bool)), ('street', street)):
        ls = list_size[m]
        out[name] = {'hit': round(float(offered[m].mean()), 4), 'one_step': round(float(one_step[m].mean()), 4),
                     'wrong_single': round(float(wrong[m].mean()), 4),
                     'mean_list_size': round(float(np.nanmean(ls)), 2) if np.isfinite(ls).any() else None}
    return out

designs = [('list', 5), ('list', 10), ('nearest', 10), ('hybrid', 10)]
errors = [0.0, 3.0, 5.0, 8.0]
res = {f'{rule} {r} m': {f'{e:g} m': evaluate(rule, r, e) for e in errors} for rule, r in designs}
(HERE / 'pick_design.json').write_text(json.dumps(res, indent=2), encoding='utf-8')

lines = ['# Pick design under tap error (street trees)', '',
         '| Design | Tap error | Intended tree offered | Found in one step | Wrong single result | Mean list size |', '|---|---:|---:|---:|---:|---:|']
for dname, by_e in res.items():
    for e, block in by_e.items():
        s = block['street']
        lines.append(f"| {dname} | {e} | {s['hit']:.1%} | {s['one_step']:.1%} | {s['wrong_single']:.1%} | {s['mean_list_size'] if s['mean_list_size'] is not None else '—'} |")
(HERE / 'pick_design.md').write_text('\n'.join(lines) + '\n', encoding='utf-8')
print('\n'.join(lines))
