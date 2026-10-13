// Injected into the Jellyfin web client (through the File Transformation plugin):
// adds a "Mon Wrapped" entry to the side menu and, during the period set by the admin, a banner on the home page.
(function () {
    'use strict';

    const script = document.currentScript;
    const base = new URL(script ? script.src : location.href).pathname.replace(/\/JellyWrapped\/App\/inject\.js$/i, '');
    const appUrl = `${base}/JellyWrapped/App/`;

    // Year announced by the home banner, or null when it is hidden.
    let bannerYear = null;

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
                <span class="navMenuOptionText">Mon Wrapped</span>
            </a>`;

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
                <div style="font-weight:800;font-size:1.2em">Ton JellyWrapped ${bannerYear} est prêt&nbsp;!</div>
                <div style="opacity:.9">Tes artistes, films et séries de l'année en un coup d'œil.</div>
            </div>
            <a href="${appUrl}" style="background:#fff;color:#111;font-weight:700;padding:.6em 1.2em;border-radius:999px;text-decoration:none">Découvrir</a>
            <button type="button" aria-label="Masquer" style="background:none;border:0;color:#fff;font-size:1.4em;cursor:pointer">✕</button>`;
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
        if (scheduled) {
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
    fetch(`${base}/JellyWrapped/Banner`)
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
            bannerYear = data && data.Year;
            refresh();
        })
        .catch(() => {});

    new MutationObserver(refresh).observe(document.documentElement, { childList: true, subtree: true });
    refresh();
})();
