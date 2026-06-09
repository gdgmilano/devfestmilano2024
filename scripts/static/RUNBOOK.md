# Runbook — static archive of a DevFest Milano edition

This tooling freezes a live "Hoverboard" DevFest SPA (Lit/Polymer + Firestore)
into a fully static, backend-free site for GitHub Pages. It is **portable**: it
auto-detects the edition from the repo it lives in, so you run it unchanged in
each year's repo. This runbook captures the exact steps and every non-obvious
gotcha so a new edition is fast and error-free.

## TL;DR — archive an edition (e.g. in the 2024 repo)

1. Copy `scripts/static/` into the edition's repo (a clone of the Hoverboard
   template configured for that year).
2. Install once:
   ```bash
   cd scripts/static
   npm install
   npx playwright install chromium chromium-headless-shell
   ```
3. Build (auto-configures from the repo — see below):
   ```bash
   npm run build        # ≈15–20 min; crawls the live site -> ../../static-site/
   node verify.mjs      # counts, no <script>, no backend calls, link check
   ```
4. Spot-check screenshots (home, speakers, a session, faq).

### Auto-configuration

`config.mjs` reads the edition from the repo, no edits needed:
- `projectId`, `apiKey` from `../../index.html` (`window.firebaseConfig = {...}`)
- live `url` + `firestoreDatabaseId` from `../../config/production.json`

`databaseId` is whatever `production.json` says — `(default)` for most, but a
**named** db for some (the 2024 project uses `devfest-2025`). Override any value
with env vars if a repo differs: `SITE_ORIGIN`, `FB_PROJECT`, `FB_API_KEY`,
`FB_DB`, `SITE_YEAR`, `OUT_DIR`.

First, confirm Firestore REST is publicly readable for the edition:
```bash
curl -s "https://firestore.googleapis.com/v1/projects/<PROJ>/databases/<DB>/documents/speakers?pageSize=2&key=<KEY>"
```

### Heads-up on data hygiene (learned from devfest-milano-2024)

A repo's Firestore may contain **mixed/leftover data**: the 2024 project's db
held 2016 DevFest-Ukraine demo docs, real 2024 (schedule `2024-11-23`) AND 2025
entries, with a home hero still reading "2025". Before trusting a build, sanity
-check `data/schedule.json` dates and the home hero, and confirm the live site is
actually the edition you want. Filtering a polluted db to one year is extra work
not handled automatically.

## Pipeline (build.mjs)

1. **extract-data** — dump public Firestore collections via REST →
   `<outDir>/data/*.json` + `routes.json`. Derives detail routes from ids.
2. **crawl** — headless Chromium renders every route, serialized with
   **Declarative Shadow DOM** (+ inlined adopted styles) so it renders without
   JS. Applies the in-page fixes (images, dynamic-UI strip, layout, header).
3. **build-speakers** — templates `/speakers/:id` & `/previous-speakers/:id`
   from data (the SPA's speaker-page can't cold-load — see gotchas).
4. **localize** — download every asset; rewrite CSS `url()`.
5. **finalize** — `404.html`, `.nojekyll`, `robots.txt`, `sitemap.xml`, CNAME.

`SITE=<edition> node build.mjs --no-crawl` re-runs everything EXCEPT the crawl
(uses existing crawled HTML): offline photo/dynamic/layout fixes via
`postprocess.mjs`, then speakers/localize/finalize. Use when the live site is
throttling, but note postprocess mutates files in place (see gotchas).

## Gotchas (hard-won — read before debugging)

- **Shadow DOM needs DSD.** Content lives in shadow roots; serialize with
  `getHTML({serializableShadowRoots, shadowRoots})`. Lit's `static styles` use
  `adoptedStyleSheets` which DSD does NOT serialize — inline them as `<style>`.
- **Polymer leftovers render as text.** `<dom-module>` registries and stray
  `/* ... */` CSS-comment text nodes show as visible text — removed in serialize.
- **Images: `/assets/<hash>` 403s.** The app shows a `lazy-image src="/assets/…"`
  placeholder, but the real CDN URL is the inner `#image`.currentSrc
  (sessionize / lh3.googleusercontent / `/images`). The crawl waits for images
  to load, then uses currentSrc. Fallback: Firestore `photoUrl` by alt/gallery
  order. Previous-speaker photos may point to a dead bucket (e.g. 2025 used the
  defunct `dfua17.appspot.com`) — unrecoverable; they're template demo data.
- **Service worker doesn't help.** SW precache holds the app shell, not photos;
  in-page fetch of `/assets` still 403s.
- **speaker-page won't cold-load.** Direct URL / refresh of `/speakers/:id`
  renders "Not Found" (only works via in-app click). So detail pages are
  TEMPLATED from data, not crawled (crawl skips those routes).
- **Live site throttles crawlers.** Aggressive/rapid requests get a 403
  `/prerender/...` or near-empty pages, and it can persist. Use a real Chrome
  User-Agent (required), pace requests, and avoid hammering with test runs. If
  blocked, wait it out or use `--no-crawl`.
- **`blog` / `previousSpeakers` are demo data.** Leftover Hoverboard content
  (DevFest Ukraine / Lviv). No `/blog` or `/post` route exists — excluded.
- **Speaker grid layout.** Each speaker = `<a class="speaker card">` + a sibling
  `<div class="contacts">` (social + logo) the app positions via JS; statically
  it flows as its own grid cell and scrambles the grid. `.contacts` holds `<a>`
  links so it CANNOT be nested in the card `<a>` (invalid; parser splits it).
  Fix: remove `.contacts` and broken `.badges` from the grid — clean grid;
  socials remain on detail pages.
- **Header is JS-themed.** Nav text turns white over the hero and the paper-tabs
  selection bar is JS-positioned. Frozen: subpage nav is white-on-white and the
  underline lands under the wrong tab. Fix: hide `#selectionBar`, underline
  `paper-tab.iron-selected` via CSS, and on non-home routes force a solid header
  with dark text (`window.__SOLID_HEADER`, set per route).
- **Dynamic UI removed.** notification-toggle, mwc-snackbar, paper-fab
  (my-schedule), signin/subscribe/feedback dialogs, ticket links
  (`gdg.community.dev`), Sign in / Get free ticket, and the broken `google-map`
  widget + `.gm-err*` box.
- **postprocess is NOT idempotent for structural moves.** Apply structural DOM
  fixes during the crawl (once, on clean live DOM). Running postprocess
  repeatedly compounds/corrupts. It mutates files in place.
- **`page.evaluate('() => {...}')`** evaluates to the function, not its result —
  call it: `'window.__fn()'` or wrap as an IIFE.

## Deploy

Each edition lives in its own repo and outputs `static-site/` with root-relative
paths, so it deploys at a domain root as-is. Copy
`.github/workflows/deploy-pages.yaml` into the edition's repo (it publishes
`static-site/` via GitHub Actions); set Settings → Pages → Source: GitHub
Actions. For a custom domain, build with `CNAME=<domain>` (or add
`static-site/CNAME`) and set it under Settings → Pages.

(If you ever want several editions under ONE Pages site at subpaths like
`/2024/`, the build would need a base-path prefix so asset/link paths don't
collide — not currently implemented.)

## Files

- `config.mjs` — auto-detects the edition from the repo (+ env overrides).
- `extract-data.mjs`, `crawl.mjs`, `page-serialize.mjs` (in-browser logic),
  `localize.mjs`, `build-speakers.mjs`, `finalize.mjs`, `postprocess.mjs`,
  `asset-path.mjs`, `build.mjs`, `verify.mjs`, `test-crawl.mjs` (dev smoke test).
