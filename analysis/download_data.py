"""
Downloads the two City of Zürich open datasets used by the analysis into data/
and compares them with the checksums recorded for the published results.

The datasets are updated by the city over time, so a fresh download can differ
from the archived one; the script reports this instead of failing.
Usage:  python download_data.py   then   python ambiguity_analysis.py ; python pick_design.py
"""
import hashlib, pathlib, urllib.request

HERE = pathlib.Path(__file__).parent / 'data'
WFS = 'https://www.ogd.stadt-zuerich.ch/wfs/geoportal/{service}?service=WFS&version=1.1.0&request=GetFeature&typename={layer}&outputFormat=GeoJSON'
SOURCES = {
    'baumkataster.geojson': WFS.format(service='Baumkataster', layer='baumkataster_baumstandorte'),
    'adressen.geojson': WFS.format(service='Adressen_Stadt_Zuerich', layer='adrstzh_adressen_stzh_p'),
}

def sha256(p):
    h = hashlib.sha256()
    with open(p, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()

expected = {}
sums = HERE / 'SHA256SUMS'
if sums.exists():
    for line in sums.read_text().splitlines():
        digest, name = line.split()
        expected[name.lstrip('*')] = digest

HERE.mkdir(exist_ok=True)
for name, url in SOURCES.items():
    target = HERE / name
    print(f'downloading {name} …')
    req = urllib.request.Request(url, headers={'User-Agent': 'zurich-tree-management-research'})
    with urllib.request.urlopen(req, timeout=300) as r:
        target.write_bytes(r.read())
    got = sha256(target)
    if name in expected:
        same = got == expected[name]
        print(f'  {"matches" if same else "differs from"} the archived version ({got[:12]}…)')
    else:
        print(f'  sha256 {got}')
