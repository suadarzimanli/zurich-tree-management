"""
RQ2 evidence: how precisely does each intake method identify ONE tree?

For every tree in the City of Zürich Baumkataster we count the candidate trees
a staff member would have to choose between when a report gives:

  street   – only the street name                 (trees on the same street)
  address  – a building address ("in front of X") (trees whose nearest official
             building address is the same address)
  map      – a tap on the map, as in the app       (trees within the app's 5 m
             pick radius of the tapped tree)

Inputs (downloaded via WFS, see data/SHA256SUMS and data/downloaded_at.txt):
  data/baumkataster.geojson  – Baumkataster, layer baumkataster_baumstandorte
  data/adressen.geojson      – Adressen Stadt Zürich, layer adrstzh_adressen_stzh_p
Output: results.json and results.md
"""
import json, math, collections, statistics, pathlib
import numpy as np
from scipy.spatial import cKDTree

HERE = pathlib.Path(__file__).parent
PICK_RADIUS_M = 10         # Map:PickRadiusM in appsettings.json
FAR_FROM_ADDRESS_M = 60    # a tree farther than this from any address cannot be described by one

def project(lon, lat, lat0=47.376):
    """Local equirectangular metres (error < 0.1 % across the city)."""
    k = 111_320.0
    return np.column_stack([(np.asarray(lon) - 8.54) * k * math.cos(math.radians(lat0)), (np.asarray(lat) - lat0) * 110_574.0])

def load(name):
    return json.loads((HERE / 'data' / name).read_text(encoding='utf-8'))['features']

trees = [f for f in load('baumkataster.geojson') if f.get('geometry') and f['geometry'].get('coordinates')]
addrs = [f for f in load('adressen.geojson') if f.get('geometry') and f['geometry'].get('coordinates')]

T = project([f['geometry']['coordinates'][0] for f in trees], [f['geometry']['coordinates'][1] for f in trees])
A = project([f['geometry']['coordinates'][0] for f in addrs], [f['geometry']['coordinates'][1] for f in addrs])
category = [str(f['properties'].get('kategorie') or 'unbekannt') for f in trees]
street = [str(f['properties'].get('strasse') or '').strip() for f in trees]

# --- street name only -------------------------------------------------------
per_street = collections.Counter(s for s in street if s)
street_cands = np.array([per_street[s] if s else np.nan for s in street], dtype=float)

# --- building address -------------------------------------------------------
dist_addr, nearest = cKDTree(A).query(T)
per_addr = collections.Counter(nearest.tolist())
addr_cands = np.array([per_addr[n] for n in nearest], dtype=float)
addressable = dist_addr <= FAR_FROM_ADDRESS_M

# --- map tap (app) ----------------------------------------------------------
tt = cKDTree(T)
map_cands = np.array([len(x) for x in tt.query_ball_point(T, r=PICK_RADIUS_M)], dtype=float)

# Sensitivity: a real tap misses the trunk. Simulate a tap error of e metres in a random
# direction (fixed seed) and count trees within the pick radius of the tapped point.
rng = np.random.default_rng(20261120)
tap_error = {}
for e in (3.0, 5.0):
    ang = rng.uniform(0, 2 * math.pi, len(T))
    taps = T + np.column_stack([np.cos(ang), np.sin(ang)]) * e
    hits = tt.query_ball_point(taps, r=PICK_RADIUS_M)
    n = np.array([len(h) for h in hits], dtype=float)
    found = np.array([i in h for i, h in enumerate(hits)])
    tap_error[e] = (n, found)

def summarise(x, mask=None):
    x = x if mask is None else x[mask]
    x = x[~np.isnan(x)]
    return {
        'n_trees': int(x.size),
        'median_candidates': float(np.median(x)),
        'mean_candidates': round(float(np.mean(x)), 2),
        'p90_candidates': float(np.percentile(x, 90)),
        'share_unique': round(float(np.mean(x == 1)), 4),
        'share_5_or_more': round(float(np.mean(x >= 5)), 4),
    }

