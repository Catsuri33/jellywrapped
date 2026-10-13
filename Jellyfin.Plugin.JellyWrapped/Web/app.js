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
    const nf = new Intl.NumberFormat('fr-FR');
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const PERSONAS = {
        'binge-watcher': ['🍿', 'Binge-watcher', 'Un épisode ? Non : toute la saison. Le bouton « épisode suivant » n\'a aucun secret pour toi.'],
        'night-owl': ['🦉', 'Oiseau de nuit', 'Plus d\'un tiers de ton temps entre 22 h et 5 h. Le calme de la nuit, c\'est ton moment.'],
        'early-bird': ['🌅', 'Lève-tôt', 'Tu lances tes lectures avant même le premier café. Respect.'],
        'explorer': ['🧭', 'Explorateur musical', 'Plus de 100 artistes différents : tes oreilles ne tiennent pas en place.'],
        'music-lover': ['🎧', 'Mélomane', 'La musique d\'abord, le reste ensuite. Ton casque mérite des vacances.'],
        'cinephile': ['🎬', 'Cinéphile', 'Les films, c\'est ton terrain de jeu. Lumières éteintes, son à fond.'],
        'series-addict': ['📺', 'Sériephile', 'Les séries ont occupé l\'essentiel de ton année. Tu connais les génériques par cœur.'],
        'weekend-warrior': ['🛋️', 'Pro du week-end', 'Samedi et dimanche, c\'est sacré : canapé et Jellyfin.'],
        'eclectic': ['🌈', 'Éclectique', 'Un peu de tout, beaucoup de bon : tu ne te laisses enfermer dans aucune case.']
    };

    // ---------- Helpers ----------

    const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }[c]));
    const fmt = (n) => nf.format(Math.round(n || 0));
    const hours = (minutes) => Math.round((minutes || 0) / 60);
    const plural = (n, one, many) => `${fmt(n)} ${n > 1 ? many : one}`;
    const month = (m) => new Date(2000, m - 1, 1).toLocaleDateString('fr-FR', { month: 'long' });
    const longDate = (iso) => new Date(iso.length === 10 ? iso + 'T12:00:00' : iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
    const imageUrl = (id, height) => `${base}/Items/${id}/Images/Primary?fillHeight=${height || 400}&quality=90`;
    const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);
    const initials = (name) => esc(String(name || '?').trim().charAt(0).toUpperCase());

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
        app.innerHTML = '<div class="screen"><div class="spinner" role="status" aria-label="Chargement"></div></div>';
    }

    function loginScreen() {
        screen(`<h1>JellyWrapped</h1>
            <p>Connecte-toi à Jellyfin dans ce navigateur pour découvrir ton année en musique, films et séries.</p>
            <p><a class="btn" href="${base}/web/">Se connecter à Jellyfin</a></p>`);
    }

    function errorScreen(message) {
        screen(`<h1>Oups</h1><p>${esc(message)}</p>
            <p><button class="btn" onclick="location.reload()">Réessayer</button></p>`);
    }

    function emptyScreen(report, years) {
        const since = new Date(report.TrackingSinceUtc).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
        screen(`<h1>Rien à déballer… pour l'instant</h1>
            <p>Aucune lecture trouvée pour ${report.Year}. JellyWrapped enregistre tes écoutes et visionnages depuis le ${since} :
            lance un film, une série ou un album, et reviens plus tard !</p>
            ${yearPicker(years, report.Year)}
            <p><a class="btn ghost" href="${base}/web/">Retour à Jellyfin</a></p>`);
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
        const t = r.Totals;
        const add = (theme, html) => slides.push({ theme, html });

        add('t-intro', `
            <div class="kicker in">JellyWrapped ${r.Year}</div>
            <h1 class="title in" style="--d:1">Salut ${esc(r.UserName)}&nbsp;👋</h1>
            <p class="lead in" style="--d:2">Voici ton année ${r.Year} sur Jellyfin : la musique, les films et les séries qui l'ont marquée.</p>
            <p class="note in" style="--d:3">Touche la droite de l'écran pour avancer.</p>
            ${ctx.shared ? '' : yearPicker(ctx.years, r.Year)}`);

        const days = t.Minutes / 1440;
        add('t-total', `
            <div class="kicker in">Au total</div>
            <p class="lead in" style="--d:1">Cette année, tu as passé</p>
            <div class="huge in" style="--d:2" data-count="${t.Minutes}">0</div>
            <p class="title in" style="--d:3">minutes sur Jellyfin</p>
            <p class="lead in" style="--d:4">${days >= 1 ? `Soit <b>${nf.format(Math.round(days * 10) / 10)} jours</b> non-stop, ` : ''}répartis sur <b>${plural(t.ActiveDays, 'jour', 'jours')}</b> d'activité et <b>${plural(t.DistinctItems, 'titre différent', 'titres différents')}</b>.</p>
            ${r.ContainsEstimates ? '<p class="note in" style="--d:5">Une partie des films et épisodes, vus avant l\'installation de JellyWrapped, est estimée.</p>' : ''}`);

        const parts = [
            ['🎧 Musique', t.MusicMinutes, 'linear-gradient(90deg,#f72585,#b5179e)'],
            ['🎬 Films', t.MovieMinutes, 'linear-gradient(90deg,#ffbe0b,#fb5607)'],
            ['📺 Séries', t.SeriesMinutes, 'linear-gradient(90deg,#00f5d4,#00bbf9)']
        ].filter((p) => p[1] > 0);
        if (parts.length > 1) {
            add('t-split', `
                <div class="kicker in">Ton mix</div>
                <h2 class="title in" style="--d:1">Comment s'est réparti ton temps</h2>
                <div class="split">${parts.map((p, i) => `
                    <div class="in" style="--d:${i + 2}">
                        <div class="lbl"><span>${p[0]}</span><span>${Math.round((p[1] / Math.max(1, t.Minutes)) * 100)}&nbsp;%</span></div>
                        <div class="track"><div class="fill" style="--w:${(p[1] / Math.max(1, t.Minutes)) * 100}%;background:${p[2]}"></div></div>
                        <div class="note" style="margin-top:4px">${plural(hours(p[1]), 'heure', 'heures')}</div>
                    </div>`).join('')}</div>`);
        }

        const m = r.Music;
        if (m) {
            add('t-music', `
                <div class="kicker in">Côté musique</div>
                <div class="huge in" style="--d:1" data-count="${m.Minutes}">0</div>
                <p class="title in" style="--d:2">minutes d'écoute</p>
                <div class="stats">
                    <div class="stat in" style="--d:3"><div class="v">${fmt(m.Plays)}</div><div class="l">écoutes</div></div>
                    <div class="stat in" style="--d:4"><div class="v">${fmt(m.DistinctTracks)}</div><div class="l">titres différents</div></div>
                    <div class="stat in" style="--d:5"><div class="v">${fmt(m.DistinctArtists)}</div><div class="l">artistes</div></div>
                    <div class="stat in" style="--d:6"><div class="v">${nf.format(Math.round(m.Minutes / Math.max(1, m.Plays) * 10) / 10)}</div><div class="l">min. par écoute</div></div>
                </div>
                ${m.FirstTrack ? `<p class="lead in" style="--d:7">Ton tout premier morceau de l'année : <b>${esc(m.FirstTrack.Name)}</b>, le ${longDate(m.FirstTrack.Subtitle)}.</p>` : ''}`);

            const top = m.TopArtists[0];
            if (top) {
                add('t-artist', `
                    <div class="kicker in">Ton artiste n°1</div>
                    ${img(top.ImageId, top.Name, 'hero-img pop', 600)}
                    <h2 class="title in center" style="--d:2;text-align:center">${esc(top.Name)}</h2>
                    <p class="lead in" style="--d:3;text-align:center"><b>${plural(top.Minutes, 'minute', 'minutes')}</b> ensemble, sur ${plural(top.Plays, 'écoute', 'écoutes')}.</p>
                    ${m.TopArtists.length > 1 ? rankedList(m.TopArtists.slice(1, 5), { delay: 4, start: 1, image: 'round', value: (e) => `${fmt(e.Minutes)} min` }) : ''}`);
            }

            if (m.TopTracks.length) {
                add('t-tracks', `
                    <div class="kicker in">Tes titres préférés</div>
                    <h2 class="title in" style="--d:1">Tu les as écoutés en boucle</h2>
                    ${rankedList(m.TopTracks, { delay: 2, image: ' ', value: (e) => plural(e.Plays, 'écoute', 'écoutes') })}`);
            }

            if (m.TopAlbums.length || m.TopGenres.length) {
                add('t-albums', `
                    <div class="kicker in">Albums & genres</div>
                    ${m.TopAlbums.length ? rankedList(m.TopAlbums.slice(0, 4), { delay: 1, image: ' ', value: (e) => `${fmt(e.Minutes)} min` }) : ''}
                    ${m.TopGenres.length ? `<p class="lead in" style="--d:6">Tes genres du moment :</p>${chips(m.TopGenres)}` : ''}`);
            }
        }

        const mv = r.Movies;
        if (mv) {
            const longest = mv.Longest ? `<p class="lead in" style="--d:6">Ton plus long film : <b>${esc(mv.Longest.Name)}</b>, ${plural(mv.Longest.Minutes, 'minute', 'minutes')}. Bravo pour l'endurance.</p>` : '';
            add('t-movies', `
                <div class="kicker in">Côté cinéma</div>
                <h2 class="title in" style="--d:1"><span class="hl">${plural(mv.DistinctMovies, 'film', 'films')}</span> et ${plural(hours(mv.Minutes), 'heure', 'heures')} devant l'écran</h2>
                <div class="posters">${mv.TopMovies.slice(0, 3).map((e, i) => `
                    <div class="p in" style="--d:${i + 2}">${img(e.ImageId, e.Name, 'ph', 450)}<div class="cap">${i + 1}. ${esc(e.Name)}</div></div>`).join('')}</div>
                ${mv.TopGenres.length ? chips(mv.TopGenres) : ''}
                ${mv.FavoriteDecade ? `<p class="lead in" style="--d:5">Ta décennie préférée : <b>les années ${mv.FavoriteDecade < 2000 ? String(mv.FavoriteDecade).slice(-2) : mv.FavoriteDecade}</b>.</p>` : ''}
                ${longest}`);

            const actor = mv.TopActors[0];
            if (actor && actor.Plays >= 2) {
                add('t-actor', `
                    <div class="kicker in">Ta tête d'affiche</div>
                    ${img(actor.ImageId, actor.Name, 'hero-img poster pop', 600)}
                    <h2 class="title in" style="--d:2;text-align:center">${esc(actor.Name)}</h2>
                    <p class="lead in" style="--d:3;text-align:center">À l'affiche de <b>${actor.Plays} de tes films</b> cette année.</p>`);
            }
        }

        const s = r.Series;
        if (s) {
            add('t-series', `
                <div class="kicker in">Côté séries</div>
                <h2 class="title in" style="--d:1"><span class="hl">${plural(s.Episodes, 'épisode', 'épisodes')}</span> de ${plural(s.DistinctSeries, 'série', 'séries')}</h2>
                ${rankedList(s.TopSeries, { delay: 2, image: 'poster', value: (e) => plural(e.Plays, 'ép.', 'ép.') })}
                ${s.TopGenres.length ? chips(s.TopGenres.slice(0, 4)) : ''}`);

            if (s.Binge && s.Binge.Episodes >= 3) {
                add('t-binge', `
                    <div class="kicker in">Record de binge</div>
                    ${img(s.Binge.ImageId, s.Binge.SeriesName, 'hero-img poster pop', 600)}
                    <h2 class="title in" style="--d:2;text-align:center">${s.Binge.Episodes} épisodes en une journée</h2>
                    <p class="lead in" style="--d:3;text-align:center">Le ${longDate(s.Binge.Date)}, <b>${esc(s.Binge.SeriesName)}</b> ne t'a pas lâché.</p>`);
            }
        }

        const h = r.Habits;
        const monthLabels = Array.from({ length: 12 }, (_, i) => month(i + 1).charAt(0).toUpperCase());
        const peakHour = h.MinutesByHour.indexOf(Math.max(...h.MinutesByHour));
        add('t-habits', `
            <div class="kicker in">Tes habitudes</div>
            <h2 class="title in" style="--d:1">${h.PeakMonth ? `<span class="hl">${capitalize(month(h.PeakMonth))}</span> a été ton mois le plus intense` : 'Ton année, mois par mois'}</h2>
            <div class="in" style="--d:2">${barChart(h.MinutesByMonth, monthLabels, '', (h.PeakMonth || 0) - 1)}</div>
            <p class="lead in" style="--d:3">Ton heure de pointe : <b>${peakHour} h</b>.</p>
            <div class="in" style="--d:3">${barChart(h.MinutesByHour, null, 'hours', peakHour)}</div>
            <div class="stats">
                <div class="stat in" style="--d:4"><div class="v">${plural(h.LongestStreakDays, 'jour', 'jours')}</div><div class="l">ta plus longue série d'affilée</div></div>
                <div class="stat in" style="--d:5"><div class="v">${fmt(h.PeakDayMinutes)} min</div><div class="l">${h.PeakDay ? `le ${longDate(h.PeakDay)}, ` : ''}ton jour record</div></div>
            </div>`);

        if (r.Server && r.Server.Users >= 3) {
            add('t-server', `
                <div class="kicker in">Sur ce serveur</div>
                <p class="lead in" style="--d:1">Parmi les ${r.Server.Users} utilisateurs actifs, tu ${r.Server.Rank === 1 ? 'es le' : 'fais partie du'}</p>
                <div class="huge in" style="--d:2">${r.Server.Rank === 1 ? 'n°1' : `top ${r.Server.TopPercent}&nbsp;%`}</div>
                <p class="title in" style="--d:3">${r.Server.Rank === 1 ? 'Personne n\'a passé plus de temps sur Jellyfin que toi cette année.' : `Tu es ${r.Server.Rank}<sup>e</sup> au classement du temps passé.`}</p>`);
        }

        const p = PERSONAS[r.Persona] || PERSONAS.eclectic;
        add('t-persona', `
            <div class="kicker in center" style="text-align:center">Ton profil ${r.Year}</div>
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
            blocks.push(`<div><h4>Top artistes</h4>${list(r.Music.TopArtists)}</div>`);
        }

        if (r.Music?.TopTracks.length) {
            blocks.push(`<div><h4>Top titres</h4>${list(r.Music.TopTracks)}</div>`);
        }

        if (r.Movies?.TopMovies.length) {
            blocks.push(`<div><h4>Top films</h4>${list(r.Movies.TopMovies)}</div>`);
        }

        if (r.Series?.TopSeries.length) {
            blocks.push(`<div><h4>Top séries</h4>${list(r.Series.TopSeries)}</div>`);
        }

        const p = PERSONAS[r.Persona] || PERSONAS.eclectic;
        const shareBlock = ctx.admin
            ? `<a class="btn ghost" href="${dashboardUrl}">Retour au tableau de bord</a>`
            : ctx.shared
            ? `<a class="btn ghost" href="${base}/web/">Découvrir Jellyfin</a>`
            : `<button class="btn" data-action="image">Enregistrer l'image</button>
               ${ctx.sharingEnabled ? `<button class="btn ghost" data-action="link">${ctx.shareToken ? 'Lien public' : 'Créer un lien public'}</button>` : ''}`;

        return `
            <div class="kicker in">${ctx.shared ? `L'année de ${esc(r.UserName)}` : 'Ton année en résumé'}</div>
            <div class="summary in" style="--d:1">
                <div class="full" style="display:flex;justify-content:space-between;align-items:flex-end">
                    <div><h4>Minutes</h4><div class="big">${fmt(r.Totals.Minutes)}</div></div>
                    <div style="text-align:right"><h4>Profil</h4><div style="font-weight:800">${p[0]} ${p[1]}</div></div>
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
                        <button class="icon-btn interactive" data-action="close" aria-label="Fermer">✕</button></div>
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
                <div class="share-link"><input readonly value="${esc(url)}" aria-label="Lien public">
                    <button class="btn" data-copy>Copier</button><button class="btn ghost" data-revoke>Supprimer</button></div>
                <p class="note" style="margin-top:6px">Toute personne qui a ce lien voit ce résumé, figé à aujourd'hui${location.hostname === 'localhost' ? '' : ', si ton serveur est accessible depuis Internet'}.</p>`;
            area.querySelector('[data-copy]').onclick = async (e) => {
                e.stopPropagation();
                try {
                    await navigator.clipboard.writeText(url);
                    toast('Lien copié');
                } catch {
                    area.querySelector('input').select();
                }
            };
            area.querySelector('[data-revoke]').onclick = async (e) => {
                e.stopPropagation();
                await api(`Shares/${report.Year}`, { method: 'DELETE' });
                ctx.shareToken = null;
                area.innerHTML = '';
                toast('Lien supprimé');
            };
        } catch {
            toast('Impossible de créer le lien');
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
            let t = String(text || '');
            while (c.measureText(t).width > max && t.length > 1) {
                t = t.slice(0, -2).trimEnd() + '…';
                if (t.length <= 2) {
                    break;
                }
            }

            return t;
        };

        c.fillStyle = '#ffd84d';
        c.font = font(800, 34);
        c.fillText(`JELLYWRAPPED ${r.Year}`, 80, 130);
        c.fillStyle = '#fff';
        c.font = font(900, 84);
        c.fillText(fit(`L'année de ${r.UserName}`, W - 160), 80, 230);

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
            columns.push(['Top artistes', r.Music.TopArtists]);
        }

        if (r.Music?.TopTracks.length) {
            columns.push(['Top titres', r.Music.TopTracks]);
        }

        if (r.Movies?.TopMovies.length) {
            columns.push(['Top films', r.Movies.TopMovies]);
        }

        if (r.Series?.TopSeries.length) {
            columns.push(['Top séries', r.Series.TopSeries]);
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
        c.fillText('MINUTES', 110, y + 20);
        c.fillText('PROFIL', W / 2 + 20, y + 20);
        c.fillStyle = '#fff';
        c.font = font(900, 76);
        c.fillText(fmt(r.Totals.Minutes), 110, y + 105);
        const p = PERSONAS[r.Persona] || PERSONAS.eclectic;
        c.font = font(800, 50);
        c.fillText(fit(`${p[0]} ${p[1]}`, W / 2 - 120), W / 2 + 20, y + 100);

        return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    }

    async function shareImage(report, button) {
        button.disabled = true;
        try {
            const blob = await renderImage(report);
            const file = new File([blob], `jellywrapped-${report.Year}.png`, { type: 'image/png' });
            if (navigator.canShare && navigator.canShare({ files: [file] })) {
                try {
                    await navigator.share({ files: [file], title: `Mon JellyWrapped ${report.Year}` });
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
            toast('Image enregistrée');
        } catch {
            toast('Impossible de générer l\'image');
        } finally {
            button.disabled = false;
        }
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
                errorScreen('Impossible de charger ton récapitulatif.');
            }
        }
    }

    function bindYearPicker(years) {
        app.querySelectorAll('[data-year]').forEach((b) => b.addEventListener('click', () => loadYear(+b.dataset.year, years)));
    }

    async function boot() {
        if (shareToken) {
            try {
                const data = await api(`Shared/${encodeURIComponent(shareToken)}`);
                play(data.Report, { shared: true });
            } catch {
                errorScreen('Ce lien de partage n\'existe pas ou n\'est plus actif.');
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
                    screen(`<h1>Rien à afficher</h1><p>${esc(data.Report.UserName)} n'a aucune lecture en ${adminYear}.</p>
                        <p><a class="btn" href="${dashboardUrl}">Retour au tableau de bord</a></p>`);
                }
            } catch (e) {
                errorScreen(e.status === 403 || e.status === 401
                    ? 'Seuls les administrateurs peuvent voir le récapitulatif des autres utilisateurs.'
                    : 'Impossible de charger ce récapitulatif.');
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
                errorScreen('Impossible de joindre le serveur.');
            }
        }
    }

    boot();
})();
