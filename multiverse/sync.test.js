import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseVodUrl, toGlobal, toLocal, covers, timelineBounds, pickPov,
  twitchTime, parseDuration, encodeState, decodeState,
} from './sync.js';

test('parseVodUrl reconnaît YouTube et Twitch', () => {
  assert.deepEqual(parseVodUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10'), { platform: 'youtube', id: 'dQw4w9WgXcQ' });
  assert.deepEqual(parseVodUrl('https://youtu.be/dQw4w9WgXcQ'), { platform: 'youtube', id: 'dQw4w9WgXcQ' });
  assert.deepEqual(parseVodUrl('https://youtube.com/live/dQw4w9WgXcQ?si=x'), { platform: 'youtube', id: 'dQw4w9WgXcQ' });
  assert.deepEqual(parseVodUrl('https://www.twitch.tv/videos/2112345678?t=1h'), { platform: 'twitch', id: '2112345678' });
  assert.deepEqual(parseVodUrl('youtube.com/watch?v=dQw4w9WgXcQ'), { platform: 'youtube', id: 'dQw4w9WgXcQ' });
  assert.deepEqual(parseVodUrl('www.twitch.tv/videos/123'), { platform: 'twitch', id: '123' });
  assert.equal(parseVodUrl('https://twitch.tv/somechannel'), null);
  assert.equal(parseVodUrl('pas une url'), null);
  assert.equal(parseVodUrl('https://evil.com/watch?v=dQw4w9WgXcQ'), null);
});

test('conversion local <-> global', () => {
  const pov = { start: 1_000_000, duration: 100 };
  assert.equal(toGlobal(pov, 10), 1_010_000);
  assert.equal(toLocal(pov, 1_010_000), 10);
  assert.equal(covers(pov, 999_999), false);
  assert.equal(covers(pov, 1_050_000), true);
  assert.equal(covers(pov, 1_100_001), false);
  assert.equal(covers({ start: 0, duration: 0 }, 9e12), true); // durée inconnue
});

test('timelineBounds et pickPov', () => {
  const povs = [
    { start: 0, duration: 60 },
    { start: 30_000, duration: 120 },
  ];
  assert.deepEqual(timelineBounds(povs), { min: 0, max: 150_000 });
  assert.equal(timelineBounds([]), null);
  assert.equal(pickPov(povs, 40_000, 0), 0);  // le POV préféré couvre l'instant : on le garde
  assert.equal(pickPov(povs, 100_000, 0), 1); // le POV préféré est terminé : on bascule
  assert.equal(pickPov(povs, 999_000, 1), 1); // aucun ne couvre : on reste
});

test('twitchTime et parseDuration', () => {
  assert.equal(twitchTime(3723.9), '1h02m03s');
  assert.equal(twitchTime(-5), '0h00m00s');
  assert.equal(parseDuration('2:30'), 9000);
  assert.equal(parseDuration('1:00:30'), 3630);
  assert.equal(parseDuration('45'), 2700);
  assert.equal(parseDuration(''), 0);
  assert.equal(parseDuration('abc'), 0);
});

test('encode/decode aller-retour, accents et emoji compris', () => {
  const s = {
    title: 'Braquage – épisode 3 🔥',
    povs: [{ platform: 'twitch', id: '123', label: 'Kayla « Vice »', start: 1763500000000, duration: 3600 }],
    moments: [{ at: 1763500100000, label: 'La trahison' }],
  };
  assert.deepEqual(decodeState(encodeState(s)), s);
});

test('decodeState rejette les entrées corrompues', () => {
  assert.deepEqual(decodeState('%%%'), { title: '', povs: [], moments: [] });
  const bad = Buffer.from(JSON.stringify({ p: [['vimeo', '1', 'x', 0], ['twitch', '1', 'ok', 5]], m: [['x']] })).toString('base64url');
  const d = decodeState(bad);
  assert.equal(d.povs.length, 1);
  assert.equal(d.povs[0].platform, 'twitch');
  assert.equal(d.moments.length, 0);
});
