// Offline photo fix: load each already-generated page from disk, replace the
// broken /assets optimization-layer photos with Firestore originals (and force
// the lazy-image's inner <img> visible), then re-serialize. No live site, so
// no bot-throttling. Speaker/previous-speaker DETAIL pages are skipped here —
// they are regenerated from data by build-speakers.mjs.
import { chromium } from 'playwright';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { OUT_DIR, DATA_DIR, LIVE_ORIGINS } from './config.mjs';
import { PAGE_FUNCTIONS } from './page-serialize.mjs';
import { buildOriginals } from './crawl.mjs';

async function htmlFiles(dir, acc = []) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'data' || e.name === 'assets') continue;
      await htmlFiles(p, acc);
    } else if (e.name.endsWith('.html')) {
      acc.push(p);
    }
  }
  return acc;
}

// Detail pages regenerated from data — skip in the photo pass.
function isDetailPage(rel) {
  return /^(speakers|previous-speakers)\/[^/]+\/index\.html$/.test(rel);
}

export async function postprocess() {
  const originals = await buildOriginals();
  const files = (await htmlFiles(OUT_DIR)).filter(
    (f) => !isDetailPage(relative(OUT_DIR, f)),
  );

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  await context.addInitScript(`window.__LIVE_ORIGINS = ${JSON.stringify(LIVE_ORIGINS)};`);
  await context.addInitScript(PAGE_FUNCTIONS);
  await context.addInitScript(`window.__ORIGINALS = ${JSON.stringify(originals)};`);
  const page = await context.newPage();

  const assets = new Map();
  let n = 0;
  for (const file of files) {
    await page.goto(pathToFileURL(file).href, { waitUntil: 'domcontentloaded' });
    const isHome = relative(OUT_DIR, file) === 'index.html';
    await page.evaluate(`window.__SOLID_HEADER = ${!isHome}`);
    const r = await page.evaluate('window.__fixAndSerialize()');
    await writeFile(file, r.html);
    for (const a of r.assets) assets.set(a.local, a.url);
    n++;
  }
  await browser.close();

  // Merge discovered originals into assets.json.
  const existing = JSON.parse(await readFile(join(DATA_DIR, 'assets.json'), 'utf8'));
  const merged = new Map(existing.map((a) => [a.local, a.url]));
  for (const [local, url] of assets) merged.set(local, url);
  const list = Array.from(merged, ([local, url]) => ({ local, url }));
  await writeFile(join(DATA_DIR, 'assets.json'), JSON.stringify(list, null, 2));

  console.log(`  postprocess: fixed ${n} pages, +${assets.size} original photos (assets now ${list.length})`);
  return { pages: n, photos: assets.size };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  postprocess().catch((e) => { console.error(e); process.exit(1); });
}
