# Static GitHub Pages archive builder

Generates a fully static, backend-free snapshot of the live DevFest Milano 2025
site (https://devfestmilano.it/) into [`static-site/`](../../static-site/),
ready to deploy to GitHub Pages.

See the design doc:
[`docs/superpowers/specs/2026-06-06-static-github-pages-design.md`](../../docs/superpowers/specs/2026-06-06-static-github-pages-design.md).

## How it works

The live site is a Lit/Polymer SPA that renders content from Firestore inside
Shadow DOM. The builder:

1. **extract-data** — dumps public Firestore collections via REST into
   `static-site/data/*.json` and derives the full route list.
2. **crawl** — loads every route in headless Chromium, waits for render, then
   serializes the DOM with **Declarative Shadow DOM** (inlining Lit's
   constructable stylesheets as `<style>`), strips all JS, and rewrites asset
   URLs to local paths. Content renders without JavaScript.
3. **localize** — downloads every referenced asset (images, CSS, fonts) into
   `static-site/` and rewrites `url()` references inside CSS.
4. **finalize** — writes `404.html`, `.nojekyll`, `robots.txt`, `sitemap.xml`,
   and an optional `CNAME`.

## Usage

```bash
cd scripts/static
npm install            # installs Playwright
npx playwright install chromium chromium-headless-shell
npm run build          # builds the 2025 edition -> ../../static-site/
node verify.mjs        # sanity checks (counts, no backend calls, link check)
```

### Other editions (portable — no edits needed)

The builder **auto-detects** the edition from the repo it lives in:
- Firebase web config (`projectId`, `apiKey`) from `../../index.html`
  (`window.firebaseConfig`)
- live URL + Firestore database id from `../../config/production.json`
  (`url`, `firestoreDatabaseId`)

So to archive another edition (e.g. DevFest Milano 2024), just copy
`scripts/static/` into that repo and run `npm install && npm run build` — it
configures itself. Override anything via env if a repo differs:

```bash
SITE_ORIGIN=https://my-site.example FB_PROJECT=... FB_API_KEY=... FB_DB=... \
SITE_YEAR=2024 OUT_DIR=static-site npm run build
```

Read [`RUNBOOK.md`](RUNBOOK.md) first — it documents the exact steps plus every
gotcha (DSD, the /assets 403 → currentSrc image recovery, speaker-page
cold-load templating, crawler throttling, layout/header fixes).

Environment variables for `finalize`/`build`:

- `SITE_URL` — public URL used in `sitemap.xml` (default: the live origin).
- `CNAME` — custom domain; writes `static-site/CNAME` for GitHub Pages.

```bash
CNAME=devfestmilano.it SITE_URL=https://devfestmilano.it npm run build
```

## Deploy

`static-site/` is committed and published by
[`.github/workflows/deploy-pages.yaml`](../../.github/workflows/deploy-pages.yaml).
Enable it under **Settings → Pages → Source: GitHub Actions**. For a custom
domain, rebuild with `CNAME=<domain>` (or add `static-site/CNAME`) and set the
domain under **Settings → Pages → Custom domain**.

## Notes

- This is an **archive**: dynamic features (login, ticketing, personal
  schedule, push notifications, forms) are non-functional by design. Their UI
  may still appear but does nothing (no JS, no backend).
- The `blog` Firestore collection holds leftover Hoverboard template demo
  content and is intentionally excluded from the routes.
