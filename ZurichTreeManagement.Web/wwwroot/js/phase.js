/*
 * Case journey shared by map panel, desk and public tracking page:
 * Received → Inspection → Work order → Closed.
 * One rendering so citizens and staff always see the same status language.
 */
(function (global) {
    'use strict';

    var STEPS = ['sr', 'inspection', 'workorder', 'closed'];
    var LABEL_KEYS = { sr: 'phase.received', inspection: 'phase.inspection', workorder: 'phase.workorder', closed: 'phase.closed' };

    function t(key, vars) {
        var i18n = global.ZurichI18n;
        return i18n && typeof i18n.t === 'function' ? i18n.t(key, vars) : key;
    }

    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    /** Phase from a list row (has .phase) or a detail record (status / inspection / workOrder). */
    function resolve(d) {
        if (!d) return 'sr';
        if (d.phase && STEPS.indexOf(d.phase) >= 0) return d.phase;
        if (String(d.status || '').toLowerCase() === 'closed') return 'closed';
        if (d.workOrder) return 'workorder';
        if (d.inspection) return 'inspection';
        return 'sr';
    }

    function fmtDate(iso) {
        if (!iso) return '';
        var d = new Date(iso);
        if (isNaN(d.getTime())) return '';
        var lang = (document.documentElement.lang || 'en').slice(0, 2) === 'de' ? 'de-CH' : 'en-GB';
        return d.toLocaleDateString(lang, { day: 'numeric', month: 'short', year: 'numeric' });
    }

    /** "Open for 12 days" / "Opened today" / "Closed 3 Jul 2026". */
    function ageText(openedIso, closedIso) {
        if (closedIso) return t('case.closedOn', { date: fmtDate(closedIso) });
        if (!openedIso) return '';
        var opened = new Date(openedIso);
        if (isNaN(opened.getTime())) return '';
        var days = Math.floor((Date.now() - opened.getTime()) / 86400000);
        if (days <= 0) return t('case.openToday');
        if (days === 1) return t('case.openOneDay');
        return t('case.openFor', { days: days });
    }

    function daysOpen(openedIso, closedIso) {
        if (!openedIso || closedIso) return 0;
        var opened = new Date(openedIso);
        return isNaN(opened.getTime()) ? 0 : Math.max(0, Math.floor((Date.now() - opened.getTime()) / 86400000));
    }

    /** Horizontal stepper. `compact` hides labels except the current one (narrow panels). */
    function stepperHtml(phase, opts) {
        opts = opts || {};
        var current = STEPS.indexOf(phase);
        if (current < 0) current = 0;
        var html = '<ol class="journey' + (opts.compact ? ' journey--compact' : '') + '" aria-label="' + esc(t('filter.phase')) + '">';
        STEPS.forEach(function (step, i) {
            var state = i < current ? 'done' : i === current ? (step === 'closed' ? 'done' : 'current') : 'todo';
            html += '<li class="journey__step journey__step--' + state + '"'
                + (i === current ? ' aria-current="step"' : '') + '>'
                + '<span class="journey__dot" aria-hidden="true"></span>'
                + '<span class="journey__label">' + esc(t(LABEL_KEYS[step])) + '</span>'
                + '</li>';
        });
        return html + '</ol>';
    }

    function render(el, phase, opts) {
        if (el) el.innerHTML = stepperHtml(phase, opts);
    }

    global.ZurichPhase = {
        steps: STEPS,
        resolve: resolve,
        label: function (phase) { return t(LABEL_KEYS[phase] || 'phase.received'); },
        ageText: ageText,
        daysOpen: daysOpen,
        formatDate: fmtDate,
        stepperHtml: stepperHtml,
        render: render,
        escape: esc
    };
}(window));
