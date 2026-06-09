// Quick smoke test of the crawler on a handful of representative routes,
// including the original-photo injection.
import { chromium } from 'playwright';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { OUT_DIR, DATA_DIR } from './config.mjs';
import { PAGE_FUNCTIONS } from './page-serialize.mjs';
import { renderRoute, routeToFile } from './crawl.mjs';

const speakers = JSON.parse(await readFile(join(DATA_DIR, 'speakers.json'), 'utf8'));
const prev = JSON.parse(await readFile(join(DATA_DIR, 'previousSpeakers.json'), 'utf8'));
const gallery = JSON.parse(await readFile(join(DATA_DIR, 'gallery.json'), 'utf8'));
const people = {};
for (const p of [...speakers, ...prev]) {
  const url = p.photoUrl || p.photo;
  if (p.name && url) people[p.name] = url;
}
const originals = { people, gallery: gallery.map((g) => g.url).filter(Boolean) };

const ROUTES = ['/', '/speakers', '/faq'];

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1280, height: 1600 },
  userAgent:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
});
await context.addInitScript(PAGE_FUNCTIONS);
await context.addInitScript(`window.__ORIGINALS = ${JSON.stringify(originals)};`);
const page = await context.newPage();

for (const route of ROUTES) {
  const r = await renderRoute(page, route);
  if (!r) { console.log('SKIP', route); continue; }
  const file = join(OUT_DIR, '_test', routeToFile(route).slice(OUT_DIR.length + 1));
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, r.html);
  const ext = r.assets.filter((a) => /sessionize|googleusercontent|storage\.googleapis/.test(a.url)).length;
  console.log('ok', route, (r.html.length / 1024).toFixed(0) + 'kb', 'assets:', r.assets.length, 'orig-photos:', ext);
}
await browser.close();
