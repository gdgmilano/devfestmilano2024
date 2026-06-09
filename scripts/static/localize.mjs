// Stage 3: write every queued asset into static-site/. Assets captured from the
// browser during the crawl (many are service-worker-cached and 403 on direct
// fetch) are used first; anything missing is fetched over the network.
import { mkdir, writeFile, readFile, stat } from 'node:fs/promises';
import { join, dirname, extname } from 'node:path';
import { OUT_DIR, DATA_DIR } from './config.mjs';
import { localFor, processCss } from './asset-path.mjs';

async function exists(p) {
  try { await stat(p); return true; } catch { return false; }
}

async function download(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (static-archive-builder)' },
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function pool(items, size, worker) {
  let i = 0;
  await Promise.all(
    Array.from({ length: size }, async () => {
      while (i < items.length) {
        const idx = i++;
        await worker(items[idx], idx);
      }
    }),
  );
}

// captured: optional Map<url, Buffer> of bodies seen by the browser.
export async function localize(captured = new Map()) {
  const queued = JSON.parse(await readFile(join(DATA_DIR, 'assets.json'), 'utf8'));
  const seen = new Set();
  const queue = [...queued];
  let ok = 0, fail = 0, fromBrowser = 0;
  const failures = [];

  for (let round = 0; round < 4 && queue.length; round++) {
    const batch = queue.splice(0, queue.length).filter((a) => {
      if (seen.has(a.local)) return false;
      seen.add(a.local);
      return true;
    });
    if (!batch.length) break;

    await pool(batch, 10, async (asset) => {
      const dest = join(OUT_DIR, asset.local.replace(/^\//, ''));
      if (await exists(dest)) { ok++; return; }
      const isCss = extname(dest).toLowerCase() === '.css';
      try {
        let buf = captured.get(asset.url);
        if (buf) fromBrowser++;
        else buf = await download(asset.url);
        await mkdir(dirname(dest), { recursive: true });
        if (isCss) {
          await writeFile(dest, processCss(buf.toString('utf8'), asset.url, queue));
        } else {
          await writeFile(dest, buf);
        }
        ok++;
      } catch (err) {
        fail++;
        failures.push(`${asset.url} -> ${err.message}`);
      }
    });
  }

  console.log(`  localize: ${ok} written (${fromBrowser} from browser), ${fail} failed`);
  if (failures.length) {
    console.log('  failures:\n' + failures.slice(0, 25).map((f) => '    ' + f).join('\n'));
  }
  return { ok, fail, failures };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  localize().catch((e) => { console.error(e); process.exit(1); });
}
