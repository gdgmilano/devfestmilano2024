// Orchestrator: build the static 2024 site entirely from Firestore data
// (no crawl). Stages:
//   1. extract-data    -> filtered 2024 JSON + routes
//   2. build-home / speakers-list / sessions / schedule / speakers (detail)
//   3. de2025          -> rewrite kept pages, prune non-2024 dirs
//   4. localize        -> download all queued assets
//   5. finalize        -> 404, .nojekyll, robots, sitemap
import { extractData } from './extract-data.mjs';
import { buildHome } from './build-home.mjs';
import { buildSpeakersList } from './build-speakers-list.mjs';
import { buildSpeakers } from './build-speakers.mjs';
import { buildSessions } from './build-sessions.mjs';
import { buildSchedule } from './build-schedule.mjs';
import { runDe2025 } from './de2025.mjs';
import { localize } from './localize.mjs';
import { finalize } from './finalize.mjs';

async function main() {
  console.log('\n[1/9] Extracting 2024 Firestore data...');
  await extractData();
  console.log('\n[2/9] Home...');           await buildHome();
  console.log('\n[3/9] Speakers list...');  await buildSpeakersList();
  console.log('\n[4/9] Speaker pages...');  await buildSpeakers();
  console.log('\n[5/9] Session pages...');  await buildSessions();
  console.log('\n[6/9] Schedule...');       await buildSchedule();
  console.log('\n[7/9] De-2025 + prune...'); await runDe2025();
  console.log('\n[8/9] Localizing assets...'); await localize();
  console.log('\n[9/9] Finalizing...');     await finalize();
  console.log('\nDone.');
}

main().catch((e) => { console.error(e); process.exit(1); });
