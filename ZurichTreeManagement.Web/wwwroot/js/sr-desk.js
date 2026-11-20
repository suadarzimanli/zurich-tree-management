(function (global) {
    'use strict';

    var cfg = null;
    var items = [];
    var selectedSr = null;
    var selectedDetail = null;
    var currentInspection = null;
    var currentWorkOrder = null;
    var activeDetailRequestId = 0;
    var activeListRequestId = 0;
    var activeReloadRequestId = 0;

    var WORK_ORDER_TYPES = [
        'Unassigned', 'Pruning', 'Removal', 'Planting', 'Stump Grinding', 'Emergency Response', 'Other'
    ];

    function byId(id) { return document.getElementById(id); }
    function valueOrEmpty(v) { return v == null ? '' : String(v); }

    function setControlValue(id, value) {
        var el = byId(id);
        if (!el) return;
        el.value = valueOrEmpty(value);
    }

    function setControlText(id, value) {
        var el = byId(id);
        if (!el) return;
        el.textContent = valueOrEmpty(value);
    }

    function getControlValue(id) {
        var el = byId(id);
        return el ? el.value : '';
    }

    function fetchJson(url, options) {
        return fetch(url, options).then(function (r) {
            return r.text().then(function (text) {
                var body = null;
                if (text) {
                    try {
                        body = JSON.parse(text);
                    } catch (e) {
                        if (r.ok) throw new Error('Invalid JSON response');
                    }
                }
                if (!r.ok) throw new Error((body && body.error) || ('HTTP ' + r.status));
                return body || {};
            });
        });
    }

    function fetchJsonResult(url, options) {
        return fetch(url, options).then(function (r) {
            return r.text().then(function (text) {
                var body = {};
                if (text) {
                    try {
                        body = JSON.parse(text);
                    } catch (e) { /* ignore */ }
                }
                return { ok: r.ok, body: body };
            });
        });
    }

    function i18nApi() { return global.ZurichI18n || {}; }

    function todayIso() {
        var d = new Date();
        var y = d.getFullYear();
        var m = String(d.getMonth() + 1).padStart(2, '0');
        var day = String(d.getDate()).padStart(2, '0');
        return y + '-' + m + '-' + day;
    }

    function hasComment(a, b) {
        return Boolean((a || '').trim() || (b || '').trim());
    }

    function entityUrl(template, id) {
        return String(template || '')
            .replace('{srNumber}', String(id))
            .replace('{inspectionId}', String(id))
            .replace('{workOrderId}', String(id));
    }

    function translateInspectionStatus(status) {
        var api = i18nApi();
        return api.translateInspectionStatus ? api.translateInspectionStatus(status) : (status || '—');
    }

    function translateWorkOrderStatus(status) {
        var api = i18nApi();
        return api.translateWorkOrderStatus ? api.translateWorkOrderStatus(status) : (status || '—');
    }

    function translateWorkOrderType(type) {
        var api = i18nApi();
        return api.translateWorkOrderType ? api.translateWorkOrderType(type) : (type || '');
    }

    function translatePriority(value) {
        var api = i18nApi();
        return api.translatePriority ? api.translatePriority(value) : (value || '');
    }

    function t(key, vars) {
        var i18n = global.ZurichI18n;
        if (i18n && typeof i18n.t === 'function') return i18n.t(key, vars);
        return key;
    }

    function phaseLabel(phase) {
        // Same short labels as the journey bar (Received / Inspection / Work order / Closed)
        var map = {
            sr: 'phase.received',
            inspection: 'phase.inspection',
            workorder: 'phase.workorder',
            closed: 'phase.closed'
        };
        return t(map[phase] || 'phase.received');
    }

    function formatDate(iso) {
        if (!iso) return '—';
        try {
            var d = new Date(iso);
            if (isNaN(d.getTime())) return iso;
            return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
        } catch (e) {
            return iso;
        }
    }

    function setListStatus(text, isError) {
        var el = byId('sr-desk-list-status');
        if (!el) return;
        el.textContent = text || '';
        el.className = 'desk-queue__badge' + (isError ? ' desk-queue__badge--error' : '');
    }

    function setDetailMessage(text, isError) {
        var el = byId('sr-desk-detail-message');
        if (!el) return;
        el.textContent = text || '';
        el.className = 'desk-flash' + (isError ? ' desk-flash--error' : '');
        el.hidden = !text;
    }

    function toDateInputValue(iso) {
        if (!iso) return '';
        try {
            var d = new Date(iso);
            if (isNaN(d.getTime())) return String(iso).substring(0, 10);
            var y = d.getFullYear();
            var m = String(d.getMonth() + 1).padStart(2, '0');
            var day = String(d.getDate()).padStart(2, '0');
            return y + '-' + m + '-' + day;
        } catch (e) {
            return '';
        }
    }

    function activityUrl(template, id) {
        return (template || '/api/activities/sr/{srNumber}')
            .replace('{srNumber}', String(id))
            .replace('{activityId}', String(id));
    }

    function activityTypeLabel(type) {
        var key = 'desk.actType.' + (type || 'Note');
        var translated = t(key);
        return translated === key ? type : translated;
    }

    function activityStatusLabel(status) {
        var map = {
            Open: 'desk.actStatus.open',
            'In Progress': 'desk.actStatus.inProgress',
            Completed: 'desk.actStatus.completed',
            Cancelled: 'desk.actStatus.cancelled'
        };
        return t(map[status] || 'desk.actStatus.open');
    }

    function loadActivities(srNumber) {
        var planSection = byId('desk-activity-plan-section');
        var actSection = byId('desk-activities-section');
        if (!cfg.activitiesUrl) return Promise.resolve();

        return fetchJson(activityUrl(cfg.activitiesUrl, srNumber))
            .then(function (body) {
                renderPlan(body && body.plan);
                renderActivities((body && body.activities) || []);
                if (planSection) planSection.hidden = !(body && body.plan);
                if (actSection) actSection.hidden = false;
            })
            .catch(function () {
                if (planSection) planSection.hidden = true;
                if (actSection) actSection.hidden = false;
                renderActivities([]);
            });
    }

    function renderPlan(plan) {
        var nameEl = byId('desk-plan-name');
        var stepsEl = byId('desk-plan-steps');
        if (!stepsEl) return;

        if (!plan) {
            if (nameEl) nameEl.textContent = '';
            stepsEl.innerHTML = '';
            return;
        }

        if (nameEl) {
            nameEl.textContent = plan.planName + (plan.subArea ? ' · ' + plan.subArea : '');
        }

        stepsEl.innerHTML = '';
        (plan.steps || []).forEach(function (step) {
            var li = document.createElement('li');
            li.className = 'desk-plan-step';
            if (step.isCompleted) li.classList.add('desk-plan-step--done');
            if (step.isCurrent) li.classList.add('desk-plan-step--current');
            li.innerHTML = '<span class="desk-plan-step__order">' + step.stepOrder + '</span>'
                + '<span class="desk-plan-step__name">' + escapeHtml(step.name) + '</span>';
            stepsEl.appendChild(li);
        });
    }

    function renderActivities(activities) {
        var list = byId('desk-activities-list');
        if (!list) return;
        list.innerHTML = '';

        if (!activities.length) {
            var empty = document.createElement('p');
            empty.className = 'desk-activity-list__empty';
            empty.textContent = t('desk.noActivities');
            list.appendChild(empty);
            return;
        }

        activities.forEach(function (act) {
            var item = document.createElement('article');
            item.className = 'desk-activity';
            item.setAttribute('role', 'listitem');
            if (act.isSystemGenerated) item.classList.add('desk-activity--system');

            var statusClass = 'desk-activity__status--' + (act.status || 'Open').toLowerCase().replace(/\s+/g, '');
            var meta = formatDate(act.createdAtUtc);
            if (act.assignedTo) meta += ' · ' + act.assignedTo;
            if (act.dueDate) meta += ' · ' + t('desk.due') + ' ' + formatDate(act.dueDate);

            var actions = '';
            if (cfg.isAuthenticated && act.status !== 'Completed' && act.status !== 'Cancelled') {
                actions = '<button type="button" class="desk-activity__complete" data-activity-id="'
                    + act.activityId + '">' + escapeHtml(t('desk.completeActivity')) + '</button>';
                actions += ''
                    + '<div class="desk-activity__edit">'
                    + '<label><span>' + escapeHtml(t('desk.dueDate')) + '</span>'
                    + '<input type="date" class="desk-activity__due" data-activity-id="' + act.activityId
                    + '" value="' + toDateInputValue(act.dueDate) + '" /></label>'
                    + '<label><span>' + escapeHtml(t('field.assignedTo')) + '</span>'
                    + '<input type="text" class="desk-activity__assigned" list="assignee-list" data-activity-id="' + act.activityId
                    + '" value="' + escapeHtml(act.assignedTo || '') + '" maxlength="128" /></label>'
                    + '<button type="button" class="desk-activity__save" data-activity-id="' + act.activityId + '">'
                    + escapeHtml(t('desk.saveActivity')) + '</button>'
                    + '</div>';
            }

            item.innerHTML = ''
                + '<div class="desk-activity__head">'
                + '<span class="desk-activity__type">' + escapeHtml(activityTypeLabel(act.activityType)) + '</span>'
                + '<span class="desk-activity__status ' + statusClass + '">' + escapeHtml(activityStatusLabel(act.status)) + '</span>'
                + '</div>'
                + '<h4 class="desk-activity__subject">' + escapeHtml(act.subject) + '</h4>'
                + (act.notes ? '<p class="desk-activity__notes">' + escapeHtml(act.notes) + '</p>' : '')
                + '<p class="desk-activity__meta">' + escapeHtml(meta) + '</p>'
                + actions;

            var completeBtn = item.querySelector('.desk-activity__complete');
            if (completeBtn) {
                completeBtn.addEventListener('click', function () {
                    completeActivity(act.activityId);
                });
            }

            var saveBtn = item.querySelector('.desk-activity__save');
            if (saveBtn) {
                saveBtn.addEventListener('click', function () {
                    var dueEl = item.querySelector('.desk-activity__due');
                    var assignedEl = item.querySelector('.desk-activity__assigned');
                    updateActivityFields(act.activityId, {
                        dueDate: dueEl && dueEl.value ? dueEl.value : null,
                        assignedTo: assignedEl ? assignedEl.value.trim() : null
                    });
                });
            }

            list.appendChild(item);
        });
    }

    function updateActivityFields(activityId, fields) {
        if (!cfg.isAuthenticated || !cfg.activityUpdateUrl) return;

        fetchJson(activityUrl(cfg.activityUpdateUrl, activityId), {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(fields)
        })
            .then(function () {
                if (selectedSr) return loadActivities(selectedSr);
            })
            .catch(function () {
                setDetailMessage(t('desk.activityError'), true);
            });
    }

    function completeActivity(activityId) {
        if (!cfg.isAuthenticated || !cfg.activityUpdateUrl) return;

        fetchJson(activityUrl(cfg.activityUpdateUrl, activityId), {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'Completed' })
        })
            .then(function () {
                if (selectedSr) return loadActivities(selectedSr);
            })
            .catch(function () {
                setDetailMessage(t('desk.activityError'), true);
            });
    }

    function postNote() {
        if (!cfg.isAuthenticated || !selectedSr) return;

        var subject = byId('desk-activity-subject');
        var notes = byId('desk-activity-notes');
        var assigned = byId('desk-activity-assigned');
        var due = byId('desk-activity-due');
        var subjectVal = subject && subject.value.trim();
        if (!subjectVal) return;

        var payload = {
            subject: subjectVal,
            notes: notes ? notes.value.trim() : '',
            assignedTo: assigned ? assigned.value.trim() : '',
            dueDate: due && due.value ? due.value : null
        };

        fetchJson(activityUrl(cfg.activitiesUrl, selectedSr), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        })
            .then(function () {
                if (subject) subject.value = '';
                if (notes) notes.value = '';
                if (assigned) assigned.value = '';
                if (due) due.value = '';
                var addPanel = byId('desk-add-activity');
                if (addPanel) addPanel.hidden = true;
                return loadActivities(selectedSr);
            })
            .catch(function () {
                setDetailMessage(t('desk.activityError'), true);
            });
    }

    function buildListUrl() {
        var base = (cfg && cfg.srListUrl) || '/api/sr';
        var params = new URLSearchParams();
        var search = byId('desk-filter-search');
        var status = byId('desk-filter-status');
        var phase = byId('desk-filter-phase');
        var subarea = byId('desk-filter-subarea');
        var priority = byId('desk-filter-priority');

        if (search && search.value.trim()) params.set('search', search.value.trim());
        if (status && status.value) params.set('status', status.value);
        if (phase && phase.value) params.set('phase', phase.value);
        if (subarea && subarea.value) params.set('subArea', subarea.value);
        if (priority && priority.value) params.set('priority', priority.value);

        var qs = params.toString();
        return qs ? base + '?' + qs : base;
    }

    /** Queue overview (caseload research: show volume, urgency and aging up front). */
    function renderKpis() {
        var el = byId('desk-kpis');
        var ph = global.ZurichPhase;
        if (!el) return;
        var open = items.filter(function (r) { return r.phase !== 'closed'; });
        var count = function (fn) { return items.filter(fn).length; };
        var oldest = open.reduce(function (m, r) { return Math.max(m, ph ? ph.daysOpen(r.openedAtUtc, r.closedDate) : 0); }, 0);
        var tiles = [
            ['kpi.open', open.length, ''],
            ['kpi.urgent', open.filter(function (r) { return r.priority === 'Urgent'; }).length, 'kpi--urgent'],
            ['kpi.inspection', count(function (r) { return r.phase === 'inspection'; }), 'kpi--inspection'],
            ['kpi.workorder', count(function (r) { return r.phase === 'workorder'; }), 'kpi--workorder'],
            ['kpi.closed', count(function (r) { return r.phase === 'closed'; }), 'kpi--closed'],
            ['kpi.oldest', open.length ? t('kpi.days', { days: oldest }) : '—', oldest > 14 ? 'kpi--stale' : '']
        ];
        el.innerHTML = tiles.map(function (k) {
            return '<div class="kpi ' + k[2] + '"><span class="kpi__value">' + escapeHtml(k[1]) + '</span><span class="kpi__label">' + escapeHtml(t(k[0])) + '</span></div>';
        }).join('');
    }

    function renderList() {
        renderKpis();
        var body = byId('sr-desk-table-body');
        if (!body) return;
        body.innerHTML = '';

        if (!items.length) {
            var empty = document.createElement('p');
            empty.className = 'desk-sr-list__empty';
            empty.textContent = t('desk.noResults');
            body.appendChild(empty);
            return;
        }

        items.forEach(function (row) {
            var phase = row.phase || 'sr';
            var card = document.createElement('article');
            card.className = 'desk-sr-card desk-sr-card--' + phase;
            if (selectedSr === row.srNumber) card.classList.add('desk-sr-card--selected');
            card.dataset.sr = String(row.srNumber);
            card.tabIndex = 0;
            card.setAttribute('role', 'listitem');
            card.setAttribute('aria-label', 'SR ' + row.srNumber);

            var reqApi = i18nApi();
            var title = row.requestType ? (reqApi.translateRequestType ? reqApi.translateRequestType(row.requestType) : row.requestType) : (row.subArea || '');
            var subParts = [];
            if (row.linkedTreeBaumnummer) subParts.push(t('field.linkedTree') + ' ' + row.linkedTreeBaumnummer);
            if (row.address) subParts.push(String(row.address).split(',')[0]);
            if (row.contactName) subParts.push(row.contactName);
            if (row.assignedTo) subParts.push(row.assignedTo);
            var ph = global.ZurichPhase;
            var ageText = ph ? ph.ageText(row.openedAtUtc, row.closedDate) : formatDate(row.openedAtUtc);
            var stale = ph && phase !== 'closed' && ph.daysOpen(row.openedAtUtc, row.closedDate) > 14;

            var priorityHtml = row.priority === 'Urgent'
                ? '<span class="desk-sr-card__urgent">' + escapeHtml(t('filter.priority.urgent')) + '</span>'
                : '';

            card.innerHTML = ''
                + '<div class="desk-sr-card__accent" aria-hidden="true"></div>'
                + '<div class="desk-sr-card__body">'
                + '<div class="desk-sr-card__row">'
                + '<span class="desk-sr-card__id">SR ' + row.srNumber + '</span>'
                + '<span class="desk-phase-badge desk-phase-badge--' + phase + '">' + phaseLabel(phase) + '</span>'
                + '</div>'
                + '<p class="desk-sr-card__title">' + escapeHtml(title) + priorityHtml + '</p>'
                + '<p class="desk-sr-card__meta">' + escapeHtml(subParts.join(' · ')) + '</p>'
                + '<p class="desk-sr-card__age' + (stale ? ' desk-sr-card__age--stale' : '') + '">' + escapeHtml(ageText) + '</p>'
                + '</div>';
            if (row.priority === 'Urgent') card.classList.add('desk-sr-card--urgent');

            card.addEventListener('click', function () { selectSr(row.srNumber); });
            card.addEventListener('keydown', function (ev) {
                if (ev.key === 'Enter' || ev.key === ' ') {
                    ev.preventDefault();
                    selectSr(row.srNumber);
                }
            });
            body.appendChild(card);
        });
    }

    function escapeHtml(text) {
        var div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function loadList() {
        var requestId = ++activeListRequestId;
        setListStatus(t('desk.loading'));
        return fetchJson(buildListUrl())
            .then(function (body) {
                if (requestId !== activeListRequestId) return;
                items = (body && body.items) ? body.items : [];
                renderList();
                setListStatus(t('desk.listCount', { count: items.length }));
            })
            .catch(function () {
                if (requestId !== activeListRequestId) return;
                items = [];
                renderList();
                setListStatus(t('desk.loadError'), true);
            });
    }

    function srUrl(template, srNumber) {
        return (template || '/api/sr/{srNumber}').replace('{srNumber}', String(srNumber));
    }

    function selectSr(srNumber) {
        var requestId = ++activeDetailRequestId;
        selectedSr = srNumber;
        selectedDetail = null;
        currentInspection = null;
        currentWorkOrder = null;
        showDeskInspectionEmpty(true);
        showDeskWorkOrderEmpty(true);
        renderList();
        setDetailMessage(t('desk.loadingDetail'));

        var empty = byId('sr-desk-detail-empty');
        var formWrap = byId('sr-desk-detail-form');
        if (empty) empty.hidden = true;
        if (formWrap) formWrap.hidden = false;

        var actSection = byId('desk-activities-section');
        if (actSection) actSection.hidden = false;

        return fetchJson(srUrl(cfg.srGetUrl, srNumber))
            .then(function (detail) {
                if (requestId !== activeDetailRequestId || selectedSr !== srNumber) return;
                selectedDetail = detail;
                populateDetail(detail);
                setDetailMessage('');
                return loadActivities(srNumber);
            })
            .catch(function () {
                if (requestId !== activeDetailRequestId) return;
                selectedSr = null;
                selectedDetail = null;
                renderList();
                var emptyPanel = byId('sr-desk-detail-empty');
                var formPanel = byId('sr-desk-detail-form');
                if (emptyPanel) emptyPanel.hidden = false;
                if (formPanel) formPanel.hidden = true;
                if (actSection) actSection.hidden = true;
                setDetailMessage(t('desk.loadDetailError'), true);
            });
    }

    function populateDetail(d) {
        var numEl = byId('sr-desk-detail-number');
        if (numEl) numEl.textContent = d.srNumber;

        var phase = resolvePhaseFromDetail(d);
        var badge = byId('sr-desk-detail-phase');
        if (badge) {
            badge.className = 'desk-phase-badge desk-phase-badge--' + phase;
            badge.textContent = phaseLabel(phase);
        }

        var heroMeta = byId('desk-hero-meta');
        if (heroMeta) {
            var metaParts = [];
            if (d.subArea) metaParts.push(d.subArea);
            if (d.linkedTreeBaumnummer) metaParts.push(t('field.linkedTree') + ' ' + d.linkedTreeBaumnummer);
            if (d.openedAtUtc) metaParts.push(formatDate(d.openedAtUtc));
            if (global.ZurichPhase) metaParts.push(global.ZurichPhase.ageText(d.openedAtUtc, d.closedDate));
            heroMeta.textContent = metaParts.join(' · ');
        }
        if (global.ZurichPhase) global.ZurichPhase.render(byId('desk-journey'), phase);
        var hiddenNote = byId('desk-contact-hidden');
        if (hiddenNote) hiddenNote.hidden = !d.contactRedacted;
        var contactGrid = byId('desk-contact-grid');
        if (contactGrid) contactGrid.hidden = !!d.contactRedacted;

        setControlValue('desk-sr-status', d.status || 'In Progress');
        setControlValue('desk-sr-substatus', d.subStatus);
        setControlValue('desk-sr-priority', d.priority || 'Normal');
        setControlValue('desk-sr-assigned', d.assignedTo);
        setControlValue('desk-sr-request-type', d.requestType);
        setControlValue('desk-sr-subarea', d.subArea);
        setControlValue('desk-sr-description', d.description);
        setControlValue('desk-sr-address', d.address);
        setControlValue('desk-sr-lat', d.lat != null ? String(d.lat) : '');
        setControlValue('desk-sr-lng', d.lng != null ? String(d.lng) : '');
        setControlValue('desk-sr-first', d.firstName);
        setControlValue('desk-sr-last', d.lastName);
        setControlValue('desk-sr-email', d.email);
        setControlValue('desk-sr-phone', d.phone);
        setControlValue('desk-sr-tree', d.linkedTreeBaumnummer);
        setControlValue('desk-sr-species', d.ogdSpeciesGerman);
        setControlValue('desk-sr-street', d.ogdStreet);
        setControlValue('desk-sr-quartier', d.ogdQuartier);
        setControlText('desk-sr-insp-status', d.inspection ? translateInspectionStatus(d.inspection.status) : '—');
        setControlText('desk-sr-wo-status', d.workOrder ? translateWorkOrderStatus(d.workOrder.status) : '—');
        setControlText('desk-sr-opened', formatDate(d.openedAtUtc));
        setControlText('desk-sr-closed', formatDate(d.closedDate));

        bindDeskWorkflow(d);

        var mapLink = byId('desk-sr-map-link');
        if (mapLink) mapLink.href = '/?openSr=' + encodeURIComponent(String(d.srNumber));

        setReadOnlyMode(!cfg.isAuthenticated);

        var addToggle = byId('desk-activity-add-toggle');
        var addPanel = byId('desk-add-activity');
        if (addToggle) addToggle.hidden = !cfg.isAuthenticated;
        if (addPanel) addPanel.hidden = true;
    }

    function populateDeskWorkOrderTypes() {
        var select = byId('desk-workorder-type');
        if (!select) return;
        var current = select.value;
        select.innerHTML = '';
        WORK_ORDER_TYPES.forEach(function (label) {
            var opt = document.createElement('option');
            opt.value = label;
            opt.textContent = translateWorkOrderType(label);
            select.appendChild(opt);
        });
        if (current) select.value = current;
    }

    function toggleDeskResolutionFields() {
        var statusEl = byId('desk-inspection-status');
        var row = byId('desk-workorder-type-row');
        if (!statusEl || !row) return;
        row.hidden = String(statusEl.value).toLowerCase() !== 'resolution';
    }

    function setDeskInspectionStatusOptions(status) {
        var select = byId('desk-inspection-status');
        if (!select) return;
        select.innerHTML = '';
        var options = ['Created'];
        if (String(status).toLowerCase() === 'created') {
            options.push('No Work', 'Resolution');
        } else {
            options.push(status);
        }
        options.forEach(function (label) {
            var opt = document.createElement('option');
            opt.value = label;
            opt.textContent = translateInspectionStatus(label);
            select.appendChild(opt);
        });
        select.value = status || 'Created';
        select.disabled = String(status).toLowerCase() !== 'created';
        toggleDeskResolutionFields();
    }

    function setDeskWorkOrderStatusOptions(status) {
        var select = byId('desk-workorder-status');
        if (!select) return;
        select.innerHTML = '';
        var options = ['Created'];
        if (String(status).toLowerCase() === 'created') options.push('Resolved');
        else options.push(status);
        options.forEach(function (label) {
            var opt = document.createElement('option');
            opt.value = label;
            opt.textContent = translateWorkOrderStatus(label);
            select.appendChild(opt);
        });
        select.value = status || 'Created';
        select.disabled = String(status).toLowerCase() !== 'created';
    }

    function showDeskInspectionEmpty(show) {
        var empty = byId('desk-inspection-empty');
        var form = byId('desk-inspection-form');
        var createBtn = byId('desk-create-inspection');
        if (empty) empty.hidden = !show;
        if (form) form.hidden = show;
        if (createBtn) createBtn.hidden = !cfg.isAuthenticated;
    }

    function showDeskWorkOrderEmpty(show) {
        var empty = byId('desk-workorder-empty');
        var form = byId('desk-workorder-form');
        if (empty) empty.hidden = !show;
        if (form) form.hidden = show;
    }

    function bindDeskInspection(inspection, sr) {
        currentInspection = inspection;
        showDeskInspectionEmpty(false);
        setControlValue('desk-inspection-id', inspection.inspectionId);
        setControlValue('desk-inspection-sr', inspection.srNumber);
        setControlValue('desk-inspection-tree', inspection.linkedTreeBaumnummer);
        setControlValue('desk-inspection-subarea', (sr && sr.subArea) || '');
        setDeskInspectionStatusOptions(inspection.status);
        setControlValue('desk-inspection-inspector', inspection.inspector);
        setControlValue('desk-inspection-comment', inspection.comment);
        setControlValue('desk-inspection-internal', inspection.internalComment);
        setControlValue('desk-workorder-type', inspection.workOrderType || 'Unassigned');
        setControlValue('desk-inspection-findings', inspection.findings);
        setControlValue('desk-inspection-priority', inspection.priority || (sr && sr.priority) || 'Normal');
        var ehapEl = byId('desk-inspection-ehap');
        if (ehapEl) ehapEl.checked = Boolean(inspection.ehap);
        var inspectDate = inspection.inspectDate ? toDateInputValue(inspection.inspectDate) : '';
        if (!inspectDate && String(inspection.status).toLowerCase() === 'created') inspectDate = todayIso();
        setControlValue('desk-inspection-date', inspectDate);
        var saveBtn = byId('desk-inspection-save');
        if (saveBtn) saveBtn.disabled = !cfg.isAuthenticated || String(inspection.status).toLowerCase() !== 'created';
        toggleDeskResolutionFields();
    }

    function bindDeskWorkOrder(workOrder) {
        currentWorkOrder = workOrder;
        showDeskWorkOrderEmpty(false);
        setControlValue('desk-workorder-id', workOrder.workOrderId);
        setControlValue('desk-workorder-sr', workOrder.srNumber);
        setControlValue('desk-workorder-tree', workOrder.linkedTreeBaumnummer);
        setDeskWorkOrderStatusOptions(workOrder.status);
        setControlValue('desk-workorder-type-wo', translateWorkOrderType(workOrder.workOrderType || 'Unassigned'));
        setControlValue('desk-workorder-priority', translatePriority(workOrder.priority || 'Normal'));
        setControlValue('desk-workorder-inspby', workOrder.inspBy);
        setControlValue('desk-workorder-start', formatDate(workOrder.startDate)) ;
        setControlValue('desk-workorder-contractor', workOrder.contractor);
        setControlValue('desk-workorder-assigned', workOrder.assignedTo);
        setControlValue('desk-workorder-project', workOrder.projectCode);
        setControlValue('desk-workorder-field', workOrder.fieldComments);
        setControlValue('desk-workorder-internal', workOrder.internalComment);
        var workDate = workOrder.workDate ? toDateInputValue(workOrder.workDate) : '';
        if (!workDate && String(workOrder.status).toLowerCase() === 'created') workDate = todayIso();
        setControlValue('desk-workorder-date', workDate);
        var saveBtn = byId('desk-workorder-save');
        if (saveBtn) saveBtn.disabled = !cfg.isAuthenticated || String(workOrder.status).toLowerCase() !== 'created';
    }

    function bindDeskWorkflow(d) {
        if (d.inspection) bindDeskInspection(d.inspection, d);
        else {
            currentInspection = null;
            showDeskInspectionEmpty(true);
        }
        if (d.workOrder) bindDeskWorkOrder(d.workOrder);
        else {
            currentWorkOrder = null;
            showDeskWorkOrderEmpty(true);
        }
    }

    function reloadSelectedSr(preferredTab) {
        if (!selectedSr) return Promise.resolve();
        var srNumber = selectedSr;
        var requestId = ++activeReloadRequestId;
        return fetchJson(srUrl(cfg.srGetUrl, srNumber))
            .then(function (detail) {
                if (requestId !== activeReloadRequestId || selectedSr !== srNumber) return;
                selectedDetail = detail;
                populateDetail(detail);
                if (preferredTab) showDeskTab(preferredTab);
                return loadList().then(function () {
                    if (requestId !== activeReloadRequestId || selectedSr !== srNumber) return;
                    renderList();
                    return loadActivities(selectedSr);
                });
            });
    }

    function restoreInspectionSaveButton(btn) {
        if (!btn) return;
        btn.disabled = !cfg.isAuthenticated || !currentInspection
            || String(currentInspection.status).toLowerCase() !== 'created';
    }

    function restoreWorkOrderSaveButton(btn) {
        if (!btn) return;
        btn.disabled = !cfg.isAuthenticated || !currentWorkOrder
            || String(currentWorkOrder.status).toLowerCase() !== 'created';
    }

    function onDeskCreateInspection() {
        if (!cfg.isAuthenticated || !selectedSr || !cfg.inspectionCreateUrl) return;
        var btn = byId('desk-create-inspection');
        if (btn) btn.disabled = true;
        setDetailMessage(t('desk.creatingInspection'));
        fetchJsonResult(entityUrl(cfg.inspectionCreateUrl, selectedSr), { method: 'POST' })
            .then(function (result) {
                if (!result.ok || !result.body.success) {
                    setDetailMessage((result.body && result.body.error) || t('desk.createInspectionError'), true);
                    if (result.body && result.body.inspection) {
                        bindDeskInspection(result.body.inspection, selectedDetail);
                    }
                    return;
                }
                setDetailMessage(t('desk.inspectionCreated'));
                return reloadSelectedSr('inspection');
            })
            .catch(function () { setDetailMessage(t('desk.createInspectionError'), true); })
            .finally(function () { if (btn) btn.disabled = false; });
    }

    function onDeskInspectionSubmit(ev) {
        ev.preventDefault();
        if (!cfg.isAuthenticated || !currentInspection || !cfg.inspectionUpdateUrl) return;

        var status = getControlValue('desk-inspection-status');
        var comment = getControlValue('desk-inspection-comment').trim();
        var internalComment = getControlValue('desk-inspection-internal').trim();
        var statusLower = String(status).toLowerCase();

        if (statusLower === 'no work' || statusLower === 'resolution') {
            if (!hasComment(comment, internalComment)) {
                setDetailMessage(t('desk.inspCommentRequired'), true);
                return;
            }
            if (statusLower === 'resolution') {
                var woType = getControlValue('desk-workorder-type');
                if (!woType || woType === 'Unassigned') {
                    setDetailMessage(t('desk.woTypeRequired'), true);
                    return;
                }
            }
        }

        var ehapEl = byId('desk-inspection-ehap');
        var payload = {
            status: status,
            inspector: getControlValue('desk-inspection-inspector').trim() || null,
            findings: getControlValue('desk-inspection-findings') || null,
            priority: getControlValue('desk-inspection-priority') || null,
            ehap: ehapEl ? ehapEl.checked : false,
            comment: comment || null,
            internalComment: internalComment || null,
            workOrderType: getControlValue('desk-workorder-type') || null,
            inspectDate: getControlValue('desk-inspection-date') || null
        };

        var btn = byId('desk-inspection-save');
        if (btn) btn.disabled = true;
        setDetailMessage(t('desk.savingInspection'));
        fetchJsonResult(entityUrl(cfg.inspectionUpdateUrl, currentInspection.inspectionId), {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        })
            .then(function (result) {
                if (!result.ok || !result.body.success) {
                    setDetailMessage((result.body && result.body.error) || t('desk.saveInspectionError'), true);
                    return;
                }
                if (result.body.workOrder) {
                    setDetailMessage(t('desk.inspectionResolved'));
                    return reloadSelectedSr('workorder');
                }
                if (statusLower === 'no work') {
                    setDetailMessage(t('desk.inspectionNoWork'));
                } else {
                    setDetailMessage(t('desk.inspectionSaved'));
                }
                return reloadSelectedSr('inspection');
            })
            .catch(function () { setDetailMessage(t('desk.saveInspectionError'), true); })
            .finally(function () { restoreInspectionSaveButton(btn); });
    }

    function onDeskWorkOrderSubmit(ev) {
        ev.preventDefault();
        if (!cfg.isAuthenticated || !currentWorkOrder || !cfg.workOrderUpdateUrl) return;
        if (String(getControlValue('desk-workorder-status')).toLowerCase() !== 'resolved') {
            setDetailMessage(t('desk.woResolveRequired'), true);
            return;
        }

        var fieldComments = getControlValue('desk-workorder-field').trim();
        var internalComment = getControlValue('desk-workorder-internal').trim();
        var workDate = getControlValue('desk-workorder-date');
        if (!workDate) {
            setDetailMessage(t('desk.woDateRequired'), true);
            return;
        }
        if (!hasComment(fieldComments, internalComment)) {
            setDetailMessage(t('desk.woCommentRequired'), true);
            return;
        }

        var payload = {
            status: 'Resolved',
            contractor: getControlValue('desk-workorder-contractor').trim() || null,
            assignedTo: getControlValue('desk-workorder-assigned').trim() || null,
            projectCode: getControlValue('desk-workorder-project').trim() || null,
            fieldComments: fieldComments || null,
            internalComment: internalComment || null,
            workDate: workDate
        };

        var btn = byId('desk-workorder-save');
        if (btn) btn.disabled = true;
        setDetailMessage(t('desk.savingWorkOrder'));
        fetchJsonResult(entityUrl(cfg.workOrderUpdateUrl, currentWorkOrder.workOrderId), {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        })
            .then(function (result) {
                if (!result.ok || !result.body.success) {
                    setDetailMessage((result.body && result.body.error) || t('desk.saveWorkOrderError'), true);
                    return;
                }
                setDetailMessage(t('desk.workOrderResolved'));
                return reloadSelectedSr('workorder');
            })
            .catch(function () { setDetailMessage(t('desk.saveWorkOrderError'), true); })
            .finally(function () { restoreWorkOrderSaveButton(btn); });
    }

    function resolvePhaseFromDetail(d) {
        if (d.status === 'Closed') return 'closed';
        if (d.workOrder && d.workOrder.status === 'Created') return 'workorder';
        if (d.inspection && d.inspection.status === 'Created') return 'inspection';
        return 'sr';
    }

    function setReadOnlyMode(readonly) {
        var banner = byId('sr-desk-readonly-banner');
        var saveBtn = byId('desk-sr-save');
        if (banner) banner.hidden = !readonly;
        if (saveBtn) saveBtn.disabled = readonly;

        var editable = [
            'desk-sr-status', 'desk-sr-substatus', 'desk-sr-priority', 'desk-sr-assigned',
            'desk-sr-description', 'desk-sr-address', 'desk-sr-first', 'desk-sr-last',
            'desk-sr-email', 'desk-sr-phone',
            'desk-inspection-inspector', 'desk-inspection-findings', 'desk-inspection-priority',
            'desk-inspection-comment', 'desk-inspection-internal',
            'desk-workorder-contractor', 'desk-workorder-assigned', 'desk-workorder-project',
            'desk-workorder-field', 'desk-workorder-internal'
        ];
        editable.forEach(function (id) {
            var el = byId(id);
            if (!el) return;
            el.readOnly = readonly && el.tagName === 'INPUT' && el.type === 'text';
            el.disabled = readonly && (el.tagName === 'SELECT' || el.tagName === 'TEXTAREA'
                || (el.tagName === 'INPUT' && el.type !== 'text'));
        });

        ['desk-inspection-status', 'desk-inspection-date', 'desk-inspection-ehap', 'desk-workorder-type',
            'desk-inspection-save', 'desk-create-inspection', 'desk-workorder-status', 'desk-workorder-date',
            'desk-workorder-save'].forEach(function (id) {
            var el = byId(id);
            if (!el) return;
            if (id === 'desk-inspection-save' && currentInspection) {
                el.disabled = readonly || String(currentInspection.status).toLowerCase() !== 'created';
            } else if (id === 'desk-workorder-save' && currentWorkOrder) {
                el.disabled = readonly || String(currentWorkOrder.status).toLowerCase() !== 'created';
            } else if (id === 'desk-create-inspection') {
                el.hidden = readonly;
            } else {
                el.disabled = readonly;
            }
        });
    }

    function collectUpdatePayload() {
        return {
            status: getControlValue('desk-sr-status'),
            subStatus: getControlValue('desk-sr-substatus'),
            priority: getControlValue('desk-sr-priority'),
            assignedTo: getControlValue('desk-sr-assigned'),
            description: getControlValue('desk-sr-description'),
            address: getControlValue('desk-sr-address'),
            firstName: getControlValue('desk-sr-first'),
            lastName: getControlValue('desk-sr-last'),
            email: getControlValue('desk-sr-email'),
            phone: getControlValue('desk-sr-phone')
        };
    }

    function saveDetail(ev) {
        ev.preventDefault();
        if (!cfg.isAuthenticated || !selectedSr) return;

        setDetailMessage(t('desk.saving'));
        fetchJson(srUrl(cfg.srUpdateUrl, selectedSr), {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(collectUpdatePayload())
        })
            .then(function (detail) {
                selectedDetail = detail;
                populateDetail(detail);
                setDetailMessage(t('desk.saved'));
                return loadList().then(function () {
                    selectedSr = detail.srNumber;
                    renderList();
                }).then(function () {
                    return loadActivities(detail.srNumber);
                });
            })
            .catch(function (err) {
                setDetailMessage(err.message || t('desk.saveError'), true);
            });
    }

    function showDeskTab(tabId) {
        var tabs = document.querySelectorAll('.desk-tab');
        var panels = document.querySelectorAll('.desk-tab-panel');
        tabs.forEach(function (tab) {
            var active = tab.getAttribute('data-desk-tab') === tabId;
            tab.classList.toggle('desk-tab--active', active);
            tab.setAttribute('aria-selected', active ? 'true' : 'false');
        });
        panels.forEach(function (panel) {
            var match = panel.id === 'desk-tab-' + tabId;
            panel.hidden = !match;
        });
    }

    function bindEvents() {
        var applyBtn = byId('desk-filter-apply');
        if (applyBtn) applyBtn.addEventListener('click', loadList);

        var filterToggle = byId('desk-filter-toggle');
        var filterPanel = byId('desk-filters-panel');
        if (filterToggle && filterPanel) {
            filterToggle.addEventListener('click', function () {
                var expanded = filterToggle.getAttribute('aria-expanded') === 'true';
                filterToggle.setAttribute('aria-expanded', expanded ? 'false' : 'true');
                filterPanel.hidden = expanded;
                filterToggle.classList.toggle('desk-btn--active', !expanded);
            });
        }

        document.querySelectorAll('.desk-tab').forEach(function (tab) {
            tab.addEventListener('click', function () {
                showDeskTab(tab.getAttribute('data-desk-tab'));
            });
        });

        var search = byId('desk-filter-search');
        if (search) {
            search.addEventListener('keydown', function (ev) {
                if (ev.key === 'Enter') {
                    ev.preventDefault();
                    loadList();
                }
            });
        }

        var form = byId('sr-desk-form');
        if (form) form.addEventListener('submit', saveDetail);

        var addToggle = byId('desk-activity-add-toggle');
        var addPanel = byId('desk-add-activity');
        if (addToggle && addPanel) {
            addToggle.addEventListener('click', function () {
                addPanel.hidden = !addPanel.hidden;
            });
        }

        var addBtn = byId('desk-activity-add-btn');
        if (addBtn) addBtn.addEventListener('click', postNote);

        var inspStatus = byId('desk-inspection-status');
        if (inspStatus) inspStatus.addEventListener('change', toggleDeskResolutionFields);
        var inspForm = byId('desk-inspection-form');
        if (inspForm) inspForm.addEventListener('submit', onDeskInspectionSubmit);
        var woForm = byId('desk-workorder-form');
        if (woForm) woForm.addEventListener('submit', onDeskWorkOrderSubmit);
        var createInsp = byId('desk-create-inspection');
        if (createInsp) createInsp.addEventListener('click', onDeskCreateInspection);

        global.addEventListener('zurich:locale', function () {
            populateDeskWorkOrderTypes();
            renderList();
            if (selectedDetail) populateDetail(selectedDetail);
            if (selectedSr) loadActivities(selectedSr);
            if (global.ZurichI18n) global.ZurichI18n.apply(document.body);
        });
    }

    function parseInitialSr() {
        var params = new URLSearchParams(window.location.search);
        var sr = params.get('sr') || params.get('openSr');
        if (!sr) return { sr: null, tab: null };
        var n = parseInt(sr, 10);
        var tab = params.get('tab');
        return { sr: n > 0 ? n : null, tab: tab };
    }

    function init() {
        cfg = global.ZURICH_DESK || {};
        cfg.isAuthenticated = cfg.isAuthenticated === true || cfg.isAuthenticated === 'true';
        populateDeskWorkOrderTypes();
        bindEvents();

        var assignees = global.ZurichAssignees;
        if (assignees && typeof assignees.init === 'function') {
            assignees.init({
                assigneesUrl: cfg.assigneesUrl,
                datalistIds: ['assignee-list']
            });
        }

        loadList().then(function () {
            var initial = parseInitialSr();
            if (initial.sr) {
                selectSr(initial.sr).then(function () {
                    if (initial.tab) showDeskTab(initial.tab);
                });
            }
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
}(window));
