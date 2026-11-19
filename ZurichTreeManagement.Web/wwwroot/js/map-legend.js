(function (global) {
    'use strict';

    var pinCount = 0;
    var markersLoaded = false;

    function byId(id) { return document.getElementById(id); }

    function t(key, vars) {
        var i18n = global.ZurichI18n;
        if (i18n && typeof i18n.t === 'function') return i18n.t(key, vars);
        return key;
    }

    function setLegendCollapsed(collapsed) {
        var root = byId('map-legend');
        var body = byId('map-legend-body');
        var toggle = byId('map-legend-toggle');
        if (!root || !body || !toggle) return;

        root.classList.toggle('map-legend--collapsed', collapsed);
        body.hidden = collapsed;
        toggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    }

    function updateEmptyHint() {
        var hint = byId('map-empty-hint');
        var textEl = hint && hint.querySelector('.map-empty-hint__text');
        if (!hint || !textEl) return;

        if (pinCount > 0) {
            hint.hidden = true;
            return;
        }

        hint.hidden = false;
        var key = markersLoaded ? 'map.empty.noneFound' : 'map.empty.hint';
        textEl.textContent = t(key);
    }

    function onMarkersChanged(count, loaded) {
        pinCount = typeof count === 'number' ? count : 0;
        markersLoaded = !!loaded;
        updateEmptyHint();
    }

    function bindToggle() {
        var toggle = byId('map-legend-toggle');
        if (!toggle) return;
        toggle.addEventListener('click', function () {
            var root = byId('map-legend');
            var collapsed = root && root.classList.contains('map-legend--collapsed');
            setLegendCollapsed(!collapsed);
        });
    }

    function init() {
        bindToggle();
        setLegendCollapsed(true);
        var i18n = global.ZurichI18n;
        var root = byId('map-legend');
        if (i18n && root) i18n.apply(root);
        updateEmptyHint();
        global.addEventListener('zurich:locale', function () {
            updateEmptyHint();
            var i18n = global.ZurichI18n;
            var root = byId('map-legend');
            if (i18n && root) i18n.apply(root);
        });
    }

    global.ZurichMapLegend = {
        init: init,
        onMarkersChanged: onMarkersChanged
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
}(window));
