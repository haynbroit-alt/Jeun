import {
  parseVodUrl, toGlobal, toLocal, covers, timelineBounds, pickPov,
  twitchTime, formatClock, parseDuration, encodeState, decodeState,
} from './sync.js';

const $ = (id) => document.getElementById(id);
const state = decodeState(new URLSearchParams(location.hash.slice(1)).get('s'));
let active = 0;          // index du POV affiché
let player = null;       // adaptateur du lecteur courant
let globalMs = null;     // instant réel affiché sur l'horloge commune
let pendingMs = null;    // instant demandé au lecteur, pas encore confirmé par lui
let pendingTicks = 0;    // ticks de lecture écoulés depuis la demande
let durationChecked = false; // durée réelle du POV actif déjà relevée ?
let scrubbing = false;
const emptyHtml = $('player').innerHTML;
const tl = $('timeline');

// --- Adaptateurs de lecteur ------------------------------------------------
const scripts = {};
function loadScript(src, ready, ms = 15000) {
  if (ready && ready()) return Promise.resolve();
  return (scripts[src] ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    let timer;
    const done = () => { clearTimeout(timer); resolve(); };
    // En cas d'échec, on vide le cache pour qu'un prochain essai refasse la requête.
    const fail = (msg) => { clearTimeout(timer); delete scripts[src]; s.remove(); reject(new Error(msg)); };
    s.onerror = () => fail('Impossible de charger le lecteur (' + new URL(src).hostname + ').');
    timer = setTimeout(() => fail('Le lecteur (' + new URL(src).hostname + ') ne répond pas.'), ms);
    if (src.includes('youtube')) window.onYouTubeIframeAPIReady = done;
    else s.onload = done;
    document.head.appendChild(s);
  }));
}

async function mountYouTube(el, id, startSec) {
  await loadScript('https://www.youtube.com/iframe_api', () => window.YT?.Player);
  return new Promise((resolve) => {
    const p = new YT.Player(el, {
      videoId: id,
      playerVars: { start: Math.floor(startSec), autoplay: 1, playsinline: 1, rel: 0 },
      events: {
        onReady: () => resolve({
          time: () => p.getCurrentTime(),
          seek: (s) => p.seekTo(s, true),
          playing: () => p.getPlayerState() === YT.PlayerState.PLAYING,
          toggle: () => (p.getPlayerState() === YT.PlayerState.PLAYING ? p.pauseVideo() : p.playVideo()),
          duration: () => p.getDuration(),
          destroy: () => p.destroy(),
        }),
      },
    });
  });
}

async function mountTwitch(el, id, startSec) {
  await loadScript('https://player.twitch.tv/js/embed/v1.js', () => window.Twitch?.Player);
  const p = new Twitch.Player(el, {
    video: 'v' + id, time: twitchTime(startSec), autoplay: true,
    parent: [location.hostname || 'localhost'], width: '100%', height: '100%',
  });
  await new Promise((r) => p.addEventListener(Twitch.Player.READY, r));
  return {
    time: () => p.getCurrentTime(),
    seek: (s) => p.seek(s),
    playing: () => !p.isPaused(),
    toggle: () => (p.isPaused() ? p.play() : p.pause()),
    duration: () => p.getDuration(),
    destroy: () => { el.innerHTML = ''; },
  };
}

/** Instant réel le plus frais : la cible en attente, sinon la position lue à l'instant dans le lecteur. */
function currentGlobal() {
  if (pendingMs != null || !player || !state.povs[active]) return pendingMs ?? globalMs;
  try { return toGlobal(state.povs[active], player.time()); } catch { return globalMs; }
}

let mountToken = 0;
async function mount(index, atGlobal) {
  const pov = state.povs[index];
  if (!pov) return;
  const token = ++mountToken;
  active = index;
  durationChecked = false;
  player?.destroy();
  player = null;
  const box = $('player');
  box.innerHTML = '';
  const el = document.createElement('div');
  box.appendChild(el);
  const startSec = Math.max(0, toLocal(pov, atGlobal ?? pov.start));
  globalMs = toGlobal(pov, startSec);
  pendingMs = globalMs; pendingTicks = 0;
  renderPovs();
  try {
    const p = await (pov.platform === 'youtube' ? mountYouTube : mountTwitch)(el, pov.id, startSec);
    if (token !== mountToken) return p.destroy(); // un autre POV a été choisi entre-temps
    player = p;
    // Les paramètres de départ n'acceptent que des secondes entières : on corrige la fraction.
    if (startSec % 1) p.seek(startSec);
  } catch (e) {
    if (token === mountToken) toast(e.message);
  }
}

