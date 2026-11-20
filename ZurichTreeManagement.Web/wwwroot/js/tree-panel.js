(function (global) {
    'use strict';

    var panelEl = null;
    var currentProps = null;
    var currentLatLng = null;

    function byId(id) { return document.getElementById(id); }
    function t(key, vars) {
        var i18n = global.ZurichI18n;
        return i18n && typeof i18n.t === 'function' ? i18n.t(key, vars) : key;
    }
    function setText(id, value) {
        var el = byId(id);
        if (el) el.textContent = value == null || value === '' ? '—' : String(value);
    }

    function closeOtherPanels() {
        var wf = global.ZurichWorkflowPanel;
        if (wf && typeof wf.close === 'function') wf.close();
        var sr = global.ZurichSrForm;
        if (sr && typeof sr.close === 'function') sr.close();
    }

    /** OGD properties + position → the context the report form expects. */
    function toReportContext(props, latLng) {
        props = props || {};
        var lat = latLng ? (typeof latLng.lat === 'function' ? latLng.lat() : latLng.lat) : null;
        var lng = latLng ? (typeof latLng.lng === 'function' ? latLng.lng() : latLng.lng) : null;
        return {
            lat: lat, lng: lng,
            baumnummer: props.baumnummer || '', baumnamelat: props.baumnamelat || '', baumnamedeu: props.baumnamedeu || '',
            quartier: props.quartier || '', strasse: props.strasse || '', objectid: props.objectid,
            pflanzjahr: props.pflanzjahr, kategorie: props.kategorie, status: props.status
        };
    }

    function bindTree(props) {
        currentProps = props || {};
        setText('tree-detail-title', currentProps.baumnamedeu || currentProps.baumnummer || 'Street tree');
        var latin = byId('tree-detail-latin');
        if (latin) latin.textContent = currentProps.baumnamelat || '';

        setText('tree-detail-baumnummer-v', currentProps.baumnummer);
        var year = parseInt(currentProps.pflanzjahr, 10);
        if (year > 1700) {
            setText('tree-detail-age-v', Math.max(0, new Date().getFullYear() - year) + ' y');
            setText('tree-detail-planted-v', t('report.planted', { year: year }));
        } else {
            setText('tree-detail-age-v', '—');
            setText('tree-detail-planted-v', t('field.planted'));
        }
        setText('tree-detail-crown-v', currentProps.kronendurchmesser != null ? currentProps.kronendurchmesser + ' m' : null);
        setText('tree-detail-street-v', currentProps.strasse);
        setText('tree-detail-quarter-v', currentProps.quartier);
        setText('tree-detail-category-v', currentProps.kategorie);
        setText('tree-detail-status-v', currentProps.status);
        setText('tree-detail-size-v', currentProps.baumtyptext);
        setText('tree-detail-objectid-v', currentProps.objectid);

        var reportBtn = byId('tree-report-btn');
        if (reportBtn) reportBtn.hidden = !currentProps.baumnummer;
    }

    function reportCurrentTree() {
        if (!currentProps || !currentProps.baumnummer) return;
        var form = global.ZurichSrForm;
        if (form && typeof form.open === 'function') form.open(toReportContext(currentProps, currentLatLng));
    }

    function open(props, latLng) {
        if (!panelEl) return;
        currentLatLng = latLng || null;
        // In "report a tree issue" mode the tapped tree goes straight into the report.
        var mode = global.ZurichReportMode;
        if (mode && mode.isActive() && props && props.baumnummer) {
            currentProps = props;
            mode.finish();
            reportCurrentTree();
            return;
        }
        closeOtherPanels();
        bindTree(props);
        panelEl.hidden = false;
        panelEl.setAttribute('aria-hidden', 'false');

        var api = global.ZurichMapApi;
        if (api && typeof api.panTo === 'function' && latLng) api.panTo(latLng);
    }

    function close() {
        if (!panelEl) return;
        panelEl.hidden = true;
        panelEl.setAttribute('aria-hidden', 'true');
        currentProps = null;
    }

    function init() {
        panelEl = byId('tree-detail-panel');
        if (!panelEl) return;
        var closeBtn = byId('tree-detail-close');
        if (closeBtn) closeBtn.addEventListener('click', close);
        var reportBtn = byId('tree-report-btn');
        if (reportBtn) reportBtn.addEventListener('click', reportCurrentTree);
    }

    global.ZurichTreePanel = {
        init: init,
        open: open,
        close: close,
        toReportContext: toReportContext
    };
}(window));
