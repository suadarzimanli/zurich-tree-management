(function (global) {
    'use strict';

    var assignees = [];
    var loaded = false;
    var loadPromise = null;

    function fetchAssignees(url) {
        if (loaded) return Promise.resolve(assignees);
        if (loadPromise) return loadPromise;

        var endpoint = url || '/api/users/assignees';
        loadPromise = fetch(endpoint)
            .then(function (r) {
                if (!r.ok) throw new Error('HTTP ' + r.status);
                return r.json();
            })
            .then(function (body) {
                assignees = Array.isArray(body) ? body : [];
                loaded = true;
                return assignees;
            })
            .catch(function () {
                assignees = [];
                loaded = true;
                return assignees;
            });

        return loadPromise;
    }

    function fillDatalist(listId) {
        var list = document.getElementById(listId);
        if (!list) return;
        list.innerHTML = '';
        assignees.forEach(function (a) {
            var opt = document.createElement('option');
            opt.value = a.name;
            if (a.role) opt.label = a.role;
            list.appendChild(opt);
        });
    }

    function wireDatalists(ids) {
        (ids || []).forEach(fillDatalist);
    }

    function init(config) {
        var url = (config && config.assigneesUrl) || '/api/users/assignees';
        var listIds = (config && config.datalistIds) || ['assignee-list'];
        return fetchAssignees(url).then(function () {
            wireDatalists(listIds);
        });
    }

    function getNames() {
        return assignees.map(function (a) { return a.name; });
    }

    global.ZurichAssignees = {
        init: init,
        fetch: fetchAssignees,
        fillDatalist: fillDatalist,
        wireDatalists: wireDatalists,
        getNames: getNames
    };
}(window));
