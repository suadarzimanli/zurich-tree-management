(function (global) {
    'use strict';

    var panelEl = null;
    var currentProps = null;

    function byId(id) { return document.getElementById(id); }

    function fillField(id, value) {
        var el = byId(id);
        if (el) el.value = value == null ? '' : String(value);
    }

    function closeOtherPanels() {
        var wf = global.ZurichWorkflowPanel;
        if (wf && typeof wf.close === 'function') wf.close();
        var sr = global.ZurichSrForm;
        if (sr && typeof sr.close === 'function') sr.close();
    }

    function bindTree(props) {
        currentProps = props || {};
        var title = currentProps.baumnamedeu || currentProps.baumnummer || 'Street tree';
        var titleEl = byId('tree-detail-title');
        if (titleEl) titleEl.textContent = title;

        fillField('tree-detail-baumnummer', currentProps.baumnummer);
        fillField('tree-detail-species-lat', currentProps.baumnamelat);
        fillField('tree-detail-species-de', currentProps.baumnamedeu);
        fillField('tree-detail-quarter', currentProps.quartier);
        fillField('tree-detail-street', currentProps.strasse);
        fillField('tree-detail-category', currentProps.kategorie);
        fillField('tree-detail-status', currentProps.status);
        fillField('tree-detail-crown', currentProps.kronendurchmesser != null ? currentProps.kronendurchmesser + ' m' : '');
        fillField('tree-detail-planted', currentProps.pflanzjahr);
        fillField('tree-detail-size', currentProps.baumtyptext);
        fillField('tree-detail-objectid', currentProps.objectid);
    }

    function open(props, latLng) {
        if (!panelEl) return;
        closeOtherPanels();
        bindTree(props);
        panelEl.hidden = false;
        panelEl.setAttribute('aria-hidden', 'false');

        var api = global.ZurichMapApi;
        if (api && typeof api.panTo === 'function' && latLng) {
            api.panTo(latLng);
        }
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
    }

    global.ZurichTreePanel = {
        init: init,
        open: open,
        close: close
    };
}(window));
