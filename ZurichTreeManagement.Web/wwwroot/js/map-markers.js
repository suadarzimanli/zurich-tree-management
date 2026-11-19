(function (global) {
    'use strict';

    var map = null;
    var pinsBySr = {};
    var cfg = null;
    var SrPinOverlay = null;
    var pinCache = {};
    var projectionOverlay = null;

    var PIN_W = 48;
    var PIN_H = 60;
    var PIN_ANCHOR_X = PIN_W / 2;
    var PIN_ANCHOR_Y = PIN_H;

    var PHASE_STYLE = {
        sr: { fill: '#f97316', stroke: '#9a3412', inner: '#fff7ed', glyph: '#9a3412' },
        inspection: { fill: '#eab308', stroke: '#a16207', inner: '#fefce8', glyph: '#a16207' },
        workorder: { fill: '#2563eb', stroke: '#1e3a8a', inner: '#eff6ff', glyph: '#1e3a8a' },
        closed: { fill: '#64748b', stroke: '#334155', inner: '#f1f5f9', glyph: '#475569' }
    };

    var SUBAREA_TO_GLYPH = {
        'Pruning Requests': 'pruning',
        'Tree Planting Requests': 'planting',
        'Stump Removal Requests': 'stump',
        'General Information': 'info',
        'Other': 'other'
    };

    var GLYPHS = {
        pruning: '<path d="M4 20 L8.5 6.5 L10.5 9.5 L13.5 4 L18.5 8.5 L14 11.5 L17.5 20 Z" fill="currentColor"/><path d="M6.5 14.5 L11 11" stroke="currentColor" stroke-width="1.2" fill="none" stroke-linecap="round"/>',
        planting: '<path d="M12 21 V13.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M12 13.5 C8 13.5 5.5 9.5 6 6.5 C9.5 6.5 11.5 10 12 13.5 C12 13.5 12 13.5 12 13.5 C12 13.5 14.5 10 18 6.5 C18.5 9.5 16 13.5 12 13.5 Z" fill="currentColor"/>',
        stump: '<ellipse cx="12" cy="10" rx="6" ry="2.2" fill="currentColor"/><path d="M7.5 10 V16 H16.5 V10" fill="currentColor"/><path d="M9.5 10 V7.5 M14.5 10 V7.5" stroke="#fff" stroke-width="1.2" stroke-linecap="round" opacity="0.7"/>',
        info: '<circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="2"/><rect x="11" y="10.5" width="2" height="7" rx="1" fill="currentColor"/><circle cx="12" cy="7.5" r="1.3" fill="currentColor"/>',
        other: '<path d="M12 21 V14.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M12 14.5 C8.5 14.5 6 11 6.5 8 C9.5 8 11.5 11.5 12 14.5 C12 14.5 12 14.5 12 14.5 C12 14.5 14.5 11.5 17.5 8 C18 11 15.5 14.5 12 14.5 Z" fill="currentColor"/>'
    };

    var PIN_PATH = 'M16 1C9.4 1 4 6.2 4 12.6c0 8.2 12 26.4 12 26.4S28 20.8 28 12.6C28 6.2 22.6 1 16 1z';
    var PIN_CENTER_X = 16;
    var PIN_INNER_CY = 12.5;
    var PIN_INNER_R = 8;
    var GLYPH_SCALE = 0.9;

    function roundZoom() {
        if (!map) return 0;
        return Math.round(map.getZoom());
    }

    function isSrClickable() {
        return roundZoom() >= minClickZoom();
    }

    function minClickZoom() {
        return cfg.minSrZoom || cfg.minTreeClickZoom || 19;
    }

    function minVisibleZoom() {
        return cfg.minTreeLayerZoom || cfg.minTreeZoom || 13;
    }

    function setMapStatus(message) {
        var el = document.getElementById('map-status');
        if (el && message) el.textContent = message;
    }

    function glyphKey(subArea) {
        return SUBAREA_TO_GLYPH[subArea] || 'other';
    }

    function buildPinSvg(phase, subArea) {
        var style = PHASE_STYLE[phase] || PHASE_STYLE.sr;
        var glyph = GLYPHS[glyphKey(subArea)] || GLYPHS.other;
        return ''
            + '<svg xmlns="http://www.w3.org/2000/svg" width="' + PIN_W + '" height="' + PIN_H + '" viewBox="0 0 32 40">'
            + '<path fill="' + style.fill + '" stroke="' + style.stroke + '" stroke-width="1.5" d="' + PIN_PATH + '"/>'
            + '<circle cx="' + PIN_CENTER_X + '" cy="' + PIN_INNER_CY + '" r="' + PIN_INNER_R + '" fill="' + style.inner + '"/>'
            + '<g color="' + style.glyph + '" transform="translate(' + PIN_CENTER_X + ' ' + PIN_INNER_CY + ') scale(' + GLYPH_SCALE + ') translate(-12 -12)">'
            + glyph
            + '</g>'
            + '</svg>';
    }

    function iconUrlForMarker(marker) {
        var phase = marker.phase || marker.iconKey || 'sr';
        var subArea = marker.subArea || 'Other';
        var key = phase + '|' + subArea;
        if (!pinCache[key]) {
            pinCache[key] = 'data:image/svg+xml,' + encodeURIComponent(buildPinSvg(phase, subArea));
        }
        return pinCache[key];
    }

    function openWorkflow(srNumber) {
        if (!map) return;
        if (!isSrClickable()) {
            var i18n = global.ZurichI18n;
            var clickMin = minClickZoom();
            var msg = i18n && i18n.t
                ? i18n.t('map.status.zoomSrPin', { zoom: clickMin })
                : 'Zoom in to level ' + clickMin + ' or higher to open service requests.';
            setMapStatus(msg);
            return;
        }
        window._zurichMarkerClickTs = Date.now();
        var wf = global.ZurichWorkflowPanel;
        if (wf && typeof wf.openForSr === 'function') {
            wf.openForSr(srNumber, 'sr');
        }
    }

    function distanceM(a, b) {
        if (!a || !b) return Infinity;
        if (typeof google !== 'undefined' && google.maps && google.maps.geometry && google.maps.geometry.spherical) {
            return google.maps.geometry.spherical.computeDistanceBetween(a, b);
        }
        return Infinity;
    }

    function collectNear(latLng, radiusM) {
        if (!map || !latLng) return [];
        var ll = typeof latLng.lat === 'function' ? latLng : new google.maps.LatLng(latLng.lat, latLng.lng);
        var maxM = radiusM || 5;
        var seen = {};
        var result = [];

        Object.keys(pinsBySr).forEach(function (key) {
            var pin = pinsBySr[key];
            if (!pin || !pin.position || !pin.data) return;
            if (distanceM(ll, pin.position) > maxM) return;
            var id = String(pin.data.srNumber);
            if (seen[id]) return;
            seen[id] = true;
            var copy = Object.assign({}, pin.data);
            copy.distanceM = distanceM(ll, pin.position);
            result.push(copy);
        });

        result.sort(function (a, b) {
            return (a.distanceM || 0) - (b.distanceM || 0);
        });
        return result;
    }

    function updatePinInteractivity() {
        if (!map) return;
        var z = roundZoom();
        var clickMin = minClickZoom();
        var visibleMin = minVisibleZoom();
        var showPins = z >= visibleMin;
        var clickable = z >= clickMin;

        Object.keys(pinsBySr).forEach(function (key) {
            var pin = pinsBySr[key];
            if (!pin || !pin.div) return;

            if (!showPins) {
                pin.div.style.display = 'none';
                pin.div.style.pointerEvents = 'none';
                pin.div.setAttribute('aria-hidden', 'true');
                return;
            }

            pin.div.style.display = '';
            pin.div.setAttribute('aria-hidden', 'false');
            pin.div.disabled = !clickable;
            pin.div.style.pointerEvents = clickable ? 'auto' : 'none';
            pin.div.style.opacity = clickable ? '1' : '0.55';
            pin.div.style.cursor = clickable ? 'pointer' : 'default';
            pin.div.setAttribute('aria-disabled', clickable ? 'false' : 'true');
        });
    }

    function blockMapBubble(ev) {
        ev.stopPropagation();
    }

    function defineSrPinOverlay() {
        if (SrPinOverlay || typeof google === 'undefined' || !google.maps || !google.maps.OverlayView) {
            return SrPinOverlay;
        }

        function Overlay(data) {
            this.data = data;
            this.position = new google.maps.LatLng(data.lat, data.lng);
            this.div = null;
        }

        Overlay.prototype = Object.create(google.maps.OverlayView.prototype);
        Overlay.prototype.constructor = Overlay;

        Overlay.prototype.onAdd = function () {
            var self = this;
            var phase = this.data.phase || this.data.iconKey || 'sr';
            var div = document.createElement('button');
            div.type = 'button';
            div.className = 'sr-map-pin sr-map-pin--' + phase;
            div.title = (this.data.title || ('SR ' + this.data.srNumber)) + ' — click to open';
            div.setAttribute('aria-label', 'Open service request ' + this.data.srNumber);

            var img = document.createElement('img');
            img.src = iconUrlForMarker(this.data);
            img.width = PIN_W;
            img.height = PIN_H;
            img.alt = '';
            img.draggable = false;
            div.appendChild(img);

            div.addEventListener('pointerdown', blockMapBubble, true);
            div.addEventListener('pointerup', blockMapBubble, true);
            div.addEventListener('mousedown', blockMapBubble, true);
            div.addEventListener('mouseup', blockMapBubble, true);
            div.addEventListener('click', function (ev) {
                ev.stopPropagation();
                ev.preventDefault();
                if (!isSrClickable()) {
                    var i18n = global.ZurichI18n;
                    var clickMin = minClickZoom();
                    var msg = i18n && i18n.t
                        ? i18n.t('map.status.zoomSrPin', { zoom: clickMin })
                        : 'Zoom in to level ' + clickMin + ' or higher to open service requests.';
                    setMapStatus(msg);
                    return;
                }
                window._zurichMarkerClickTs = Date.now();
                var pick = global.ZurichMapClickPick;
                if (pick && typeof pick.resolveAt === 'function') {
                    pick.resolveAt(self.position, self.data);
                    return;
                }
                openWorkflow(self.data.srNumber);
            });

            this.div = div;
            this.getPanes().floatPane.appendChild(div);
        };

        Overlay.prototype.draw = function () {
            if (!this.div) return;
            var projection = this.getProjection();
            if (!projection) return;
            var point = projection.fromLatLngToDivPixel(this.position);
            if (!point) return;
            this.div.style.left = Math.round(point.x - PIN_ANCHOR_X) + 'px';
            this.div.style.top = Math.round(point.y - PIN_ANCHOR_Y) + 'px';
        };

        Overlay.prototype.onRemove = function () {
            if (this.div && this.div.parentNode) {
                this.div.parentNode.removeChild(this.div);
            }
            this.div = null;
        };

        SrPinOverlay = Overlay;
        return SrPinOverlay;
    }

    function clearPins() {
        Object.keys(pinsBySr).forEach(function (key) {
            pinsBySr[key].setMap(null);
        });
        pinsBySr = {};
    }

    function notifyLegend(count, loaded) {
        var legend = global.ZurichMapLegend;
        if (legend && typeof legend.onMarkersChanged === 'function') {
            legend.onMarkersChanged(count, loaded);
        }
    }

    function placeMarkers(items) {
        if (!map || typeof google === 'undefined') return;
        var PinClass = defineSrPinOverlay();
        if (!PinClass) return;

        clearPins();

        (items || []).forEach(function (marker) {
            if (!marker || marker.lat == null || marker.lng == null) return;
            var overlay = new PinClass(marker);
            overlay.setMap(map);
            pinsBySr[String(marker.srNumber)] = overlay;
        });
        updatePinInteractivity();
    }

    var lastMarkersUrl = null;

    function refresh(urlOverride) {
        if (arguments.length > 0) {
            lastMarkersUrl = urlOverride || null;
        }
        var url = lastMarkersUrl;
        if (!url) {
            placeMarkers([]);
            notifyLegend(0, false);
            return Promise.resolve(0);
        }
        return fetch(url)
            .then(function (r) { return r.json(); })
            .then(function (body) {
                var items = body && body.markers ? body.markers : [];
                placeMarkers(items);
                notifyLegend(items.length, true);
                return items.length;
            })
            .catch(function (err) {
                console.warn('Could not load map markers:', err);
                notifyLegend(0, true);
                return 0;
            });
    }

    function init(mapInstance, config) {
        map = mapInstance;
        cfg = config || global.ZURICH_MAP || {};
        defineSrPinOverlay();
        if (!projectionOverlay && map) {
            projectionOverlay = new google.maps.OverlayView();
            projectionOverlay.onAdd = function () { };
            projectionOverlay.draw = function () { };
            projectionOverlay.onRemove = function () { };
            projectionOverlay.setMap(map);
        }
        map.addListener('zoom_changed', updatePinInteractivity);
        placeMarkers([]);
        notifyLegend(0, false);
        return Promise.resolve(0);
    }

    function clear() {
        lastMarkersUrl = null;
        placeMarkers([]);
        notifyLegend(0, false);
    }

    global.ZurichMapMarkers = {
        init: init,
        refresh: refresh,
        clear: clear,
        collectNear: collectNear
    };
}(window));
