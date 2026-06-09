// Generate /sessions/<id>/index.html for each 2024 talk (sessions with speakers).
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { OUT_DIR, DATA_DIR } from './config.mjs';
import { SITE_TITLE, esc, header, footer, head } from './template-common.mjs';

export async function buildSessions() {
  const sessions = JSON.parse(await readFile(join(DATA_DIR, 'sessions.json'), 'utf8'));
  const speakers = JSON.parse(await readFile(join(DATA_DIR, 'speakers.json'), 'utf8'));
  const spById = Object.fromEntries(speakers.map((s) => [s.id, s]));

  const talks = sessions.filter((s) => (s.speakers || []).length);
  for (const s of talks) {
    const spk = (s.speakers || []).map((id) => spById[id]).filter(Boolean);
    const speakerLinks = spk
      .map((sp) => `<a href="/speakers/${esc(sp.id)}">${esc(sp.name)}</a>`)
      .join(', ');
    const tags = (s.tags || []).map((t) => esc(t)).join(', ');
    const meta = [s.language, s.complexity].filter(Boolean).map(esc).join(' · ');

    const html = `${head(s.title, s.description)}
${header()}
<div class="hero"><div class="hero-in"><div>
  <h1>${esc(s.title)}</h1>
  ${speakerLinks ? `<p class="role">${speakerLinks}</p>` : ''}
  ${meta ? `<p class="meta">${meta}</p>` : ''}
</div></div></div>
<main>
  <a class="back" href="/schedule">&larr; Schedule</a>
  ${s.description ? `<section><h2>Abstract</h2><div class="bio">${esc(s.description)}</div></section>` : ''}
  ${tags ? `<section><h2>Tags</h2><div>${tags}</div></section>` : ''}
</main>
${footer()}
</body></html>`;

    const dir = join(OUT_DIR, 'sessions', String(s.id));
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'index.html'), html);
  }
  console.log(`  sessions: ${talks.length} talk pages`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  buildSessions().catch((e) => { console.error(e); process.exit(1); });
}
