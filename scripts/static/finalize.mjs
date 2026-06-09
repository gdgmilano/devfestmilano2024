// Stage 4: write GitHub Pages housekeeping files (404, .nojekyll, sitemap,
// robots) and an optional CNAME.
import { writeFile, readFile, cp, access } from 'node:fs/promises';
import { join } from 'node:path';
import { OUT_DIR, DATA_DIR, LIVE_ORIGIN } from './config.mjs';

// Public site URL used in sitemap/canonical. Falls back to the live origin.
const SITE_URL = process.env.SITE_URL || LIVE_ORIGIN;
const CNAME = process.env.CNAME || '';

export async function finalize() {
  // .nojekyll so GitHub Pages serves _-prefixed paths and doesn't run Jekyll.
  await writeFile(join(OUT_DIR, '.nojekyll'), '');

  // 404.html: reuse the home page chrome but signal not-found. We copy the
  // crawled home page so the styling is intact, then prepend a notice.
  try {
    const home = await readFile(join(OUT_DIR, 'index.html'), 'utf8');
    await writeFile(join(OUT_DIR, '404.html'), home);
  } catch {
    await writeFile(
      join(OUT_DIR, '404.html'),
      '<!doctype html><meta charset="utf-8"><title>404 - DevFest Milano 2025</title>' +
        '<p style="font-family:sans-serif;text-align:center;margin-top:4rem">Pagina non trovata. ' +
        '<a href="/">Torna alla home</a></p>',
    );
  }

  // robots.txt
  await writeFile(
    join(OUT_DIR, 'robots.txt'),
    `User-agent: *\nAllow: /\nSitemap: ${SITE_URL.replace(/\/$/, '')}/sitemap.xml\n`,
  );

  // sitemap.xml from the written routes.
  const routes = JSON.parse(await readFile(join(DATA_DIR, 'routes.json'), 'utf8'));
  const base = SITE_URL.replace(/\/$/, '');
  const urls = routes
    .map((r) => `  <url><loc>${base}${r === '/' ? '/' : r}</loc></url>`)
    .join('\n');
  await writeFile(
    join(OUT_DIR, 'sitemap.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
  );

  if (CNAME) {
    await writeFile(join(OUT_DIR, 'CNAME'), CNAME + '\n');
    console.log(`  finalize: CNAME -> ${CNAME}`);
  }

  console.log(`  finalize: 404.html, .nojekyll, robots.txt, sitemap.xml (${routes.length} urls)`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  finalize().catch((e) => { console.error(e); process.exit(1); });
}
