// Orchestrator: run the full static build pipeline end to end.
//   1. extract-data   -> Firestore JSON + route list
//   2. crawl          -> pre-render every route (DSD) + queue assets
//   3. postprocess    -> fix broken /assets photos with Firestore originals
//   4. build-speakers -> template speaker/previous-speaker detail pages
//   5. localize       -> download & localize all assets
//   6. finalize       -> 404, .nojekyll, robots, sitemap, (CNAME)
//
// `node build.mjs --no-crawl` skips stages 1-2 and only refreshes the photo
// fix, speaker pages, assets and finalize from existing crawled output (useful
// when the live site is throttling re-crawls).
import { extractData } from './extract-data.mjs';
import { crawl } from './crawl.mjs';
import { postprocess } from './postprocess.mjs';
import { buildSpeakers } from './build-speakers.mjs';
import { localize } from './localize.mjs';
import { finalize } from './finalize.mjs';

const noCrawl = process.argv.includes('--no-crawl');

async function main() {
  if (!noCrawl) {
    console.log('\n[1/6] Extracting Firestore data...');
    await extractData();
    console.log('\n[2/6] Crawling & pre-rendering routes...');
    await crawl();
  } else {
    console.log('\n[1-2/6] Skipped (--no-crawl): using existing crawled output.');
    // Photo fix + dynamic-UI strip is applied inline during crawl; only needed
    // as a separate offline pass when reusing already-crawled output.
    console.log('\n[3/6] Fixing photos + stripping dynamic UI (offline)...');
    await postprocess();
  }

  console.log('\n[4/6] Building speaker detail pages...');
  await buildSpeakers();

  console.log('\n[5/6] Localizing assets...');
  await localize();

  console.log('\n[6/6] Finalizing...');
  await finalize();

  console.log('\nDone.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
