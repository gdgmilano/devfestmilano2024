// Generate speaker / previous-speaker detail pages from Firestore data.
// The live SPA's speaker-page does not render on direct URL load (it only
// works via in-app navigation), so these pages are built from data with a
// clean, on-brand template that links to the speaker's sessions.
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { OUT_DIR, DATA_DIR } from './config.mjs';
import { localFor } from './asset-path.mjs';
import { SITE_TITLE, esc, header, footer, head } from './template-common.mjs';

function page(sp, photoLocal, sessions) {
  const role = [sp.title, sp.company].filter(Boolean).join(' · ');
  // Some `country` values are polluted with bio text in Firestore — only show
  // clean, short, single-phrase values.
  const cleanCountry = sp.country && sp.country.length < 40 && !sp.country.includes('.') ? sp.country : '';
  const meta = [sp.pronouns, cleanCountry].filter(Boolean).join(' · ');
  const socials = (sp.socials || [])
    .filter((s) => s && s.link)
    .map((s) => `<a href="${esc(s.link)}" target="_blank" rel="noopener noreferrer">${esc(s.name || s.icon || 'Link')}</a>`)
    .join('');
  const talks = sessions
    .map((t) => `<li><a href="/sessions/${esc(t.id)}">${esc(t.title)}</a></li>`)
    .join('');
  return `${head(sp.name, (sp.shortBio || sp.bio || sp.name).slice(0, 150))}
${header()}
<div class="hero"><div class="hero-in">
  ${photoLocal ? `<img class="photo" src="${esc(photoLocal)}" alt="${esc(sp.name)}">` : ''}
  <div>
    <h1>${esc(sp.name)}</h1>
    ${role ? `<p class="role">${esc(role)}</p>` : ''}
    ${meta ? `<p class="meta">${esc(meta)}</p>` : ''}
  </div>
</div></div>
<main>
  <a class="back" href="/speakers">&larr; All speakers</a>
  ${sp.bio ? `<section><h2>Bio</h2><div class="bio">${esc(sp.bio)}</div></section>` : ''}
  ${socials ? `<section><h2>Links</h2><div class="socials">${socials}</div></section>` : ''}
  ${talks ? `<section><h2>Talks</h2><ul class="talks">${talks}</ul></section>` : ''}
</main>
${footer()}
</body>
</html>`;
}

export async function buildSpeakers() {
  const read = async (f) => JSON.parse(await readFile(join(DATA_DIR, f), 'utf8'));
  const speakers = await read('speakers.json');
  const previous = await read('previousSpeakers.json');
  const sessions = await read('sessions.json');

  // speakerId -> [{id, title}]
  const talksBySpeaker = {};
  for (const s of sessions) {
    for (const sid of s.speakers || []) {
      (talksBySpeaker[sid] = talksBySpeaker[sid] || []).push({ id: s.id, title: s.title });
    }
  }

  const assets = new Map();
  const gen = async (list, base) => {
    for (const sp of list) {
      const orig = sp.photoUrl || sp.photo;
      let photoLocal = null;
      if (orig) {
        const abs = /^https?:/.test(orig) ? orig : `https://devfestmilano.it${orig}`;
        photoLocal = localFor(abs);
        if (photoLocal) assets.set(photoLocal, abs);
      }
      const html = page(sp, photoLocal, talksBySpeaker[sp.id] || []);
      const dir = join(OUT_DIR, base, sp.id);
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, 'index.html'), html);
    }
  };
  await gen(speakers, 'speakers');
  await gen(previous, 'previous-speakers');

  // Merge photos into assets.json.
  const existing = JSON.parse(await readFile(join(DATA_DIR, 'assets.json'), 'utf8'));
  const merged = new Map(existing.map((a) => [a.local, a.url]));
  for (const [local, url] of assets) merged.set(local, url);
  await writeFile(
    join(DATA_DIR, 'assets.json'),
    JSON.stringify(Array.from(merged, ([local, url]) => ({ local, url })), null, 2),
  );

  console.log(`  speakers: ${speakers.length} + ${previous.length} previous detail pages, +${assets.size} photos`);
  return { speakers: speakers.length, previous: previous.length };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  buildSpeakers().catch((e) => { console.error(e); process.exit(1); });
}
