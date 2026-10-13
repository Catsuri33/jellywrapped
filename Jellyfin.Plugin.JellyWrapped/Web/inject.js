// Injected into the Jellyfin web client (through the File Transformation plugin):
// adds a "My Wrapped" entry to the side menu and, during the period set by the admin, a banner on the home page.
(function () {
    'use strict';

    const script = document.currentScript;
    const appRoot = new URL('.', script ? script.src : location.href).href;
    const base = new URL(appRoot).pathname.replace(/\/JellyWrapped\/App\/$/i, '');
    const appUrl = `${base}/JellyWrapped/App/`;

    // Translation function, set once the strings are loaded.
    let t = null;
    // Year announced by the home banner, or null when it is hidden.
    let bannerYear = null;

    function currentUserId() {
        try {
            return window.ApiClient?.getCurrentUserId() || null;
        } catch {
            return null;
        }
    }

    function loadTranslations() {
        return new Promise((resolve, reject) => {
            if (window.JellyWrappedI18n) {
                resolve();
                return;
            }

            const tag = document.createElement('script');
            tag.src = `${appRoot}i18n.js`;
            tag.onload = resolve;
            tag.onerror = reject;
            document.head.appendChild(tag);
        }).then(() => window.JellyWrappedI18n.load(currentUserId()));
    }

    function addMenuLink() {
        const container = document.querySelector('.mainDrawer .mainDrawer-scrollContainer');
        if (!container || container.querySelector('.jellywrapped-menu')) {
            return;
        }

        const section = document.createElement('div');
        section.className = 'jellywrapped-menu';
        section.innerHTML = `
            <a is="emby-linkbutton" class="navMenuOption lnkMediaFolder emby-button" href="${appUrl}">
                <span class="material-icons navMenuOptionIcon auto_awesome" aria-hidden="true"></span>
                <span class="navMenuOptionText"></span>
            </a>`;
        section.querySelector('.navMenuOptionText').textContent = t('inject.menu');

        // Right after the "Home" entry when we can find it, else at the top.
        const home = container.querySelector('.lnkMediaFolder[href*="home"]');
        if (home && home.parentElement) {
            home.parentElement.insertBefore(section, home.nextSibling);
        } else {
            container.insertBefore(section, container.firstChild);
        }
    }

    function addHomeBanner() {
        if (!bannerYear) {
            return;
        }

        const bannerKey = `jellywrapped-banner-dismissed-${bannerYear}`;
        try {
            if (localStorage.getItem(bannerKey)) {
                return;
            }
        } catch {
            // Storage unavailable: show the banner anyway.
        }

        const home = document.querySelector('#indexPage:not(.hide) .homeSectionsContainer, .homePage:not(.hide) .sections');
        if (!home || home.querySelector('.jellywrapped-banner')) {
            return;
        }

        const banner = document.createElement('div');
        banner.className = 'jellywrapped-banner';
        banner.style.cssText = 'display:flex;align-items:center;gap:16px;margin:1em 3.3%;padding:18px 22px;border-radius:14px;'
            + 'background:linear-gradient(120deg,#aa5cc3,#00a4dc);color:#fff;box-shadow:0 10px 30px rgba(0,0,0,.35)';
        banner.innerHTML = `
            <span style="font-size:2.2em" aria-hidden="true">🎁</span>
            <div style="flex:1;min-width:0">
                <div style="font-weight:800;font-size:1.2em">${t('inject.bannerTitle', { year: String(bannerYear) })}</div>
                <div style="opacity:.9">${t('inject.bannerText')}</div>
            </div>
            <a href="${appUrl}" style="background:#fff;color:#111;font-weight:700;padding:.6em 1.2em;border-radius:999px;text-decoration:none">${t('inject.bannerButton')}</a>
            <button type="button" aria-label="${t('inject.bannerHide')}" style="background:none;border:0;color:#fff;font-size:1.4em;cursor:pointer">✕</button>`;
        banner.querySelector('button').addEventListener('click', () => {
            banner.remove();
            try {
                localStorage.setItem(bannerKey, '1');
            } catch {
                // Ignore.
            }
        });
        home.insertBefore(banner, home.firstChild);
    }

    let scheduled = false;
    function refresh() {
        if (scheduled || !t) {
            return;
        }

        scheduled = true;
        requestAnimationFrame(() => {
            scheduled = false;
            addMenuLink();
            addHomeBanner();
        });
    }

    // The period during which the banner is shown is set by the admin in the plugin settings.
    const banner = fetch(`${base}/JellyWrapped/Banner`)
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
            bannerYear = data && data.Year;
        })
        .catch(() => {});

    Promise.all([loadTranslations(), banner])
        .then(([i18n]) => {
            t = i18n.t;
            new MutationObserver(refresh).observe(document.documentElement, { childList: true, subtree: true });
            refresh();
        })
        .catch(() => {});
})();
