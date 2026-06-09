# Static Site 2024 Data Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Regenerate `static-site/` from DevFest Milano **2024** Firestore data (event day `2024-11-23`, `(default)` db) using clean data-driven templates, replacing the pasted-in 2025 DSD crawl snapshots.

**Architecture:** A set of `scripts/static/*.mjs` page generators read filtered `static-site/data/*.json` and emit clean templated HTML (the `build-speakers.mjs` style), reusing shared presentation helpers. The crawl stage is never used. Pages whose text is edition-independent (faq/coc/location/speakers-info/team) are kept from the 2025 build and de-2025'd. A final cleanup deletes non-2024 pages; `localize.mjs`/`finalize.mjs` are reused.

**Tech Stack:** Node ESM (`.mjs`), Firestore REST, no framework. Run with env: `SITE_ORIGIN=https://devfest-milano-2024.web.app FB_PROJECT=devfest-milano-2024 FB_API_KEY=AIzaSyBcyqi1LwIDKwRBZ4iAMXv7rGUozyEMGGo FB_DB="(default)" SITE_YEAR=2024`.

---

## File Structure

- Create: `scripts/static/template-common.mjs` — shared `SITE_TITLE`, `STYLE`, `NAV`, `header()`, `footer()`, `esc()`.
- Modify: `scripts/static/build-speakers.mjs` — import shared helpers from `template-common.mjs`.
- Modify: `scripts/static/firestore.mjs` — add `fetchSubcollection()` for `partners/<id>/items`.
- Modify: `scripts/static/extract-data.mjs` — filter to the `2024-11-23` edition; fetch partner items.
- Create: `scripts/static/build-home.mjs` — `/index.html`.
- Create: `scripts/static/build-speakers-list.mjs` — `/speakers/index.html`.
- Create: `scripts/static/build-sessions.mjs` — `/sessions/<id>/index.html`.
- Create: `scripts/static/build-schedule.mjs` — `/schedule/index.html`.
- Create: `scripts/static/de2025.mjs` — strip "2025" refs from kept pages + cleanup non-2024 dirs.
- Modify: `scripts/static/build.mjs` — wire the new data-driven pipeline.
- Modify: `scripts/static/verify.mjs` — add anti-2025 + count checks.

A throwaway helper for assertions: each generator is run standalone (`node build-x.mjs`) and verified by grepping its output, since there is no unit-test harness in `scripts/static/` (it has none today; we keep that convention and verify via output inspection).

**Env note:** every command below assumes this prefix is exported in the shell:

```bash
cd scripts/static
export SITE_ORIGIN=https://devfest-milano-2024.web.app FB_PROJECT=devfest-milano-2024 \
  FB_API_KEY=AIzaSyBcyqi1LwIDKwRBZ4iAMXv7rGUozyEMGGo FB_DB="(default)" SITE_YEAR=2024
```

---

## Task 1: Shared template helpers

**Files:**
- Create: `scripts/static/template-common.mjs`
- Modify: `scripts/static/build-speakers.mjs:7-65` (replace local copies with imports)

- [ ] **Step 1: Create `template-common.mjs`**

