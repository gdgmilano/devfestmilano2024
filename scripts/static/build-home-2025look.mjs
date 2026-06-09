// Replace the 2024 home with the 2025 DSD home shell (Duomo hero + graphic
// logo + transparent header), rewritten for the 2024 edition. Single-page,
// idempotent. No Firestore / crawl / network.
//
// Run from scripts/static/:
//   node build-home-2025look.mjs
// The 2025 static build is read from SRC_2025 (default below); output goes to
// the 2024 repo root (two levels up from this script).
import { readFile, writeFile, copyFile, stat, mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_ROOT = resolve(HERE, '..', '..'); // 2024 repo root
const SRC_2025 = process.env.SRC_2025 || '/Users/dave/Projects/devfestmilano2025';

// Hero/home assets that may be missing in the 2024 root and must be copied
// from the 2025 build. (Currently none: every asset the 2024 home references
// is already present in the 2024 root. The og:image/twitter:image meta tags
// point at images/social-share.jpg, which is a dead reference in the 2025
// source too — not served by either live site — so there is nothing to copy.)
const EXTRA_ASSETS = [];

// Rewrite every 2025 reference to 2024. Order matters: specific URLs first so
// canonical/social URLs land on the real 2024 domain, generic year last.
function de2025(html) {
  return html
    // canonical / config-url / twitter:image host -> real 2024 domain.
    // Leaves any trailing path (e.g. //images/social-share.jpg) intact.
    .replaceAll('https://devfest-milano-2025.web.app', 'https://2024.devfestmilano.it')
    // 2025 og:url -> 2024 domain.
    .replaceAll('https://devfestmilano.it/', 'https://2024.devfestmilano.it/')
    .replaceAll('DevFest Milano 2025', 'DevFest Milano 2024')
    .replaceAll('October 11, 2025', 'November 23, 2024')
    .replaceAll('devfest-milano-2025', 'devfest-milano-2024')
    .replace(/\b2025\b/g, '2024');
}

async function exists(p) { try { await stat(p); return true; } catch { return false; } }

async function main() {
  const srcHome = join(SRC_2025, 'index.html');
  if (!(await exists(srcHome))) {
    throw new Error(`2025 home not found at ${srcHome} — set SRC_2025 to the 2025 static build dir`);
  }

  // 1+3. Copy 2025 home and rewrite it for 2024.
  const html = de2025(await readFile(srcHome, 'utf8'));
  await writeFile(join(OUT_ROOT, 'index.html'), html);

  // 2. Copy any missing hero assets from the 2025 build.
  const warnings = [];
  for (const rel of EXTRA_ASSETS) {
    const dest = join(OUT_ROOT, rel);
    if (await exists(dest)) continue;
    const from = join(SRC_2025, rel);
    if (!(await exists(from))) { warnings.push(`missing asset (src+dest): ${rel}`); continue; }
    await mkdir(dirname(dest), { recursive: true });
    await copyFile(from, dest);
  }

  for (const w of warnings) console.warn(`  WARN: ${w}`);
  console.log(`  home-2025look: wrote index.html (${html.length} bytes), assets ok` +
    (warnings.length ? ` (${warnings.length} warnings)` : ''));
}

main().catch((e) => { console.error(e); process.exit(1); });
