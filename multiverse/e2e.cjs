// Test de bout en bout avec des lecteurs Twitch/YouTube simulés (aucun accès réseau requis).
// Lancer : npm run e2e   (nécessite Playwright et Chromium, préinstallés ou via `npx playwright install chromium`)
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
// Faux lecteurs : getCurrentTime() = 0 pendant 600 ms, durée inconnue (0) pendant 1 s, puis le temps avance en réel.
const fakeCore = `
function FakeCore(start, dur){ this.t0=performance.now(); this.base=start; this.playing=true; this.dur=dur; this.loadedAt=this.t0+600;}
FakeCore.prototype.now=function(){ const n=performance.now(); if(n<this.loadedAt) return 0; return this.playing? this.base+(n-this.loadedAt)/1000 : this.base; };
FakeCore.prototype.seek=function(s){ this.base=s; this.loadedAt=performance.now(); };
FakeCore.prototype.pause=function(){ this.base=this.now(); this.playing=false; };
FakeCore.prototype.play=function(){ this.loadedAt=performance.now(); this.playing=true; };
FakeCore.prototype.duration=function(){ return performance.now()-this.t0>1000? this.dur:0; };
window.__mounts=window.__mounts||[];`;
const fakeTwitch = fakeCore + `
function parseT(t){const m=t.match(/(\\d+)h(\\d+)m(\\d+)s/);return +m[1]*3600+ +m[2]*60+ +m[3];}
window.Twitch={Player:function(el,o){const c=new FakeCore(parseT(o.time),3*3600);window.__mounts.push({p:'twitch',v:o.video,start:parseT(o.time)});
 el.textContent='TWITCH '+o.video;
 this.addEventListener=(e,f)=>setTimeout(f,200);
 this.getCurrentTime=()=>c.now(); this.seek=s=>{window.__mounts.push({seek:s});c.seek(s)}; this.isPaused=()=>!c.playing;
 this.play=()=>c.play(); this.pause=()=>c.pause(); this.getDuration=()=>c.duration();}};
window.Twitch.Player.READY='ready';`;
const fakeYT = fakeCore + `
window.YT={PlayerState:{PLAYING:1},Player:function(el,o){const c=new FakeCore(o.playerVars.start,2*3600);window.__mounts.push({p:'yt',v:o.videoId,start:o.playerVars.start});
 el.textContent='YT '+o.videoId;
 this.getCurrentTime=()=>c.now(); this.seekTo=s=>{window.__mounts.push({seek:s});c.seek(s)}; this.getPlayerState=()=>c.playing?1:2;
 this.pauseVideo=()=>c.pause(); this.playVideo=()=>c.play(); this.getDuration=()=>c.duration(); this.destroy=()=>{};
 setTimeout(()=>o.events.onReady(),200);}};
setTimeout(()=>window.onYouTubeIframeAPIReady&&window.onYouTubeIframeAPIReady(),50);`;

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const server = http.createServer((req, res) => {
  const file = path.join(__dirname, req.url.split('?')[0] === '/' ? 'index.html' : path.normalize(req.url.split('?')[0]));
  if (!file.startsWith(__dirname)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
});

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const BASE = 'http://localhost:' + server.address().port + '/';
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 860 } });
  await ctx.route('https://player.twitch.tv/**', (r) => r.fulfill({ contentType: 'text/javascript', body: fakeTwitch }));
  await ctx.route('https://www.youtube.com/iframe_api', (r) => r.fulfill({ contentType: 'text/javascript', body: fakeYT }));
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  let fails = 0;
  const ok = (c, m) => { if (!c) fails++; console.log((c ? 'PASS ' : 'FAIL ') + m); };
  await p.goto(BASE);
  ok((await p.title()).includes('MULTIVERSE — synchroniser les VOD'), 'titre de la page');
  ok(await p.$eval('.legal', (e) => { const x = e.textContent; return x.includes('NOVARYS') && x.includes('GitHub Pages') && x.includes('haynbroit@hotmail.com') && !/Lhassan|charfa/i.test(x); }), 'mentions légales');
  const demoHref = await p.getAttribute('#demoLink', 'href');
  await p.goto(BASE + demoHref);
  await p.waitForTimeout(800);
  ok((await p.$$eval('.pov .name', (n) => n.map((x) => x.textContent))).join() === 'Commentaire officiel,InTheLittleWood,jojosolos', 'lien d\'exemple charge les 3 POV');
  ok((await p.title()).includes('MCC Pride 2026'), 'titre de session de l\'exemple');
  await p.goto(BASE);
  const add = async (url, label, start, dur = '') => {
    await p.fill('[name=url]', url); await p.fill('[name=label]', label);
    await p.fill('[name=start]', start); await p.fill('[name=duration]', dur);
    await p.click('#addPov button[type=submit]');
  };

  // Comptage GoatCounter : faux compteur qui enregistre les appels.
  await p.evaluate(() => { window.__gc = []; window.goatcounter.count = (o) => window.__gc.push(o.path); });
  const pathFor = (hash) => p.evaluate((h) => { history.replaceState(null, '', location.pathname + h); const r = window.goatcounter.path(); history.replaceState(null, '', location.pathname); return r; }, hash);
  const pa = await pathFor('#s=eyJ0IjoiIiwicCI6W1sidHdpdGNoIiwiMTExIiwiQSIsMTc4MjU4NDY3OTExMSwwXV0sIm0iOltdfQ');
  const pb = await pathFor('#s=eyJ0IjoiIiwicCI6W1sidHdpdGNoIiwiOTk5IiwiQSIsMTc4MjU4NDY3OTk5OSwwXV0sIm0iOltdfQ');
  ok(/^\/lien\/[0-9a-f]{8}$/.test(pa) && pa !== pb, 'deux liens sans titre ont des chemins distincts (' + pa + ' / ' + pb + ')');
  ok((await pathFor(demoHref)) === '/demo', 'le lien d\'exemple est compté à part (/demo)');
  ok((await pathFor('')) === '/', 'page d\'accueil comptée sur /');
  await add('www.twitch.tv/videos/111', 'Alpha', '2026-11-19T20:00');
  await add('https://youtu.be/dQw4w9WgXcQ', 'Bravo', '2026-11-19T20:30');
  ok((await p.textContent('#formError')) === '', 'URL sans https:// acceptée');
  ok((await p.evaluate(() => window.__gc.filter((x) => x === '/pov-ajoute').length)) === 2, 'événement /pov-ajoute envoyé à chaque POV ajouté');
  await p.click('#share');
  await p.waitForTimeout(200);
  const created = await p.evaluate(() => window.__gc.find((x) => x.startsWith('/created/')));
  const expected = await p.evaluate(() => '/created/' + window.mvShortId(new URLSearchParams(location.hash.slice(1)).get('s')));
  ok(created === expected, 'événement /created/<empreinte> envoyé au partage (' + created + ')');
  await add('https://youtu.be/dQw4w9WgXcQ', 'Bad', '2026-11-19T20:30', '45:99:99:1');
  ok((await p.textContent('#formError')).includes('Durée invalide'), 'durée invalide signalée');
  ok((await p.$$('.pov')).length === 2, 'POV invalide non ajouté');

  await p.waitForTimeout(400);
  ok((await p.textContent('#clock')) === '20:00:00', 'horloge reste à 20:00:00 pendant le chargement (pas de saut)');
  await p.waitForTimeout(2200);
  const c1 = await p.textContent('#clock');
  ok(c1 >= '20:00:01' && c1 <= '20:00:03', 'horloge avance après chargement : ' + c1);
  const durOk = await p.evaluate(() => location.hash.length > 10);
  ok(durOk, 'état sauvegardé dans l\'URL');

  await p.focus('.pov:nth-child(2) .name');
  await p.keyboard.press('Enter');
  await p.waitForTimeout(300);
  ok((await p.evaluate(() => document.activeElement && document.activeElement.dataset.key)) === 'go-1', 'focus conservé après bascule au clavier');
  const m = await p.evaluate(() => window.__mounts.filter((x) => x.p).slice(-1)[0]);
  ok(m && m.p === 'yt', 'Bravo (YouTube) monté');
  ok(m && m.start === 0, 'Bravo démarre à 0 (instant antérieur à son début) : ' + (m && m.start));
  await p.keyboard.press('Tab');
  ok((await p.evaluate(() => document.activeElement && document.activeElement.dataset.key)) === 'minus-1', 'bouton −1s atteignable au Tab');

  await p.evaluate(() => { const t = document.getElementById('timeline'); t.dispatchEvent(new Event('input')); t.dispatchEvent(new PointerEvent('pointerup')); });
  await p.waitForTimeout(1200);
  const c2 = await p.textContent('#clock');
  await p.waitForTimeout(1100);
  const c3 = await p.textContent('#clock');
  ok(c3 !== c2, 'horloge non figée après un scrub sans « change » (' + c2 + ' → ' + c3 + ')');

  await p.click('[data-key="del-1"]');
  await p.waitForTimeout(400);
  ok((await p.$$('.pov')).length === 1, 'POV actif retiré');
  await p.click('[data-key="del-0"]');
  await p.waitForTimeout(300);
  ok(await p.$eval('#play', (x) => x.disabled && x.textContent === '▶'), 'lecture désactivée quand il n\'y a plus de POV');
  ok((await p.textContent('#clock')) === '--:--:--', 'horloge réinitialisée');

  await add('https://www.twitch.tv/videos/222', 'Charlie', '2026-11-19T21:00');
  await p.waitForTimeout(300);
  const link = p.url();
  await p.evaluate(() => { history.replaceState(null, '', location.pathname); });
  await p.evaluate((h) => { location.hash = h; }, link.split('#')[1]);
  await p.waitForTimeout(1500);
  ok((await p.$$eval('.pov .name', (n) => n.map((x) => x.textContent))).join() === 'Charlie', 'lien collé dans le même onglet pris en compte');

  await p.setViewportSize({ width: 390, height: 844 });
  ok((await p.evaluate(() => document.documentElement.scrollWidth)) === 390, 'pas de défilement horizontal à 390 px');
  ok((await p.$eval('[name=url]', (i) => getComputedStyle(i).fontSize)) === '16px', 'champs à 16 px (pas de zoom iOS)');

  const p2 = await ctx.newPage();
  await p2.setViewportSize({ width: 390, height: 844 });
  await p2.goto(BASE);
  ok(await p2.$eval('.empty', (e) => e.getBoundingClientRect().bottom <= e.parentElement.getBoundingClientRect().bottom + 1), 'texte d\'accueil non coupé à 390 px');

  ok(errs.length === 0, 'aucune erreur JS ' + JSON.stringify(errs));
  console.log(fails ? fails + ' échec(s)' : 'TOUT PASSE');
  await b.close();
  server.close();
  process.exit(fails ? 1 : 0);
})();
