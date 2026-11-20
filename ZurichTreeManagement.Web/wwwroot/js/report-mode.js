/*
 * "Report a tree issue" mode. Location first (FixMyStreet): the citizen starts
 * from the map, optionally jumps to their GPS position, zooms to street level,
 * and the next tree they tap opens the report form. Works with touch (iPhone),
 * mouse and keyboard — no right-click needed.
 */
(function (global) {
    'use strict';

    var active = false;
    var banner = null;

    function byId(id) { return document.getElementById(id); }
    function t(key, vars) {
        var i18n = global.ZurichI18n;
        return i18n && typeof i18n.t === 'function' ? i18n.t(key, vars) : key;
    }
    function api() { return global.ZurichMapApi || null; }
    function setBannerText(key) { var el = byId('report-banner-text'); if (el) el.textContent = t(key); }

    function closePanels() {
        ['ZurichTreePanel', 'ZurichSrForm', 'ZurichWorkflowPanel'].forEach(function (name) {
            var p = global[name];
            if (p && typeof p.close === 'function') p.close();
        });
    }

    function start() {
        active = true;
        closePanels();
        setBannerText('report.banner');
        if (banner) banner.hidden = false;
        document.body.classList.add('is-reporting');
        var zoomBtn = byId('report-zoom');
        var a = api();
        if (zoomBtn && a && a.getZoom) zoomBtn.hidden = a.getZoom() >= a.minClickZoom();
        var first = byId(navigator.geolocation ? 'report-locate' : 'report-cancel');
        if (first) first.focus();
    }

    function finish() {
        active = false;
        if (banner) banner.hidden = true;
        document.body.classList.remove('is-reporting');
    }

    function zoomToStreet() {
        var a = api();
        if (a && a.focus) a.focus(null, null, a.minClickZoom());
        var zoomBtn = byId('report-zoom');
        if (zoomBtn) zoomBtn.hidden = true;
    }

    function locate() {
        if (!navigator.geolocation) { setBannerText('report.locateFailed'); return; }
        setBannerText('report.locating');
        navigator.geolocation.getCurrentPosition(function (pos) {
            var a = api();
            if (a && a.focus) a.focus(pos.coords.latitude, pos.coords.longitude, a.minClickZoom());
            var zoomBtn = byId('report-zoom');
            if (zoomBtn) zoomBtn.hidden = true;
            setBannerText('report.banner');
        }, function () {
            setBannerText('report.locateFailed');
        }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 });
    }

    function openSearch() {
        var filterBtn = byId('rail-filter');
        if (filterBtn && filterBtn.getAttribute('aria-expanded') !== 'true') filterBtn.click();
        setTimeout(function () { var input = byId('filter-location'); if (input) input.focus(); }, 60);
    }

    function init() {
        banner = byId('report-banner');
        var startBtn = byId('report-start');
        if (startBtn) startBtn.addEventListener('click', function () { if (active) finish(); else start(); });
        var cancel = byId('report-cancel');
        if (cancel) cancel.addEventListener('click', finish);
        var loc = byId('report-locate');
        if (loc) loc.addEventListener('click', locate);
        var zoom = byId('report-zoom');
        if (zoom) zoom.addEventListener('click', zoomToStreet);
        var pill = byId('map-search-pill');
        if (pill) pill.addEventListener('click', openSearch);
        document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape' && active) finish(); });
        global.addEventListener('zurich:locale', function () { if (active) setBannerText('report.banner'); });
    }

    global.ZurichReportMode = {
        isActive: function () { return active; },
        start: start,
        finish: finish
    };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
}(window));
