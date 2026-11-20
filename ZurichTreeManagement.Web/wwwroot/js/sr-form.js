/*
 * Citizen report: a 4-step guided form (Tree → Issue → Contact → Review) and a
 * confirmation page with the reference number — patterns from FixMyStreet
 * (category first, contact last, duplicate check) and GOV.UK (check answers,
 * confirmation with "what happens next").
 */
(function (global) {
    'use strict';

    var panelEl = null;
    var formEl = null;
    var messageEl = null;
    var currentContext = null;
    var cfg = null;
    var step = 1;
    var TOTAL = 4;
    var lastCreatedSr = null;

    var REQUEST_TYPES = [
        'Tree inspection or pruning request',
        'Fallen tree — road blocked (emergency)',
        'Fallen tree — not blocking road',
        'Broken or hanging branch',
        'Tree planting request',
        'Stump removal request',
        'Bee nest in tree',
        'Sight line / visibility obstruction',
        'General tree information'
    ];
    var URGENT = ['Fallen tree — road blocked (emergency)', 'Broken or hanging branch'];

    // Simple line icons per issue (24×24, stroke = currentColor)
    var ICONS = {
        'Tree inspection or pruning request': '<path d="M6 20 18 8M14 4l6 6M4 14l6 6" />',
        'Fallen tree — road blocked (emergency)': '<path d="M3 20h18M5 16l9-9 3 3-9 9M14 7l3-3" /><path d="M12 3v2" />',
        'Fallen tree — not blocking road': '<path d="M3 20h18M6 17l8-8 3 3-8 8" />',
        'Broken or hanging branch': '<path d="M4 6h10l4 4M10 6l3 7M13 13l-2 6" />',
        'Tree planting request': '<path d="M12 21v-8m0 0c-3.5 0-6-2.5-5.5-6 3.5 0 5.5 2.5 5.5 6Zm0 0c3.5 0 6-2.5 5.5-6-3.5 0-5.5 2.5-5.5 6Z" />',
        'Stump removal request': '<ellipse cx="12" cy="9" rx="7" ry="2.5" /><path d="M5 9v7c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5V9" />',
        'Bee nest in tree': '<ellipse cx="12" cy="13" rx="5" ry="6" /><path d="M7.5 11h9M7.5 15h9M12 4v3" />',
        'Sight line / visibility obstruction': '<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" /><circle cx="12" cy="12" r="2.5" /><path d="M4 20 20 4" />',
        'General tree information': '<circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7.5v.5" />'
    };

    function byId(id) { return document.getElementById(id); }
    function t(key, vars) {
        var i18n = global.ZurichI18n;
        return i18n && typeof i18n.t === 'function' ? i18n.t(key, vars) : key;
    }
    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }
    function typeLabel(type) {
        var api = global.ZurichI18n;
        return api && api.translateRequestType ? api.translateRequestType(type) : type;
    }

    function setMessage(text, isError) {
        if (!messageEl) return;
        messageEl.textContent = text || '';
        messageEl.className = 'sr-create-message' + (isError ? ' sr-create-message--error' : text ? ' sr-create-message--info' : '');
    }

    function reverseGeocode(lat, lng) {
        return new Promise(function (resolve) {
            if (typeof google === 'undefined' || !google.maps || !google.maps.Geocoder) {
                resolve(lat.toFixed(6) + ', ' + lng.toFixed(6));
                return;
            }
            new google.maps.Geocoder().geocode({ location: { lat: lat, lng: lng } }, function (results, status) {
                resolve(status === 'OK' && results && results.length ? results[0].formatted_address : lat.toFixed(6) + ', ' + lng.toFixed(6));
            });
        });
    }

    /** Hidden <select> stays the source of truth; the issue cards drive it. */
    function populateRequestTypes() {
        var select = byId('sr-request-type');
        if (select) {
            var current = select.value;
            while (select.options.length > 1) select.remove(1);
            REQUEST_TYPES.forEach(function (label) {
                var opt = document.createElement('option');
                opt.value = label;
                opt.textContent = typeLabel(label);
                select.appendChild(opt);
            });
            if (current) select.value = current;
        }
        renderIssueCards();
    }

    function renderIssueCards() {
        var grid = byId('report-issue-grid');
        var select = byId('sr-request-type');
        if (!grid || !select) return;
        grid.innerHTML = REQUEST_TYPES.map(function (type, i) {
            var checked = select.value === type;
            var urgent = URGENT.indexOf(type) >= 0;
            return '<label class="issue-card' + (urgent ? ' issue-card--urgent' : '') + '">'
                + '<input type="radio" name="report-issue" value="' + esc(type) + '"' + (checked ? ' checked' : '') + (i === 0 ? ' required' : '') + ' />'
                + '<span class="issue-card__icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">'
                + (ICONS[type] || '') + '</svg></span>'
                + '<span class="issue-card__label">' + esc(typeLabel(type)) + '</span>'
                + '</label>';
        }).join('');
        grid.querySelectorAll('input[name="report-issue"]').forEach(function (input) {
            input.addEventListener('change', function () {
                select.value = input.value;
                updateEmergency();
                setMessage('');
            });
        });
        updateEmergency();
    }

    function updateEmergency() {
        var note = byId('report-emergency');
        var select = byId('sr-request-type');
        if (note && select) note.hidden = URGENT.indexOf(select.value) < 0;
    }

    function isValidEmail(value) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
    }

    function parseApiError(body) {
        if (!body) return 'Could not create service request.';
        if (body.error) return body.error;
        if (body.title && body.errors) {
            var messages = [];
            Object.keys(body.errors).forEach(function (key) {
                var fieldErrors = body.errors[key];
                if (fieldErrors && fieldErrors.length) messages.push(fieldErrors[0]);
            });
            if (messages.length) return messages.join(' ');
        }
        return body.title || 'Could not create service request.';
    }

    function setValue(id, value) {
        var el = byId(id);
        if (el) el.value = value == null ? '' : String(value);
    }
    function setText(id, value) {
        var el = byId(id);
        if (el) el.textContent = value == null ? '' : String(value);
    }

    // ---- steps ---------------------------------------------------------------
    function showStep(n) {
        step = Math.max(1, Math.min(TOTAL, n));
        panelEl.querySelectorAll('.wizard-step').forEach(function (sec) {
            sec.hidden = Number(sec.getAttribute('data-step')) !== step;
        });
        panelEl.querySelectorAll('[data-step-dot]').forEach(function (li) {
            var k = Number(li.getAttribute('data-step-dot'));
            li.className = k < step ? 'is-done' : k === step ? 'is-current' : '';
        });
        setText('report-step-count', t('step.of', { n: step, total: TOTAL }));
        byId('report-back').hidden = step === 1;
        byId('report-next').hidden = step === TOTAL;
        byId('sr-submit').hidden = step !== TOTAL;
        if (step === TOTAL) renderReview();
        setMessage('');
        var heading = panelEl.querySelector('.wizard-step[data-step="' + step + '"] .wizard-step__title');
        if (heading) { heading.setAttribute('tabindex', '-1'); heading.focus({ preventScroll: true }); }
        var body = panelEl.querySelector('.side-panel__body');
        if (body) body.scrollTop = 0;
    }

    function validateStep(n) {
        if (n === 2 && !byId('sr-request-type').value) return t('report.chooseIssue');
        if (n === 3) {
            var first = byId('sr-first-name').value.trim();
            var last = byId('sr-last-name').value.trim();
            var email = byId('sr-email').value.trim();
            if (!first || !last || !isValidEmail(email)) return t('report.contactError');
        }
        return '';
    }

    function next() {
        var err = validateStep(step);
        if (err) { setMessage(err, true); return; }
        showStep(step + 1);
    }

    function renderReview() {
        var dl = byId('report-review');
        if (!dl) return;
        var ctx = currentContext || {};
        var rows = [
            [t('step.tree'), (ctx.baumnamedeu || '—') + (ctx.baumnummer ? ' · ' + ctx.baumnummer : ''), 1],
            [t('report.location'), byId('sr-address').value, 1],
            [t('step.issue'), typeLabel(byId('sr-request-type').value), 2],
            [t('field.description'), byId('sr-description').value.trim() || '—', 2],
            [t('step.contact'), [byId('sr-first-name').value, byId('sr-last-name').value].join(' ').trim()
                + ' · ' + byId('sr-email').value.trim() + (byId('sr-phone').value.trim() ? ' · ' + byId('sr-phone').value.trim() : ''), 3]
        ];
        dl.innerHTML = rows.map(function (r) {
            return '<div class="review-list__row"><dt>' + esc(r[0]) + '</dt><dd>' + esc(r[1]) + '</dd>'
                + '<button type="button" class="review-list__edit" data-goto="' + r[2] + '">' + esc(t('report.edit')) + '</button></div>';
        }).join('');
        dl.querySelectorAll('[data-goto]').forEach(function (b) {
            b.addEventListener('click', function () { showStep(Number(b.getAttribute('data-goto'))); });
        });
    }

    /** FixMyStreet-style duplicate check: open requests already filed for this tree. */
    function checkExisting(baumnummer) {
        var box = byId('report-existing');
        if (!box || !baumnummer || !cfg || !cfg.srListUrl) return;
        box.hidden = true;
        fetch(cfg.srListUrl + '?status=' + encodeURIComponent('In Progress') + '&search=' + encodeURIComponent(baumnummer))
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (body) {
                var items = (body && body.items || []).filter(function (i) { return i.linkedTreeBaumnummer === baumnummer; });
                if (!items.length || !currentContext || currentContext.baumnummer !== baumnummer) return;
                var phase = global.ZurichPhase;
                box.innerHTML = '<p><strong>' + esc(t('report.existing', { count: items.length })) + '</strong></p><ul>'
                    + items.slice(0, 3).map(function (i) {
                        return '<li><a href="/Track?sr=' + i.srNumber + '">SR ' + i.srNumber + '</a> — ' + esc(typeLabel(i.requestType))
                            + (phase ? ' · ' + esc(phase.label(i.phase)) : '') + '</li>';
                    }).join('') + '</ul><p class="notice__hint">' + esc(t('report.existingHint')) + '</p>';
                box.hidden = false;
            })
            .catch(function () { /* the check is a courtesy; never block reporting */ });
    }

    function fillTree(ctx) {
        setValue('sr-linked-tree', ctx.baumnummer || '');
        setValue('sr-species-de', ctx.baumnamedeu || '');
        setValue('sr-species-lat', ctx.baumnamelat || '');
        setValue('sr-quarter', ctx.quartier || '');
        setValue('sr-street', ctx.strasse || '');
        setValue('sr-lat', ctx.lat);
        setValue('sr-lng', ctx.lng);
        setText('report-tree-name', ctx.baumnamedeu || ctx.baumnummer || '—');
        setText('report-tree-latin', ctx.baumnamelat || '');
        setText('report-tree-number', ctx.baumnummer || '');
        var year = parseInt(ctx.pflanzjahr, 10);
        var streetBits = [ctx.strasse, ctx.quartier].filter(Boolean).join(', ');
        if (year > 1700) streetBits += (streetBits ? ' · ' : '') + t('report.planted', { year: year });
        setText('report-tree-street', streetBits ? ' · ' + streetBits : '');
    }

    function showForm(show) {
        formEl.hidden = !show;
        byId('report-done').hidden = show;
        byId('report-steps').hidden = !show;
    }

    function open(context) {
        if (!panelEl || !formEl) return;
        var treePanel = global.ZurichTreePanel;
        if (treePanel && typeof treePanel.close === 'function') treePanel.close();
        var wf = global.ZurichWorkflowPanel;
        if (wf && typeof wf.close === 'function') wf.close();
        currentContext = context || null;
        formEl.reset();
        byId('sr-request-type').value = '';
        renderIssueCards();
        showForm(true);
        if (!currentContext) return;

        fillTree(currentContext);
        setValue('sr-address', t('map.status.lookingUp'));
        panelEl.hidden = false;
        panelEl.setAttribute('aria-hidden', 'false');
        showStep(1);
        checkExisting(currentContext.baumnummer);

        if (currentContext.lat != null && currentContext.lng != null) {
            reverseGeocode(Number(currentContext.lat), Number(currentContext.lng)).then(function (address) {
                if (currentContext) setValue('sr-address', address);
            });
        }
    }

    function close() {
        if (!panelEl) return;
        panelEl.hidden = true;
        panelEl.setAttribute('aria-hidden', 'true');
        currentContext = null;
        setMessage('');
        if (formEl) formEl.reset();
    }

    function buildPayload() {
        var ctx = currentContext || {};
        return {
            lat: Number(byId('sr-lat').value),
            lng: Number(byId('sr-lng').value),
            address: byId('sr-address').value.trim().slice(0, 512),
            firstName: byId('sr-first-name').value.trim(),
            lastName: byId('sr-last-name').value.trim(),
            email: byId('sr-email').value.trim(),
            phone: byId('sr-phone').value.trim() || null,
            requestType: byId('sr-request-type').value,
            description: byId('sr-description').value.trim() || null,
            linkedTreeBaumnummer: byId('sr-linked-tree').value.trim(),
            ogdSpeciesGerman: ctx.baumnamedeu || null,
            ogdSpeciesLatin: ctx.baumnamelat || null,
            ogdQuartier: ctx.quartier || null,
            ogdStreet: ctx.strasse || null,
            ogdObjectId: ctx.objectid != null ? Number(ctx.objectid) : null,
            ogdPlantingYear: ctx.pflanzjahr != null ? Number(ctx.pflanzjahr) : null,
            ogdCategory: ctx.kategorie || null,
            ogdStatus: ctx.status || null
        };
    }

    function showDone(srNumber) {
        lastCreatedSr = srNumber;
        showForm(false);
        setText('report-step-count', '');
        setText('report-done-ref', 'SR ' + srNumber);
        var track = byId('report-done-track');
        if (track) track.href = '/Track?sr=' + encodeURIComponent(srNumber);
        var wfBtn = byId('report-done-workflow');
        if (wfBtn) wfBtn.hidden = !(cfg && cfg.isAuthenticated);
        var h = byId('report-done');
        if (h) { var title = h.querySelector('h3'); if (title) { title.setAttribute('tabindex', '-1'); title.focus(); } }
    }

    function onSubmit(ev) {
        ev.preventDefault();
        if (step !== TOTAL) { next(); return; }
        if (!cfg || !cfg.srCreateUrl) { setMessage('SR API is not configured.', true); return; }

        var payload = buildPayload();
        for (var s = 2; s <= 3; s++) {
            var err = validateStep(s);
            if (err) { showStep(s); setMessage(err, true); return; }
        }
        if (!payload.linkedTreeBaumnummer) { showStep(1); setMessage('Linked Tree (Baumnummer) is required.', true); return; }

        var submitBtn = byId('sr-submit');
        if (submitBtn) submitBtn.disabled = true;
        setMessage(t('report.sending'));

        fetch(cfg.srCreateUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        })
            .then(function (r) { return r.json().then(function (body) { return { ok: r.ok, body: body }; }); })
            .then(function (result) {
                if (!result.ok || !result.body || !result.body.success) {
                    setMessage(parseApiError(result.body), true);
                    return;
                }
                setMessage('');
                if (global.ZurichMapMarkers && typeof global.ZurichMapMarkers.refresh === 'function') global.ZurichMapMarkers.refresh();
                showDone(result.body.srNumber);
            })
            .catch(function () { setMessage('Network error while creating service request.', true); })
            .finally(function () { if (submitBtn) submitBtn.disabled = false; });
    }

    function init(config) {
        cfg = config || global.ZURICH_MAP || {};
        if (!cfg.srListUrl) cfg.srListUrl = '/api/sr';
        panelEl = byId('sr-create-panel');
        formEl = byId('sr-create-form');
        messageEl = byId('sr-create-message');
        if (!panelEl || !formEl) return;

        populateRequestTypes();

        formEl.addEventListener('submit', onSubmit);
        byId('report-next').addEventListener('click', next);
        byId('report-back').addEventListener('click', function () { showStep(step - 1); });
        byId('sr-cancel').addEventListener('click', close);
        byId('sr-close').addEventListener('click', close);
        byId('report-done-close').addEventListener('click', close);
        byId('report-done-workflow').addEventListener('click', function () {
            var srNumber = lastCreatedSr;
            close();
            var wf = global.ZurichWorkflowPanel;
            if (srNumber && wf && typeof wf.openInspectionAfterCreate === 'function') wf.openInspectionAfterCreate(srNumber);
        });

        global.addEventListener('zurich:locale', function () {
            var api = global.ZurichI18n;
            if (api && panelEl) api.apply(panelEl);
            populateRequestTypes();
            if (!panelEl.hidden && !formEl.hidden) showStep(step);
        });
    }

    global.ZurichSrForm = {
        init: init,
        open: open,
        close: close
    };
}(window));
