(function (global) {
    'use strict';

    var cfg = null;
    var geocoder = null;
    var locationMarker = null;
    var treeMarker = null;
    var autocomplete = null;

    var BAUMNUMMER_RE = /^[\w\-.]{1,32}$/;

    function byId(id) { return document.getElementById(id); }

    function t(key, vars) {
        var i18n = global.ZurichI18n;
        if (i18n && typeof i18n.t === 'function') return i18n.t(key, vars);
        return key;
    }

    function setHint(id, text, isError) {
        var el = byId(id);
        if (!el) return;
        el.textContent = text || '';
        el.className = 'filter-hint' + (isError ? ' filter-hint--error' : '');
    }

    function buildMarkersUrl(filters) {
        var base = (cfg && cfg.mapMarkersUrl) || '/api/map/markers';
        var params = new URLSearchParams();
        Object.keys(filters || {}).forEach(function (key) {
            var val = filters[key];
            if (val) params.set(key, val);
        });
        var qs = params.toString();
        return qs ? base + '?' + qs : base;
    }

    function isoDateLocal(d) {
        var y = d.getFullYear();
        var m = String(d.getMonth() + 1).padStart(2, '0');
        var day = String(d.getDate()).padStart(2, '0');
        return y + '-' + m + '-' + day;
    }

    function readCreatedRange() {
        var el = byId('filter-created-preset');
        var value = el ? el.value : '';
        if (!value) return { createdFrom: '', createdTo: '' };

        var parts = value.split('-');
        if (parts.length !== 2) return { createdFrom: '', createdTo: '' };

        var mode = parts[0];
        var days = parseInt(parts[1], 10);
        if (!days || (mode !== 'last' && mode !== 'older')) return { createdFrom: '', createdTo: '' };

        var today = new Date();
        today.setHours(0, 0, 0, 0);
        var cutoff = new Date(today);
        cutoff.setDate(cutoff.getDate() - days);

        if (mode === 'last') {
            return { createdFrom: isoDateLocal(cutoff), createdTo: isoDateLocal(today) };
        }

        var before = new Date(cutoff);
        before.setDate(before.getDate() - 1);
        return { createdFrom: '', createdTo: isoDateLocal(before) };
    }

    function clearCreatedRange() {
        var el = byId('filter-created-preset');
        if (el) el.value = '';
    }

    function readFilters() {
        var dates = readCreatedRange();
        return {
            status: (byId('filter-status') && byId('filter-status').value) || '',
            phase: (byId('filter-phase') && byId('filter-phase').value) || '',
            subArea: (byId('filter-subarea') && byId('filter-subarea').value) || '',
            priority: (byId('filter-priority') && byId('filter-priority').value) || '',
            createdFrom: dates.createdFrom,
            createdTo: dates.createdTo
        };
    }

    function showMarkerCount(count, hintId) {
        var id = hintId || 'filter-result-count';
        var n = typeof count === 'number' ? count : 0;
        setHint(id, t('filter.markersShown', { count: n }));
    }

    function loadAllSrs() {
        var scopeEl = byId('filter-sr-load-scope');
        var includeClosed = scopeEl && scopeEl.value === 'all';
        var filters = { status: includeClosed ? '' : 'In Progress' };
        var url = buildMarkersUrl(filters);
        var markers = global.ZurichMapMarkers;
        if (!markers || typeof markers.refresh !== 'function') return Promise.resolve();

        setHint('filter-load-all-msg', t('filter.loadingMarkers'));
        setHint('filter-result-count', '');
        return markers.refresh(url).then(function (count) {
            showMarkerCount(count, 'filter-load-all-msg');
        });
    }

    function applyMarkerFilters() {
        var filters = readFilters();
        var url = buildMarkersUrl(filters);
        var markers = global.ZurichMapMarkers;
        if (!markers || typeof markers.refresh !== 'function') return Promise.resolve();

        setHint('filter-result-count', t('filter.loadingMarkers'));
        setHint('filter-load-all-msg', '');
        return markers.refresh(url).then(function (count) {
            showMarkerCount(count, 'filter-result-count');
        });
    }

    function clearSrMarkers() {
        var markers = global.ZurichMapMarkers;
        if (markers && typeof markers.clear === 'function') {
            markers.clear();
        } else if (markers && typeof markers.refresh === 'function') {
            markers.refresh(null);
        }
    }

    function resetFilters() {
        ['filter-status', 'filter-phase', 'filter-subarea', 'filter-priority', 'filter-location', 'filter-baumnummer', 'filter-created-preset']
            .forEach(function (id) {
                var el = byId(id);
                if (el) el.value = '';
            });
        clearCreatedRange();
        var scopeEl = byId('filter-sr-load-scope');
        if (scopeEl) scopeEl.value = 'open';
        setHint('filter-location-msg', '');
        setHint('filter-baumnummer-msg', '');
        setHint('filter-result-count', t('filter.markersCleared'));
        setHint('filter-load-all-msg', '');
        clearTreeMarker();
        clearSrMarkers();
        return Promise.resolve();
    }

    function ensureGeocoder() {
        if (geocoder || typeof google === 'undefined' || !google.maps) return geocoder;
        geocoder = new google.maps.Geocoder();
        return geocoder;
    }

    function clearTreeMarker() {
        if (treeMarker) {
            treeMarker.setMap(null);
            treeMarker = null;
        }
    }

    function clearLocationMarker() {
        if (locationMarker) {
            locationMarker.setMap(null);
            locationMarker = null;
        }
    }

    function treeMarkerIcon() {
        return {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 11,
            fillColor: '#0d9488',
            fillOpacity: 1,
            strokeColor: '#ffffff',
            strokeWeight: 2
        };
    }

    function panToLatLng(loc, label, isTree) {
        var api = global.ZurichMapApi;
        if (!api || typeof api.getMap !== 'function') {
            setHint(isTree ? 'filter-baumnummer-msg' : 'filter-location-msg', 'Map is not ready yet.', true);
            return;
        }

        var map = api.getMap();
        var minZoom = (cfg && cfg.minTreeLayerZoom) || 13;
        map.panTo(loc);
        map.setZoom(Math.max(map.getZoom(), minZoom));

        if (isTree) {
            clearLocationMarker();
            clearTreeMarker();
            treeMarker = new google.maps.Marker({
                map: map,
                position: loc,
                title: label || '',
                zIndex: 1000,
                icon: treeMarkerIcon(),
                animation: google.maps.Animation.DROP
            });
        } else {
            clearLocationMarker();
            locationMarker = new google.maps.Marker({
                map: map,
                position: loc,
                title: label || '',
                zIndex: 999
            });
        }
    }

    function goToLocation() {
        var input = byId('filter-location');
        var query = input ? input.value.trim() : '';
        if (!query) {
            setHint('filter-location-msg', 'Enter an address or place name.', true);
            return;
        }

        var gc = ensureGeocoder();
        if (!gc) {
            setHint('filter-location-msg', 'Geocoder unavailable.', true);
            return;
        }

        setHint('filter-location-msg', 'Searching…');
        gc.geocode({ address: query + ', Zürich, Switzerland' }, function (results, status) {
            if (status !== 'OK' || !results || !results[0]) {
                setHint('filter-location-msg', 'Location not found. Try a street or place in Zürich.', true);
                return;
            }
            panToLatLng(results[0].geometry.location, results[0].formatted_address, false);
            setHint('filter-location-msg', results[0].formatted_address);
        });
    }

    function coordsFromFeature(feature) {
        if (!feature || !feature.geometry || !feature.geometry.coordinates) return null;
        var c = feature.geometry.coordinates;
        if (feature.geometry.type === 'Point' && c.length >= 2) {
            return { lat: c[1], lng: c[0] };
        }
        return null;
    }

    function searchBaumnummer() {
        var input = byId('filter-baumnummer');
        var id = input ? input.value.trim() : '';
        if (!id) {
            setHint('filter-baumnummer-msg', t('filter.treeInvalid'), true);
            return;
        }
        if (!BAUMNUMMER_RE.test(id)) {
            setHint('filter-baumnummer-msg', t('filter.treeInvalid'), true);
            return;
        }

        var url = (cfg && cfg.treeSearchUrl) || '/api/ogd/tree-by-baumnummer';
        setHint('filter-baumnummer-msg', t('filter.treeSearching'));

        fetch(url + '?baumnummer=' + encodeURIComponent(id))
            .then(function (r) {
                if (r.status === 400) throw new Error('invalid');
                return r.json();
            })
            .then(function (geo) {
                var feature = geo && geo.features && geo.features.length ? geo.features[0] : null;
                if (!feature) {
                    setHint('filter-baumnummer-msg', t('filter.treeNotFound', { baumnummer: id }), true);
                    clearTreeMarker();
                    return;
                }

                var props = feature.properties || {};
                var coords = coordsFromFeature(feature);
                if (!coords) {
                    setHint('filter-baumnummer-msg', t('filter.treeNotFound', { baumnummer: id }), true);
                    return;
                }

                var latLng = new google.maps.LatLng(coords.lat, coords.lng);
                var species = props.baumnamedeu || props.baumnamelat || '';
                var label = props.baumnummer || id;

                panToLatLng(latLng, label + (species ? ' — ' + species : ''), true);
                setHint('filter-baumnummer-msg', t('filter.treeFound', { baumnummer: label, species: species || '—' }));

                var treePanel = global.ZurichTreePanel;
                if (treePanel && typeof treePanel.open === 'function') {
                    treePanel.open(props, latLng);
                }
            })
            .catch(function (err) {
                if (err && err.message === 'invalid') {
                    setHint('filter-baumnummer-msg', t('filter.treeInvalid'), true);
                } else {
                    setHint('filter-baumnummer-msg', t('filter.treeNotFound', { baumnummer: id }), true);
                }
            });
    }

    function initAutocomplete(map) {
        var input = byId('filter-location');
        if (!input || autocomplete) return;
        if (typeof google === 'undefined' || !google.maps || !google.maps.places) return;

        var bounds = new google.maps.LatLngBounds(
            { lat: 47.330, lng: 8.448 },
            { lat: 47.435, lng: 8.625 }
        );

        autocomplete = new google.maps.places.Autocomplete(input, {
            bounds: bounds,
            strictBounds: false,
            componentRestrictions: { country: 'ch' },
            fields: ['geometry', 'formatted_address', 'name'],
            types: ['geocode', 'establishment']
        });

        autocomplete.addListener('place_changed', function () {
            var place = autocomplete.getPlace();
            if (!place || !place.geometry || !place.geometry.location) {
                setHint('filter-location-msg', 'Select a suggestion from the list.', true);
                return;
            }
            var label = place.formatted_address || place.name || '';
            panToLatLng(place.geometry.location, label, false);
            setHint('filter-location-msg', label);
        });
    }

    function onSubmit(ev) {
        ev.preventDefault();
        applyMarkerFilters();
    }

    function init(config) {
        cfg = config || global.ZURICH_MAP || {};
        var form = byId('filter-form');
        var resetBtn = byId('filter-reset');
        var loadAllBtn = byId('filter-load-all-srs');
        var goBtn = byId('filter-location-go');
        var treeGoBtn = byId('filter-baumnummer-go');
        var locationInput = byId('filter-location');
        var baumInput = byId('filter-baumnummer');

        if (form) form.addEventListener('submit', onSubmit);
        if (resetBtn) resetBtn.addEventListener('click', resetFilters);
        if (loadAllBtn) loadAllBtn.addEventListener('click', loadAllSrs);
        if (goBtn) goBtn.addEventListener('click', goToLocation);
        if (treeGoBtn) treeGoBtn.addEventListener('click', searchBaumnummer);
        if (locationInput) {
            locationInput.addEventListener('keydown', function (ev) {
                if (ev.key === 'Enter') {
                    ev.preventDefault();
                    goToLocation();
                }
            });
        }
        if (baumInput) {
            baumInput.addEventListener('keydown', function (ev) {
                if (ev.key === 'Enter') {
                    ev.preventDefault();
                    searchBaumnummer();
                }
            });
        }
    }

    global.ZurichFilterPanel = {
        init: init,
        initAutocomplete: initAutocomplete,
        apply: applyMarkerFilters,
        loadAllSrs: loadAllSrs,
        buildMarkersUrl: buildMarkersUrl,
        readFilters: readFilters,
        searchBaumnummer: searchBaumnummer
    };
}(window));
