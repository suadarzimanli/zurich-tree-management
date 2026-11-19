(function (global) {
    'use strict';

    var panelEl = null;
    var formEl = null;
    var messageEl = null;
    var currentContext = null;
    var cfg = null;

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

    function byId(id) {
        return document.getElementById(id);
    }

    function setMessage(text, isError) {
        if (!messageEl) return;
        messageEl.textContent = text || '';
        messageEl.className = 'sr-create-message' + (isError ? ' sr-create-message--error' : text ? ' sr-create-message--success' : '');
    }

    function reverseGeocode(lat, lng) {
        return new Promise(function (resolve) {
            if (typeof google === 'undefined' || !google.maps || !google.maps.Geocoder) {
                resolve(lat.toFixed(6) + ', ' + lng.toFixed(6));
                return;
            }
            var geocoder = new google.maps.Geocoder();
            geocoder.geocode({ location: { lat: lat, lng: lng } }, function (results, status) {
                if (status === 'OK' && results && results.length) {
                    resolve(results[0].formatted_address);
                } else {
                    resolve(lat.toFixed(6) + ', ' + lng.toFixed(6));
                }
            });
        });
    }

    function populateRequestTypes() {
        var select = byId('sr-request-type');
        if (!select) return;
        var current = select.value;
        var api = global.ZurichI18n;
        while (select.options.length > 1) {
            select.remove(1);
        }
        REQUEST_TYPES.forEach(function (label) {
            var opt = document.createElement('option');
            opt.value = label;
            opt.textContent = api && api.translateRequestType ? api.translateRequestType(label) : label;
            select.appendChild(opt);
        });
        if (current) select.value = current;
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
                if (fieldErrors && fieldErrors.length) {
                    messages.push(fieldErrors[0]);
                }
            });
            if (messages.length) return messages.join(' ');
        }
        if (body.title) return body.title;
        return 'Could not create service request.';
    }

    function fillReadonlyField(id, value) {
        var el = byId(id);
        if (el) el.value = value == null ? '' : String(value);
    }

    function open(context) {
        if (!panelEl || !formEl) return;
        var treePanel = window.ZurichTreePanel;
        if (treePanel && typeof treePanel.close === 'function') treePanel.close();
        currentContext = context || null;
        setMessage('');
        formEl.reset();

        if (!currentContext) return;

        fillReadonlyField('sr-linked-tree', currentContext.baumnummer || '');
        fillReadonlyField('sr-species-de', currentContext.baumnamedeu || '');
        fillReadonlyField('sr-species-lat', currentContext.baumnamelat || '');
        fillReadonlyField('sr-quarter', currentContext.quartier || '');
        fillReadonlyField('sr-street', currentContext.strasse || '');
        fillReadonlyField('sr-lat', currentContext.lat);
        fillReadonlyField('sr-lng', currentContext.lng);
        fillReadonlyField('sr-address', 'Resolving address…');

        panelEl.hidden = false;
        panelEl.setAttribute('aria-hidden', 'false');

        reverseGeocode(currentContext.lat, currentContext.lng).then(function (address) {
            if (currentContext) fillReadonlyField('sr-address', address);
        });
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
            address: byId('sr-address').value.trim(),
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

    function validatePayload(payload) {
        if (!payload.linkedTreeBaumnummer) return 'Linked Tree (Baumnummer) is required.';
        if (!payload.firstName) return 'First name is required.';
        if (!payload.lastName) return 'Last name is required.';
        if (!payload.email) return 'Email is required.';
        if (!isValidEmail(payload.email)) return 'Enter a valid email address (e.g. name@example.com).';
        if (!payload.requestType) return 'Request type is required.';
        return '';
    }

    function onSubmit(ev) {
        ev.preventDefault();
        if (!cfg || !cfg.srCreateUrl) {
            setMessage('SR API is not configured.', true);
            return;
        }

        var payload = buildPayload();
        var validationError = validatePayload(payload);
        if (validationError) {
            setMessage(validationError, true);
            return;
        }

        var submitBtn = byId('sr-submit');
        if (submitBtn) submitBtn.disabled = true;
        setMessage('Creating service request…');

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
                var srNumber = result.body.srNumber;
                var inspectionId = result.body.inspectionId;
                setMessage('Service request ' + srNumber + ' created — opening inspection…');
                if (global.ZurichMapMarkers && typeof global.ZurichMapMarkers.refresh === 'function') {
                    global.ZurichMapMarkers.refresh();
                }
                if (global.ZurichWorkflowPanel && typeof global.ZurichWorkflowPanel.openInspectionAfterCreate === 'function') {
                    global.ZurichWorkflowPanel.openInspectionAfterCreate(srNumber);
                }
                close();
            })
            .catch(function () {
                setMessage('Network error while creating service request.', true);
            })
            .finally(function () {
                if (submitBtn) submitBtn.disabled = false;
            });
    }

    function init(config) {
        cfg = config || global.ZURICH_MAP || {};
        panelEl = byId('sr-create-panel');
        formEl = byId('sr-create-form');
        messageEl = byId('sr-create-message');
        if (!panelEl || !formEl) return;

        populateRequestTypes();

        formEl.addEventListener('submit', onSubmit);
        byId('sr-cancel').addEventListener('click', close);
        byId('sr-close').addEventListener('click', close);

        global.addEventListener('zurich:locale', function () {
            var api = global.ZurichI18n;
            if (api && panelEl) api.apply(panelEl);
            populateRequestTypes();
        });
    }

    global.ZurichSrForm = {
        init: init,
        open: open,
        close: close
    };
}(window));
