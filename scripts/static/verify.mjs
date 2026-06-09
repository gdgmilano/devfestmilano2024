// Post-build verification: page counts, no live backend calls, no scripts,
// and internal links/asset references resolve to files on disk.
import { readFile, readdir, stat } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { OUT_DIR, DATA_DIR } from './config.mjs';

async function walkHtml(dir, acc = []) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'data' || entry.name === 'assets') continue;
      await walkHtml(p, acc);
    } else if (entry.name.endsWith('.html')) {
      acc.push(p);
    }
  }
  return acc;
}

async function exists(p) {
  try { await stat(p); return true; } catch { return false; }
}

const BACKEND_PATTERNS = [
  /firestore\.googleapis\.com/i,
  /firebaseio\.com/i,
  /identitytoolkit\.googleapis\.com/i,
  /googletagmanager\.com/i,
  /www\.google-analytics\.com/i,
  /firebaseinstallations/i,
];

const files = await walkHtml(OUT_DIR);
let problems = 0;
let scriptCount = 0;
const backendHits = [];
const brokenAssets = new Map();

for (const file of files) {
  const html = await readFile(file, 'utf8');
  const rel = file.slice(OUT_DIR.length);

  if (/<script[\s>]/i.test(html)) {
    scriptCount++;
    problems++;
    console.log(`  SCRIPT present: ${rel}`);
  }
  for (const re of BACKEND_PATTERNS) {
    if (re.test(html)) { backendHits.push(`${rel} :: ${re}`); problems++; }
  }

  // Check local asset refs (root-relative paths to /images, /assets, /styles).
  const refs = [...html.matchAll(/(?:src|href)="(\/(?:assets|images|styles|fonts)\/[^"]+)"/g)].map((m) => m[1]);
  for (const ref of new Set(refs)) {
    const dest = join(OUT_DIR, ref.replace(/^\//, ''));
    if (!(await exists(dest))) {
      brokenAssets.set(ref, (brokenAssets.get(ref) || 0) + 1);
    }
  }
}

// Page counts
async function countDir(sub) {
  const dir = join(OUT_DIR, sub);
  if (!(await exists(dir))) return 0;
  const entries = await readdir(dir, { withFileTypes: true });
  let n = 0;
  for (const e of entries) {
    if (e.isDirectory() && (await exists(join(dir, e.name, 'index.html')))) n++;
  }
  return n;
}

const speakerPages = await countDir('speakers');
const sessionPages = await countDir('sessions');
const prevPages = await countDir('previous-speakers');

const data = JSON.parse(await readFile(join(DATA_DIR, 'speakers.json'), 'utf8'));
const sessions = JSON.parse(await readFile(join(DATA_DIR, 'sessions.json'), 'utf8'));

console.log('\n=== Verification ===');
console.log(`HTML pages total:       ${files.length}`);
console.log(`Speaker pages:          ${speakerPages} (firestore: ${data.length})`);
console.log(`Session pages:          ${sessionPages} (firestore: ${sessions.length})`);
console.log(`Previous-speaker pages: ${prevPages}`);
console.log(`Pages with <script>:    ${scriptCount}`);
console.log(`Backend-call hits:      ${backendHits.length}`);
if (backendHits.length) console.log(backendHits.slice(0, 15).map((h) => '   ' + h).join('\n'));
console.log(`Broken local assets:    ${brokenAssets.size} distinct`);
if (brokenAssets.size) {
  console.log([...brokenAssets.keys()].slice(0, 20).map((k) => '   ' + k).join('\n'));
}

console.log(problems === 0 && brokenAssets.size === 0 ? '\nPASS' : `\nISSUES: ${problems + brokenAssets.size}`);
