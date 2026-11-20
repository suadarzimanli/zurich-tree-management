(function (global) {
    'use strict';

    var cfg = null;
    var sheetEl = null;
    var summaryEl = null;
    var hintEl = null;
    var listEl = null;
    var closeBtn = null;
    var escHandler = null;
    var mapInstance = null;
    var pickCircle = null;

    // 10 m: keeps the intended tree in the list even when a tap misses by ~8 m
    // (see research_materials/analysis/pick_design.md)
    var DEFAULT_RADIUS_M = 10;

    function t(key, vars) {
        var i18n = global.ZurichI18n;
        if (i18n && typeof i18n.t === 'function') return i18n.t(key, vars);
        return key;
    }

    function pickRadiusM() {
        return (cfg && cfg.mapPickRadiusM) || DEFAULT_RADIUS_M;
    }

    function escapeHtml(value) {
        if (value == null || value === '') return '';
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function toLatLng(latLng) {
        if (!latLng) return null;
        if (typeof latLng.lat === 'function') return latLng;
        if (latLng.lat != null && latLng.lng != null) {
            return new google.maps.LatLng(latLng.lat, latLng.lng);
        }
        return null;
    }

    function distanceM(a, b) {
        if (!a || !b) return Infinity;
        if (typeof google !== 'undefined' && google.maps && google.maps.geometry && google.maps.geometry.spherical) {
            return google.maps.geometry.spherical.computeDistanceBetween(a, b);
        }
        var lat1 = typeof a.lat === 'function' ? a.lat() : a.lat;
        var lng1 = typeof a.lng === 'function' ? a.lng() : a.lng;
        var lat2 = typeof b.lat === 'function' ? b.lat() : b.lat;
        var lng2 = typeof b.lng === 'function' ? b.lng() : b.lng;
        var r = 6371000;
        var dLat = (lat2 - lat1) * Math.PI / 180;
        var dLng = (lng2 - lng1) * Math.PI / 180;
        var s = Math.sin(dLat / 2) * Math.sin(dLat / 2)
            + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180)
            * Math.sin(dLng / 2) * Math.sin(dLng / 2);
        return 2 * r * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
    }

    function mercatorBbox3857(coord, zoom) {
        var tileSize = 40075016.686 / Math.pow(2, zoom);
        var minX = -20037508.342789244 + coord.x * tileSize;
        var maxX = minX + tileSize;
        var maxY = 20037508.342789244 - coord.y * tileSize;
        var minY = maxY - tileSize;
        return [minX, minY, maxX, maxY];
    }

    function latLngToTileCoordAndPixel(latLng, zoom) {
        var lat = latLng.lat();
        var lng = latLng.lng();
        var scale = Math.pow(2, zoom);
        var sinLat = Math.sin(lat * Math.PI / 180);
        var worldX = (lng + 180) / 360 * scale;
        var worldY = (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * scale;
        var tileX = Math.floor(worldX);
        var tileY = Math.floor(worldY);
        var pixelI = Math.min(255, Math.max(0, Math.floor((worldX - tileX) * 256)));
        var pixelJ = Math.min(255, Math.max(0, Math.floor((worldY - tileY) * 256)));
        return { coord: { x: tileX, y: tileY }, i: pixelI, j: pixelJ };
    }

    function clearPickCircle() {
        if (pickCircle) {
            pickCircle.setMap(null);
            pickCircle = null;
        }
    }

    function showPickCircle(center, radiusM) {
        if (!mapInstance || typeof google === 'undefined' || !google.maps) return;
        var ll = toLatLng(center);
        if (!ll) return;
        clearPickCircle();
        pickCircle = new google.maps.Circle({
            map: mapInstance,
            center: ll,
            radius: radiusM,
            strokeColor: '#0d9488',
            strokeWeight: 2,
            strokeOpacity: 0.95,
            fillColor: '#0d9488',
            fillOpacity: 0.14,
            clickable: false,
            zIndex: 400
        });
    }

    function normalizeTreeProps(props) {
        if (!props) return {};
        return {
            baumnummer: props.baumnummer || props.BAUMNUMMER || props.poi_id || props.POI_ID || '',
            baumnamelat: props.baumnamelat || props.BAUMNAMELAT || '',
            baumnamedeu: props.baumnamedeu || props.BAUMNAMEDE || '',
            quartier: props.quartier || props.QUARTIER || '',
            strasse: props.strasse || props.STRASSE || '',
            kategorie: props.kategorie || props.KATEGORIE || '',
            status: props.status || props.STATUS || '',
            kronendurchmesser: props.kronendurchmesser != null ? props.kronendurchmesser : props.KRONENDURCHMESSER,
            pflanzjahr: props.pflanzjahr != null ? props.pflanzjahr : props.PFLANZJAHR,
            baumtyptext: props.baumtyptext || props.BAUMTYPTEXT || '',
            objectid: props.objectid != null ? props.objectid : props.OBJECTID
        };
    }

    function coordsFromFeature(feature, fallbackLl) {
        var g = feature && feature.geometry;
        var coords = g && g.coordinates;
        if (Array.isArray(coords) && coords.length >= 2 && typeof coords[0] === 'number') {
            return coords;
        }
        if (fallbackLl) {
            return [fallbackLl.lng(), fallbackLl.lat()];
        }
        return null;
    }

    function treeFromFeature(feature, center, radiusM) {
        if (!feature) return null;
        var props = normalizeTreeProps(feature.properties || feature);
        var ll = toLatLng(center);
        var coords = coordsFromFeature(feature, ll);
        if (!coords || coords.length < 2) return null;
        var pos = new google.maps.LatLng(coords[1], coords[0]);
        var d = ll ? distanceM(ll, pos) : 0;
        if (d > radiusM + 0.5) return null;
        var id = props.baumnummer || (props.objectid != null ? String(props.objectid) : '');
        if (!id) return null;
        return {
            type: 'tree',
            baumnummer: props.baumnummer || id,
            species: props.baumnamedeu || props.baumnamelat || '',
            quartier: props.quartier || '',
            street: props.strasse || '',
            lat: coords[1],
            lng: coords[0],
            props: props,
            distanceM: d
        };
    }

    function treeKey(tree) {
        if (!tree) return '';
        return tree.baumnummer || (tree.props && tree.props.objectid != null ? 'oid:' + tree.props.objectid : '');
    }

    function mergeTrees(existing, incoming) {
        var seen = {};
        var items = [];
        (existing || []).concat(incoming || []).forEach(function (tree) {
            var key = treeKey(tree);
            if (!tree || !key || seen[key]) return;
            seen[key] = true;
            items.push(tree);
        });
        items.sort(function (a, b) { return (a.distanceM || 0) - (b.distanceM || 0); });
        return items;
    }

    function metersPerPixel(lat, zoom) {
        return 156543.03392 * Math.cos(lat * Math.PI / 180) / Math.pow(2, zoom);
    }

    function fetchWmsFeatureAtPixel(tile, zoom, pixelI, pixelJ, center, radiusM) {
        if (!cfg || !cfg.wmsFeatureInfoUrl) return Promise.resolve([]);
        var bbox = mercatorBbox3857(tile.coord, zoom).join(',');
        var url = cfg.wmsFeatureInfoUrl
            + '?bbox=' + encodeURIComponent(bbox)
            + '&width=256&height=256'
            + '&i=' + pixelI
            + '&j=' + pixelJ;
        return fetch(url)
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (geo) {
                var features = geo && geo.features ? geo.features : [];
                var items = [];
                features.forEach(function (f) {
                    var tree = treeFromFeature(f, center, radiusM);
                    if (tree) items.push(tree);
                });
                return items;
            })
            .catch(function () { return []; });
    }

    function fetchJsonWithTimeout(url, timeoutMs) {
        return new Promise(function (resolve) {
            var done = false;
            var timer = setTimeout(function () {
                if (done) return;
                done = true;
                resolve(null);
            }, timeoutMs || 12000);
            fetch(url)
                .then(function (r) { return r.ok ? r.json() : null; })
                .then(function (data) {
                    if (done) return;
                    done = true;
                    clearTimeout(timer);
                    resolve(data);
                })
                .catch(function () {
                    if (done) return;
                    done = true;
                    clearTimeout(timer);
                    resolve(null);
                });
        });
    }

    function treesFromGeoJson(geo, center, radiusM) {
        var ll = toLatLng(center);
        var features = geo && geo.features ? geo.features : [];
        var items = [];
        features.forEach(function (f) {
            var tree = treeFromFeature(f, ll, radiusM);
            if (tree) items.push(tree);
        });
        return items;
    }

    function fetchTreesViaWmsSamples(center, radiusM) {
        var ll = toLatLng(center);
        if (!ll || !mapInstance || !cfg || !cfg.wmsFeatureInfoUrl) return Promise.resolve([]);
        var zoom = Math.round(mapInstance.getZoom() || 19);
        var tile = latLngToTileCoordAndPixel(ll, zoom);
        var mpp = metersPerPixel(ll.lat(), zoom);
        var pixelRadius = Math.max(1, Math.min(4, Math.ceil(radiusM / mpp)));
        var samples = [{ i: tile.i, j: tile.j }];
        for (var dx = -pixelRadius; dx <= pixelRadius; dx++) {
            for (var dy = -pixelRadius; dy <= pixelRadius; dy++) {
                if (dx === 0 && dy === 0) continue;
                if (Math.sqrt(dx * dx + dy * dy) > pixelRadius) continue;
                samples.push({
                    i: Math.min(255, Math.max(0, tile.i + dx)),
                    j: Math.min(255, Math.max(0, tile.j + dy))
                });
            }
        }
        var tasks = samples.map(function (s) {
            return fetchWmsFeatureAtPixel(tile, zoom, s.i, s.j, ll, radiusM);
        });
        return Promise.all(tasks).then(function (chunks) {
            var items = [];
            chunks.forEach(function (chunk) { items = mergeTrees(items, chunk); });
            return items;
        });
    }

    function fetchTreesNear(center, radiusM) {
        var ll = toLatLng(center);
        if (!ll) return Promise.resolve([]);
        var base = (cfg && cfg.treesNearUrl) || '/api/ogd/trees-near';
        var url = base
            + '?lat=' + encodeURIComponent(ll.lat())
            + '&lng=' + encodeURIComponent(ll.lng())
            + '&radiusM=' + encodeURIComponent(String(radiusM));
        return fetchJsonWithTimeout(url, 12000).then(function (geo) {
            var items = treesFromGeoJson(geo, ll, radiusM);
            if (items.length > 0) return items;
            return fetchTreesViaWmsSamples(ll, radiusM);
        });
    }

    function collectSrsNear(center, radiusM, ensureSr) {
        var markers = global.ZurichMapMarkers;
        var srs = markers && typeof markers.collectNear === 'function'
            ? markers.collectNear(center, radiusM)
            : [];
        if (!ensureSr || !ensureSr.srNumber) return srs;
        var id = String(ensureSr.srNumber);
        var found = srs.some(function (sr) { return String(sr.srNumber) === id; });
        if (found) return srs;
        var copy = Object.assign({}, ensureSr, { distanceM: 0 });
        srs.unshift(copy);
        return srs;
    }

    function openSr(sr) {
        if (!sr) return;
        clearPickCircle();
        var wf = global.ZurichWorkflowPanel;
        if (wf && typeof wf.openForSr === 'function') {
            wf.openForSr(sr.srNumber, 'sr');
        }
    }

    function openTree(tree) {
        if (!tree) return;
        clearPickCircle();
        var panel = global.ZurichTreePanel;
        var ll = new google.maps.LatLng(tree.lat, tree.lng);
        var props = Object.assign({}, tree.props || {});
        if (!props.baumnummer && tree.baumnummer) props.baumnummer = tree.baumnummer;
        if (!props.baumnamedeu && tree.species) props.baumnamedeu = tree.species;
        if (panel && typeof panel.open === 'function') {
            panel.open(props, ll);
        }
    }

    function unbindEsc() {
        if (escHandler) {
            document.removeEventListener('keydown', escHandler);
            escHandler = null;
        }
    }

    function closeSheet() {
        unbindEsc();
        if (sheetEl) {
            sheetEl.hidden = true;
            sheetEl.setAttribute('aria-hidden', 'true');
        }
        if (listEl) listEl.innerHTML = '';
        if (summaryEl) summaryEl.textContent = '';
    }

    function closeAll() {
        closeSheet();
        clearPickCircle();
    }

    function formatDistance(m) {
        if (m == null || !isFinite(m)) return '';
        if (m < 1) return '< 1 m';
        return Math.round(m) + ' m';
    }

    function buildSummaryText(srs, trees, radiusM) {
        var srCount = srs.length;
        var assetCount = trees.length;
        if (srCount > 0 && assetCount > 0) {
            return t('map.pick.mixed', { srs: srCount, assets: assetCount, radius: radiusM });
        }
        if (srCount > 0) {
            return t('map.pick.srsOnly', { count: srCount, radius: radiusM });
        }
        return t('map.pick.assetsOnly', { count: assetCount, radius: radiusM });
    }

    function openSheetShell() {
        if (!sheetEl) return;
        sheetEl.hidden = false;
        sheetEl.setAttribute('aria-hidden', 'false');
        unbindEsc();
        escHandler = function (ev) {
            if (ev.key === 'Escape') closeAll();
        };
        document.addEventListener('keydown', escHandler);
    }

    function showLoadingSheet(radiusM) {
        if (!sheetEl || !listEl) return;
        if (summaryEl) summaryEl.textContent = t('map.pick.searching', { radius: radiusM });
        if (hintEl) hintEl.textContent = t('map.pick.loading');
        listEl.innerHTML = '<p class="map-pick-sheet__loading" aria-live="polite">' + escapeHtml(t('map.pick.loading')) + '</p>';
        openSheetShell();
    }

    function showSheet(srs, trees, radiusM, onPick) {
        if (!sheetEl || !listEl) return;
        var html = '';
        srs.forEach(function (sr, idx) {
            var label = 'SR ' + (sr.srNumber || '');
            var lines = [];
            if (sr.phase) lines.push(sr.phase);
            if (sr.subArea) lines.push(sr.subArea);
            if (sr.status) lines.push(sr.status);
            var tree = sr.linkedTreeBaumnummer || '';
            var dist = formatDistance(sr.distanceM);
            html += '<button type="button" class="map-pick-item map-pick-item--sr" role="listitem" data-pick-kind="sr" data-pick-index="' + idx + '">';
            html += '<span class="map-pick-item__type">' + escapeHtml(t('map.pick.typeSr')) + '</span>';
            html += '<span class="map-pick-item__title">' + escapeHtml(label) + '</span>';
            if (lines.length) html += '<span class="map-pick-item__sub">' + escapeHtml(lines.join(' · ')) + '</span>';
            if (tree) html += '<span class="map-pick-item__meta">' + escapeHtml(t('map.pick.linkedTree', { tree: tree })) + '</span>';
            if (dist) html += '<span class="map-pick-item__meta">' + escapeHtml(t('map.pick.distance', { distance: dist })) + '</span>';
            html += '</button>';
        });
        trees.forEach(function (tree, idx) {
            var title = tree.baumnummer || t('map.pick.tree');
            var lines = [];
            if (tree.species) lines.push(tree.species);
            if (tree.quartier) lines.push(tree.quartier);
            if (tree.street) lines.push(tree.street);
            var dist = formatDistance(tree.distanceM);
            html += '<button type="button" class="map-pick-item map-pick-item--tree" role="listitem" data-pick-kind="tree" data-pick-index="' + idx + '">';
            html += '<span class="map-pick-item__type">' + escapeHtml(t('map.pick.typeAsset')) + '</span>';
            html += '<span class="map-pick-item__title">' + escapeHtml(title) + '</span>';
            if (lines.length) html += '<span class="map-pick-item__sub">' + escapeHtml(lines.join(' · ')) + '</span>';
            if (dist) html += '<span class="map-pick-item__meta">' + escapeHtml(t('map.pick.distance', { distance: dist })) + '</span>';
            html += '</button>';
        });
        if (summaryEl) summaryEl.textContent = buildSummaryText(srs, trees, radiusM);
        if (hintEl) hintEl.hidden = false;
        listEl.innerHTML = html;
        openSheetShell();
        listEl.querySelectorAll('.map-pick-item').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var kind = btn.getAttribute('data-pick-kind');
                var idx = parseInt(btn.getAttribute('data-pick-index'), 10);
                closeSheet();
                if (kind === 'sr' && srs[idx]) onPick('sr', srs[idx]);
                else if (kind === 'tree' && trees[idx]) onPick('tree', trees[idx]);
            });
        });
    }

    function finishPick(srs, trees, radiusM) {
        srs = srs || [];
        trees = trees || [];
        var total = srs.length + trees.length;

        if (total === 0) {
            closeSheet();
            return 'empty';
        }

        // Exactly 1 item in the 5 m circle (only SR, or only asset) → open directly, no splash.
        if (total === 1) {
            closeSheet();
            if (srs.length === 1) openSr(srs[0]);
            else openTree(trees[0]);
            return 'single';
        }

        // 2 or more (any mix) → splash with counts + horizontal cards.
        showSheet(srs, trees, radiusM, function (kind, item) {
            if (kind === 'sr') openSr(item);
            else openTree(item);
        });
        return 'found';
    }

    function resolveAt(latLng, ensureSr) {
        var ll = toLatLng(latLng);
        if (!ll) return Promise.resolve('empty');
        var radiusM = pickRadiusM();
        closeSheet();
        showPickCircle(ll, radiusM);
        var srs = collectSrsNear(ll, radiusM, ensureSr);
        return fetchTreesNear(ll, radiusM).then(function (trees) {
            return finishPick(srs, trees, radiusM);
        });
    }

    function wireUi() {
        sheetEl = document.getElementById('map-pick-sheet');
        summaryEl = document.getElementById('map-pick-sheet-summary');
        hintEl = document.getElementById('map-pick-sheet-hint');
        listEl = document.getElementById('map-pick-popup-list');
        closeBtn = document.getElementById('map-pick-popup-close');
        if (closeBtn && !closeBtn._wired) {
            closeBtn._wired = true;
            closeBtn.addEventListener('click', closeAll);
        }
        if (sheetEl && !sheetEl._wired) {
            sheetEl._wired = true;
            sheetEl.addEventListener('mousedown', function (ev) { ev.stopPropagation(); });
            sheetEl.addEventListener('click', function (ev) { ev.stopPropagation(); });
            var backdrop = sheetEl.querySelector('[data-map-pick-dismiss]');
            if (backdrop) backdrop.addEventListener('click', closeAll);
        }
    }

    function init(map, config) {
        cfg = config || global.ZURICH_MAP || {};
        mapInstance = map;
        wireUi();
        if (map && !map._mapPickDragClose) {
            map._mapPickDragClose = true;
            map.addListener('dragstart', closeAll);
            map.addListener('zoom_changed', closeAll);
        }
    }

    global.ZurichMapClickPick = {
        init: init,
        resolveAt: resolveAt,
        close: closeAll,
        clearCircle: clearPickCircle,
        pickRadiusM: pickRadiusM
    };
}(window));
