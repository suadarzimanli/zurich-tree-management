(function (global) {
    'use strict';

    var panelEl = null;
    var messageEl = null;
    var cfg = null;
    var currentSr = null;
    var currentInspection = null;
    var currentWorkOrder = null;
    var activeTab = 'sr';
    var activeSrRequestId = 0;

    var WORK_ORDER_TYPES = [
        'Unassigned', 'Pruning', 'Removal', 'Planting', 'Stump Grinding', 'Emergency Response', 'Other'
    ];

    function byId(id) { return document.getElementById(id); }

    function i18nApi() { return global.ZurichI18n || {}; }

    function setMessage(text, isError) {
        if (!messageEl) return;
        messageEl.textContent = text || '';
        messageEl.className = 'side-panel__message' + (isError ? ' side-panel__message--error' : text ? ' side-panel__message--success' : '');
    }

    function fillField(id, value) {
        var el = byId(id);
        if (el) el.value = value == null ? '' : String(value);
    }

    function formatDate(value) {
        if (!value) return '';
        return String(value).substring(0, 10);
    }

    function formatDateTime(value) {
        if (!value) return '';
        var d = new Date(value);
        if (isNaN(d.getTime())) return String(value).substring(0, 10);
        return d.toISOString().substring(0, 10);
    }

    function todayIso() {
        var d = new Date();
        var y = d.getFullYear();
        var m = String(d.getMonth() + 1).padStart(2, '0');
        var day = String(d.getDate()).padStart(2, '0');
        return y + '-' + m + '-' + day;
    }

    function isAuth() {
        return cfg && (cfg.isAuthenticated === true || cfg.isAuthenticated === 'true');
    }

    function refreshMapMarkers() {
        var markers = global.ZurichMapMarkers;
        if (!markers || !markers.refresh) return;
        var fp = global.ZurichFilterPanel;
        if (fp && typeof fp.readFilters === 'function' && typeof fp.buildMarkersUrl === 'function') {
            markers.refresh(fp.buildMarkersUrl(fp.readFilters()));
        } else if (cfg && cfg.mapMarkersUrl) {
            markers.refresh(cfg.mapMarkersUrl);
        }
    }

    function hasComment(a, b) {
        return Boolean((a || '').trim() || (b || '').trim());
    }

    function t(key, vars) {
        var api = i18nApi();
        if (api.t) return api.t(key, vars);
        return key;
    }

    function activityTypeLabel(type) {
        var key = 'desk.actType.' + (type || 'Note');
        var label = t(key);
        return label === key ? type : label;
    }

    function loadWorkflowActivities(srNumber) {
        if (!cfg.activitiesUrl || !srNumber) return Promise.resolve();

        var url = cfg.activitiesUrl.replace('{srNumber}', String(srNumber));
        return fetch(url)
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (body) {
                renderWorkflowActivities(body && body.plan, (body && body.activities) || []);
            })
            .catch(function () {
                renderWorkflowActivities(null, []);
            });
    }

    function renderWorkflowActivities(plan, activities) {
        var planEl = byId('wf-plan-current');
        var listEl = byId('wf-activities-open');
        var emptyEl = byId('wf-activities-empty');
        var deskLink = byId('wf-desk-link');
        if (!listEl) return;

        if (deskLink && currentSr) {
            deskLink.href = (cfg.serviceDeskPath || '/ServiceRequests')
                + '?sr=' + encodeURIComponent(String(currentSr.srNumber))
                + '&tab=activities';
        }

        if (planEl) {
            if (plan && plan.steps && plan.steps.length) {
                var current = plan.steps.filter(function (s) { return s.isCurrent; })[0];
                var stepName = current ? current.name : '';
                planEl.textContent = plan.planName + (stepName ? ' — ' + stepName : '');
                planEl.hidden = false;
            } else {
                planEl.hidden = true;
                planEl.textContent = '';
            }
        }

        var open = (activities || []).filter(function (a) {
            return a.status !== 'Completed' && a.status !== 'Cancelled';
        }).slice(0, 5);

        listEl.innerHTML = '';
        if (emptyEl) emptyEl.hidden = open.length > 0;

        open.forEach(function (act) {
            var li = document.createElement('li');
            li.className = 'wf-activities-compact__item';
            var due = act.dueDate ? t('desk.due') + ' ' + formatDate(act.dueDate) : '';
            var assignee = act.assignedTo || '';
            li.innerHTML = '<strong>' + escapeHtml(act.subject) + '</strong>'
                + '<span class="wf-activities-compact__meta">'
                + escapeHtml(activityTypeLabel(act.activityType))
                + (assignee ? ' · ' + escapeHtml(assignee) : '')
                + (due ? ' · ' + escapeHtml(due) : '')
                + '</span>';
            listEl.appendChild(li);
        });
    }

    function escapeHtml(text) {
        var div = document.createElement('div');
        div.textContent = text || '';
        return div.innerHTML;
    }

    function populateWorkOrderTypes() {
        var select = byId('wf-workorder-type');
        if (!select) return;
        var current = select.value;
        var api = i18nApi();
        select.innerHTML = '';
        WORK_ORDER_TYPES.forEach(function (label) {
            var opt = document.createElement('option');
            opt.value = label;
            opt.textContent = api.translateWorkOrderType ? api.translateWorkOrderType(label) : label;
            select.appendChild(opt);
        });
        if (current) select.value = current;
    }

    function toggleResolutionFields() {
        var statusEl = byId('wf-inspection-status');
        var row = byId('wf-workorder-type-row');
        if (!statusEl || !row) return;
        var isResolution = String(statusEl.value).toLowerCase() === 'resolution';
        row.hidden = !isResolution;
    }

    function setInspectionStatusOptions(status) {
        var select = byId('wf-inspection-status');
        if (!select) return;
        var api = i18nApi();
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
            opt.textContent = api.translateInspectionStatus ? api.translateInspectionStatus(label) : label;
            select.appendChild(opt);
        });
        select.value = status || 'Created';
        select.disabled = String(status).toLowerCase() !== 'created';
        toggleResolutionFields();
    }

    function setWorkOrderStatusOptions(status) {
        var select = byId('wf-workorder-status');
        if (!select) return;
        var api = i18nApi();
        select.innerHTML = '';
        var options = ['Created'];
        if (String(status).toLowerCase() === 'created') options.push('Resolved');
        else options.push(status);
        options.forEach(function (label) {
            var opt = document.createElement('option');
            opt.value = label;
            opt.textContent = api.translateWorkOrderStatus ? api.translateWorkOrderStatus(label) : label;
            select.appendChild(opt);
        });
        select.value = status || 'Created';
        select.disabled = String(status).toLowerCase() !== 'created';
    }

    function updateTabs(sr) {
        var woTab = byId('wf-tab-workorder');
        if (woTab) {
            woTab.classList.remove('wf-tab--hidden');
            woTab.hidden = false;
        }
        var badge = byId('wf-header-sr-num');
        if (badge) badge.textContent = sr ? '#' + sr.srNumber : '';
    }

    function showInspectionEmpty(show) {
        var empty = byId('wf-inspection-empty');
        var form = byId('wf-inspection-form');
        var createBtn = byId('wf-create-inspection');
        if (empty) empty.hidden = !show;
        if (form) form.hidden = show;
        if (createBtn) createBtn.hidden = !isAuth();
    }

    function showWorkOrderEmpty(show) {
        var empty = byId('wf-workorder-empty');
        var form = byId('wf-workorder-form');
        if (empty) empty.hidden = !show;
        if (form) form.hidden = show;
    }

    function showTab(tabName) {
        activeTab = tabName;
        ['sr', 'inspection', 'workorder'].forEach(function (name) {
            var view = byId('workflow-view-' + name);
            if (view) view.hidden = name !== tabName;
            var tab = document.querySelector('.wf-tab[data-tab="' + name + '"]');
            if (tab) {
                var isActive = name === tabName;
                tab.classList.toggle('wf-tab--active', isActive);
                tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
            }
        });
    }

    function bindSr(sr) {
        currentSr = sr;
        var api = i18nApi();
        fillField('wf-sr-number', sr.srNumber);
        fillField('wf-sr-status', sr.status);
        fillField('wf-sr-substatus', sr.subStatus || '');
        fillField('wf-sr-priority', api.translatePriority ? api.translatePriority(sr.priority || 'Normal') : (sr.priority || 'Normal'));
        fillField('wf-sr-subarea', sr.subArea || '');
        fillField('wf-sr-request-type', api.translateRequestType ? api.translateRequestType(sr.requestType || '') : (sr.requestType || ''));
        fillField('wf-sr-tree', sr.linkedTreeBaumnummer || '');
        fillField('wf-sr-species', sr.ogdSpeciesGerman || '');
        fillField('wf-sr-quarter', sr.ogdQuartier || '');
        fillField('wf-sr-street', sr.ogdStreet || '');
        fillField('wf-sr-contact', ((sr.firstName || '') + ' ' + (sr.lastName || '')).trim());
        fillField('wf-sr-email', sr.email || '');
        fillField('wf-sr-address', sr.address || '');
        fillField('wf-sr-opened', formatDateTime(sr.openedAtUtc));
        fillField('wf-sr-closed', formatDateTime(sr.closedDate));
        fillField('wf-sr-description', sr.description || '');
        bindSummary(sr);
        updateTabs(sr);
    }

    /** Journey bar + "open for N days" + privacy note (contact withheld for anonymous viewers). */
    function bindSummary(sr) {
        var phase = global.ZurichPhase;
        if (phase) {
            phase.render(byId('wf-journey'), phase.resolve(sr), { compact: true });
            var meta = byId('wf-summary-meta');
            if (meta) {
                var api = i18nApi();
                var bits = [];
                if (sr.requestType) bits.push(api.translateRequestType ? api.translateRequestType(sr.requestType) : sr.requestType);
                bits.push(phase.ageText(sr.openedAtUtc, sr.closedDate));
                if (sr.priority === 'Urgent') bits.push('⚑ ' + (api.translatePriority ? api.translatePriority('Urgent') : 'Urgent'));
                meta.textContent = bits.filter(Boolean).join(' · ');
            }
        }
        var hidden = byId('wf-contact-hidden');
        if (hidden) hidden.hidden = !sr.contactRedacted;
        ['wf-sr-contact', 'wf-sr-email'].forEach(function (id) {
            var input = byId(id);
            var field = input && input.closest('.wf-field');
            if (field) field.hidden = !!sr.contactRedacted;
        });
    }

    function bindInspection(inspection, sr) {
        currentInspection = inspection;
        showInspectionEmpty(false);
        fillField('wf-inspection-id', inspection.inspectionId);
        fillField('wf-inspection-sr', inspection.srNumber);
        fillField('wf-inspection-tree', inspection.linkedTreeBaumnummer);
        setInspectionStatusOptions(inspection.status);
        fillField('wf-inspection-inspector', inspection.inspector || '');
        fillField('wf-inspection-comment', inspection.comment || '');
        fillField('wf-inspection-internal', inspection.internalComment || '');
        fillField('wf-workorder-type', inspection.workOrderType || 'Unassigned');
        fillField('wf-inspection-findings', inspection.findings || '');
        fillField('wf-inspection-priority', inspection.priority || (sr && sr.priority) || 'Normal');
        var ehapEl = byId('wf-inspection-ehap');
        if (ehapEl) ehapEl.checked = Boolean(inspection.ehap);
        var inspectDate = inspection.inspectDate ? formatDate(inspection.inspectDate) : '';
        if (!inspectDate && String(inspection.status).toLowerCase() === 'created') {
            inspectDate = todayIso();
        }
        fillField('wf-inspection-date', inspectDate);
        var subAreaEl = byId('wf-inspection-subarea');
        if (subAreaEl) subAreaEl.textContent = (sr && sr.subArea) || '';
        var saveBtn = byId('wf-inspection-save');
        if (saveBtn) saveBtn.disabled = !isAuth() || String(inspection.status).toLowerCase() !== 'created';
        toggleResolutionFields();
    }

    function bindWorkOrder(workOrder) {
        currentWorkOrder = workOrder;
        showWorkOrderEmpty(false);
        var api = i18nApi();
        fillField('wf-workorder-id', workOrder.workOrderId);
        fillField('wf-workorder-sr', workOrder.srNumber);
        fillField('wf-workorder-tree', workOrder.linkedTreeBaumnummer);
        setWorkOrderStatusOptions(workOrder.status);
        fillField('wf-workorder-type-wo', api.translateWorkOrderType ? api.translateWorkOrderType(workOrder.workOrderType || 'Unassigned') : (workOrder.workOrderType || 'Unassigned'));
        fillField('wf-workorder-priority', api.translatePriority ? api.translatePriority(workOrder.priority || 'Normal') : (workOrder.priority || 'Normal'));
        fillField('wf-workorder-inspby', workOrder.inspBy || '');
        fillField('wf-workorder-start', formatDateTime(workOrder.startDate));
        fillField('wf-workorder-contractor', workOrder.contractor || '');
        fillField('wf-workorder-assigned', workOrder.assignedTo || '');
        fillField('wf-workorder-project', workOrder.projectCode || '');
        fillField('wf-workorder-field', workOrder.fieldComments || '');
        fillField('wf-workorder-internal', workOrder.internalComment || '');
        var workDate = workOrder.workDate ? formatDate(workOrder.workDate) : '';
        if (!workDate && String(workOrder.status).toLowerCase() === 'created') {
            workDate = todayIso();
        }
        fillField('wf-workorder-date', workDate);
        var saveBtn = byId('wf-workorder-save');
        if (saveBtn) saveBtn.disabled = !isAuth() || String(workOrder.status).toLowerCase() !== 'created';
    }

    function clearWorkflowStaleState() {
        currentSr = null;
        currentInspection = null;
        currentWorkOrder = null;
        showInspectionEmpty(true);
        showWorkOrderEmpty(true);
        var badge = byId('wf-header-sr-num');
        if (badge) badge.textContent = '';
    }

    function restoreInspectionSaveButton(btn) {
        if (!btn) return;
        btn.disabled = !isAuth() || !currentInspection
            || String(currentInspection.status).toLowerCase() !== 'created';
    }

    function restoreWorkOrderSaveButton(btn) {
        if (!btn) return;
        btn.disabled = !isAuth() || !currentWorkOrder
            || String(currentWorkOrder.status).toLowerCase() !== 'created';
    }

    function applySrData(sr) {
        bindSr(sr);
        if (sr.inspection) {
            bindInspection(sr.inspection, sr);
        } else {
            currentInspection = null;
            showInspectionEmpty(true);
        }
        if (sr.workOrder) {
            bindWorkOrder(sr.workOrder);
        } else {
            currentWorkOrder = null;
            showWorkOrderEmpty(true);
        }
    }

    function openPanel() {
        if (!panelEl) return;
        var treePanel = window.ZurichTreePanel;
        if (treePanel && typeof treePanel.close === 'function') treePanel.close();
        panelEl.hidden = false;
        panelEl.setAttribute('aria-hidden', 'false');
        var srPanel = byId('sr-create-panel');
        if (srPanel) {
            srPanel.hidden = true;
            srPanel.setAttribute('aria-hidden', 'true');
        }
    }

    function close() {
        if (!panelEl) return;
        panelEl.hidden = true;
        panelEl.setAttribute('aria-hidden', 'true');
        setMessage('');
        currentSr = null;
        currentInspection = null;
        currentWorkOrder = null;
        activeTab = 'sr';
    }

    function loadSr(srNumber, preferredTab) {
        if (!cfg || !cfg.srGetUrl) return Promise.resolve();
        var requestId = ++activeSrRequestId;
        clearWorkflowStaleState();
        return fetch(cfg.srGetUrl.replace('{srNumber}', String(srNumber)))
            .then(function (r) {
                if (!r.ok) throw new Error('SR not found');
                return r.json();
            })
            .then(function (sr) {
                if (requestId !== activeSrRequestId) return;
                applySrData(sr);
                if (preferredTab === 'workorder' && sr.workOrder) showTab('workorder');
                else if (preferredTab === 'inspection') showTab('inspection');
                else showTab(preferredTab || 'sr');
                return loadWorkflowActivities(srNumber).then(function () { return sr; });
            })
            .catch(function () {
                if (requestId !== activeSrRequestId) return;
                setMessage(t('desk.loadDetailError'), true);
            });
    }

    function openForSr(srNumber, preferredTab) {
        openPanel();
        setMessage('');
        return loadSr(srNumber, preferredTab);
    }

    function openInspectionAfterCreate(srNumber) {
        openForSr(srNumber, 'inspection');
    }

    function onCreateInspection() {
        if (!isAuth() || !currentSr || !cfg || !cfg.inspectionCreateUrl) return;
        var btn = byId('wf-create-inspection');
        if (btn) btn.disabled = true;
        setMessage(t('desk.creatingInspection'));
        var url = cfg.inspectionCreateUrl.replace('{srNumber}', String(currentSr.srNumber));
        fetch(url, { method: 'POST' })
            .then(function (r) { return r.json().then(function (body) { return { ok: r.ok, body: body }; }); })
            .then(function (result) {
                if (!result.ok || !result.body || !result.body.success) {
                    setMessage((result.body && result.body.error) || t('desk.createInspectionError'), true);
                    if (result.body && result.body.inspection) {
                        currentInspection = result.body.inspection;
                        bindInspection(result.body.inspection, currentSr);
                    }
                    return;
                }
                setMessage(t('desk.inspectionCreated'));
                showTab('inspection');
                refreshMapMarkers();
                return loadSr(currentSr.srNumber, 'inspection');
            })
            .catch(function () { setMessage(t('desk.createInspectionError'), true); })
            .finally(function () { if (btn) btn.disabled = false; });
    }

    function onInspectionSubmit(ev) {
        ev.preventDefault();
        if (!isAuth() || !currentInspection || !cfg || !cfg.inspectionUpdateUrl) return;

        var status = byId('wf-inspection-status').value;
        var comment = byId('wf-inspection-comment').value.trim();
        var internalComment = byId('wf-inspection-internal').value.trim();
        var statusLower = String(status).toLowerCase();

        if (statusLower === 'no work' || statusLower === 'resolution') {
            if (!hasComment(comment, internalComment)) {
                setMessage(t('desk.inspCommentRequired'), true);
                return;
            }
            if (statusLower === 'resolution') {
                var woType = byId('wf-workorder-type').value;
                if (!woType || woType === 'Unassigned') {
                    setMessage(t('desk.woTypeRequired'), true);
                    return;
                }
            }
        }

        var ehapEl = byId('wf-inspection-ehap');
        var payload = {
            status: status,
            inspector: byId('wf-inspection-inspector').value.trim() || null,
            findings: byId('wf-inspection-findings').value || null,
            priority: byId('wf-inspection-priority').value || null,
            ehap: ehapEl ? ehapEl.checked : false,
            comment: comment || null,
            internalComment: internalComment || null,
            workOrderType: byId('wf-workorder-type').value || null,
            inspectDate: byId('wf-inspection-date').value || null
        };

        var btn = byId('wf-inspection-save');
        if (btn) btn.disabled = true;
        setMessage(t('desk.savingInspection'));
        var url = cfg.inspectionUpdateUrl.replace('{inspectionId}', String(currentInspection.inspectionId));
        var srNumber = currentSr ? currentSr.srNumber : currentInspection.srNumber;
        var nextTab = statusLower === 'resolution' ? 'workorder' : 'inspection';
        fetch(url, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        })
            .then(function (r) { return r.json().then(function (body) { return { ok: r.ok, body: body }; }); })
            .then(function (result) {
                if (!result.ok || !result.body || !result.body.success) {
                    setMessage((result.body && result.body.error) || t('desk.saveInspectionError'), true);
                    return;
                }
                if (result.body.workOrder) {
                    setMessage(t('desk.inspectionResolved'));
                } else if (statusLower === 'no work') {
                    setMessage(t('desk.inspectionNoWork'));
                } else {
                    setMessage(t('desk.inspectionSaved'));
                }
                refreshMapMarkers();
                return loadSr(srNumber, nextTab);
            })
            .catch(function () { setMessage(t('desk.saveInspectionError'), true); })
            .finally(function () { restoreInspectionSaveButton(btn); });
    }

    function onWorkOrderSubmit(ev) {
        ev.preventDefault();
        if (!isAuth() || !currentWorkOrder || !cfg || !cfg.workOrderUpdateUrl) return;
        if (String(byId('wf-workorder-status').value).toLowerCase() !== 'resolved') {
            setMessage(t('desk.woResolveRequired'), true);
            return;
        }

        var fieldComments = byId('wf-workorder-field').value.trim();
        var internalComment = byId('wf-workorder-internal').value.trim();
        var workDate = byId('wf-workorder-date').value;

        if (!workDate) {
            setMessage(t('desk.woDateRequired'), true);
            return;
        }
        if (!hasComment(fieldComments, internalComment)) {
            setMessage(t('desk.woCommentRequired'), true);
            return;
        }

        var payload = {
            status: 'Resolved',
            contractor: byId('wf-workorder-contractor').value.trim() || null,
            assignedTo: byId('wf-workorder-assigned').value.trim() || null,
            projectCode: byId('wf-workorder-project').value.trim() || null,
            fieldComments: fieldComments || null,
            internalComment: internalComment || null,
            workDate: workDate
        };

        var btn = byId('wf-workorder-save');
        if (btn) btn.disabled = true;
        setMessage(t('desk.savingWorkOrder'));
        var url = cfg.workOrderUpdateUrl.replace('{workOrderId}', String(currentWorkOrder.workOrderId));
        var srNumber = currentSr ? currentSr.srNumber : currentWorkOrder.srNumber;
        fetch(url, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        })
            .then(function (r) { return r.json().then(function (body) { return { ok: r.ok, body: body }; }); })
            .then(function (result) {
                if (!result.ok || !result.body || !result.body.success) {
                    setMessage((result.body && result.body.error) || t('desk.saveWorkOrderError'), true);
                    return;
                }
                setMessage(t('desk.workOrderResolved'));
                refreshMapMarkers();
                return loadSr(srNumber, 'workorder');
            })
            .catch(function () { setMessage(t('desk.saveWorkOrderError'), true); })
            .finally(function () { restoreWorkOrderSaveButton(btn); });
    }

    function init(config) {
        cfg = config || global.ZURICH_MAP || {};
        cfg.isAuthenticated = cfg.isAuthenticated === true || cfg.isAuthenticated === 'true';
        panelEl = byId('workflow-panel');
        messageEl = byId('workflow-message');
        if (!panelEl) return;

        populateWorkOrderTypes();

        var assignees = global.ZurichAssignees;
        if (assignees && typeof assignees.init === 'function') {
            assignees.init({
                assigneesUrl: cfg.assigneesUrl,
                datalistIds: ['assignee-list']
            });
        }

        document.querySelectorAll('.wf-tab').forEach(function (tab) {
            tab.addEventListener('click', function () {
                var name = tab.getAttribute('data-tab');
                if (!name || tab.classList.contains('wf-tab--hidden')) return;
                showTab(name);
                setMessage('');
            });
        });

        var statusSelect = byId('wf-inspection-status');
        if (statusSelect) statusSelect.addEventListener('change', toggleResolutionFields);

        var inspForm = byId('wf-inspection-form');
        if (inspForm) inspForm.addEventListener('submit', onInspectionSubmit);
        var woForm = byId('wf-workorder-form');
        if (woForm) woForm.addEventListener('submit', onWorkOrderSubmit);
        byId('workflow-close').addEventListener('click', close);
        var createBtn = byId('wf-create-inspection');
        if (createBtn) createBtn.addEventListener('click', onCreateInspection);

        global.addEventListener('zurich:locale', function () {
            var api = global.ZurichI18n;
            if (api && panelEl) api.apply(panelEl);
            populateWorkOrderTypes();
            if (currentInspection) {
                setInspectionStatusOptions(currentInspection.status);
                bindInspection(currentInspection, currentSr);
            }
            if (currentWorkOrder) bindWorkOrder(currentWorkOrder);
            if (currentSr) bindSr(currentSr);
        });
    }

    global.ZurichWorkflowPanel = {
        init: init,
        openInspectionAfterCreate: openInspectionAfterCreate,
        openForSr: openForSr,
        close: close
    };
}(window));
