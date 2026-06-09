// Stage 1: extract the 2024 edition (schedule day 2024-11-23) from Firestore
// into JSON, plus the route list. The schedule day is authoritative: only the
// sessions it references (and the speakers those sessions reference) are kept.
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DATA_DIR } from './config.mjs';
import { fetchCollection, fetchSubcollection } from './firestore.mjs';

const EDITION_DAY = process.env.EDITION_DAY || '2024-11-23';

const STATIC_ROUTES = [
  '/', '/schedule', '/speakers', '/team', '/faq', '/coc', '/location', '/speakers-info',
];

export async function extractData() {
  await mkdir(DATA_DIR, { recursive: true });
  const write = (name, val) => writeFile(join(DATA_DIR, name), JSON.stringify(val, null, 2));

  // Schedule: keep only the edition day.
  const allSchedule = await fetchCollection('schedule');
  const day = allSchedule.find((d) => d.id === EDITION_DAY);
  if (!day) throw new Error(`schedule day ${EDITION_DAY} not found`);
  await write('schedule.json', [day]);

  // Session ids referenced by that day's timeslots.
  const sessionIds = new Set();
  for (const ts of day.timeslots || []) {
    for (const s of ts.sessions || []) {
      for (const it of s.items || []) sessionIds.add(it);
    }
  }

  const allSessions = await fetchCollection('sessions');
  const sessions = allSessions.filter((s) => sessionIds.has(s.id));
  await write('sessions.json', sessions);

  // Speaker ids referenced by those sessions.
  const speakerIds = new Set();
  for (const s of sessions) for (const sid of s.speakers || []) speakerIds.add(sid);

  const allSpeakers = await fetchCollection('speakers');
  const speakers = allSpeakers
    .filter((sp) => speakerIds.has(sp.id))
    .sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
  await write('speakers.json', speakers);

  // previousSpeakers / blog are demo data -> excluded entirely (empty).
  await write('previousSpeakers.json', []);

  // Partners with their logo items (subcollection `items`).
  const partners = (await fetchCollection('partners')).sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
  for (const p of partners) {
    try { p.items = await fetchSubcollection(`partners/${p.id}/items`); }
    catch { p.items = []; }
  }
  await write('partners.json', partners.filter((p) => (p.items || []).length));

  // Pass-through collections (kept as-is for completeness; pages may use them).
  await write('team.json', await fetchCollection('team'));
  await write('gallery.json', await fetchCollection('gallery'));
  await write('videos.json', await fetchCollection('videos'));

  const detail = [
    ...sessions.filter((s) => (s.speakers || []).length).map((s) => `/sessions/${s.id}`),
    ...speakers.map((s) => `/speakers/${s.id}`),
  ];
  const routes = [...STATIC_ROUTES, ...detail];
  await write('routes.json', routes);

  console.log(`  data: ${speakers.length} speakers, ${sessions.length} sessions ` +
    `(${detail.filter((r) => r.startsWith('/sessions')).length} talks), schedule day ${EDITION_DAY}`);
  console.log(`  routes: ${routes.length}`);
  return { speakers, sessions, routes };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  extractData().catch((e) => { console.error(e); process.exit(1); });
}
