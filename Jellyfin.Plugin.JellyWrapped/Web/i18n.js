// Translations shared by the story app, the script injected into Jellyfin and the dashboard pages.
// Strings live in lang-<code>.json next to this file; English is the fallback.
(function () {
    'use strict';

    if (window.JellyWrappedI18n) {
        return;
    }

    const script = document.currentScript;
    const root = script ? script.src.replace(/i18n\.js(\?.*)?$/, '') : '';
    const FALLBACK = 'en';
    const loaded = {};

    // Same setting as the Jellyfin web client: the user's display language, else the browser's.
    function detectLanguage(userId) {
        let language = '';
        try {
            language = (userId && localStorage.getItem(`${userId}-language`)) || '';
        } catch {
            // Storage unavailable.
        }

        language = language || document.documentElement.getAttribute('data-culture') || navigator.language || FALLBACK;
        return language.toLowerCase().split(/[-_]/)[0];
    }

    async function fetchStrings(language) {
        if (!loaded[language]) {
            loaded[language] = fetch(`${root}lang-${language}.json`).then((r) => {
                if (!r.ok) {
                    throw new Error(`No translation for ${language}`);
                }

                return r.json();
            });
        }

        return loaded[language];
    }

    async function load(userId) {
        let language = detectLanguage(userId);
        let strings;
        try {
            strings = await fetchStrings(language);
        } catch {
            language = FALLBACK;
            strings = await fetchStrings(FALLBACK);
        }

        const locale = strings._locale || language;
        const numbers = new Intl.NumberFormat(locale);
        const plurals = new Intl.PluralRules(locale);

        // t('a.b', { n: 3, name: 'x' }): numbers are formatted for the locale; an entry
        // written as { "one": ..., "other": ... } is picked according to n.
        function t(key, params) {
            let value = key.split('.').reduce((node, part) => (node == null ? node : node[part]), strings);
            if (value == null) {
                return key;
            }

            if (typeof value === 'object') {
                value = value[plurals.select(params?.n ?? 0)] ?? value.other;
            }

            return String(value).replace(/\{(\w+)\}/g, (match, name) => {
                const param = params?.[name];
                if (param === undefined) {
                    return match;
                }

                return typeof param === 'number' ? numbers.format(param) : String(param);
            });
        }

        return { language, locale, numbers, t };
    }

    window.JellyWrappedI18n = { load };
})();
