// Stage 2: pre-render every route from the live site into a standalone HTML
// file using Declarative Shadow DOM, and collect the set of assets to localize.
import { chromium } from 'playwright';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { LIVE_ORIGIN, LIVE_ORIGINS, OUT_DIR, DATA_DIR } from './config.mjs';
import { PAGE_FUNCTIONS } from './page-serialize.mjs';

// Map a route to its output file (directory-style for clean URLs).
export function routeToFile(route) {
  if (route === '/') return join(OUT_DIR, 'index.html');
  const clean = route.replace(/^\/+|\/+$/g, '');
  return join(OUT_DIR, clean, 'index.html');
}

export async function renderRoute(page, route) {
  const url = LIVE_ORIGIN + route;
  // Do NOT wait for networkidle: the app keeps Firestore listeners open so the
  // network is never idle (that made every page hit a 60s timeout). Instead
  // wait until the deep (shadow-piercing) text content stabilises.
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });

  let last = -1;
  let stable = 0;
  for (let i = 0; i < 40; i++) {
    const len = await page.evaluate('window.__deepText()');
    if (len > 200 && len === last) {
      if (++stable >= 2) break;
    } else {
      stable = 0;
    }
    last = len;
    await page.waitForTimeout(250);
  }

  await page.evaluate('window.__autoScroll()');
  await page.waitForTimeout(400);

  // Wait for images to load so each lazy-image's inner <img>.currentSrc (the
  // real CDN URL) is populated. Stop early when the pending count stabilises
  // (broken images never load, so don't wait for zero).
  let lastPending = -1;
  for (let i = 0; i < 14; i++) {
    const pending = await page.evaluate(
      `(()=>{let p=0;function r(n){if(!n.querySelectorAll)return;n.querySelectorAll('img').forEach(im=>{if(!(im.complete&&im.naturalWidth>0))p++;});n.querySelectorAll('*').forEach(e=>{if(e.shadowRoot)r(e.shadowRoot);});}r(document);return p;})()`,
    );
    if (pending === 0 || pending === lastPending) break;
    lastPending = pending;
    await page.waitForTimeout(400);
  }

  const isNotFound = await page.evaluate('window.__isNotFound()');
  if (isNotFound) return null;

  // Solid header (dark text) on every page except the home hero.
  await page.evaluate(`window.__SOLID_HEADER = ${route !== '/'}`);
  return page.evaluate('window.__serialize()');
}

// Build name -> original photo URL map (Firestore) + ordered gallery URLs,
// used in-page to replace the broken /assets optimization-layer images.
export async function buildOriginals() {
  const read = async (f) => {
    try { return JSON.parse(await readFile(join(DATA_DIR, f), 'utf8')); } catch { return []; }
  };
  const people = {};
  for (const f of ['speakers.json', 'previousSpeakers.json']) {
    for (const p of await read(f)) {
      const url = p.photoUrl || p.photo;
      if (p.name && url && /^https?:|^\//.test(url)) people[p.name] = url;
    }
  }
  const gallery = (await read('gallery.json'))
    .map((g) => g.url)
    .filter((u) => u && /^https?:/.test(u));
  return { people, gallery };
}

export async function crawl() {
  const allRoutes = JSON.parse(await readFile(join(DATA_DIR, 'routes.json'), 'utf8'));
  // Speaker / previous-speaker detail pages render "Not Found" on cold load and
  // are generated from data by build-speakers.mjs — skip crawling them.
  const routes = allRoutes.filter((r) => !/^\/(speakers|previous-speakers)\/[^/]+$/.test(r));
  const originals = await buildOriginals();
  console.log(`  originals: ${Object.keys(originals.people).length} people photos, ${originals.gallery.length} gallery`);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 1600 },
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();
  // Inject target config + serialization helpers + original-photo map before
  // any app code on every navigation. __LIVE_ORIGINS must precede PAGE_FUNCTIONS.
  await context.addInitScript(`window.__LIVE_ORIGINS = ${JSON.stringify(LIVE_ORIGINS)};`);
  await context.addInitScript(PAGE_FUNCTIONS);
  await context.addInitScript(`window.__ORIGINALS = ${JSON.stringify(originals)};`);

  const assets = new Map(); // local -> url
  const written = [];
  const skipped = [];

  for (let i = 0; i < routes.length; i++) {
    const route = routes[i];
    try {
      const result = await renderRoute(page, route);
      if (!result) {
        skipped.push(route);
        console.log(`  [${i + 1}/${routes.length}] SKIP (not found) ${route}`);
        continue;
      }
      const file = routeToFile(route);
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, result.html);
      for (const a of result.assets) assets.set(a.local, a.url);
      written.push(route);
      console.log(`  [${i + 1}/${routes.length}] ok ${route} (${(result.html.length / 1024).toFixed(0)}kb)`);
    } catch (err) {
      skipped.push(route);
      console.warn(`  [${i + 1}/${routes.length}] ERROR ${route}: ${err.message.split('\n')[0]}`);
    }
  }

  await browser.close();

  const assetList = Array.from(assets, ([local, url]) => ({ local, url }));
  await writeFile(join(DATA_DIR, 'assets.json'), JSON.stringify(assetList, null, 2));
  console.log(`\n  crawl: ${written.length} pages written, ${skipped.length} skipped, ${assetList.length} assets queued`);
  return { written, skipped, assets: assetList };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  crawl().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