```javascript
// Shared presentation helpers for the data-driven 2024 page generators.
// Extracted verbatim from build-speakers.mjs so all pages share one look.
import { YEAR } from './config.mjs';

export const SITE_TITLE = `DevFest Milano ${YEAR}`;

export const esc = (s) =>
  String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

export const NAV = [
  ['/', 'Home'],
  ['/speakers', 'Speakers'],
  ['/schedule', 'Schedule'],
  ['/location', 'Location'],
  ['/faq', 'FAQ'],
  ['/team', 'Team'],
];

export const STYLE = `
  :root{--indigo:#1f2a63;--blue:#1a73e8;--ink:#202124;--muted:#5f6368;--line:#e3e6ec;--bg:#f5f7fb}
  *{box-sizing:border-box}
  body{margin:0;font-family:'Roboto',system-ui,-apple-system,Segoe UI,sans-serif;color:var(--ink);background:var(--bg)}
  a{color:var(--blue);text-decoration:none}a:hover{text-decoration:underline}
  header.site{display:flex;align-items:center;justify-content:space-between;gap:24px;
    padding:16px 24px;background:#fff;border-bottom:1px solid var(--line);flex-wrap:wrap}
  header.site .logo{display:flex;align-items:center;gap:10px;font-weight:700;color:var(--ink)}
  header.site .logo img{height:32px;width:auto}
  header.site nav a{color:var(--ink);margin-left:20px;font-size:14px;font-weight:500}
  .hero{background:linear-gradient(135deg,var(--indigo),#33408a);color:#fff;padding:48px 24px}
  .hero-in{max-width:920px;margin:0 auto;display:flex;gap:32px;align-items:center;flex-wrap:wrap}
  .hero img.photo{width:160px;height:160px;border-radius:50%;object-fit:cover;border:4px solid rgba(255,255,255,.25);background:#dde}
  .hero h1{margin:0 0 6px;font-size:34px}
  .hero .role{font-size:18px;opacity:.92;margin:0 0 4px}
  .hero .meta{font-size:14px;opacity:.8}
  main{max-width:920px;margin:0 auto;padding:32px 24px 64px}
  section{background:#fff;border:1px solid var(--line);border-radius:12px;padding:24px 28px;margin-bottom:24px}
  section h2{margin:0 0 12px;font-size:18px;color:var(--indigo)}
  .bio{font-size:16px;line-height:1.7;color:#33373d;white-space:pre-line}
  .socials a{display:inline-block;margin-right:16px;font-weight:500}
  ul.talks{list-style:none;margin:0;padding:0}
  ul.talks li{padding:12px 0;border-bottom:1px solid var(--line)}
  ul.talks li:last-child{border-bottom:0}
  .back{display:inline-block;margin-bottom:20px;font-size:14px}
  footer.site{padding:28px 24px;text-align:center;color:var(--muted);font-size:13px;border-top:1px solid var(--line);background:#fff}
  /* grids for list pages */
  .grid{max-width:1040px;margin:0 auto;padding:32px 24px 64px;display:grid;
    grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:20px}
  .card{display:block;background:#fff;border:1px solid var(--line);border-radius:12px;
    padding:20px;text-align:center;color:var(--ink)}
  .card img{width:96px;height:96px;border-radius:50%;object-fit:cover;background:#dde;margin:0 auto 12px}
  .card .nm{font-weight:700;margin-bottom:4px}
  .card .ro{font-size:13px;color:var(--muted)}
  /* schedule table */
  table.sched{max-width:1100px;margin:0 auto;border-collapse:collapse;width:100%;background:#fff}
  table.sched th,table.sched td{border:1px solid var(--line);padding:10px;vertical-align:top;font-size:14px}
  table.sched th{background:var(--indigo);color:#fff}
  table.sched .time{white-space:nowrap;font-weight:700;color:var(--indigo)}
  /* partner logos */
  .partners{display:flex;flex-wrap:wrap;gap:24px;align-items:center;justify-content:center}
  .partners img{max-height:64px;max-width:160px;object-fit:contain}
`;

export function header() {
  return `<header class="site">
  <a class="logo" href="/"><img src="/images/logo.png" alt="${SITE_TITLE}">${SITE_TITLE}</a>
  <nav>${NAV.map(([h, t]) => `<a href="${h}">${t}</a>`).join('')}</nav>
</header>`;
}

export function footer() {
  return `<footer class="site">${SITE_TITLE} · GDG Milano &amp; GDG Cloud Milano · <a href="/coc">Code of Conduct</a></footer>`;
}

// Standard <head> with shared style.
export function head(titleText, description) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(titleText)} — ${SITE_TITLE}</title>
<meta name="description" content="${esc((description || SITE_TITLE).slice(0, 150))}">
<link rel="icon" href="/images/favicon.ico">
<link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&display=swap" rel="stylesheet">
<style>${STYLE}</style>
</head>
<body>`;
}
```

- [ ] **Step 2: Refactor `build-speakers.mjs` to use the shared helpers**

In `scripts/static/build-speakers.mjs`, delete the local `SITE_TITLE`, `esc`, `NAV`, `STYLE`, `header`, `footer` definitions (lines ~10-65) and replace the import block at the top. The new top of the file:

```javascript
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { OUT_DIR, DATA_DIR } from './config.mjs';
import { localFor } from './asset-path.mjs';
import { SITE_TITLE, STYLE, esc, header, footer } from './template-common.mjs';
```

Leave `page()` and `buildSpeakers()` unchanged (they reference `SITE_TITLE`, `STYLE`, `esc`, `header`, `footer`, now imported).

- [ ] **Step 3: Verify speakers still build identically**

Run: `node build-speakers.mjs`
Expected output: `  speakers: 28 + N previous detail pages, +M photos` (no crash). (Note: speaker/previous counts depend on the current data JSON; at this point data may still be the 2025 set — the goal here is only that it runs without error after the refactor.)

- [ ] **Step 4: Commit**

```bash
git add scripts/static/template-common.mjs scripts/static/build-speakers.mjs
git commit -m "refactor(static): extract shared template helpers"
```

---

## Task 2: Firestore subcollection reader

**Files:**
- Modify: `scripts/static/firestore.mjs` (append `fetchSubcollection`)

- [ ] **Step 1: Add `fetchSubcollection` to `firestore.mjs`**

Append after `fetchCollection` (it reuses the module's `BASE`, `fromFields`, `docId`):

```javascript
// Fetch a subcollection at an explicit document path, e.g.
// fetchSubcollection('partners/<id>/items'). Same shape as fetchCollection.
export async function fetchSubcollection(path) {
  const out = [];
  let pageToken = '';
  for (;;) {
    const url = new URL(`${BASE}/${path}`);
    url.searchParams.set('pageSize', '300');
    url.searchParams.set('key', FIREBASE.apiKey);
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Firestore ${path} -> HTTP ${res.status}: ${await res.text()}`);
    }
    const data = await res.json();
    for (const doc of data.documents || []) {
      out.push({ id: docId(doc.name), ...fromFields(doc.fields || {}) });
    }
    if (!data.nextPageToken) break;
    pageToken = data.nextPageToken;
  }
  return out;
}
```

- [ ] **Step 2: Verify it reads partner items**

Run:
```bash
node -e "import('./firestore.mjs').then(async m=>{const it=await m.fetchSubcollection('partners/GSar5fHbLFTgoBfgMAxx/items'); console.log(it.length, it[0]&&it[0].name, it[0]&&it[0].logoUrl)})"
```
Expected: a non-zero count and a line like `1 Google https://devfest.gdgpisa.it/_astro/google.D4_SAEf_.svg`.

- [ ] **Step 3: Commit**

```bash
git add scripts/static/firestore.mjs
git commit -m "feat(static): add Firestore subcollection reader"
```

---

## Task 3: Filter data extraction to the 2024 edition

**Files:**
- Modify: `scripts/static/extract-data.mjs` (rewrite `extractData`)

- [ ] **Step 1: Rewrite `extract-data.mjs`**

Replace the whole file with:

```javascript
// Stage 1: extract the 2024 edition (schedule day 2024-11-23) from Firestore
// into JSON, plus the route list. The schedule day is authoritative: only the
// sessions it references (and the speakers those sessions reference) are kept.
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DATA_DIR } from './config.mjs';
import { fetchCollection, fetchSubcollection } from './firestore.mjs';

const EDITION_DAY = process.env.EDITION_DAY || '2024-11-23';

const STATIC_ROUTES = [
  '/', '/schedule', '/speakers', '/team', '/faq', '/coc', '/location', '/speakers-info',
];

export async function extractData() {
  await mkdir(DATA_DIR, { recursive: true });
  const write = (name, val) => writeFile(join(DATA_DIR, name), JSON.stringify(val, null, 2));

  // Schedule: keep only the edition day.
  const allSchedule = await fetchCollection('schedule');
  const day = allSchedule.find((d) => d.id === EDITION_DAY);
  if (!day) throw new Error(`schedule day ${EDITION_DAY} not found`);
  await write('schedule.json', [day]);

  // Session ids referenced by that day's timeslots.
  const sessionIds = new Set();
  for (const ts of day.timeslots || []) {
    for (const s of ts.sessions || []) {
      for (const it of s.items || []) sessionIds.add(it);
    }
  }

  const allSessions = await fetchCollection('sessions');
  const sessions = allSessions.filter((s) => sessionIds.has(s.id));
  await write('sessions.json', sessions);

  // Speaker ids referenced by those sessions.
  const speakerIds = new Set();
  for (const s of sessions) for (const sid of s.speakers || []) speakerIds.add(sid);

  const allSpeakers = await fetchCollection('speakers');
  const speakers = allSpeakers
    .filter((sp) => speakerIds.has(sp.id))
    .sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
  await write('speakers.json', speakers);

  // previousSpeakers / blog are demo data -> excluded entirely (empty).
  await write('previousSpeakers.json', []);

  // Partners with their logo items (subcollection `items`).
  const partners = (await fetchCollection('partners')).sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
  for (const p of partners) {
    try { p.items = await fetchSubcollection(`partners/${p.id}/items`); }
    catch { p.items = []; }
  }
  await write('partners.json', partners.filter((p) => (p.items || []).length));

  // Pass-through collections (kept as-is for completeness; pages may use them).
  await write('team.json', await fetchCollection('team'));
  await write('gallery.json', await fetchCollection('gallery'));
  await write('videos.json', await fetchCollection('videos'));

  const detail = [
    ...sessions.filter((s) => (s.speakers || []).length).map((s) => `/sessions/${s.id}`),
    ...speakers.map((s) => `/speakers/${s.id}`),
  ];
  const routes = [...STATIC_ROUTES, ...detail];
  await write('routes.json', routes);

  console.log(`  data: ${speakers.length} speakers, ${sessions.length} sessions ` +
    `(${detail.filter((r) => r.startsWith('/sessions')).length} talks), schedule day ${EDITION_DAY}`);
  console.log(`  routes: ${routes.length}`);
  return { speakers, sessions, routes };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  extractData().catch((e) => { console.error(e); process.exit(1); });
}
```

- [ ] **Step 2: Run extraction and verify 2024 counts**

Run: `node extract-data.mjs`
Expected:
```
  data: 28 speakers, 34 sessions (27 talks), schedule day 2024-11-23
  routes: 8 + 27 + 28 = 63 total
```
(Exact line: `routes: 63`.)

- [ ] **Step 3: Sanity-check the written data**

Run:
```bash
node -e "const fs=require('fs'),d='../../static-site/data/'; \
console.log('speakers',require(d+'speakers.json').length); \
console.log('sessions',require(d+'sessions.json').length); \
console.log('schedule days',require(d+'schedule.json').map(x=>x.id)); \
console.log('partners',require(d+'partners.json').map(p=>p.title+':'+(p.items||[]).length))"
```
Expected: `speakers 28`, `sessions 34`, `schedule days [ '2024-11-23' ]`, partners with non-zero item counts.

- [ ] **Step 4: Commit**

```bash
git add scripts/static/extract-data.mjs
git commit -m "feat(static): filter data extraction to 2024 edition"
```

---

## Task 4: Speakers list page

**Files:**
- Create: `scripts/static/build-speakers-list.mjs`

- [ ] **Step 1: Create `build-speakers-list.mjs`**

```javascript
// Generate /speakers/index.html — a static grid of all 2024 speakers.
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { OUT_DIR, DATA_DIR } from './config.mjs';
import { localFor } from './asset-path.mjs';
import { SITE_TITLE, esc, header, footer, head } from './template-common.mjs';

export async function buildSpeakersList() {
  const speakers = JSON.parse(await readFile(join(DATA_DIR, 'speakers.json'), 'utf8'));
  const assets = new Map();

  const cards = speakers.map((sp) => {
    const role = [sp.title, sp.company].filter(Boolean).join(' · ');
    const orig = sp.photoUrl || sp.photo;
    let photo = '';
    if (orig) {
      const abs = /^https?:/.test(orig) ? orig : `https://devfestmilano.it${orig}`;
      const local = localFor(abs);
      if (local) { assets.set(local, abs); photo = local; }
    }
    return `<a class="card" href="/speakers/${esc(sp.id)}">
      ${photo ? `<img src="${esc(photo)}" alt="${esc(sp.name)}">` : ''}
      <div class="nm">${esc(sp.name)}</div>
      ${role ? `<div class="ro">${esc(role)}</div>` : ''}
    </a>`;
  }).join('\n');

  const html = `${head('Speakers', `${SITE_TITLE} speakers`)}
${header()}
<div class="hero"><div class="hero-in"><div><h1>Speakers</h1></div></div></div>
<div class="grid">
${cards}
</div>
${footer()}
</body></html>`;

  await mkdir(join(OUT_DIR, 'speakers'), { recursive: true });
  await writeFile(join(OUT_DIR, 'speakers', 'index.html'), html);

  await mergeAssets(DATA_DIR, assets);
  console.log(`  speakers-list: ${speakers.length} cards`);
}

// Merge {local->url} pairs into data/assets.json (shared by localize.mjs).
export async function mergeAssets(dataDir, assets) {
  const path = join(dataDir, 'assets.json');
  let existing = [];
  try { existing = JSON.parse(await readFile(path, 'utf8')); } catch {}
  const merged = new Map(existing.map((a) => [a.local, a.url]));
  for (const [local, url] of assets) merged.set(local, url);
  await writeFile(path, JSON.stringify(Array.from(merged, ([local, url]) => ({ local, url })), null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  buildSpeakersList().catch((e) => { console.error(e); process.exit(1); });
}
```

- [ ] **Step 2: Run and verify**

Run: `node build-speakers-list.mjs`
Expected: `  speakers-list: 28 cards`.

Run: `grep -c 'class="card"' ../../static-site/speakers/index.html`
Expected: `28`.

- [ ] **Step 3: Commit**

```bash
git add scripts/static/build-speakers-list.mjs
git commit -m "feat(static): generate speakers list page"
```

---

## Task 5: Session detail pages

**Files:**
- Create: `scripts/static/build-sessions.mjs`

- [ ] **Step 1: Create `build-sessions.mjs`**

```javascript
// Generate /sessions/<id>/index.html for each 2024 talk (sessions with speakers).
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { OUT_DIR, DATA_DIR } from './config.mjs';
import { SITE_TITLE, esc, header, footer, head } from './template-common.mjs';

export async function buildSessions() {
  const sessions = JSON.parse(await readFile(join(DATA_DIR, 'sessions.json'), 'utf8'));
  const speakers = JSON.parse(await readFile(join(DATA_DIR, 'speakers.json'), 'utf8'));
  const spById = Object.fromEntries(speakers.map((s) => [s.id, s]));

  const talks = sessions.filter((s) => (s.speakers || []).length);
  for (const s of talks) {
    const spk = (s.speakers || []).map((id) => spById[id]).filter(Boolean);
    const speakerLinks = spk
      .map((sp) => `<a href="/speakers/${esc(sp.id)}">${esc(sp.name)}</a>`)
      .join(', ');
    const tags = (s.tags || []).map((t) => esc(t)).join(', ');
    const meta = [s.language, s.complexity].filter(Boolean).map(esc).join(' · ');

    const html = `${head(s.title, s.description)}
${header()}
<div class="hero"><div class="hero-in"><div>
  <h1>${esc(s.title)}</h1>
  ${speakerLinks ? `<p class="role">${speakerLinks}</p>` : ''}
  ${meta ? `<p class="meta">${meta}</p>` : ''}
</div></div></div>
<main>
  <a class="back" href="/schedule">&larr; Schedule</a>
  ${s.description ? `<section><h2>Abstract</h2><div class="bio">${esc(s.description)}</div></section>` : ''}
  ${tags ? `<section><h2>Tags</h2><div>${tags}</div></section>` : ''}
</main>
${footer()}
</body></html>`;

    const dir = join(OUT_DIR, 'sessions', String(s.id));
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'index.html'), html);
  }
  console.log(`  sessions: ${talks.length} talk pages`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  buildSessions().catch((e) => { console.error(e); process.exit(1); });
}
```

- [ ] **Step 2: Run and verify**

Run: `node build-sessions.mjs`
Expected: `  sessions: 27 talk pages`.

Run: `grep -o 'Bringing Fictional Characters[^<]*' ../../static-site/sessions/756063/index.html | head -1`
Expected: `Bringing Fictional Characters to Life with Open Source LLMs`.

- [ ] **Step 3: Commit**

```bash
git add scripts/static/build-sessions.mjs
git commit -m "feat(static): generate session detail pages"
```

---

## Task 6: Schedule page

**Files:**
- Create: `scripts/static/build-schedule.mjs`

The schedule day has `tracks` (ordered) and `timeslots`. Each timeslot has
`sessions[]` positional by track index; each entry is `{ items:[id], extend? }`.
`extend: N` means the cell spans N timeslot rows (rowspan). A timeslot with a
single `sessions` entry whose item spans all tracks (e.g. registration/lunch)
is rendered as one full-width cell.

- [ ] **Step 1: Create `build-schedule.mjs`**

```javascript
// Generate /schedule/index.html — the 2024-11-23 agenda as a tracks × timeslots
// table. Cells link to session detail pages where the session is a talk.
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { OUT_DIR, DATA_DIR } from './config.mjs';
import { SITE_TITLE, esc, header, footer, head } from './template-common.mjs';

export async function buildSchedule() {
  const [day] = JSON.parse(await readFile(join(DATA_DIR, 'schedule.json'), 'utf8'));
  const sessions = JSON.parse(await readFile(join(DATA_DIR, 'sessions.json'), 'utf8'));
  const byId = Object.fromEntries(sessions.map((s) => [s.id, s]));

  const tracks = day.tracks || [];
  const isTalk = (id) => byId[id] && (byId[id].speakers || []).length;

  const cell = (id) => {
    const s = byId[id];
    if (!s) return '';
    const title = esc(s.title || id);
    return isTalk(id) ? `<a href="/sessions/${esc(id)}">${title}</a>` : title;
  };

  // Track which (row,col) positions are already covered by a rowspan above.
  const rows = day.timeslots || [];
  const skip = rows.map(() => new Array(tracks.length).fill(false));

  const bodyRows = rows.map((ts, r) => {
    const time = `${esc(ts.startTime)}–${esc(ts.endTime)}`;
    const entries = ts.sessions || [];

    // Full-width service slot: single entry covering the row.
    if (entries.length === 1 && tracks.length > 1) {
      const id = (entries[0].items || [])[0];
      return `<tr><td class="time">${time}</td>` +
        `<td colspan="${tracks.length}">${cell(id)}</td></tr>`;
    }

    const cells = [];
    for (let c = 0; c < tracks.length; c++) {
      if (skip[r][c]) continue;
      const entry = entries[c];
      const id = entry && (entry.items || [])[0];
      const span = entry && entry.extend ? entry.extend : 1;
      if (span > 1) {
        for (let k = 1; k < span && r + k < rows.length; k++) skip[r + k][c] = true;
      }
      cells.push(`<td${span > 1 ? ` rowspan="${span}"` : ''}>${id ? cell(id) : ''}</td>`);
    }
    return `<tr><td class="time">${time}</td>${cells.join('')}</tr>`;
  }).join('\n');

  const headRow = `<tr><th>Time</th>${tracks.map((t) => `<th>${esc(t.title)}</th>`).join('')}</tr>`;

  const html = `${head('Schedule', `${SITE_TITLE} schedule`)}
${header()}
<div class="hero"><div class="hero-in"><div>
  <h1>Schedule</h1>
  <p class="meta">${esc(day.dateReadable || day.date || day.id)}</p>
</div></div></div>
<main style="max-width:1140px">
  <table class="sched">${headRow}${bodyRows}</table>
</main>
${footer()}
</body></html>`;

  await mkdir(join(OUT_DIR, 'schedule'), { recursive: true });
  await writeFile(join(OUT_DIR, 'schedule', 'index.html'), html);
  console.log(`  schedule: ${rows.length} timeslots × ${tracks.length} tracks`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  buildSchedule().catch((e) => { console.error(e); process.exit(1); });
}
```

- [ ] **Step 2: Run and verify**

Run: `node build-schedule.mjs`
Expected: `  schedule: 14 timeslots × 5 tracks`.

Run: `grep -c '<tr>' ../../static-site/schedule/index.html`
Expected: `15` (1 header + 14 timeslot rows).

Run: `grep -o '/sessions/756063' ../../static-site/schedule/index.html | head -1`
Expected: `/sessions/756063` (a talk cell links out).

- [ ] **Step 3: Commit**

```bash
git add scripts/static/build-schedule.mjs
git commit -m "feat(static): generate schedule page"
```

---

## Task 7: Home page

**Files:**
- Create: `scripts/static/build-home.mjs`

- [ ] **Step 1: Create `build-home.mjs`**

```javascript
// Generate /index.html — hero + CTAs + partner logos for the 2024 edition.
import { writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { OUT_DIR, DATA_DIR, YEAR } from './config.mjs';
import { localFor } from './asset-path.mjs';
import { SITE_TITLE, esc, header, footer, head } from './template-common.mjs';
import { mergeAssets } from './build-speakers-list.mjs';

export async function buildHome() {
  const [day] = JSON.parse(await readFile(join(DATA_DIR, 'schedule.json'), 'utf8'));
  const partners = JSON.parse(await readFile(join(DATA_DIR, 'partners.json'), 'utf8'));
  const assets = new Map();

  const partnerBlocks = partners.map((g) => {
    const logos = (g.items || []).map((it) => {
      const orig = it.logoUrl || it.logo;
      if (!orig) return '';
      const abs = /^https?:/.test(orig) ? orig : `https://devfestmilano.it${orig}`;
      const local = localFor(abs);
      if (!local) return '';
      assets.set(local, abs);
      const img = `<img src="${esc(local)}" alt="${esc(it.name || g.title)}">`;
      return it.url ? `<a href="${esc(it.url)}" target="_blank" rel="noopener noreferrer">${img}</a>` : img;
    }).join('');
    return logos ? `<section><h2>${esc(g.title)}</h2><div class="partners">${logos}</div></section>` : '';
  }).join('\n');

  const dateLine = esc(day.dateReadable || day.date || day.id);

  const html = `${head(`DevFest Milano ${YEAR}`, `DevFest Milano ${YEAR} — the GDG Milano developer festival`)}
${header()}
<div class="hero"><div class="hero-in"><div>
  <h1>${SITE_TITLE}</h1>
  <p class="role">${dateLine}</p>
  <p class="meta">GDG Milano &amp; GDG Cloud Milano</p>
</div></div></div>
<main>
  <section><h2>Welcome</h2>
    <div class="bio">DevFest Milano brings world-class experts in Android, Web, Cloud, AI and more to Milan. Explore the <a href="/speakers">speakers</a> and the full <a href="/schedule">schedule</a>.</div>
  </section>
  ${partnerBlocks}
</main>
${footer()}
</body></html>`;

  await writeFile(join(OUT_DIR, 'index.html'), html);
  await mergeAssets(DATA_DIR, assets);
  console.log(`  home: ${partners.length} partner groups`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  buildHome().catch((e) => { console.error(e); process.exit(1); });
}
```

- [ ] **Step 2: Run and verify**

Run: `node build-home.mjs`
Expected: `  home: N partner groups` (N ≥ 1).

Run: `grep -c 'DevFest Milano 2024' ../../static-site/index.html`
Expected: `≥ 2` (title + hero). And: `grep -c '2025' ../../static-site/index.html` → `0`.

- [ ] **Step 3: Commit**

```bash
git add scripts/static/build-home.mjs
git commit -m "feat(static): generate home page"
```

---

## Task 8: De-2025 kept pages + cleanup non-2024 dirs

**Files:**
- Create: `scripts/static/de2025.mjs`

The kept pages (`faq`, `coc`, `location`, `speakers-info`, `team`) are 2025 DSD
snapshots with identical text. We rewrite "2025" references to 2024 and delete
all non-2024 generated dirs/snapshots.

- [ ] **Step 1: Create `de2025.mjs`**

```javascript
// Strip "2025" references from kept pages and remove non-2024 leftovers.
import { readFile, writeFile, readdir, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { OUT_DIR, DATA_DIR } from './config.mjs';

const KEEP_PAGES = ['faq', 'coc', 'location', 'speakers-info', 'team'];

// Date string the 2025 snapshots use, mapped to the 2024 edition day.
const DATE_2025 = '2025-10-11';
const DATE_2024 = '2024-11-23';

function de2025(html) {
  return html
    .replace(/DevFest Milano 2025/g, 'DevFest Milano 2024')
    .replace(/devfest-milano-2025/g, 'devfest-milano-2024')
    .replace(/devfestmilano-2025/g, 'devfestmilano-2024')
    .replace(new RegExp(DATE_2025, 'g'), DATE_2024)
    .replace(/\b2025\b/g, '2024');
}

async function exists(p) { try { await stat(p); return true; } catch { return false; } }

export async function runDe2025() {
  // 1. Rewrite kept pages in place.
  let rewritten = 0;
  for (const p of KEEP_PAGES) {
    const f = join(OUT_DIR, p, 'index.html');
    if (!(await exists(f))) continue;
    await writeFile(f, de2025(await readFile(f, 'utf8')));
    rewritten++;
  }

  // 2. Delete non-2024 session/speaker dirs (keep only those in routes.json).
  const routes = JSON.parse(await readFile(join(DATA_DIR, 'routes.json'), 'utf8'));
  const keepSessions = new Set(routes.filter((r) => r.startsWith('/sessions/')).map((r) => r.split('/')[2]));
  const keepSpeakers = new Set(routes.filter((r) => r.startsWith('/speakers/')).map((r) => r.split('/')[2]));

  const pruneDir = async (sub, keep) => {
    const base = join(OUT_DIR, sub);
    if (!(await exists(base))) return 0;
    let removed = 0;
    for (const name of await readdir(base)) {
      if (name === 'index.html') continue;
      if (!keep.has(name)) { await rm(join(base, name), { recursive: true, force: true }); removed++; }
    }
    return removed;
  };
  const rmSessions = await pruneDir('sessions', keepSessions);
  const rmSpeakers = await pruneDir('speakers', keepSpeakers);

  // 3. Remove previous-speakers entirely (demo data).
  await rm(join(OUT_DIR, 'previous-speakers'), { recursive: true, force: true });

  console.log(`  de2025: ${rewritten} pages rewritten; pruned ${rmSessions} sessions, ${rmSpeakers} speakers`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runDe2025().catch((e) => { console.error(e); process.exit(1); });
}
```

- [ ] **Step 2: Run and verify**

Run: `node de2025.mjs`
Expected: `  de2025: 5 pages rewritten; pruned 68 sessions, 44 speakers` (95−27=68, 72−28=44).

Run: `grep -rl 'DevFest Milano 2025' ../../static-site/faq ../../static-site/coc ../../static-site/location ../../static-site/team ../../static-site/speakers-info 2>/dev/null | wc -l`
Expected: `0`.

Run: `ls ../../static-site/speakers | grep -v index.html | wc -l` → `28`; `ls ../../static-site/sessions | wc -l` → `27`.

- [ ] **Step 3: Commit**

```bash
git add scripts/static/de2025.mjs
git commit -m "feat(static): de-2025 kept pages and prune non-2024 dirs"
```

---

## Task 9: Wire the orchestrator

**Files:**
- Modify: `scripts/static/build.mjs`

- [ ] **Step 1: Replace `build.mjs` with the data-driven pipeline**

```javascript
// Orchestrator: build the static 2024 site entirely from Firestore data
// (no crawl). Stages:
//   1. extract-data    -> filtered 2024 JSON + routes
//   2. build-home / speakers-list / sessions / schedule / speakers (detail)
//   3. de2025          -> rewrite kept pages, prune non-2024 dirs
//   4. localize        -> download all queued assets
//   5. finalize        -> 404, .nojekyll, robots, sitemap
import { extractData } from './extract-data.mjs';
import { buildHome } from './build-home.mjs';
import { buildSpeakersList } from './build-speakers-list.mjs';
import { buildSpeakers } from './build-speakers.mjs';
import { buildSessions } from './build-sessions.mjs';
import { buildSchedule } from './build-schedule.mjs';
import { runDe2025 } from './de2025.mjs';
import { localize } from './localize.mjs';
import { finalize } from './finalize.mjs';

async function main() {
  console.log('\n[1/9] Extracting 2024 Firestore data...');
  await extractData();
  console.log('\n[2/9] Home...');        await buildHome();
  console.log('\n[3/9] Speakers list...'); await buildSpeakersList();
  console.log('\n[4/9] Speaker pages...'); await buildSpeakers();
  console.log('\n[5/9] Session pages...'); await buildSessions();
  console.log('\n[6/9] Schedule...');     await buildSchedule();
  console.log('\n[7/9] De-2025 + prune...'); await runDe2025();
  console.log('\n[8/9] Localizing assets...'); await localize();
  console.log('\n[9/9] Finalizing...');   await finalize();
  console.log('\nDone.');
}

main().catch((e) => { console.error(e); process.exit(1); });
```

Note: `build-speakers.mjs` writes `previous-speakers/*` from `previousSpeakers.json`,
which is now `[]`, so it creates none; `de2025` also removes that dir. Order is
fine because `buildSpeakers` runs (step 4) before `runDe2025` (step 7).

- [ ] **Step 2: Verify finalize reads routes correctly**

`finalize.mjs` reads `data/routes.json` for the sitemap and copies `index.html`
to `404.html`. Confirm it still references those (no change needed):

Run: `grep -n "routes.json\|404.html\|index.html" finalize.mjs`
Expected: lines referencing `routes.json` and writing `404.html` from `index.html`.

- [ ] **Step 3: Commit**

```bash
git add scripts/static/build.mjs
git commit -m "feat(static): wire data-driven 2024 build pipeline"
```

---

## Task 10: Verify checks (anti-2025 + counts)

**Files:**
- Modify: `scripts/static/verify.mjs`

- [ ] **Step 1: Read current verify.mjs to find the end of its checks**

Run: `tail -30 verify.mjs`
Expected: it prints counts and a pass/fail summary near the end.

- [ ] **Step 2: Add anti-2025 + 2024 count assertions**

Append a block before the final summary/exit in `verify.mjs` (adapt variable
names to those already in the file; this block is self-contained using fs):

```javascript
// --- 2024 edition assertions ---
import { readdir as _readdir, readFile as _readFile, stat as _stat } from 'node:fs/promises';
async function _exists(p){try{await _stat(p);return true}catch{return false}}
async function _walk(dir, acc=[]) {
  for (const e of await _readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) await _walk(p, acc);
    else if (e.name.endsWith('.html')) acc.push(p);
  }
  return acc;
}
{
  const files = await _walk(OUT_DIR);
  let bad2025 = 0;
  for (const f of files) {
    const html = await _readFile(f, 'utf8');
    if (/2025|devfest-milano-2025/.test(html)) bad2025++;
  }
  const nSpeakers = (await _readdir(join(OUT_DIR, 'speakers'))).filter((n) => n !== 'index.html').length;
  const nSessions = (await _exists(join(OUT_DIR, 'sessions')))
    ? (await _readdir(join(OUT_DIR, 'sessions'))).filter((n) => n !== 'index.html').length : 0;
  console.log(`2024 speakers dirs:     ${nSpeakers} (expect 28)`);
  console.log(`2024 sessions dirs:     ${nSessions} (expect 27)`);
  console.log(`Pages still citing 2025: ${bad2025} (expect 0)`);
  if (bad2025 !== 0 || nSpeakers !== 28 || nSessions !== 27) {
    console.error('FAIL: 2024 edition checks did not pass');
    process.exit(1);
  }
}
```

If `verify.mjs` does not already import `join`/`OUT_DIR`, add:
`import { join } from 'node:path';` and `import { OUT_DIR } from './config.mjs';`
at the top (check first to avoid duplicate imports).

- [ ] **Step 3: Run the full build, then verify**

Run: `node build.mjs`
Expected (tail): `Done.` with no thrown errors; localize reports written assets.

Run: `node verify.mjs`
Expected:
```
2024 speakers dirs:     28 (expect 28)
2024 sessions dirs:     27 (expect 27)
Pages still citing 2025: 0 (expect 0)
```
and overall PASS (no `FAIL`).

- [ ] **Step 4: Commit**

```bash
git add scripts/static/verify.mjs
git commit -m "feat(static): verify 2024 counts and no-2025 refs"
```

---

## Task 11: Final review + commit the built site

**Files:**
- Modify: `static-site/**` (regenerated output)

- [ ] **Step 1: Spot-check pages in a browser or with grep**

Run:
```bash
grep -o '<title>[^<]*' ../../static-site/index.html
grep -o '<title>[^<]*' ../../static-site/speakers/index.html
grep -o '<title>[^<]*' ../../static-site/schedule/index.html
```
Expected: all titled with "DevFest Milano 2024".

- [ ] **Step 2: Confirm no backend/script leakage in generated pages**

Run: `node verify.mjs`
Expected: `Pages with <script>: 0` (or only kept-page snapshots if any contain inert markup — investigate if non-zero) and the 2024 checks PASS.

- [ ] **Step 3: Commit the regenerated static-site**

```bash
git add static-site
git commit -m "build(static): regenerate static site with 2024 data"
```

---

## Self-Review notes

- **Spec coverage:** data filter (T3), home (T7), speakers list (T4), speaker detail (T1 reuse), sessions (T5), schedule (T6), kept-page de-2025 + prune (T8), assets via localize (T9), finalize (T9), verify incl. anti-2025 (T10) — all spec sections mapped.
- **Type consistency:** `mergeAssets(dataDir, assets)` defined in T4, imported in T7. `runDe2025` (T8) used in T9. `buildSpeakers` reused unchanged (T1). Session "talk" = `(speakers||[]).length>0` consistently in T3/T5/T6.
- **Known data caveat:** partner logo URLs point to external hosts (gdgpisa/astro) — `localize.mjs` downloads them; failures are logged, not fatal. Photos use sessionize/storage absolute URLs (downloadable).
```