groups = {'all trees': np.ones(len(trees), bool),
          'street trees (Strassenbaum)': np.array([c == 'Strassenbaum' for c in category]),
          'park & other trees': np.array([c != 'Strassenbaum' for c in category])}

results = {
    'inputs': {
        'trees': len(trees), 'addresses': len(addrs),
        'downloaded_at': (HERE / 'data' / 'downloaded_at.txt').read_text().strip(),
        'pick_radius_m': PICK_RADIUS_M, 'far_from_address_m': FAR_FROM_ADDRESS_M,
        'categories': dict(collections.Counter(category).most_common()),
    },
    'distance_tree_to_nearest_address_m': {
        'median': round(float(np.median(dist_addr)), 1),
        'p90': round(float(np.percentile(dist_addr, 90)), 1),
        'share_farther_than_%dm' % FAR_FROM_ADDRESS_M: round(float(np.mean(~addressable)), 4),
    },
    'by_group': {},
}
for g, m in groups.items():
    results['by_group'][g] = {
        'street_name_only': summarise(street_cands, m),
        'building_address': summarise(addr_cands, m & addressable),
        'map_tap_%dm' % PICK_RADIUS_M: summarise(map_cands, m),
        # "unique" here = exactly one candidate AND it is the intended tree (a lone wrong tree is a miss)
        **{f'map_tap_{PICK_RADIUS_M}m_with_{e:g}m_tap_error': {**summarise(n, m),
              'share_unique': round(float(np.mean((n[m] == 1) & found[m])), 4),
              'share_target_in_list': round(float(np.mean(found[m])), 4)}
           for e, (n, found) in tap_error.items()},
    }
(HERE / 'results.json').write_text(json.dumps(results, indent=2, ensure_ascii=False), encoding='utf-8')

# --- readable table ---------------------------------------------------------
lines = ['# RQ2 — candidate trees per report, by intake method', '',
         f"Baumkataster: {len(trees):,} trees · official building addresses: {len(addrs):,} · downloaded {results['inputs']['downloaded_at']}", '',
         '| Trees | Intake method | Median candidates | Mean | 90th pct | Uniquely identified | ≥5 candidates |',
         '|---|---|---:|---:|---:|---:|---:|']
names = {'street_name_only': 'Street name only', 'building_address': 'Building address', 'map_tap_%dm' % PICK_RADIUS_M: f'Map tap ({PICK_RADIUS_M} m), exact',
         **{f'map_tap_{PICK_RADIUS_M}m_with_{e:g}m_tap_error': f'Map tap, {e:g} m tap error' for e in tap_error}}
for g, block in results['by_group'].items():
    for k, s in block.items():
        lines.append(f"| {g} | {names[k]} | {s['median_candidates']:.0f} | {s['mean_candidates']} | {s['p90_candidates']:.0f} | {s['share_unique']:.1%} | {s['share_5_or_more']:.1%} |")
lines += ['', 'With tap error the tapped point is displaced; "target in list" = share of taps whose pick list still contains the intended tree '
          '(the app then shows a labelled list to choose from): ' + ', '.join(
          f"{e:g} m → {float(np.mean(found)):.1%}" for e, (n, found) in tap_error.items()) + ' (all trees).']
d = results['distance_tree_to_nearest_address_m']
lines += ['', f"Median distance tree → nearest building address: {d['median']} m (90th pct {d['p90']} m); "
          f"{d['share_farther_than_%dm' % FAR_FROM_ADDRESS_M]:.1%} of trees are more than {FAR_FROM_ADDRESS_M} m from any address "
          "and are excluded from the address method (an address cannot describe them)."]
(HERE / 'results.md').write_text('\n'.join(lines) + '\n', encoding='utf-8')
print('\n'.join(lines))
