(function () {
    'use strict';

    const SLIDE_MS = 9000;
    const app = document.getElementById('app');

    // The app is served at {base}/JellyWrapped/App/, base being Jellyfin's "base URL" setting.
    const base = location.pathname.replace(/\/JellyWrapped\/App\/?.*$/i, '');
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    const shareToken = new URLSearchParams(location.search).get('share');
    // Admin dashboard: "?user=<id>&year=<year>" shows another user's recap.
    const adminUser = new URLSearchParams(location.search).get('user');
    const adminYear = parseInt(new URLSearchParams(location.search).get('year'), 10) || new Date().getFullYear();
    const dashboardUrl = `${base}/web/#/configurationpage?name=JellyWrappedUsers`;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const DOWNLOAD_ICON = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
        + '<path d="M12 4v11"/><path d="m7 10 5 5 5-5"/><path d="M5 20h14"/></svg>';

    // Set in boot() once the translations are loaded.
    let t = (key) => key;
    let nf = new Intl.NumberFormat();
    let locale;

    const PERSONA_EMOJIS = {
        'binge-watcher': '🍿',
        'night-owl': '🦉',
        'early-bird': '🌅',
        'explorer': '🧭',
        'music-lover': '🎧',
        'cinephile': '🎬',
        'series-addict': '📺',
        'weekend-warrior': '🛋️',
        'eclectic': '🌈'
    };

    // ---------- Helpers ----------

    const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }[c]));
    const fmt = (n) => nf.format(Math.round(n || 0));
    const hours = (minutes) => Math.round((minutes || 0) / 60);
    // unit('minute', 3) -> "3 minutes", in the current language.
    const unit = (name, n) => t(`units.${name}`, { n: Math.round(n || 0) });
    const minutesShort = (n) => t('units.minutesShort', { n: Math.round(n || 0) });
    const month = (m) => new Date(2000, m - 1, 1).toLocaleDateString(locale, { month: 'long' });
    const longDate = (iso) => new Date(iso.length === 10 ? iso + 'T12:00:00' : iso).toLocaleDateString(locale, { day: 'numeric', month: 'long' });
    const hourLabel = (h) => new Date(2000, 0, 1, h).toLocaleTimeString(locale, { hour: 'numeric' });
    const imageUrl = (id, height) => `${base}/Items/${id}/Images/Primary?fillHeight=${height || 400}&quality=90`;
    const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);
    const initials = (name) => esc(String(name || '?').trim().charAt(0).toUpperCase());

    // [emoji, title, description]
    function persona(key) {
        const known = PERSONA_EMOJIS[key] ? key : 'eclectic';
        return [PERSONA_EMOJIS[known], t(`personas.${known}.0`), t(`personas.${known}.1`)];
    }

    function img(id, name, cls, height) {
        if (!id) {
            return `<div class="${cls}">${initials(name)}</div>`;
        }

        return `<img class="${cls}" src="${imageUrl(id, height)}" alt="" data-initial="${initials(name)}">`;
    }

    // Items without artwork: replace the broken image with a placeholder showing the initial.
    document.addEventListener('error', (e) => {
        const el = e.target;
        if (el.tagName === 'IMG' && el.dataset.initial !== undefined) {
            const placeholder = document.createElement('div');
            placeholder.className = el.className;
            placeholder.textContent = el.dataset.initial;
            el.replaceWith(placeholder);
        }
    }, true);

    function toast(message) {
        const el = document.createElement('div');
        el.className = 'toast';
        el.textContent = message;
        document.body.appendChild(el);
        setTimeout(() => el.remove(), 2600);
    }

    // ---------- Authentication (reuses the Jellyfin web session) ----------

    function getCredentials() {
        try {
            const data = JSON.parse(localStorage.getItem('jellyfin_credentials') || '{}');
            const servers = (data.Servers || []).filter((s) => s.AccessToken && s.UserId);
            const here = (location.origin + base).toLowerCase();
            servers.sort((a, b) => (b.DateLastAccessed || 0) - (a.DateLastAccessed || 0));
            return servers.find((s) => [s.ManualAddress, s.LocalAddress, s.RemoteAddress]
                .some((a) => a && a.toLowerCase().replace(/\/$/, '') === here)) || servers[0] || null;
        } catch {
            return null;
        }
    }

    const credentials = shareToken ? null : getCredentials();

    async function api(path, options) {
        const headers = { Accept: 'application/json' };
        if (credentials) {
            headers.Authorization = `MediaBrowser Token="${credentials.AccessToken}"`;
        }

        const response = await fetch(`${base}/JellyWrapped/${path}`, { ...options, headers });
        if (!response.ok) {
            const error = new Error(`HTTP ${response.status}`);
            error.status = response.status;
            throw error;
        }

        return response.status === 204 ? null : response.json();
    }

    // ---------- Screens ----------

    function screen(html) {
        app.innerHTML = `<div class="screen"><div class="screen-box">${html}</div></div>`;
    }

    function loading() {
        app.innerHTML = `<div class="screen"><div class="spinner" role="status" aria-label="${t('app.loading')}"></div></div>`;
    }

    function loginScreen() {
        screen(`<h1>JellyWrapped</h1>
            <p>${t('app.login.text')}</p>
            <p><a class="btn" href="${base}/web/">${t('app.login.button')}</a></p>`);
    }

    function errorScreen(message) {
        screen(`<h1>${t('app.error.title')}</h1><p>${esc(message)}</p>
            <p><button class="btn" onclick="location.reload()">${t('app.error.retry')}</button></p>`);
    }

    function emptyScreen(report, years) {
        const since = new Date(report.TrackingSinceUtc).toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' });
        screen(`<h1>${t('app.empty.title')}</h1>
            <p>${t('app.empty.text', { year: String(report.Year), since })}</p>
            ${yearPicker(years, report.Year)}
            <p><a class="btn ghost" href="${base}/web/">${t('app.backToJellyfin')}</a></p>`);
    }

    function yearPicker(years, current) {
        if (!years || years.length < 2) {
            return '';
        }

        return `<div class="years interactive">${years.map((y) =>
            `<button class="btn ${y === current ? '' : 'ghost'}" data-year="${y}">${y}</button>`).join('')}</div>`;
    }

    // ---------- Slides ----------

    function rankedList(entries, opts) {
        return `<ol class="list">${entries.map((e, i) => `
            <li class="row in" style="--d:${i + (opts.delay || 1)}">
                <span class="rank">${i + 1 + (opts.start || 0)}</span>
                ${opts.image ? img(e.ImageId, e.Name, 'thumb ' + (opts.image || ''), 120) : ''}
                <div class="meta"><div class="name">${esc(e.Name)}</div>${e.Subtitle ? `<div class="sub">${esc(e.Subtitle)}</div>` : ''}</div>
                <span class="val">${opts.value(e)}</span>
            </li>`).join('')}</ol>`;
    }

    function chips(entries) {
        return `<div class="chips">${entries.map((g, i) => `<span class="chip in" style="--d:${i + 3}">${esc(g.Name)}</span>`).join('')}</div>`;
    }

    function barChart(values, labels, cls, peakIndex) {
        const max = Math.max(1, ...values);
        return `<div class="chart ${cls || ''}">${values.map((v, i) => `
            <div class="c ${i === peakIndex ? 'peak' : ''}" style="--i:${i}">
                <i style="--h:${Math.max(2, (v / max) * 100)}%"></i>${labels ? `<span>${labels[i]}</span>` : ''}
            </div>`).join('')}</div>`;
    }

    function buildSlides(r, ctx) {
        const slides = [];
        const tot = r.Totals;
        const add = (theme, html) => slides.push({ theme, html });

        add('t-intro', `
            <div class="kicker in">JellyWrapped ${r.Year}</div>
            <h1 class="title in" style="--d:1">${t('app.intro.hello', { name: esc(r.UserName) })}</h1>
            <p class="lead in" style="--d:2">${t('app.intro.text', { year: String(r.Year) })}</p>
            <p class="note in" style="--d:3">${t('app.intro.hint')}</p>
            ${ctx.shared ? '' : yearPicker(ctx.years, r.Year)}`);

        const days = Math.round((tot.Minutes / 1440) * 10) / 10;
        const spread = { activeDays: unit('day', tot.ActiveDays), items: unit('distinctTitle', tot.DistinctItems) };
        add('t-total', `
            <div class="kicker in">${t('app.total.kicker')}</div>
            <p class="lead in" style="--d:1">${t('app.total.lead')}</p>
            <div class="huge in" style="--d:2" data-count="${tot.Minutes}">0</div>
            <p class="title in" style="--d:3">${t('app.total.unit')}</p>
            <p class="lead in" style="--d:4">${days >= 1 ? t('app.total.days', { days, ...spread }) : t('app.total.noDays', spread)}</p>
            ${r.ContainsEstimates ? `<p class="note in" style="--d:5">${t('app.total.estimates')}</p>` : ''}`);

        const parts = [
            [t('app.split.music'), tot.MusicMinutes, 'linear-gradient(90deg,#f72585,#b5179e)'],
            [t('app.split.movies'), tot.MovieMinutes, 'linear-gradient(90deg,#ffbe0b,#fb5607)'],
            [t('app.split.series'), tot.SeriesMinutes, 'linear-gradient(90deg,#00f5d4,#00bbf9)']
        ].filter((p) => p[1] > 0);
        if (parts.length > 1) {
            const share = (minutes) => (minutes / Math.max(1, tot.Minutes)) * 100;
            add('t-split', `
                <div class="kicker in">${t('app.split.kicker')}</div>
                <h2 class="title in" style="--d:1">${t('app.split.title')}</h2>
                <div class="split">${parts.map((p, i) => `
                    <div class="in" style="--d:${i + 2}">
                        <div class="lbl"><span>${p[0]}</span><span>${t('app.split.percent', { n: Math.round(share(p[1])) })}</span></div>
                        <div class="track"><div class="fill" style="--w:${share(p[1])}%;background:${p[2]}"></div></div>
                        <div class="note" style="margin-top:4px">${unit('hour', hours(p[1]))}</div>
                    </div>`).join('')}</div>`);
        }

        const m = r.Music;
        if (m) {
            add('t-music', `
                <div class="kicker in">${t('app.music.kicker')}</div>
                <div class="huge in" style="--d:1" data-count="${m.Minutes}">0</div>
                <p class="title in" style="--d:2">${t('app.music.unit')}</p>
                <div class="stats">
                    <div class="stat in" style="--d:3"><div class="v">${fmt(m.Plays)}</div><div class="l">${t('app.music.plays')}</div></div>
                    <div class="stat in" style="--d:4"><div class="v">${fmt(m.DistinctTracks)}</div><div class="l">${t('app.music.distinctTracks')}</div></div>
                    <div class="stat in" style="--d:5"><div class="v">${fmt(m.DistinctArtists)}</div><div class="l">${t('app.music.artists')}</div></div>
                    <div class="stat in" style="--d:6"><div class="v">${nf.format(Math.round(m.Minutes / Math.max(1, m.Plays) * 10) / 10)}</div><div class="l">${t('app.music.perPlay')}</div></div>
                </div>
                ${m.FirstTrack ? `<p class="lead in" style="--d:7">${t('app.music.firstTrack', { name: esc(m.FirstTrack.Name), date: longDate(m.FirstTrack.Subtitle) })}</p>` : ''}`);

            const top = m.TopArtists[0];
            if (top) {
                add('t-artist', `
                    <div class="kicker in">${t('app.artist.kicker')}</div>
                    ${img(top.ImageId, top.Name, 'hero-img pop', 600)}
                    <h2 class="title in center" style="--d:2;text-align:center">${esc(top.Name)}</h2>
                    <p class="lead in" style="--d:3;text-align:center">${t('app.artist.together', { minutes: unit('minute', top.Minutes), plays: unit('play', top.Plays) })}</p>
                    ${m.TopArtists.length > 1 ? rankedList(m.TopArtists.slice(1, 5), { delay: 4, start: 1, image: 'round', value: (e) => minutesShort(e.Minutes) }) : ''}`);
            }

            if (m.TopTracks.length) {
                add('t-tracks', `
                    <div class="kicker in">${t('app.tracks.kicker')}</div>
                    <h2 class="title in" style="--d:1">${t('app.tracks.title')}</h2>
                    ${rankedList(m.TopTracks, { delay: 2, image: ' ', value: (e) => unit('play', e.Plays) })}`);
            }

            if (m.TopAlbums.length || m.TopGenres.length) {
                add('t-albums', `
                    <div class="kicker in">${t('app.albums.kicker')}</div>
                    ${m.TopAlbums.length ? rankedList(m.TopAlbums.slice(0, 4), { delay: 1, image: ' ', value: (e) => minutesShort(e.Minutes) }) : ''}
                    ${m.TopGenres.length ? `<p class="lead in" style="--d:6">${t('app.albums.genres')}</p>${chips(m.TopGenres)}` : ''}`);
            }
        }

        const mv = r.Movies;
        if (mv) {
            const longest = mv.Longest
                ? `<p class="lead in" style="--d:6">${t('app.movies.longest', { name: esc(mv.Longest.Name), minutes: unit('minute', mv.Longest.Minutes) })}</p>`
                : '';
            const decade = mv.FavoriteDecade
                ? t('app.movies.decadeLabel', { decade: mv.FavoriteDecade < 2000 ? String(mv.FavoriteDecade).slice(-2) : String(mv.FavoriteDecade) })
                : '';
            add('t-movies', `
                <div class="kicker in">${t('app.movies.kicker')}</div>
                <h2 class="title in" style="--d:1">${t('app.movies.title', { movies: unit('movie', mv.DistinctMovies), hours: unit('hour', hours(mv.Minutes)) })}</h2>
                <div class="posters">${mv.TopMovies.slice(0, 3).map((e, i) => `
                    <div class="p in" style="--d:${i + 2}">${img(e.ImageId, e.Name, 'ph', 450)}<div class="cap">${i + 1}. ${esc(e.Name)}</div></div>`).join('')}</div>
                ${mv.TopGenres.length ? chips(mv.TopGenres) : ''}
                ${decade ? `<p class="lead in" style="--d:5">${t('app.movies.decade', { decade })}</p>` : ''}
                ${longest}`);

            const actor = mv.TopActors[0];
            if (actor && actor.Plays >= 2) {
                add('t-actor', `
                    <div class="kicker in">${t('app.actor.kicker')}</div>
                    ${img(actor.ImageId, actor.Name, 'hero-img poster pop', 600)}
                    <h2 class="title in" style="--d:2;text-align:center">${esc(actor.Name)}</h2>
                    <p class="lead in" style="--d:3;text-align:center">${t('app.actor.text', { n: actor.Plays })}</p>`);
            }
        }

        const s = r.Series;
        if (s) {
            add('t-series', `
                <div class="kicker in">${t('app.series.kicker')}</div>
                <h2 class="title in" style="--d:1">${t('app.series.title', { episodes: unit('episode', s.Episodes), series: unit('series', s.DistinctSeries) })}</h2>
                ${rankedList(s.TopSeries, { delay: 2, image: 'poster', value: (e) => unit('episodeShort', e.Plays) })}
                ${s.TopGenres.length ? chips(s.TopGenres.slice(0, 4)) : ''}`);

            if (s.Binge && s.Binge.Episodes >= 3) {
                add('t-binge', `
                    <div class="kicker in">${t('app.binge.kicker')}</div>
                    ${img(s.Binge.ImageId, s.Binge.SeriesName, 'hero-img poster pop', 600)}
                    <h2 class="title in" style="--d:2;text-align:center">${t('app.binge.title', { n: s.Binge.Episodes })}</h2>
                    <p class="lead in" style="--d:3;text-align:center">${t('app.binge.text', { date: longDate(s.Binge.Date), name: esc(s.Binge.SeriesName) })}</p>`);
            }
        }

        const h = r.Habits;
        const monthLabels = Array.from({ length: 12 }, (_, i) => month(i + 1).charAt(0).toUpperCase());
        const peakHour = h.MinutesByHour.indexOf(Math.max(...h.MinutesByHour));
        add('t-habits', `
            <div class="kicker in">${t('app.habits.kicker')}</div>
            <h2 class="title in" style="--d:1">${h.PeakMonth ? t('app.habits.peakMonth', { month: capitalize(month(h.PeakMonth)) }) : t('app.habits.byMonth')}</h2>
            <div class="in" style="--d:2">${barChart(h.MinutesByMonth, monthLabels, '', (h.PeakMonth || 0) - 1)}</div>
            <p class="lead in" style="--d:3">${t('app.habits.peakHour', { hour: hourLabel(peakHour) })}</p>
            <div class="in" style="--d:3">${barChart(h.MinutesByHour, null, 'hours', peakHour)}</div>
            <div class="stats">
                <div class="stat in" style="--d:4"><div class="v">${unit('day', h.LongestStreakDays)}</div><div class="l">${t('app.habits.streak')}</div></div>
                <div class="stat in" style="--d:5"><div class="v">${minutesShort(h.PeakDayMinutes)}</div><div class="l">${h.PeakDay ? t('app.habits.peakDay', { date: longDate(h.PeakDay) }) : t('app.habits.peakDayNoDate')}</div></div>
            </div>`);

        if (r.Server && r.Server.Users >= 3) {
            const first = r.Server.Rank === 1;
            add('t-server', `
                <div class="kicker in">${t('app.server.kicker')}</div>
                <p class="lead in" style="--d:1">${t(first ? 'app.server.leadFirst' : 'app.server.leadTop', { n: r.Server.Users })}</p>
                <div class="huge in" style="--d:2">${first ? t('app.server.first') : t('app.server.top', { n: r.Server.TopPercent })}</div>
                <p class="title in" style="--d:3">${first ? t('app.server.firstText') : t('app.server.rankText', { rank: r.Server.Rank })}</p>`);
        }

        const p = persona(r.Persona);
        add('t-persona', `
            <div class="kicker in center" style="text-align:center">${t('app.persona.kicker', { year: String(r.Year) })}</div>
            <div class="persona-emoji pop" style="--d:1">${p[0]}</div>
            <h2 class="title in" style="--d:2;text-align:center">${p[1]}</h2>
            <p class="lead in" style="--d:3;text-align:center">${p[2]}</p>`);

        add('t-summary', summaryHtml(r, ctx));
        return slides;
    }

    function summaryHtml(r, ctx) {
        const list = (entries) => `<ol>${entries.slice(0, 5).map((e) => `<li>${esc(e.Name)}</li>`).join('')}</ol>`;
        const blocks = [];
        if (r.Music?.TopArtists.length) {
            blocks.push(`<div><h4>${t('app.summary.topArtists')}</h4>${list(r.Music.TopArtists)}</div>`);
        }

        if (r.Music?.TopTracks.length) {
            blocks.push(`<div><h4>${t('app.summary.topTracks')}</h4>${list(r.Music.TopTracks)}</div>`);
        }

        if (r.Movies?.TopMovies.length) {
            blocks.push(`<div><h4>${t('app.summary.topMovies')}</h4>${list(r.Movies.TopMovies)}</div>`);
        }

        if (r.Series?.TopSeries.length) {
            blocks.push(`<div><h4>${t('app.summary.topSeries')}</h4>${list(r.Series.TopSeries)}</div>`);
        }

        const p = persona(r.Persona);
        let shareBlock;
        if (ctx.admin) {
            shareBlock = `<a class="btn ghost" href="${dashboardUrl}">${t('app.backToDashboard')}</a>`;
        } else if (ctx.shared) {
            shareBlock = `<a class="btn ghost" href="${base}/web/">${t('app.summary.discover')}</a>`;
        } else {
            shareBlock = `<button class="btn" data-action="image">${t('app.summary.saveImage')}</button>`;
            if (ctx.sharingEnabled) {
                shareBlock += `<button class="btn ghost" data-action="link">${t(ctx.shareToken ? 'app.summary.publicLink' : 'app.summary.createLink')}</button>`;
            }
        }

        return `
            <div class="kicker in">${ctx.shared ? t('app.summary.sharedKicker', { name: esc(r.UserName) }) : t('app.summary.kicker')}</div>
            <div class="summary in" style="--d:1">
                <div class="full" style="display:flex;justify-content:space-between;align-items:flex-end">
                    <div><h4>${t('app.summary.minutes')}</h4><div class="big">${fmt(r.Totals.Minutes)}</div></div>
                    <div style="text-align:right"><h4>${t('app.summary.persona')}</h4><div style="font-weight:800">${p[0]} ${p[1]}</div></div>
                </div>
                ${blocks.join('')}
            </div>
            <div class="actions interactive in" style="--d:3">${shareBlock}</div>
            <div class="interactive" id="share-area"></div>`;
    }

    // ---------- Story player ----------

    function play(report, ctx) {
        const slides = buildSlides(report, ctx);
        let index = 0;
        let timer = null;
        let startedAt = 0;
        let elapsed = 0;
        let paused = false;

        app.innerHTML = `
            <div class="stage">
                <div class="story" tabindex="0">
                    <div class="bars">${slides.map(() => '<div class="bar"><i></i></div>').join('')}</div>
                    <div class="topbar"><span class="brand">JellyWrapped ${report.Year}</span>
                        <span class="topbar-actions">
                            <button class="icon-btn interactive" data-action="download" aria-label="${t('app.share.downloadSlide')}" title="${t('app.share.downloadSlide')}">${DOWNLOAD_ICON}</button>
                            <button class="icon-btn interactive" data-action="close" aria-label="${t('app.close')}">✕</button>
                        </span></div>
                    ${slides.map((s, i) => `<section class="slide ${s.theme}" data-index="${i}" hidden>${s.html}</section>`).join('')}
                    <div class="nav-zone prev" aria-hidden="true"></div>
                    <div class="nav-zone next" aria-hidden="true"></div>
                </div>
            </div>`;

        const story = app.querySelector('.story');
        const bars = [...story.querySelectorAll('.bar')];
        const sections = [...story.querySelectorAll('.slide')];

        function animateCounters(section) {
            section.querySelectorAll('[data-count]').forEach((el) => {
                const target = +el.dataset.count;
                if (reducedMotion) {
                    el.textContent = fmt(target);
                    return;
                }

                const t0 = performance.now();
                const step = (now) => {
                    const k = Math.min(1, (now - t0) / 1600);
                    el.textContent = fmt(target * (1 - Math.pow(1 - k, 3)));
                    if (k < 1) {
                        requestAnimationFrame(step);
                    }
                };
                requestAnimationFrame(step);
            });
        }

        function show(i) {
            index = Math.max(0, Math.min(slides.length - 1, i));
            sections.forEach((s, j) => {
                s.hidden = j !== index;
                s.classList.toggle('active', j === index);
            });
            bars.forEach((b, j) => {
                b.classList.toggle('done', j < index);
                b.firstChild.style.width = j < index ? '100%' : '0';
            });
            animateCounters(sections[index]);
            elapsed = 0;
            startedAt = performance.now();
            if (index === slides.length - 1) {
                bars[index].firstChild.style.width = '100%';
            }
        }

        function tick(now) {
            if (!paused && index < slides.length - 1) {
                const progress = (elapsed + now - startedAt) / SLIDE_MS;
                bars[index].firstChild.style.width = `${Math.min(100, progress * 100)}%`;
                if (progress >= 1) {
                    show(index + 1);
                }
            }

            timer = requestAnimationFrame(tick);
        }

        function setPaused(value) {
            if (value === paused) {
                return;
            }

            if (value) {
                elapsed += performance.now() - startedAt;
            } else {
                startedAt = performance.now();
            }

            paused = value;
        }

        // A long press pauses; it must not also change slide when released.
        let held = false;
        const navigate = (delta) => () => {
            if (!held) {
                show(index + delta);
            }

            held = false;
        };
        story.querySelector('.nav-zone.prev').addEventListener('click', navigate(-1));
        story.querySelector('.nav-zone.next').addEventListener('click', navigate(1));
        story.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowRight' || e.key === ' ') {
                show(index + 1);
            } else if (e.key === 'ArrowLeft') {
                show(index - 1);
            } else if (e.key === 'Escape') {
                close();
            }
        });

        // Hold to pause, like stories.
        let holdTimer = null;
        story.addEventListener('pointerdown', (e) => {
            if (!e.target.closest('.interactive')) {
                held = false;
                holdTimer = setTimeout(() => {
                    held = true;
                    setPaused(true);
                }, 250);
            }
        });
        ['pointerup', 'pointercancel', 'pointerleave'].forEach((type) => story.addEventListener(type, () => {
            clearTimeout(holdTimer);
            setPaused(false);
        }));
        document.addEventListener('visibilitychange', () => setPaused(document.hidden));

        story.addEventListener('click', async (e) => {
            const target = e.target.closest('[data-action],[data-year]');
            if (!target) {
                return;
            }

            e.stopPropagation();
            if (target.dataset.year) {
                cancelAnimationFrame(timer);
                loadYear(+target.dataset.year, ctx.years);
            } else if (target.dataset.action === 'close') {
                close();
            } else if (target.dataset.action === 'download') {
                setPaused(true);
                target.disabled = true;
                try {
                    const blob = await renderSlide(sections[index], story, report.Year);
                    await saveImage(blob, `jellywrapped-${report.Year}-${String(index + 1).padStart(2, '0')}.png`, report.Year);
                } catch {
                    toast(t('app.share.imageError'));
                } finally {
                    target.disabled = false;
                    setPaused(false);
                }
            } else if (target.dataset.action === 'image') {
                setPaused(true);
                await shareImage(report, target);
            } else if (target.dataset.action === 'link') {
                await shareLink(report, ctx, story.querySelector('#share-area'));
            }
        });

        function close() {
            cancelAnimationFrame(timer);
            location.href = ctx.admin ? dashboardUrl : `${base}/web/`;
        }

        // "#s=3" opens the 4th slide directly.
        show(parseInt((location.hash.match(/s=(\d+)/) || [])[1], 10) || 0);
        story.focus();
        timer = requestAnimationFrame(tick);
    }

    // ---------- Sharing ----------

    async function shareLink(report, ctx, area) {
        try {
            if (!ctx.shareToken) {
                ctx.shareToken = (await api(`Shares/${report.Year}?tz=${encodeURIComponent(timeZone)}`, { method: 'POST' })).Token;
            }

            const url = `${location.origin}${base}/JellyWrapped/App/?share=${encodeURIComponent(ctx.shareToken)}`;
            area.innerHTML = `
                <div class="share-link"><input readonly value="${esc(url)}" aria-label="${t('app.share.linkLabel')}">
                    <button class="btn" data-copy>${t('app.share.copy')}</button><button class="btn ghost" data-revoke>${t('app.share.revoke')}</button></div>
                <p class="note" style="margin-top:6px">${t('app.share.note')}</p>`;
            area.querySelector('[data-copy]').onclick = async (e) => {
                e.stopPropagation();
                try {
                    await navigator.clipboard.writeText(url);
                    toast(t('app.share.copied'));
                } catch {
                    area.querySelector('input').select();
                }
            };
            area.querySelector('[data-revoke]').onclick = async (e) => {
                e.stopPropagation();
                await api(`Shares/${report.Year}`, { method: 'DELETE' });
                ctx.shareToken = null;
                area.innerHTML = '';
                toast(t('app.share.revoked'));
            };
        } catch {
            toast(t('app.share.linkError'));
        }
    }

    function loadImage(id, height) {
        return new Promise((resolve) => {
            if (!id) {
                resolve(null);
                return;
            }

            const image = new Image();
            image.onload = () => resolve(image);
            image.onerror = () => resolve(null);
            image.src = imageUrl(id, height);
        });
    }

    async function renderImage(r) {
        const W = 1080;
        const H = 1920;
        const canvas = document.createElement('canvas');
        canvas.width = W;
        canvas.height = H;
        const c = canvas.getContext('2d');
        const font = (weight, size) => `${weight} ${size}px Inter, "Segoe UI", system-ui, sans-serif`;

        const bg = c.createLinearGradient(0, 0, W, H);
        bg.addColorStop(0, '#2a0b4a');
        bg.addColorStop(.55, '#120a2b');
        bg.addColorStop(1, '#00334d');
        c.fillStyle = bg;
        c.fillRect(0, 0, W, H);
        [['rgba(170,92,195,.55)', 120, 260], ['rgba(0,164,220,.45)', 960, 1640]].forEach(([color, x, y]) => {
            const g = c.createRadialGradient(x, y, 0, x, y, 620);
            g.addColorStop(0, color);
            g.addColorStop(1, 'transparent');
            c.fillStyle = g;
            c.fillRect(0, 0, W, H);
        });

        const fit = (text, max) => {
            let s = String(text || '');
            while (c.measureText(s).width > max && s.length > 1) {
                s = s.slice(0, -2).trimEnd() + '…';
                if (s.length <= 2) {
                    break;
                }
            }

            return s;
        };

        c.fillStyle = '#ffd84d';
        c.font = font(800, 34);
        c.fillText(`JELLYWRAPPED ${r.Year}`, 80, 130);
        c.fillStyle = '#fff';
        c.font = font(900, 84);
        c.fillText(fit(t('app.summary.sharedKicker', { name: r.UserName }), W - 160), 80, 230);

        // Hero image: top artist, else top movie, else top series.
        const heroEntry = r.Music?.TopArtists[0] || r.Movies?.TopMovies[0] || r.Series?.TopSeries[0];
        const hero = await loadImage(heroEntry?.ImageId, 700);
        if (hero) {
            const size = 520;
            const x = (W - size) / 2;
            const y = 300;
            c.save();
            c.beginPath();
            c.roundRect(x, y, size, size, 40);
            c.clip();
            const scale = Math.max(size / hero.width, size / hero.height);
            c.drawImage(hero, x + (size - hero.width * scale) / 2, y + (size - hero.height * scale) / 2, hero.width * scale, hero.height * scale);
            c.restore();
        }

        let y = hero ? 920 : 380;
        const columns = [];
        if (r.Music?.TopArtists.length) {
            columns.push([t('app.summary.topArtists'), r.Music.TopArtists]);
        }

        if (r.Music?.TopTracks.length) {
            columns.push([t('app.summary.topTracks'), r.Music.TopTracks]);
        }

        if (r.Movies?.TopMovies.length) {
            columns.push([t('app.summary.topMovies'), r.Movies.TopMovies]);
        }

        if (r.Series?.TopSeries.length) {
            columns.push([t('app.summary.topSeries'), r.Series.TopSeries]);
        }

        const colW = (W - 160 - 40) / 2;
        columns.slice(0, 4).forEach(([title, entries], i) => {
            const x = 80 + (i % 2) * (colW + 40);
            const top = y + Math.floor(i / 2) * 330;
            c.fillStyle = '#ffd84d';
            c.font = font(800, 30);
            c.fillText(title.toUpperCase(), x, top);
            c.fillStyle = '#fff';
            c.font = font(700, 38);
            entries.slice(0, 5).forEach((e, j) => c.fillText(fit(`${j + 1}. ${e.Name}`, colW), x, top + 62 + j * 52));
        });

        y = H - 260;
        c.fillStyle = 'rgba(0,0,0,.28)';
        c.beginPath();
        c.roundRect(60, y - 40, W - 120, 200, 32);
        c.fill();
        c.fillStyle = '#ffd84d';
        c.font = font(800, 30);
        c.fillText(t('app.summary.minutes').toUpperCase(), 110, y + 20);
        c.fillText(t('app.summary.persona').toUpperCase(), W / 2 + 20, y + 20);
        c.fillStyle = '#fff';
        c.font = font(900, 76);
        c.fillText(fmt(r.Totals.Minutes), 110, y + 105);
        const p = persona(r.Persona);
        c.font = font(800, 50);
        c.fillText(fit(`${p[0]} ${p[1]}`, W / 2 - 120), W / 2 + 20, y + 100);

        return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    }

    // Opens the share sheet where available (phones), else downloads the file.
    async function saveImage(blob, fileName, year) {
        const file = new File([blob], fileName, { type: 'image/png' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
            try {
                await navigator.share({ files: [file], title: t('app.share.title', { year: String(year) }) });
                return;
            } catch (e) {
                if (e.name === 'AbortError') {
                    return;
                }
            }
        }

        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = file.name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 5000);
        toast(t('app.share.imageSaved'));
    }

    async function shareImage(report, button) {
        button.disabled = true;
        try {
            await saveImage(await renderImage(report), `jellywrapped-${report.Year}.png`, report.Year);
        } catch {
            toast(t('app.share.imageError'));
        } finally {
            button.disabled = false;
        }
    }

    // ---------- Slide export ----------

    let stylesheet = null;

    async function getStylesheet() {
        if (stylesheet === null) {
            try {
                stylesheet = await (await fetch('app.css')).text();
            } catch {
                stylesheet = '';
            }
        }

        return stylesheet;
    }

    function toDataUrl(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }

    // An SVG image cannot load anything: images must be embedded.
    async function embedImages(root) {
        await Promise.all([...root.querySelectorAll('img')].map(async (el) => {
            try {
                const response = await fetch(el.src);
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }

                el.src = await toDataUrl(await response.blob());
            } catch {
                const placeholder = document.createElement('div');
                placeholder.className = el.className;
                placeholder.textContent = el.dataset.initial || '';
                el.replaceWith(placeholder);
            }
        }));
    }

    // Renders a slide, as displayed but without the controls, to a 1080-pixel-wide PNG:
    // the slide is copied into an SVG <foreignObject> together with the stylesheet, then drawn on a canvas.
    async function renderSlide(section, story, year) {
        const width = story.clientWidth;
        const height = story.clientHeight;
        const clone = section.cloneNode(true);

        // Viewport units mean something else inside an SVG image: freeze the font sizes as displayed.
        const originals = [section, ...section.querySelectorAll('*')];
        const copies = [clone, ...clone.querySelectorAll('*')];
        originals.forEach((el, i) => {
            copies[i].style.fontSize = getComputedStyle(el).fontSize;
        });

        clone.hidden = false;
        clone.classList.add('active');
        clone.querySelectorAll('[data-count]').forEach((el) => {
            el.textContent = fmt(+el.dataset.count);
        });
        clone.querySelectorAll('.interactive').forEach((el) => el.remove());
        await embedImages(clone);

        const css = (await getStylesheet()).replace(/\]\]>/g, '');
        const font = getComputedStyle(document.body).fontFamily.replace(/"/g, '\'');
        const html = `<div xmlns="http://www.w3.org/1999/xhtml" class="slide-export" style="position:relative;width:${width}px;height:${height}px;overflow:hidden;color:#fff;font-family:${font}">`
            + `<style><![CDATA[${css}
                .slide-export *, .slide-export *::before, .slide-export *::after { animation: none !important; transition: none !important; }
                .slide-export .watermark { position: absolute; z-index: 5; left: 0; right: 0; bottom: 12px; text-align: center; font-size: 11px; font-weight: 800; letter-spacing: .14em; opacity: .65; }
            ]]></style>`
            + new XMLSerializer().serializeToString(clone)
            + `<div class="watermark">JELLYWRAPPED ${year}</div></div>`;

        const scale = 1080 / width;
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(width * scale)}" height="${Math.round(height * scale)}" viewBox="0 0 ${width} ${height}">`
            + `<foreignObject x="0" y="0" width="${width}" height="${height}">${html}</foreignObject></svg>`;

        const image = new Image();
        image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
        await image.decode();

        const canvas = document.createElement('canvas');
        canvas.width = Math.round(width * scale);
        canvas.height = Math.round(height * scale);
        canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
        return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Empty image'))), 'image/png'));
    }

    // ---------- Boot ----------

    async function loadYear(year, years) {
        loading();
        try {
            const data = await api(`Report/${year}?tz=${encodeURIComponent(timeZone)}`);
            if (!data.Report.HasData) {
                emptyScreen(data.Report, years);
                bindYearPicker(years);
                return;
            }

            play(data.Report, { years, shareToken: data.ShareToken, sharingEnabled: data.SharingEnabled, shared: false });
        } catch (e) {
            if (e.status === 401) {
                loginScreen();
            } else {
                errorScreen(t('app.error.loadOwn'));
            }
        }
    }

    function bindYearPicker(years) {
        app.querySelectorAll('[data-year]').forEach((b) => b.addEventListener('click', () => loadYear(+b.dataset.year, years)));
    }

    async function loadTranslations() {
        try {
            // The signed-in user's language, even when viewing someone's share link.
            const i18n = await window.JellyWrappedI18n.load(getCredentials()?.UserId);
            t = i18n.t;
            nf = i18n.numbers;
            locale = i18n.locale;
            document.documentElement.lang = i18n.language;
        } catch {
            // Keep the default: keys are shown instead of text.
        }
    }

    async function boot() {
        await loadTranslations();

        if (shareToken) {
            try {
                const data = await api(`Shared/${encodeURIComponent(shareToken)}`);
                play(data.Report, { shared: true });
            } catch {
                errorScreen(t('app.error.shareMissing'));
            }

            return;
        }

        if (!credentials) {
            loginScreen();
            return;
        }

        if (adminUser) {
            try {
                const data = await api(`Admin/Report/${encodeURIComponent(adminUser)}/${adminYear}?tz=${encodeURIComponent(timeZone)}`);
                if (data.Report.HasData) {
                    play(data.Report, { shared: true, admin: true });
                } else {
                    screen(`<h1>${t('app.empty.adminTitle')}</h1><p>${t('app.empty.adminText', { name: esc(data.Report.UserName), year: String(adminYear) })}</p>
                        <p><a class="btn" href="${dashboardUrl}">${t('app.backToDashboard')}</a></p>`);
                }
            } catch (e) {
                errorScreen(e.status === 403 || e.status === 401 ? t('app.error.adminOnly') : t('app.error.loadOther'));
            }

            return;
        }

        try {
            const data = await api(`Years?tz=${encodeURIComponent(timeZone)}`);
            await loadYear(data.Default, data.Years);
        } catch (e) {
            if (e.status === 401) {
                loginScreen();
            } else {
                errorScreen(t('app.error.unreachable'));
            }
        }
    }

    boot();
})();
