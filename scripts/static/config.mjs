// Shared configuration for the static site builder.
//
// PORTABLE BY DESIGN: drop scripts/static/ into any "Hoverboard" DevFest repo
// and it auto-detects that edition from the repo's own files —
//   - Firebase web config (projectId, apiKey) from ../../index.html
//     (the `window.firebaseConfig = { ... }` block)
//   - live URL + Firestore database id from ../../config/production.json
//     (`url` and `firestoreDatabaseId`)
// No per-edition editing needed. Override any value via env vars:
//   SITE_ORIGIN   live site to crawl (default: production.json `url`)
//   FB_PROJECT    Firebase projectId
//   FB_API_KEY    Firebase web apiKey
//   FB_DB         Firestore database id (default: production.json, else "(default)")
//   SITE_YEAR     edition label used by templated pages (default: year in projectId)
//   OUT_DIR       output dir name (default: "static-site")
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { readFileSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(__dirname, '..', '..');

const env = process.env;

function readJson(path, fallback) {
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return fallback; }
}

// Parse window.firebaseConfig = { ... } out of the repo's index.html.
function readFirebaseFromIndex() {
  try {
    const html = readFileSync(resolve(ROOT, 'index.html'), 'utf8');
    const m = html.match(/firebaseConfig\s*=\s*(\{[\s\S]*?\})\s*;/);
    if (!m) return {};
    // The block is valid JSON in the Hoverboard template (double-quoted keys).
    return JSON.parse(m[1]);
  } catch {
    return {};
  }
}

const fb = readFirebaseFromIndex();
const prod = readJson(resolve(ROOT, 'config', 'production.json'), {});

const projectId = env.FB_PROJECT || fb.projectId || '';
const apiKey = env.FB_API_KEY || fb.apiKey || '';
const databaseId = env.FB_DB || prod.firestoreDatabaseId || '(default)';

const origin = (env.SITE_ORIGIN || prod.url || (projectId && `https://${projectId}.web.app`) || '')
  .replace(/\/+$/, '');

if (!origin || !apiKey || !projectId) {
  throw new Error(
    'Could not auto-detect site config. Provide SITE_ORIGIN / FB_PROJECT / FB_API_KEY env vars, ' +
      'or ensure index.html has window.firebaseConfig and config/production.json has `url`.',
  );
}

const webApp = projectId ? `https://${projectId}.web.app` : origin;
const yearMatch = (projectId.match(/(20\d{2})/) || [])[1];

export const LIVE_ORIGIN = origin;
// Origins whose same-path assets are preserved as-is (the app + its hosting).
export const LIVE_ORIGINS = [...new Set([origin, webApp])];
export const FIREBASE = { projectId, apiKey, databaseId };
export const YEAR = env.SITE_YEAR || yearMatch || '';
export const OUT_DIR = resolve(ROOT, env.OUT_DIR || 'static-site');
export const DATA_DIR = resolve(OUT_DIR, 'data');

// Firestore collections that are publicly readable via REST.
export const COLLECTIONS = [
  'speakers',
  'sessions',
  'schedule',
  'team',
  'partners',
  'blog',
  'gallery',
  'videos',
  'previousSpeakers',
  'tickets',
];
