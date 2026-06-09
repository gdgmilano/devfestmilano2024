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
