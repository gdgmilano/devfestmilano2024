// Generate /index.html — hero + CTAs + partner logos for the 2024 edition.
import { writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { OUT_DIR, DATA_DIR, YEAR } from './config.mjs';
import { resolveAssetRef } from './asset-path.mjs';
import { SITE_TITLE, esc, header, footer, head } from './template-common.mjs';
import { mergeAssets } from './build-speakers-list.mjs';

export async function buildHome() {
  const [day] = JSON.parse(await readFile(join(DATA_DIR, 'schedule.json'), 'utf8'));
  const partners = JSON.parse(await readFile(join(DATA_DIR, 'partners.json'), 'utf8'));
  const assets = new Map();

  const partnerBlocks = partners.map((g) => {
    const logos = (g.items || []).map((it) => {
      const ref = resolveAssetRef(it.logoUrl || it.logo);
      if (!ref) return '';
      if (ref.remote) assets.set(ref.local, ref.remote);
      const img = `<img src="${esc(ref.local)}" alt="${esc(it.name || g.title)}">`;
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
