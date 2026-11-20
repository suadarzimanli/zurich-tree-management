/* Public request tracking: reference number -> journey + dated timeline (no personal data). */
(function (global) {
    'use strict';

    function byId(id) { return document.getElementById(id); }
    function t(key, vars) {
        var i18n = global.ZurichI18n;
        return i18n && typeof i18n.t === 'function' ? i18n.t(key, vars) : key;
    }
    function typeLabel(type) {
        var api = global.ZurichI18n;
        return api && api.translateRequestType ? api.translateRequestType(type || '') : (type || '');
    }

    var last = null;

    function showError(key) {
        var e = byId('track-error');
        e.textContent = t(key);
        e.hidden = false;
        byId('track-result').hidden = true;
    }

    function timelineItem(labelKey, iso, done) {
        var P = global.ZurichPhase;
        return '<li class="timeline__item' + (done ? ' timeline__item--done' : '') + '">'
            + '<span class="timeline__dot" aria-hidden="true"></span>'
            + '<span class="timeline__label">' + P.escape(t(labelKey)) + '</span>'
            + '<span class="timeline__date">' + P.escape(iso ? P.formatDate(iso) : '—') + '</span></li>';
    }

    function render(d) {
        var P = global.ZurichPhase;
        last = d;
        var phase = P.resolve(d);
        byId('track-error').hidden = true;
        byId('track-ref').textContent = 'SR ' + d.srNumber;
        byId('track-type').textContent = typeLabel(d.requestType);
        byId('track-age').textContent = P.ageText(d.openedAtUtc, d.closedDate);
        var chip = byId('track-phase');
        chip.textContent = P.label(phase);
        chip.className = 'phase-chip phase-chip--' + phase;
        P.render(byId('track-journey'), phase);
        byId('track-tree').textContent = [d.ogdSpeciesGerman, d.linkedTreeBaumnummer].filter(Boolean).join(' · ') || '—';
        byId('track-where').textContent = [d.ogdStreet, d.ogdQuartier].filter(Boolean).join(', ') || (d.address || '').split(',')[0] || '—';
        byId('track-opened').textContent = P.formatDate(d.openedAtUtc) || '—';
        var insp = d.inspection, wo = d.workOrder;
        byId('track-timeline').innerHTML =
            timelineItem('phase.received', d.openedAtUtc, true)
            + timelineItem('phase.inspection', insp && (insp.inspectDate || insp.createdAtUtc), !!insp)
            + timelineItem('phase.workorder', wo && (wo.workDate || wo.createdAtUtc), !!wo)
            + timelineItem('phase.closed', d.closedDate, phase === 'closed');
        byId('track-map').href = '/?openSr=' + encodeURIComponent(d.srNumber);
        byId('track-result').hidden = false;
    }

    function lookup(raw) {
        var n = String(raw || '').replace(/^\s*sr\s*/i, '').trim();
        if (!/^\d{1,12}$/.test(n)) { showError('track.invalid'); return; }
        if (global.history && history.replaceState) history.replaceState(null, '', '/Track?sr=' + n);
        fetch('/api/sr/' + n)
            .then(function (r) { if (r.status === 404) return null; if (!r.ok) throw new Error('lookup failed'); return r.json(); })
            .then(function (d) { if (!d) showError('track.notFound'); else render(d); })
            .catch(function () { showError('track.notFound'); });
    }

    function init() {
        var form = byId('track-form');
        var input = byId('track-input');
        form.addEventListener('submit', function (ev) { ev.preventDefault(); lookup(input.value); });
        if (input.value) lookup(input.value);
        global.addEventListener('zurich:locale', function () { if (last) render(last); });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
}(window));
