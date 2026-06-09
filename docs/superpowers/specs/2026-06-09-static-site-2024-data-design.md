# Static site — repopulate with DevFest Milano 2024 data

**Date:** 2026-06-09
**Status:** Approved design

## Goal

Produce a `static-site/` whose content is the **real DevFest Milano 2024
edition** (event day `2024-11-23`), reusing the clean templating style already
present in `scripts/static/build-speakers.mjs`, and removing the heavy 2025
Declarative-Shadow-DOM (DSD) crawl snapshots.

The repo currently contains a complete **2025** static build (pasted in by the
user): 199 HTML pages, assets, images — titled "DevFest Milano 2025", dates
`2025-10-11`, canonical `devfest-milano-2025.web.app`. We keep its look/CSS and
asset pipeline but swap the **content** to 2024.

## Why a rebuild-from-data (not a crawl, not in-place DSD edits)

- There is **no live site serving 2024 data**: the project's real Firestore
  (named db `devfest-2025`, see `src/firebase.ts:31`) has been overwritten with
  2025 content. So crawling cannot produce 2024 pages.
- The 2024 data lives in the **`(default)`** Firestore database of project
  `devfest-milano-2024` (confirmed by the user). It also holds leftover demo
  data (2016 DevFest-Ukraine/Lviv days, `previousSpeakers`, `blog`) that must be
  filtered out.
- The 2025 list/detail/schedule/home pages are 300–800 KB DSD crawl snapshots
  that cannot be regenerated from JSON. Per the user's decision, we **regenerate
  all pages from clean data-driven templates** (the `build-speakers.mjs`
  approach), which is robust and yields 100% 2024 content.

## Source data — `(default)` db, filtered to the 2024 edition

REST base:
`https://firestore.googleapis.com/v1/projects/devfest-milano-2024/databases/(default)/documents`
API key (public web key, already in use): `AIzaSyBcyqi1LwIDKwRBZ4iAMXv7rGUozyEMGGo`.

Filter rule — the **schedule day `2024-11-23` is authoritative**:

- Its 14 timeslots × 5 tracks (Bit / Nibble / Byte / Word / DWord Room)
  reference **34 session ids** = **27 talks** + 7 service slots
  (registration, coffee, lunch).
- Those talk sessions reference **28 speakers** (all present in `(default)`).

Included collections (filtered): `sessions` (34 referenced),
`speakers` (28 referenced), `schedule` (day `2024-11-23` only), `team`,
`partners`, `gallery` (8), `videos` (22).

Excluded: schedule days `2016-09-09` / `2016-09-10`, speakers not on the 2024
agenda, `previousSpeakers`, `blog`, `tickets` (dynamic/non-archival).

Schema note: `(default)` speaker docs have the **same field set** as the 2025
build expects (`badges, bio, featured, id, name, order, photoUrl, socials,
title`) — no schema translation needed. Session docs use
`{ id, title, description, speakers:[id], language, tags, complexity }`; service
slots have `{ id, title, description, image, icon }` and no `speakers`.

## Architecture

New/modified scripts under `scripts/static/`, all **data-driven, no crawl**.
Reuse the existing `STYLE` / `header()` / `footer()` / `esc()` from
`build-speakers.mjs` by extracting them into a shared module.

### Module: `template-common.mjs` (new)
Extract the duplicated presentation helpers from `build-speakers.mjs`:
`SITE_TITLE`, `STYLE`, `NAV`, `header()`, `footer()`, `esc()`. `build-speakers.mjs`
imports from it (no behavior change to existing speaker pages).

### Stage 1 — data extraction (`extract-data.mjs`, modified)
1. Read `(default)` via REST (driven by `FB_DB=(default)`).
2. Load `schedule`, pick day `2024-11-23`; collect its 34 session ids and the
   28 speaker ids referenced by those sessions' `speakers` arrays.
3. Write filtered `static-site/data/*.json`: `speakers.json` (28),
   `sessions.json` (34), `schedule.json` (1 day), `team.json`, `partners.json`,
   `gallery.json`, `videos.json`. Omit blog / previousSpeakers / 2016 days.
4. Write `routes.json` for 2024.

### Stage 2 — page generators (new, clean templates)
- **`build-home.mjs`** → `/index.html`: hero "DevFest Milano 2024", date
  23 Nov 2024, location line, CTAs to speakers/schedule, partner/sponsor cards
  from `partners`.
- **`build-speakers-list.mjs`** → `/speakers/index.html`: grid of all **28**
  speaker cards (photo, name, role) linking to `/speakers/<id>`.
- **`build-speakers.mjs`** (existing, reused) → `/speakers/<id>` for the 28.
- **`build-sessions.mjs`** → `/sessions/<id>/index.html` for the 27 talks:
  title, description, language, complexity, tags, linked speakers.
- **`build-schedule.mjs`** → `/schedule/index.html`: the 23 Nov 2024 agenda,
  14 timeslots × 5 tracks, each cell linking to its session. Doubles as the
  sessions index (the live SPA has no separate `/sessions` list).
- **Static pages** `/faq`, `/coc`, `/location`, `/team`, `/speakers-info`:
  `/team` generated from `team` data; the others either simple templated pages
  or the 2025 snapshot stripped of "2025" references. (Resolved during planning
  per page; default to clean templated pages for consistency.)

### Stage 3 — assets, cleanup, finalize
- **Assets**: reuse `localize.mjs` + `asset-path.mjs`. Speaker/partner photos are
  absolute sessionize/storage URLs → downloaded locally; CSS `url()` rewritten.
- **Cleanup of 2025 DSD snapshots**: delete non-2024 `/sessions/<id>` and
  `/speakers/<id>` directories (95→27, 72→28), and the heavy DSD `index.html` /
  `404.html` replaced by templates. Remove `/previous-speakers/*`.
- **finalize.mjs** (reused): `.nojekyll`, `robots.txt`, `sitemap.xml`,
  `404.html` for the 2024 routes; `SITE_YEAR=2024`, title/canonical for 2024.
- **verify.mjs** (extended): counts (28 speakers, 27 talks, schedule = 1 day),
  no `<script>` / backend calls, internal link check, and an **anti-2025** check
  (no "2025" / `devfest-milano-2025` left in output).

## Config / invocation

The builder auto-detects config from the repo but this repo lacks a static
`window.firebaseConfig` and `firestoreDatabaseId`, so values are passed via env:

```
SITE_ORIGIN=https://devfest-milano-2024.web.app \
FB_PROJECT=devfest-milano-2024 \
FB_API_KEY=AIzaSyBcyqi1LwIDKwRBZ4iAMXv7rGUozyEMGGo \
FB_DB="(default)" \
SITE_YEAR=2024 \
node build.mjs --no-crawl
```

(`--no-crawl`: the whole 2024 build is data-driven; the crawl stage is never
used.)

## Out of scope

- Dynamic features (login, ticketing, personal schedule, push) — archive only.
- Restoring 2016/previous-speaker/blog demo content.
- Pixel-identical reproduction of the 2025 DSD pages (we use clean templates).

## Success criteria

- `static-site/` titled "DevFest Milano 2024", hero/date `2024-11-23`.
- 28 speaker pages + speakers list; 27 session pages; schedule for 23/11/2024.
- No "2025" / `devfest-milano-2025` references; no `<script>` or backend calls.
- `verify.mjs` passes (counts, links, anti-2025).