// --- Rendu -------------------------------------------------------------------
function renderPovs() {
  const box = $('povs');
  const focused = box.contains(document.activeElement) ? document.activeElement.dataset.key : null;
  box.innerHTML = '';
  state.povs.forEach((pov, i) => {
    const off = globalMs != null && !covers(pov, globalMs);
    const card = el('div', 'pov' + (i === active ? ' active' : '') + (off ? ' off' : ''));
    const badge = el('span', 'badge ' + pov.platform, pov.platform);
    const name = el('button', 'name', pov.label);
    name.type = 'button';
    name.dataset.key = 'go-' + i;
    name.title = 'Regarder ce POV au même instant';
    name.setAttribute('aria-pressed', String(i === active));
    const meta = el('span', 'meta', 'début ' + formatClock(pov.start) + (off ? ' · hors champ' : ''));
    const tools = el('span', 'tools');
    for (const [key, txt, title, fn] of [
      ['minus', '−1s', 'Recaler : ce POV a démarré 1 s plus tôt', () => nudge(i, -1000)],
      ['plus', '+1s', 'Recaler : ce POV a démarré 1 s plus tard', () => nudge(i, 1000)],
      ['del', '✕', 'Retirer ce POV', () => removePov(i)],
    ]) {
      const b = el('button', '', txt);
      b.type = 'button';
      b.title = title;
      b.dataset.key = key + '-' + i;
      b.setAttribute('aria-label', title + ' (' + pov.label + ')');
      b.addEventListener('click', fn);
      tools.appendChild(b);
    }
    card.append(badge, name, meta, tools);
    // Toute la carte est cliquable à la souris, sauf la zone d'outils.
    card.addEventListener('click', (e) => { if (!e.target.closest('.tools')) mount(i, currentGlobal()); });
    box.appendChild(card);
  });
  if (focused) box.querySelector(`[data-key="${focused}"]`)?.focus({ preventScroll: true });
  const has = state.povs.length > 0;
  tl.disabled = !has;
  $('addMoment').disabled = !has;
  $('play').disabled = !has;
  if (!has) $('play').textContent = '▶';
  renderMarkers();
}

function renderMoments() {
  const list = $('moments');
  list.innerHTML = '';
  [...state.moments].sort((a, b) => a.at - b.at).forEach((m) => {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    b.append(el('time', '', formatClock(m.at)), document.createTextNode(m.label || 'Moment'));
    b.addEventListener('click', () => seekGlobal(m.at));
    li.appendChild(b);
    list.appendChild(li);
  });
  $('noMoments').hidden = state.moments.length > 0;
  renderMarkers();
}

function renderMarkers() {
  const box = $('markers');
  box.innerHTML = '';
  const b = timelineBounds(state.povs);
  if (!b) return;
  for (const m of state.moments) {
    const pct = ((m.at - b.min) / (b.max - b.min)) * 100;
    if (pct < 0 || pct > 100) continue;
    const d = el('div', 'marker');
    d.style.left = pct + '%';
    d.title = m.label;
    box.appendChild(d);
  }
}

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

// --- Actions -----------------------------------------------------------------
function seekGlobal(ms) {
  if (!state.povs.length) return toast('Ajoutez un POV pour lire ce moment.');
  const target = pickPov(state.povs, ms, active);
  if (target !== active || !player) return mount(target, ms);
  player.seek(Math.max(0, toLocal(state.povs[active], ms)));
  globalMs = ms;
  pendingMs = ms; pendingTicks = 0;
}

// Décaler le début réel d'un POV : « −1s » = la VOD a démarré 1 s plus tôt qu'indiqué.
function nudge(i, deltaMs) {
  const at = currentGlobal();
  state.povs[i].start += deltaMs;
  save();
  if (i === active && player && at != null) {
    player.seek(Math.max(0, toLocal(state.povs[i], at)));
    globalMs = at;
    pendingMs = at; pendingTicks = 0;
  }
  renderPovs();
}

function removePov(i) {
  const at = currentGlobal();
  state.povs.splice(i, 1);
  save();
  if (i === active) {
    player?.destroy();
    player = null;
    mountToken++; // annule un éventuel montage en cours
    active = 0;
    if (state.povs.length) mount(pickPov(state.povs, at, 0), at);
    else {
      $('player').innerHTML = emptyHtml;
      globalMs = null;
      pendingMs = null;
      tl.value = 0;
      $('clock').textContent = '--:--:--';
    }
  } else if (i < active) active--;
  renderPovs();
}

function save() {
  history.replaceState(null, '', '#s=' + encodeState(state));
}

function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove('show'), 2600);
}

