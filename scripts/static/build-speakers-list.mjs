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
