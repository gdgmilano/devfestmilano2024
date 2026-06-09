// Generate /schedule/index.html — the 2024-11-23 agenda as a tracks × timeslots
// table. Cells link to session detail pages where the session is a talk.
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { OUT_DIR, DATA_DIR } from './config.mjs';
import { SITE_TITLE, esc, header, footer, head } from './template-common.mjs';

export async function buildSchedule() {
  const [day] = JSON.parse(await readFile(join(DATA_DIR, 'schedule.json'), 'utf8'));
  const sessions = JSON.parse(await readFile(join(DATA_DIR, 'sessions.json'), 'utf8'));
  const byId = Object.fromEntries(sessions.map((s) => [s.id, s]));

  const tracks = day.tracks || [];
  const isTalk = (id) => byId[id] && (byId[id].speakers || []).length;

  const cell = (id) => {
    const s = byId[id];
    if (!s) return '';
    const title = esc(s.title || id);
    return isTalk(id) ? `<a href="/sessions/${esc(id)}">${title}</a>` : title;
  };

  // Track which (row,col) positions are already covered by a rowspan above.
  const rows = day.timeslots || [];
  const skip = rows.map(() => new Array(tracks.length).fill(false));

  const bodyRows = rows.map((ts, r) => {
    const time = `${esc(ts.startTime)}–${esc(ts.endTime)}`;
    const entries = ts.sessions || [];

    // Full-width service slot: single entry covering the row.
    if (entries.length === 1 && tracks.length > 1) {
      const id = (entries[0].items || [])[0];
      return `<tr><td class="time">${time}</td>` +
        `<td colspan="${tracks.length}">${cell(id)}</td></tr>`;
    }

    const cells = [];
    for (let c = 0; c < tracks.length; c++) {
      if (skip[r][c]) continue;
      const entry = entries[c];
      const id = entry && (entry.items || [])[0];
      const span = entry && entry.extend ? entry.extend : 1;
      if (span > 1) {
        for (let k = 1; k < span && r + k < rows.length; k++) skip[r + k][c] = true;
      }
      cells.push(`<td${span > 1 ? ` rowspan="${span}"` : ''}>${id ? cell(id) : ''}</td>`);
    }
    return `<tr><td class="time">${time}</td>${cells.join('')}</tr>`;
  }).join('\n');

  const headRow = `<tr><th>Time</th>${tracks.map((t) => `<th>${esc(t.title)}</th>`).join('')}</tr>`;

  const html = `${head('Schedule', `${SITE_TITLE} schedule`)}
${header()}
<div class="hero"><div class="hero-in"><div>
  <h1>Schedule</h1>
  <p class="meta">${esc(day.dateReadable || day.date || day.id)}</p>
</div></div></div>
<main style="max-width:1140px">
  <table class="sched">${headRow}${bodyRows}</table>
</main>
${footer()}
</body></html>`;

  await mkdir(join(OUT_DIR, 'schedule'), { recursive: true });
  await writeFile(join(OUT_DIR, 'schedule', 'index.html'), html);
  console.log(`  schedule: ${rows.length} timeslots × ${tracks.length} tracks`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  buildSchedule().catch((e) => { console.error(e); process.exit(1); });
}
