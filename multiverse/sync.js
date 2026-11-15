// Logique pure de MULTIVERSE : parsing des URLs, horloge commune, état partageable.
// Aucune dépendance au DOM, ce qui permet de la tester avec `node --test`.

/** Reconnaît une URL de VOD YouTube ou Twitch. Renvoie {platform, id} ou null. */
export function parseVodUrl(raw) {
  const s = String(raw ?? '').trim();
  let url;
  try {
    // Accepte aussi « youtube.com/watch?v=… » ou « www.twitch.tv/videos/… » sans https://
    url = new URL(/^[a-z][\w+.-]*:\/\//i.test(s) ? s : 'https://' + s);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^(www\.|m\.)/, '');
  if (host === 'youtu.be') {
    const id = url.pathname.slice(1).split('/')[0];
    return isYtId(id) ? { platform: 'youtube', id } : null;
  }
  if (host === 'youtube.com') {
    const v = url.searchParams.get('v');
    if (isYtId(v)) return { platform: 'youtube', id: v };
    const m = url.pathname.match(/^\/(?:live|embed|shorts)\/([\w-]{11})/);
    return m ? { platform: 'youtube', id: m[1] } : null;
  }
  if (host === 'twitch.tv') {
    const m = url.pathname.match(/^\/videos\/(\d+)/);
    return m ? { platform: 'twitch', id: m[1] } : null;
  }
  return null;
}

function isYtId(id) {
  return typeof id === 'string' && /^[\w-]{11}$/.test(id);
}

/** Convertit une position locale (secondes dans la VOD) en instant réel (ms epoch). */
export function toGlobal(pov, localSec) {
  return pov.start + localSec * 1000;
}

/** Convertit un instant réel (ms epoch) en position locale dans la VOD (secondes). */
export function toLocal(pov, globalMs) {
  return (globalMs - pov.start) / 1000;
}

/** Indique si la VOD couvre l'instant réel donné. Durée inconnue : on suppose que oui une fois démarrée. */
export function covers(pov, globalMs) {
  const local = toLocal(pov, globalMs);
  if (local < 0) return false;
  return pov.duration ? local <= pov.duration : true;
}

const DEFAULT_DURATION = 4 * 3600; // hypothèse quand la durée est inconnue

/** Bornes de la timeline commune {min, max} en ms epoch, ou null s'il n'y a aucun POV. */
export function timelineBounds(povs) {
  if (!povs.length) return null;
  let min = Infinity;
  let max = -Infinity;
  for (const p of povs) {
    min = Math.min(min, p.start);
    max = Math.max(max, p.start + (p.duration || DEFAULT_DURATION) * 1000);
  }
  return { min, max };
}

/** Choisit le meilleur POV pour un instant : le POV préféré s'il le couvre, sinon le premier qui le couvre. */
export function pickPov(povs, globalMs, preferredIndex) {
  if (povs[preferredIndex] && covers(povs[preferredIndex], globalMs)) return preferredIndex;
  const i = povs.findIndex((p) => covers(p, globalMs));
  return i === -1 ? preferredIndex : i;
}

/** Format compact accepté par le paramètre `time` du lecteur Twitch : 1h02m03s. */
export function twitchTime(sec) {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}h${String(m).padStart(2, '0')}m${String(s % 60).padStart(2, '0')}s`;
}

/** Heure lisible HH:MM:SS (heure locale du navigateur). */
export function formatClock(ms) {
  const d = new Date(ms);
  return [d.getHours(), d.getMinutes(), d.getSeconds()].map((n) => String(n).padStart(2, '0')).join(':');
}

/** Parse une durée "2:30:00", "90:00" ou "45" (minutes) en secondes. Renvoie 0 si vide ou invalide. */
export function parseDuration(text) {
  const t = String(text || '').trim();
  if (!t) return 0;
  const parts = t.split(':').map(Number);
  if (parts.some((n) => !Number.isFinite(n) || n < 0)) return 0;
  if (parts.length === 1) return parts[0] * 60;
  if (parts.length === 2) return parts[0] * 3600 + parts[1] * 60;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return 0;
}

// --- État partageable dans l'URL (#s=...) -----------------------------------

/** Encode l'état {title, povs, moments} en base64url, encodage UTF-8 compris. */
export function encodeState(state) {
  const compact = {
    t: state.title || '',
    p: state.povs.map((p) => [p.platform, p.id, p.label, p.start, p.duration || 0]),
    m: (state.moments || []).map((m) => [m.at, m.label]),
  };
  const bytes = new TextEncoder().encode(JSON.stringify(compact));
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Décode l'état. Les entrées invalides sont ignorées. En cas d'échec, renvoie un état vide. */
export function decodeState(str) {
  const empty = { title: '', povs: [], moments: [] };
  if (!str) return empty;
  try {
    const b64 = str.replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    const c = JSON.parse(new TextDecoder().decode(bytes));
    const povs = (Array.isArray(c.p) ? c.p : [])
      .filter((r) => Array.isArray(r) && (r[0] === 'youtube' || r[0] === 'twitch') && typeof r[1] === 'string' && Number.isFinite(r[3]))
      .map(([platform, id, label, start, duration]) => ({
        platform,
        id,
        label: String(label || id).slice(0, 60),
        start,
        duration: Number(duration) || 0,
      }));
    const moments = (Array.isArray(c.m) ? c.m : [])
      .filter((r) => Array.isArray(r) && Number.isFinite(r[0]))
      .map(([at, label]) => ({ at, label: String(label || '').slice(0, 80) }));
    return { title: String(c.t || '').slice(0, 80), povs, moments };
  } catch {
    return empty;
  }
}