$('addPov').addEventListener('submit', (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  const vod = parseVodUrl(f.get('url'));
  const start = new Date(f.get('start')).getTime();
  const durText = String(f.get('duration') || '').trim();
  const duration = parseDuration(durText);
  const err = $('formError');
  if (!vod) return (err.textContent = 'Lien non reconnu : il faut une VOD Twitch (twitch.tv/videos/…) ou une vidéo YouTube (youtube.com/watch?v=…).');
  if (!Number.isFinite(start)) return (err.textContent = 'Indiquez l\'heure réelle de début de la VOD.');
  if (durText && (!duration || duration > 48 * 3600)) return (err.textContent = 'Durée invalide : utilisez h:mm (ex. 4:00) ou h:mm:ss.');
  err.textContent = '';
  state.povs.push({ ...vod, start, label: String(f.get('label') || '').trim() || vod.id, duration });
  save();
  e.target.reset();
  if (state.povs.length === 1) mount(0, null);
  else renderPovs();
});

$('addMoment').addEventListener('click', () => {
  const at = currentGlobal();
  if (at == null) return;
  const label = prompt('Nom du moment (ex. : « La trahison »)', '');
  if (label === null) return;
  state.moments.push({ at: Math.round(at), label: label.trim().slice(0, 80) });
  save();
  renderMoments();
});

$('play').addEventListener('click', () => player?.toggle());
$('title').addEventListener('input', (e) => {
  state.title = e.target.value;
  document.title = (state.title ? state.title + ' · ' : '') + 'MULTIVERSE';
  save();
});

$('share').addEventListener('click', async () => {
  save();
  try {
    await navigator.clipboard.writeText(location.href);
    toast('Lien copié : il contient tous les POV et les moments.');
  } catch {
    prompt('Copiez ce lien :', location.href);
  }
});

// Un lien MULTIVERSE collé dans le même onglet ne recharge pas la page : on le fait nous-mêmes.
// (history.replaceState, utilisé par save(), ne déclenche jamais hashchange.)
window.addEventListener('hashchange', () => location.reload());

const sliderToMs = (b) => b.min + (tl.value / 1000) * (b.max - b.min);
tl.addEventListener('input', () => {
  scrubbing = true;
  const b = timelineBounds(state.povs);
  if (b) $('clock').textContent = formatClock(sliderToMs(b));
});
tl.addEventListener('change', () => {
  scrubbing = false;
  const b = timelineBounds(state.povs);
  if (b) seekGlobal(sliderToMs(b));
});
// « change » ne part pas si le curseur est relâché sur sa valeur de départ : on termine le geste ici aussi.
const endScrub = () => { scrubbing = false; };
for (const ev of ['pointerup', 'pointercancel', 'blur']) tl.addEventListener(ev, endScrub);

// --- Boucle d'horloge ----------------------------------------------------------
let lastCovered = '';
setInterval(() => {
  const cur = state.povs[active];
  if (player && cur) {
    try {
      const g = toGlobal(cur, player.time());
      const playing = player.playing();
      // Juste après un montage ou un seek, le lecteur renvoie encore 0 ou l'ancienne position :
      // on garde l'instant demandé tant qu'il n'a pas confirmé y être.
      // Après ~3 s de lecture, on fait confiance au lecteur (l'utilisateur a pu se déplacer dans l'embed).
      if (playing && pendingMs != null) pendingTicks++;
      if (pendingMs == null || (playing && (Math.abs(g - pendingMs) < 2000 || pendingTicks > 6))) {
        pendingMs = null;
        globalMs = g;
      }
      $('play').textContent = playing ? '❚❚' : '▶';
      // La durée n'est connue qu'une fois la vidéo chargée : on la relève dès qu'elle arrive.
      // La durée réelle l'emporte sur une durée saisie à la main.
      if (!durationChecked) {
        const d = player.duration();
        if (Number.isFinite(d) && d > 0) {
          durationChecked = true;
          if (Math.abs(d - (cur.duration || 0)) > 2) {
            cur.duration = Math.round(d);
            save();
            lastCovered = ''; // force le recalcul des cartes, des bornes et des repères
          }
        }
      }
    } catch { /* lecteur pas encore prêt */ }
  }
  if (globalMs == null || scrubbing) return;
  $('clock').textContent = formatClock(globalMs);
  const b = timelineBounds(state.povs);
  if (b) tl.value = Math.round(((globalMs - b.min) / (b.max - b.min)) * 1000);
  // Ne réafficher les cartes que si la couverture change (pas à chaque tick).
  const covered = state.povs.map((p) => (covers(p, globalMs) ? 1 : 0)).join('');
  if (covered !== lastCovered) { lastCovered = covered; renderPovs(); }
}, 500);

// --- Démarrage -----------------------------------------------------------------
$('title').value = state.title;
if (state.title) document.title = state.title + ' · MULTIVERSE';
renderMoments();
renderPovs();
if (state.povs.length) mount(0, null);
