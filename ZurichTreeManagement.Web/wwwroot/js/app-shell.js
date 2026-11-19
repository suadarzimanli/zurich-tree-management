(function (global) {
    'use strict';

    var activeMapType = 'roadmap';

    function byId(id) { return document.getElementById(id); }

    function closeSubmenus(exceptId) {
        ['map-type-submenu', 'satellite-type-submenu'].forEach(function (id) {
            if (id === exceptId) return;
            var el = byId(id);
            if (el) el.hidden = true;
        });
        ['rail-map', 'rail-satellite'].forEach(function (id) {
            var btn = byId(id);
            if (btn) {
                btn.classList.remove('app-rail__btn--active');
                btn.setAttribute('aria-expanded', 'false');
            }
        });
    }

    function toggleSubmenu(which) {
        var mapSub = byId('map-type-submenu');
        var satSub = byId('satellite-type-submenu');
        var mapBtn = byId('rail-map');
        var satBtn = byId('rail-satellite');

        if (which === 'map') {
            var showMap = mapSub && mapSub.hidden;
            closeSubmenus(showMap ? 'map-type-submenu' : null);
            if (mapSub) mapSub.hidden = !showMap;
            if (mapBtn) {
                mapBtn.classList.toggle('app-rail__btn--active', showMap);
                mapBtn.setAttribute('aria-expanded', showMap ? 'true' : 'false');
            }
        } else if (which === 'satellite') {
            var showSat = satSub && satSub.hidden;
            closeSubmenus(showSat ? 'satellite-type-submenu' : null);
            if (satSub) satSub.hidden = !showSat;
            if (satBtn) {
                satBtn.classList.toggle('app-rail__btn--active', showSat);
                satBtn.setAttribute('aria-expanded', showSat ? 'true' : 'false');
            }
        }
    }

    function highlightMapType(type) {
        activeMapType = type;
        document.querySelectorAll('.app-rail__submenu-btn').forEach(function (btn) {
            var t = btn.getAttribute('data-map-type');
            btn.classList.toggle('app-rail__submenu-btn--active', t === type);
        });

        var mapBtn = byId('rail-map');
        var satBtn = byId('rail-satellite');
        if (mapBtn) mapBtn.classList.toggle('app-rail__btn--active', type === 'roadmap' || type === 'terrain');
        if (satBtn) satBtn.classList.toggle('app-rail__btn--active', type === 'hybrid' || type === 'satellite');
    }

    function setMapType(type) {
        var api = global.ZurichMapApi;
        if (!api || typeof api.setMapType !== 'function') return;
        api.setMapType(type);
        highlightMapType(type);

        if (type === 'roadmap' || type === 'terrain') {
            var mapSub = byId('map-type-submenu');
            if (mapSub) mapSub.hidden = false;
            if (byId('rail-map')) byId('rail-map').setAttribute('aria-expanded', 'true');
            if (byId('satellite-type-submenu')) byId('satellite-type-submenu').hidden = true;
        } else {
            var satSub = byId('satellite-type-submenu');
            if (satSub) satSub.hidden = false;
            if (byId('rail-satellite')) byId('rail-satellite').setAttribute('aria-expanded', 'true');
            if (byId('map-type-submenu')) byId('map-type-submenu').hidden = true;
        }
    }

    function toggleFilterDrawer(forceOpen) {
        var drawer = byId('filter-drawer');
        var btn = byId('rail-filter');
        var shell = byId('app-shell');
        if (!drawer || !shell) return;

        var open = typeof forceOpen === 'boolean' ? forceOpen : drawer.hidden;
        drawer.hidden = !open;
        drawer.setAttribute('aria-hidden', open ? 'false' : 'true');
        shell.classList.toggle('filter-drawer-open', open);
        if (btn) {
            btn.classList.toggle('app-rail__btn--active', open);
            btn.setAttribute('aria-expanded', open ? 'true' : 'false');
        }
        if (open) closeSubmenus(null);

        if (open && global.ZurichMapApi && typeof global.ZurichMapApi.resize === 'function') {
            global.setTimeout(function () { global.ZurichMapApi.resize(); }, 280);
        }
    }

    function init() {
        var filterBtn = byId('rail-filter');
        var filterClose = byId('filter-drawer-close');
        var mapBtn = byId('rail-map');
        var satBtn = byId('rail-satellite');

        if (filterBtn) {
            filterBtn.addEventListener('click', function () {
                var drawer = byId('filter-drawer');
                toggleFilterDrawer(drawer ? drawer.hidden : true);
            });
        }
        if (filterClose) {
            filterClose.addEventListener('click', function () { toggleFilterDrawer(false); });
        }
        if (mapBtn) {
            mapBtn.addEventListener('click', function () { toggleSubmenu('map'); });
        }
        if (satBtn) {
            satBtn.addEventListener('click', function () { toggleSubmenu('satellite'); });
        }

        document.querySelectorAll('.app-rail__submenu-btn').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var type = btn.getAttribute('data-map-type');
                if (type) setMapType(type);
            });
        });

        document.addEventListener('click', function (ev) {
            if (!ev.target || typeof ev.target.closest !== 'function') return;
            if (ev.target.closest('.app-rail__group') || ev.target.closest('#rail-filter')) return;
            closeSubmenus(null);
        });

        highlightMapType(activeMapType);
    }

    global.ZurichAppShell = {
        init: init,
        toggleFilterDrawer: toggleFilterDrawer,
        setMapType: setMapType
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
}(window));
