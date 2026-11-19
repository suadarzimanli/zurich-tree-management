(function (global) {
    'use strict';

    var THEME_KEY = 'zurich-theme';

    function byId(id) { return document.getElementById(id); }

    function getTheme() {
        return localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light';
    }

    function setTheme(theme) {
        var value = theme === 'dark' ? 'dark' : 'light';
        localStorage.setItem(THEME_KEY, value);
        document.documentElement.setAttribute('data-theme', value);
        updateThemeButtons(value);
    }

    function updateThemeButtons(theme) {
        var lightBtn = byId('theme-toggle-light');
        var darkBtn = byId('theme-toggle-dark');
        if (lightBtn) {
            lightBtn.classList.toggle('header-toggle__btn--active', theme === 'light');
            lightBtn.setAttribute('aria-pressed', theme === 'light' ? 'true' : 'false');
        }
        if (darkBtn) {
            darkBtn.classList.toggle('header-toggle__btn--active', theme === 'dark');
            darkBtn.setAttribute('aria-pressed', theme === 'dark' ? 'true' : 'false');
        }
    }

    function updateLangButtons(locale) {
        var enBtn = byId('lang-toggle-en');
        var deBtn = byId('lang-toggle-de');
        if (enBtn) {
            enBtn.classList.toggle('header-toggle__btn--active', locale === 'en');
            enBtn.setAttribute('aria-pressed', locale === 'en' ? 'true' : 'false');
        }
        if (deBtn) {
            deBtn.classList.toggle('header-toggle__btn--active', locale === 'de');
            deBtn.setAttribute('aria-pressed', locale === 'de' ? 'true' : 'false');
        }
    }

    function init() {
        setTheme(getTheme());

        var lightBtn = byId('theme-toggle-light');
        var darkBtn = byId('theme-toggle-dark');
        if (lightBtn) lightBtn.addEventListener('click', function () { setTheme('light'); });
        if (darkBtn) darkBtn.addEventListener('click', function () { setTheme('dark'); });

        var enBtn = byId('lang-toggle-en');
        var deBtn = byId('lang-toggle-de');
        var i18n = global.ZurichI18n;
        var onAboutPage = global.location.pathname.toLowerCase().indexOf('/about') >= 0;

        function applyLang(locale) {
            if (i18n && typeof i18n.setLocale === 'function') {
                i18n.setLocale(locale);
            }
            updateLangButtons(locale);
            if (onAboutPage) {
                global.location.reload();
                return;
            }
            if (global.ZurichMapApi && typeof global.ZurichMapApi.refreshStatus === 'function') {
                global.ZurichMapApi.refreshStatus();
            }
        }

        if (i18n) {
            updateLangButtons(i18n.getLocale());
        }

        if (enBtn) enBtn.addEventListener('click', function () { applyLang('en'); });
        if (deBtn) deBtn.addEventListener('click', function () { applyLang('de'); });
    }

    global.ZurichHeaderControls = { init: init, setTheme: setTheme, getTheme: getTheme };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
}(window));
