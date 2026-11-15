import {
  parseVodUrl, toGlobal, toLocal, covers, timelineBounds, pickPov,
  twitchTime, formatClock, parseDuration, encodeState, decodeState,
} from './sync.js';

const $ = (id) => document.getElementById(id);
const state = decodeState(new URLSearchParams(location.hash.slice(1)).get('s'));
let active = 0;          // index du POV affiché
let player = null;       // adaptateur du lecteur courant
let globalMs = null;     // instant réel affiché sur l'horloge commune
let scrubbing = false;
const emptyHtml = $('player').innerHTML;

// --- Adaptateurs de lecteur ------------------------------------------------
const scripts = {};
function loadScript(src, ready) {
  scripts[src] ??= new Promise((resolve, reject) => {
    if (ready && ready()) return resolve();
    const s = document.createElement('script');
    s.src = src;
    s.onerror = () => reject(new Error('Impossible de charger ' + src));
    if (src.includes('youtube')) window.onYouTubeIframeAPIReady = resolve;
    else s.onload = resolve;
    document.head.appendChild(s);
  });
  return scripts[src];
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

let mountToken = 0;
async function mount(index, atGlobal) {
  const pov = state.povs[index];
  if (!pov) return;
  const token = ++mountToken;
  active = index;
  player?.destroy();
  player = null;
  const box = $('player');
  box.innerHTML = '';
  const el = document.createElement('div');
  box.appendChild(el);
  const startSec = Math.max(0, toLocal(pov, atGlobal ?? pov.start));
  globalMs = toGlobal(pov, startSec);
  renderPovs();
  try {
    const p = await (pov.platform === 'youtube' ? mountYouTube : mountTwitch)(el, pov.id, startSec);
    if (token !== mountToken) return p.destroy(); // un autre POV a été choisi entre-temps
    player = p;
    const d = p.duration();
    if (d > 0 && !pov.duration) { pov.duration = Math.round(d); save(); }
  } catch (e) {
    toast(e.message);
  }
}

// --- Rendu -------------------------------------------------------------------
function renderPovs() {
  const box = $('povs');
  box.innerHTML = '';
  state.povs.forEach((pov, i) => {
    const card = document.createElement('div');
    card.className = 'pov' + (i === active ? ' active' : '');
    if (globalMs != null && !covers(pov, globalMs)) card.classList.add('off');
    card.tabIndex = 0;
    card.setAttribute('role', 'button');
    const badge = el('span', 'badge ' + pov.platform, pov.platform);
    const name = el('span', 'name', pov.label);
    const meta = el('span', 'meta', 'début ' + formatClock(pov.start)
      + (globalMs != null && !covers(pov, globalMs) ? ' · hors champ' : ''));
    const tools = el('span', 'tools');
    for (const [txt, title, fn] of [
      ['−1s', 'Décaler ce POV d\'une seconde plus tôt', () => nudge(i, -1000)],
      ['+1s', 'Décaler ce POV d\'une seconde plus tard', () => nudge(i, 1000)],
      ['✕', 'Retirer ce POV', () => removePov(i)],
    ]) {
      const b = el('span', '', txt);
      b.title = title;
      b.addEventListener('click', (e) => { e.stopPropagation(); fn(); });
      tools.appendChild(b);
    }
    card.append(badge, name, meta, tools);
    const go = () => mount(i, globalMs);
    card.addEventListener('click', go);
    card.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
    box.appendChild(card);
  });
  const has = state.povs.length > 0;
  $('timeline').disabled = !has;
  $('addMoment').disabled = !has;
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
  const target = pickPov(state.povs, ms, active);
  if (target !== active || !player) return mount(target, ms);
  player.seek(Math.max(0, toLocal(state.povs[active], ms)));
  globalMs = ms;
}

function nudge(i, deltaMs) {
  state.povs[i].start += deltaMs;
  save();
  if (i === active && player && globalMs != null) player.seek(Math.max(0, toLocal(state.povs[i], globalMs)));
  renderPovs();
}

function removePov(i) {
  state.povs.splice(i, 1);
  save();
  if (i === active) {
    player?.destroy();
    player = null;
    active = 0;
    if (state.povs.length) mount(0, globalMs);
    else { $('player').innerHTML = emptyHtml; globalMs = null; $('clock').textContent = '--:--:--'; }
  } else if (i < active) active--;
  renderPovs();
}

function save() {
  const s = encodeState(state);
  history.replaceState(null, '', '#s=' + s);
}

function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove('show'), 2200);
}

$('addPov').addEventListener('submit', (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  const vod = parseVodUrl(f.get('url'));
  const start = new Date(f.get('start')).getTime();
  if (!vod) return ($('formError').textContent = 'URL non reconnue : utilisez une VOD Twitch (/videos/…) ou YouTube.');
  if (!Number.isFinite(start)) return ($('formError').textContent = 'Indiquez l\'heure réelle de début de la VOD.');
  $('formError').textContent = '';
  state.povs.push({
    ...vod, start,
    label: String(f.get('label') || '').trim() || vod.id,
    duration: parseDuration(f.get('duration')),
  });
  save();
  e.target.reset();
  if (state.povs.length === 1) mount(0, null);
  else renderPovs();
});

$('addMoment').addEventListener('click', () => {
  if (globalMs == null) return;
  const label = prompt('Nom du moment (ex. : « La trahison »)', '');
  if (label === null) return;
  state.moments.push({ at: Math.round(globalMs), label: label.trim().slice(0, 80) });
  save();
  renderMoments();
});

$('play').addEventListener('click', () => player?.toggle());
$('title').addEventListener('input', (e) => { state.title = e.target.value; document.title = (state.title ? state.title + ' · ' : '') + 'MULTIVERSE'; save(); });

$('share').addEventListener('click', async () => {
  save();
  try {
    await navigator.clipboard.writeText(location.href);
    toast('Lien copié : il contient tous les POV et les moments.');
  } catch {
    prompt('Copiez ce lien :', location.href);
  }
});

const tl = $('timeline');
tl.addEventListener('input', () => {
  scrubbing = true;
  const b = timelineBounds(state.povs);
  if (b) $('clock').textContent = formatClock(b.min + (tl.value / 1000) * (b.max - b.min));
});
tl.addEventListener('change', () => {
  scrubbing = false;
  const b = timelineBounds(state.povs);
  if (b) seekGlobal(b.min + (tl.value / 1000) * (b.max - b.min));
});

// --- Boucle d'horloge ----------------------------------------------------------
let lastCovered = '';
setInterval(() => {
  if (player && state.povs[active]) {
    try { globalMs = toGlobal(state.povs[active], player.time()); } catch { /* lecteur pas encore prêt */ }
    $('play').textContent = player.playing() ? '❚❚' : '▶';
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
