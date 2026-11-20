(function () {
    'use strict';

    var cfg = window.ZURICH_MAP;
    if (!cfg) return;

    var TREE_LAYER_MIN_ZOOM = cfg.minTreeLayerZoom || cfg.minTreeZoom || 13;
    var TREE_CLICK_MIN_ZOOM = cfg.minTreeClickZoom || 19;
    var statusEl = document.getElementById('map-status');
    var infoWindow = null;
    var mapInstance = null;
    var suppressInteractionUntil = 0;
    var lastLookupTs = 0;
    var lastLookupKey = '';
    var lastOutOfBoundsTs = 0;
    var lastOutOfBoundsKey = '';

    var DRAG_SUPPRESS_MS = 400;

    function cityBoundary() {
        return window.ZurichCityBoundary || null;
    }

    function setStatus(message) {
        if (statusEl && message) statusEl.textContent = message;
    }

    function i18n(key, vars) {
        var i18nApi = window.ZurichI18n;
        if (i18nApi && typeof i18nApi.t === 'function') return i18nApi.t(key, vars);
        return key;
    }

    function suppressInteraction(ms) {
        suppressInteractionUntil = Date.now() + (ms || DRAG_SUPPRESS_MS);
    }

    function isInteractionSuppressed() {
        return Date.now() < suppressInteractionUntil;
    }

    function shouldAllowMapControlClick(domEv) {
        return shouldIgnorePointerEvent(domEv);
    }

    function suppressGooglePoiClick(domEv) {
        if (!domEv) return;
        if (shouldIgnorePointerEvent(domEv)) return;
        if (!isGooglePoiDomTarget(domEv.target)) return;
        domEv.stopPropagation();
        domEv.preventDefault();
    }

    function isGooglePoiDomTarget(target) {
        if (!target || typeof target.closest !== 'function') return false;
        if (target.closest('.gm-style-iw')) return true;
        if (target.closest('.gm-style-iw-chr')) return true;
        if (target.closest('a[href*="maps.google.com"]')) return true;
        if (target.closest('[data-poi]')) return true;
        return false;
    }

    function wireGooglePoiSuppression(map) {
        var mapDiv = map.getDiv();
        if (!mapDiv || mapDiv._googlePoiSuppressed) return;
        mapDiv._googlePoiSuppressed = true;

        mapDiv.addEventListener('click', suppressGooglePoiClick, true);
    }

    function shouldIgnorePointerEvent(domEv) {
        if (!domEv || !domEv.target || typeof domEv.target.closest !== 'function') return false;
        var el = domEv.target;
        if (el.closest('#map-status')) return true;
        if (el.closest('#sr-create-panel')) return true;
        if (el.closest('#workflow-panel')) return true;
        if (el.closest('#tree-detail-panel')) return true;
        if (el.closest('.side-panel')) return true;
        if (el.closest('.app-rail')) return true;
        if (el.closest('.filter-drawer')) return true;
        if (el.closest('.app-header')) return true;
        if (el.closest('.sr-map-pin')) return true;
        if (el.closest('.map-pick-sheet')) return true;
        if (el.closest('.gm-style-iw')) return true;
        if (el.closest('.gm-style-iw-chr')) return true;
        if (el.closest('button.gm-ui-hover-effect')) return true;
        if (el.closest('[aria-label="Close"]')) return true;
        if (el.closest('.gm-control-active')) return true;
        if (el.closest('.gm-fullscreen-control')) return true;
        if (el.closest('.gm-svpc')) return true;
        if (el.closest('.gmnoprint')) return true;
        if (el.closest('.gm-bundled-control')) return true;
        return false;
    }

    function escapeHtml(value) {
        if (value == null || value === '') return '';
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
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

    function buildTreePopupHtml(props) {
        props = props || {};
        var title = props.baumnamedeu || props.baumnummer || 'Street tree';
        var rows = [
            ['Baumnummer', props.baumnummer],
            ['Species (Latin)', props.baumnamelat],
            ['Species (German)', props.baumnamedeu],
            ['Quarter', props.quartier],
            ['Street', props.strasse],
            ['Category', props.kategorie],
            ['Status', props.status],
            ['Crown diameter', props.kronendurchmesser != null ? props.kronendurchmesser + ' m' : ''],
            ['Planted', props.pflanzjahr],
            ['Size class', props.baumtyptext]
        ];

        var html = '<div class="tree-popup">';
        html += '<span class="tree-popup-badge">OGD Baumkataster</span>';
        html += '<h3 class="tree-popup-title">' + escapeHtml(title) + '</h3>';
        html += '<dl class="tree-popup-grid">';
        rows.forEach(function (row) {
            if (!row[1]) return;
            html += '<dt>' + escapeHtml(row[0]) + '</dt>';
            html += '<dd>' + escapeHtml(row[1]) + '</dd>';
        });
        html += '</dl>';
        html += '<p class="tree-popup-note">Official Stadt Zürich tree registry (read-only).</p>';
        html += '</div>';
        return html;
    }

    function fetchTreeAtLatLng(latLng, zoom) {
        var tile = latLngToTileCoordAndPixel(latLng, zoom);
        var bbox = mercatorBbox3857(tile.coord, zoom).join(',');
        var url = cfg.wmsFeatureInfoUrl
            + '?bbox=' + encodeURIComponent(bbox)
            + '&width=256&height=256'
            + '&i=' + tile.i
            + '&j=' + tile.j;
        return fetch(url)
            .then(function (r) { return r.ok ? r.json() : null; })
            .catch(function () { return null; });
    }

    function ensureInfoWindow(map) {
        if (!infoWindow) {
            infoWindow = new google.maps.InfoWindow({ maxWidth: 320 });
            infoWindow.addListener('closeclick', function () {
                suppressInteraction();
            });
        }
        return infoWindow;
    }

    function wireInfoWindowCloseButtons(mapDiv) {
        if (!mapDiv || mapDiv._infoCloseWired) return;
        mapDiv._infoCloseWired = true;
        mapDiv.addEventListener('mousedown', function (ev) {
            if (shouldIgnorePointerEvent(ev) && ev.target.closest('button, [aria-label="Close"]')) {
                suppressInteraction();
            }
        }, true);
    }

    function openTreeInfo(map, latLng, props) {
        suppressInteraction(700);
        var treePanel = window.ZurichTreePanel;
        if (treePanel && typeof treePanel.open === 'function') {
            treePanel.open(props, latLng);
            return;
        }
        var iw = ensureInfoWindow(map);
        iw.setContent(buildTreePopupHtml(props));
        iw.setPosition(latLng);
        iw.open(map);
    }

    function openNoTreeInfo(map, latLng) {
        suppressInteraction(700);
        var treePanel = window.ZurichTreePanel;
        if (treePanel && typeof treePanel.close === 'function') treePanel.close();
        var iw = ensureInfoWindow(map);
        iw.setContent(
            '<div class="tree-popup tree-popup--empty">'
            + '<span class="tree-popup-badge">OGD Baumkataster</span>'
            + '<p class="tree-popup-note">No tree at this location. Try clicking directly on a tree symbol.</p>'
            + '</div>'
        );
        iw.setPosition(latLng);
        iw.open(map);
    }

    function openOutOfBoundsInfo(map, latLng) {
        var boundary = cityBoundary();
        if (boundary && boundary.containsLocation(latLng)) return;

        var key = latLng.lat().toFixed(6) + ',' + latLng.lng().toFixed(6);
        var now = Date.now();
        if (now - lastOutOfBoundsTs < 1200 && key === lastOutOfBoundsKey) return;
        lastOutOfBoundsTs = now;
        lastOutOfBoundsKey = key;

        suppressInteraction(700);
        var iw = ensureInfoWindow(map);
        iw.setContent(
            '<div class="tree-popup tree-popup--boundary">'
            + '<span class="tree-popup-badge tree-popup-badge--warn">Outside city limits</span>'
            + '<h3 class="tree-popup-title">Outside the City of Zürich</h3>'
            + '<p class="tree-popup-note">This location is outside the official Stadt Zürich municipal boundary. Pan back inside the highlighted border to browse trees.</p>'
            + '</div>'
        );
        iw.setPosition(latLng);
        iw.open(map);
        setStatus('Outside Stadt Zürich — pan inside the city border to use the tree map.');
    }

    function isInsideCity(latLng) {
        var boundary = cityBoundary();
        if (!boundary || !boundary.isReady()) return true;
        return boundary.containsLocation(latLng);
    }

    function srForm() {
        return window.ZurichSrForm || null;
    }

    function treePropsToContext(latLng, props) {
        props = props || {};
        return {
            lat: latLng.lat(),
            lng: latLng.lng(),
            baumnummer: props.baumnummer || '',
            baumnamelat: props.baumnamelat || '',
            baumnamedeu: props.baumnamedeu || '',
            quartier: props.quartier || '',
            strasse: props.strasse || '',
            objectid: props.objectid,
            pflanzjahr: props.pflanzjahr,
            kategorie: props.kategorie,
            status: props.status
        };
    }

    function openNoTreeForSr(map, latLng) {
        suppressInteraction(700);
        var iw = ensureInfoWindow(map);
        iw.setContent(
            '<div class="tree-popup tree-popup--empty">'
            + '<span class="tree-popup-badge tree-popup-badge--warn">Create SR</span>'
            + '<p class="tree-popup-note">No asset or tree at this location. Right-click directly on a Baumkataster tree symbol.</p>'
            + '</div>'
        );
        iw.setPosition(latLng);
        iw.open(map);
        setStatus('No tree at that point — right-click directly on a tree symbol to create an SR.');
    }

    function handleSrCreateRightClick(map, latLng) {
        if (isInteractionSuppressed()) return;
        if (!handleMapLocationAction(map, latLng)) return;

        var zoom = Math.round(map.getZoom());
        if (zoom < TREE_CLICK_MIN_ZOOM) {
            setStatus(i18n('map.status.zoomSr', { zoom: TREE_CLICK_MIN_ZOOM }));
            return;
        }

        var form = srForm();
        if (!form) return;

        setStatus(i18n('map.status.lookingUp'));
        fetchTreeAtLatLng(latLng, zoom).then(function (geo) {
            var feature = geo && geo.features && geo.features.length ? geo.features[0] : null;
            var props = feature && feature.properties ? feature.properties : null;
            if (!props || !props.baumnummer) {
                openNoTreeForSr(map, latLng);
                return;
            }
            form.open(treePropsToContext(latLng, props));
            setStatus(i18n('map.status.srLinked', { tree: props.baumnummer }));
        });
    }

    function handleMapLocationAction(map, latLng) {
        if (isInsideCity(latLng)) return true;
        openOutOfBoundsInfo(map, latLng);
        return false;
    }

    function attachBaumkatasterLayer(map) {
        if (map._baumkatasterLayer) return map._baumkatasterLayer;

        var layer = new google.maps.ImageMapType({
            getTileUrl: function (coord, zoom) {
                var z = Math.round(zoom);
                if (z < TREE_LAYER_MIN_ZOOM) return '';
                var bbox = mercatorBbox3857(coord, z).join(',');
                return cfg.wmsTileUrl
                    + '?bbox=' + encodeURIComponent(bbox)
                    + '&width=256&height=256';
            },
            tileSize: new google.maps.Size(256, 256),
            name: 'Baumkataster',
            opacity: 1,
            maxZoom: 22
        });

        if (!map.overlayMapTypes) map.overlayMapTypes = [];
        map.overlayMapTypes.push(layer);
        map._baumkatasterLayer = layer;

        map.addListener('zoom_changed', function () {
            google.maps.event.trigger(map, 'resize');
        });

        return layer;
    }

    function handleTreeLookup(map, latLng, domEv) {
        if (isInteractionSuppressed()) return;
        if (!handleMapLocationAction(map, latLng)) return;

        var key = latLng.lat().toFixed(6) + ',' + latLng.lng().toFixed(6);
        var now = Date.now();
        if (now - lastLookupTs < 400 && key === lastLookupKey) return;
        lastLookupTs = now;
        lastLookupKey = key;

        var zoom = Math.round(map.getZoom());
        if (zoom < TREE_CLICK_MIN_ZOOM) {
            setStatus(i18n('map.status.zoomClickTree', { zoom: TREE_CLICK_MIN_ZOOM }));
            return;
        }

        var pick = window.ZurichMapClickPick;
        if (pick && typeof pick.resolveAt === 'function') {
            pick.resolveAt(latLng).then(function (result) {
                suppressInteraction(700);
                if (result === 'single' || result === 'found') {
                    setStatus(i18n('map.status.ready'));
                } else if (result === 'empty') {
                    setStatus(i18n('map.status.noneInRadius', { radius: pick.pickRadiusM() }));
                }
            });
            return;
        }
        runSingleTreeLookup(map, latLng);
    }

    function runSingleTreeLookup(map, latLng) {
        setStatus(i18n('map.status.lookingUp'));
        var treePanel = window.ZurichTreePanel;
        if (treePanel && typeof treePanel.open === 'function') {
            treePanel.open({ baumnamedeu: 'Looking up…' }, latLng);
        } else {
            var iw = ensureInfoWindow(map);
            iw.setContent(
                '<div class="tree-popup tree-popup--loading">'
                + '<span class="tree-popup-badge">OGD Baumkataster</span>'
                + '<p class="tree-popup-note">Looking up tree…</p>'
                + '</div>'
            );
            iw.setPosition(latLng);
            iw.open(map);
        }
        suppressInteraction(700);

        var zoom = map.getZoom();
        fetchTreeAtLatLng(latLng, zoom).then(function (geo) {
            var feature = geo && geo.features && geo.features.length ? geo.features[0] : null;
            if (feature && feature.properties) {
                openTreeInfo(map, latLng, feature.properties);
                setStatus(i18n('map.status.ready'));
            } else {
                openNoTreeInfo(map, latLng);
                setStatus(i18n('map.status.noTree'));
            }
        });
    }

    function latLngFromDomEvent(mapDiv, projectionOverlay, domEv) {
        var proj = projectionOverlay.getProjection();
        if (!proj) return null;
        var rect = mapDiv.getBoundingClientRect();
        var px = new google.maps.Point(
            domEv.clientX - rect.left,
            domEv.clientY - rect.top
        );
        return proj.fromContainerPixelToLatLng(px);
    }

    function wireMapInteraction(map) {
        var mapDiv = map.getDiv();
        wireInfoWindowCloseButtons(mapDiv);

        if (!mapDiv || mapDiv._mapInteractionWired) return;
        mapDiv._mapInteractionWired = true;

        var projectionOverlay = new google.maps.OverlayView();
        projectionOverlay.onAdd = function () { };
        projectionOverlay.draw = function () { };
        projectionOverlay.onRemove = function () { };
        projectionOverlay.setMap(map);

        map.addListener('dragstart', function () {
            suppressInteraction(DRAG_SUPPRESS_MS);
        });

        map.addListener('dragend', function () {
            suppressInteraction(DRAG_SUPPRESS_MS);
        });

        // Left-click map lookup — Google Maps click only (avoid duplicate DOM + Maps handlers).
        map.addListener('click', function (ev) {
            if (isInteractionSuppressed()) return;
            if (!ev || !ev.latLng) return;
            handleTreeLookup(map, ev.latLng, ev.domEvent || null);
        });

        mapDiv.addEventListener('click', function (domEv) {
            if (shouldIgnorePointerEvent(domEv)) return;
            if (window._zurichMarkerClickTs && Date.now() - window._zurichMarkerClickTs < 500) return;
        }, false);

        mapDiv.addEventListener('contextmenu', function (ev) {
            if (shouldIgnorePointerEvent(ev)) return;
            ev.preventDefault();
            suppressGooglePoiClick(ev);

            var ll = latLngFromDomEvent(mapDiv, projectionOverlay, ev);
            if (!ll) return;
            handleSrCreateRightClick(map, ll);
        }, true);
    }

    function loadCityBoundary(map) {
        var boundaryUrl = cfg.cityBoundaryUrl;
        var boundary = cityBoundary();
        if (!boundaryUrl || !boundary) return;

        boundary.load(boundaryUrl, {
            referenceLat: cfg.centerLat,
            referenceLng: cfg.centerLng,
            maskBufferFeet: cfg.maskBufferFeet
        }).then(function () {
            boundary.drawOnMap(map, { maskBufferFeet: cfg.maskBufferFeet });
        }).catch(function (err) {
            console.warn('City boundary could not be loaded:', err);
            setStatus('City boundary unavailable — tree map is still usable.');
        });
    }

    function openSrFromQuery(map, config) {
        var params = new URLSearchParams(window.location.search);
        var raw = params.get('openSr') || params.get('sr');
        if (!raw) return;

        var srNumber = parseInt(raw, 10);
        if (!srNumber) return;

        var url = (config.srGetUrl || '/api/sr/{srNumber}').replace('{srNumber}', String(srNumber));
        fetch(url)
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (detail) {
                if (!detail || detail.lat == null || detail.lng == null) return;

                var targetZoom = config.minSrZoom || config.minTreeClickZoom || 19;
                map.panTo({ lat: detail.lat, lng: detail.lng });
                map.setZoom(Math.max(map.getZoom() || targetZoom, targetZoom));

                var markers = window.ZurichMapMarkers;
                if (markers && typeof markers.refresh === 'function') {
                    var fp = window.ZurichFilterPanel;
                    if (fp && typeof fp.readFilters === 'function' && typeof fp.buildMarkersUrl === 'function') {
                        markers.refresh(fp.buildMarkersUrl(fp.readFilters()));
                    } else {
                        markers.refresh(config.mapMarkersUrl);
                    }
                }

                var workflow = window.ZurichWorkflowPanel;
                if (workflow && typeof workflow.openForSr === 'function') {
                    workflow.openForSr(srNumber, 'sr');
                }
            })
            .catch(function () { /* ignore deep-link errors */ });
    }

    window.initZurichMap = function () {
        var mapEl = document.getElementById('map');
        if (!mapEl || typeof google === 'undefined') return;

        var map = new google.maps.Map(mapEl, {
            center: { lat: cfg.centerLat, lng: cfg.centerLng },
            zoom: cfg.initialZoom,
            minZoom: 10,
            mapTypeId: 'roadmap',
            mapTypeControl: false,
            streetViewControl: true,
            fullscreenControl: true,
            zoomControl: true,
            scaleControl: true,
            clickableIcons: false
        });
        mapInstance = map;

        function updateZoomBadge() {
            var el = document.getElementById('header-zoom-value');
            if (!el || !map) return;
            el.textContent = String(Math.round(map.getZoom()));
        }

        function updateStatus() {
            updateZoomBadge();
            var z = Math.round(map.getZoom());
            if (z < TREE_LAYER_MIN_ZOOM) {
                setStatus(i18n('map.status.zoomSee', { zoom: TREE_LAYER_MIN_ZOOM }));
            } else if (z < TREE_CLICK_MIN_ZOOM) {
                setStatus(i18n('map.status.zoomClick', { zoom: TREE_CLICK_MIN_ZOOM }));
            } else {
                setStatus(i18n('map.status.ready'));
            }
        }

        window.ZurichMapApi = {
            getMap: function () { return mapInstance; },
            setMapType: function (type) {
                if (mapInstance && type) mapInstance.setMapTypeId(type);
            },
            getZoom: function () { return mapInstance ? mapInstance.getZoom() : null; },
            minClickZoom: function () { return TREE_CLICK_MIN_ZOOM; },
            /** Centre on a point (or the current centre) at a given zoom. */
            focus: function (lat, lng, zoom) {
                if (!mapInstance) return;
                if (lat != null && lng != null) mapInstance.panTo({ lat: lat, lng: lng });
                if (zoom != null) mapInstance.setZoom(zoom);
            },
            panTo: function (latLng) {
                if (!mapInstance || !latLng) return;
                if (typeof latLng.lat === 'function') mapInstance.panTo(latLng);
                else mapInstance.panTo({ lat: latLng.lat, lng: latLng.lng });
            },
            resize: function () {
                if (mapInstance && google && google.maps) google.maps.event.trigger(mapInstance, 'resize');
            },
            refreshStatus: updateStatus
        };

        attachBaumkatasterLayer(map);
        wireGooglePoiSuppression(map);
        wireMapInteraction(map);
        loadCityBoundary(map);

        google.maps.event.addListenerOnce(map, 'idle', function () {
            google.maps.event.trigger(map, 'resize');
        });

        var form = srForm();
        if (form && typeof form.init === 'function') {
            form.init(cfg);
        }

        var workflow = window.ZurichWorkflowPanel;
        if (workflow && typeof workflow.init === 'function') {
            workflow.init(cfg);
        }

        var markers = window.ZurichMapMarkers;
        if (markers && typeof markers.init === 'function') {
            markers.init(map, cfg);
        }

        var mapPick = window.ZurichMapClickPick;
        if (mapPick && typeof mapPick.init === 'function') {
            mapPick.init(map, cfg);
        }

        var filterPanel = window.ZurichFilterPanel;
        if (filterPanel && typeof filterPanel.init === 'function') {
            filterPanel.init(cfg);
        }
        if (filterPanel && typeof filterPanel.initAutocomplete === 'function') {
            filterPanel.initAutocomplete(map);
        }

        openSrFromQuery(map, cfg);

        var treePanel = window.ZurichTreePanel;
        if (treePanel && typeof treePanel.init === 'function') {
            treePanel.init();
        }

        map.addListener('zoom_changed', updateStatus);
        updateStatus();
        window.addEventListener('zurich:locale', updateStatus);
    };
})();
