(function (global) {
    'use strict';

    var state = {
        ready: false,
        polygons: [],
        bounds: null,
        maskBufferFeet: 400,
        layers: { bufferBands: [], glow: null, stroke: null, hit: null }
    };

    function lngLatRingToPath(ring) {
        if (!ring || ring.length < 3) return null;
        var path = [];
        for (var i = 0; i < ring.length; i++) {
            var lng = Number(ring[i][0]);
            var lat = Number(ring[i][1]);
            if (isNaN(lat) || isNaN(lng)) continue;
            path.push({ lat: lat, lng: lng });
        }
        return path.length >= 3 ? path : null;
    }

    function pointInRing(lat, lng, ring) {
        if (!ring || ring.length < 3) return false;
        var inside = false;
        for (var i = 0, j = ring.length - 1; i < ring.length; j = i++) {
            var yi = ring[i].lat;
            var xi = ring[i].lng;
            var yj = ring[j].lat;
            var xj = ring[j].lng;
            if (((yi > lat) !== (yj > lat))
                && (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi)) {
                inside = !inside;
            }
        }
        return inside;
    }

    function pointInPolygon(lat, lng, rings) {
        if (!rings || !rings.length || !rings[0]) return false;
        if (!pointInRing(lat, lng, rings[0])) return false;
        for (var h = 1; h < rings.length; h++) {
            if (pointInRing(lat, lng, rings[h])) return false;
        }
        return true;
    }

    function normalizeOuterRing(path, referenceLat, referenceLng) {
        if (!path || path.length < 3) return path;
        if (pointInRing(referenceLat, referenceLng, path)) return path;
        var reversed = path.slice().reverse();
        if (pointInRing(referenceLat, referenceLng, reversed)) return reversed;
        return path;
    }

    function extendBounds(bounds, path) {
        for (var i = 0; i < path.length; i++) {
            bounds.extend(path[i]);
        }
    }

    function ringsFromGeometry(geometry) {
        var result = [];
        if (!geometry) return result;
        if (geometry.type === 'Polygon') {
            var polygonRings = [];
            for (var p = 0; p < geometry.coordinates.length; p++) {
                var path = lngLatRingToPath(geometry.coordinates[p]);
                if (path) polygonRings.push(path);
            }
            if (polygonRings.length) result.push(polygonRings);
        } else if (geometry.type === 'MultiPolygon') {
            for (var m = 0; m < geometry.coordinates.length; m++) {
                var multiRings = [];
                for (var r = 0; r < geometry.coordinates[m].length; r++) {
                    var multiPath = lngLatRingToPath(geometry.coordinates[m][r]);
                    if (multiPath) multiRings.push(multiPath);
                }
                if (multiRings.length) result.push(multiRings);
            }
        }
        return result;
    }

    function parseGeoJson(geoJson, referenceLat, referenceLng) {
        var polygons = [];
        if (!geoJson) return polygons;

        var features = geoJson.type === 'FeatureCollection'
            ? (geoJson.features || [])
            : geoJson.type === 'Feature'
                ? [geoJson]
                : geoJson.type === 'Polygon' || geoJson.type === 'MultiPolygon'
                    ? [{ type: 'Feature', geometry: geoJson }]
                    : [];

        for (var f = 0; f < features.length; f++) {
            var feature = features[f];
            if (!feature || !feature.geometry) continue;
            var geometryRings = ringsFromGeometry(feature.geometry);
            for (var g = 0; g < geometryRings.length; g++) {
                if (geometryRings[g][0]) {
                    geometryRings[g][0] = normalizeOuterRing(
                        geometryRings[g][0],
                        referenceLat,
                        referenceLng
                    );
                }
                polygons.push(geometryRings[g]);
            }
        }
        return polygons;
    }

    function signedRingArea(path) {
        if (!path || path.length < 3) return 0;
        var area = 0;
        for (var i = 0; i < path.length; i++) {
            var j = (i + 1) % path.length;
            area += path[i].lng * path[j].lat - path[j].lng * path[i].lat;
        }
        return area * 0.5;
    }

    function reversePath(path) {
        return path.slice().reverse();
    }

    function asHolePath(outerPath, innerPath) {
        if (!innerPath || innerPath.length < 3) return innerPath;
        var outerArea = signedRingArea(outerPath);
        var innerArea = signedRingArea(innerPath);
        if (outerArea === 0 || innerArea === 0) return reversePath(innerPath);
        if ((outerArea > 0) === (innerArea > 0)) return reversePath(innerPath);
        return innerPath;
    }

    function buildBufferBandPaths(bufferedPath, borderPath) {
        return [bufferedPath, asHolePath(bufferedPath, borderPath)];
    }

    function clearLayers() {
        if (state.layers.bufferBands && state.layers.bufferBands.length) {
            state.layers.bufferBands.forEach(function (band) {
                band.setMap(null);
            });
            state.layers.bufferBands = [];
        }
        ['glow', 'stroke', 'hit'].forEach(function (key) {
            if (state.layers[key]) {
                state.layers[key].setMap(null);
                state.layers[key] = null;
            }
        });
    }

    function pathToTurfPolygon(path) {
        var coords = path.map(function (p) { return [p.lng, p.lat]; });
        var first = coords[0];
        var last = coords[coords.length - 1];
        if (!last || first[0] !== last[0] || first[1] !== last[1]) {
            coords.push([first[0], first[1]]);
        }
        return turf.polygon([coords]);
    }

    function ringFromBufferedGeometry(geometry) {
        if (!geometry) return null;
        if (geometry.type === 'Polygon') {
            return lngLatRingToPath(geometry.coordinates[0]);
        }
        if (geometry.type === 'MultiPolygon' && geometry.coordinates.length) {
            var bestRing = null;
            var bestArea = -1;
            for (var i = 0; i < geometry.coordinates.length; i++) {
                var candidate = turf.polygon(geometry.coordinates[i]);
                var area = turf.area(candidate);
                if (area > bestArea) {
                    bestArea = area;
                    bestRing = geometry.coordinates[i][0];
                }
            }
            return lngLatRingToPath(bestRing);
        }
        return null;
    }

    function bufferOuterPath(path, bufferFeet) {
        if (!path || !bufferFeet || bufferFeet <= 0) return path;
        if (typeof turf === 'undefined' || typeof turf.buffer !== 'function') {
            console.warn('Turf.js unavailable; city mask uses exact boundary without buffer.');
            return path;
        }
        try {
            var buffered = turf.buffer(pathToTurfPolygon(path), bufferFeet, {
                units: 'feet',
                steps: 24
            });
            if (typeof turf.rewind === 'function') {
                buffered = turf.rewind(buffered, { reverse: false });
            }
            if (typeof turf.cleanCoords === 'function') {
                buffered = turf.cleanCoords(buffered);
            }
            return ringFromBufferedGeometry(buffered.geometry) || path;
        } catch (err) {
            console.warn('City mask buffer failed:', err);
            return path;
        }
    }

    function resolveMaskBufferFeet(options) {
        var value = Number(options && options.maskBufferFeet);
        if (isNaN(value) || value < 0) return state.maskBufferFeet;
        return value;
    }

    function drawBufferBand(map, borderPaths, bufferFeet) {
        if (!map || !borderPaths || !borderPaths.length || !bufferFeet || bufferFeet <= 0) return;

        state.layers.bufferBands = [];
        borderPaths.forEach(function (borderPath) {
            var bufferedPath = bufferOuterPath(borderPath, bufferFeet);
            if (!bufferedPath) return;

            var band = new google.maps.Polygon({
                paths: buildBufferBandPaths(bufferedPath, borderPath),
                strokeOpacity: 0,
                fillColor: '#0f172a',
                fillOpacity: 0.58,
                clickable: false,
                zIndex: 1
            });
            band.setMap(map);
            state.layers.bufferBands.push(band);
        });
    }

    function drawOnMap(map, options) {
        if (!map || !state.polygons.length) return;

        clearLayers();

        var maskBufferFeet = resolveMaskBufferFeet(options);
        state.maskBufferFeet = maskBufferFeet;

        var borderPaths = state.polygons.map(function (rings) { return rings[0]; });
        drawBufferBand(map, borderPaths, maskBufferFeet);

        state.layers.glow = new google.maps.Polygon({
            paths: borderPaths,
            strokeColor: '#ffffff',
            strokeOpacity: 0.92,
            strokeWeight: 8,
            fillOpacity: 0,
            clickable: false,
            zIndex: 4
        });
        state.layers.glow.setMap(map);

        state.layers.stroke = new google.maps.Polygon({
            paths: borderPaths,
            strokeColor: '#0f766e',
            strokeOpacity: 1,
            strokeWeight: 3,
            fillOpacity: 0,
            clickable: false,
            zIndex: 5
        });
        state.layers.stroke.setMap(map);

        state.layers.hit = new google.maps.Polygon({
            paths: borderPaths,
            strokeOpacity: 0,
            fillOpacity: 0,
            clickable: false,
            zIndex: 2
        });
        state.layers.hit.setMap(map);
    }

    function load(url, options) {
        options = options || {};
        var referenceLat = Number(options.referenceLat);
        var referenceLng = Number(options.referenceLng);
        if (isNaN(referenceLat)) referenceLat = 47.3769;
        if (isNaN(referenceLng)) referenceLng = 8.5417;
        state.maskBufferFeet = resolveMaskBufferFeet(options);

        return fetch(url)
            .then(function (response) {
                if (!response.ok) throw new Error('Boundary fetch failed: ' + response.status);
                return response.json();
            })
            .then(function (geoJson) {
                var polygons = parseGeoJson(geoJson, referenceLat, referenceLng);
                if (!polygons.length) throw new Error('Boundary GeoJSON contained no polygon rings.');

                state.polygons = polygons;
                state.bounds = new google.maps.LatLngBounds();
                polygons.forEach(function (rings) {
                    if (rings[0]) extendBounds(state.bounds, rings[0]);
                });
                state.ready = true;
                return polygons;
            });
    }

    function isReady() {
        return state.ready && state.polygons.length > 0;
    }

    function isInside(lat, lng) {
        var latNum = Number(lat);
        var lngNum = Number(lng);
        if (isNaN(latNum) || isNaN(lngNum)) return false;
        if (!isReady()) return true;

        for (var i = 0; i < state.polygons.length; i++) {
            if (pointInPolygon(latNum, lngNum, state.polygons[i])) return true;
        }
        return false;
    }

    function containsLocation(latLng) {
        if (!latLng) return false;
        return isInside(
            typeof latLng.lat === 'function' ? latLng.lat() : latLng.lat,
            typeof latLng.lng === 'function' ? latLng.lng() : latLng.lng
        );
    }

    global.ZurichCityBoundary = {
        load: load,
        drawOnMap: drawOnMap,
        isReady: isReady,
        isInside: isInside,
        containsLocation: containsLocation,
        getBounds: function () { return state.bounds; },
        getMaskBufferFeet: function () { return state.maskBufferFeet; }
    };
}(window));
