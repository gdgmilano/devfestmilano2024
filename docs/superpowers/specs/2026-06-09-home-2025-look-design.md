# Home 2024 with the 2025 visual look

**Date:** 2026-06-09
**Status:** Approved design

## Goal

Replace the current 2024 home page (a clean minimal template — flat blue
banner) with the **2025 home shell** (immersive hero over a Milan/Duomo photo,
graphic DevFest logo, transparent header), rewritten for the 2024 edition.

This is a **single-page** change. The rest of the 2024 site (speakers list,
schedule, sessions, speaker detail pages) stays as it is now (our clean
data-driven templates). Scope is deliberately limited to the home page, which
is the page whose look differs most from 2025.

## Context

- The 2025 site (`/Users/dave/Projects/devfestmilano2025/`, branch
  `main-static`) is a **static DSD build** crawled from the live 2025 SPA: its
  `index.html` (413 KB) carries the full look inline in Declarative Shadow DOM
  (`hero-block`, `hero-image` over `images/backgrounds/home.jpg`, `hero-logo`),
  no `<script>` tags.
- The 2024 site (this repo, branch `pages-static`) serves a clean minimal home.
- The 2024 and 2025 sites share the same asset layout and root-relative links,
  so the 2025 home's nav/footer links (`/speakers`, `/schedule`, `/coc`,
  `/faq`, `/location`, `/team`, `/`) resolve correctly against the 2024 site.

Why only the home: editing the other 2025 DSD pages is not viable — the 2025
speakers list contains only 21 lazy-loaded cards (4 of our 28), and the 2025
schedule is a custom DSD layout with 2025 times/structure. Those can't be
edited into 2024; rebuilding them is out of scope for this change.

## Source

`/Users/dave/Projects/devfestmilano2025/index.html` — the crawled 2025 home.

## Approach

A small, idempotent build step, `build-home-2025look.mjs`, run once:

1. **Copy** the 2025 `index.html` to the 2024 repo root (replaces the current
   clean-template home).
2. **Copy missing hero assets.** Verified: all referenced assets already exist
   in the 2024 root EXCEPT `images/social-share.jpg`, which is copied from the
   2025 repo. (`images/backgrounds/home.jpg`, `images/logo.png`,
   `images/logo-monochrome.png`, manifest icons, the hashed `/assets/*` used by
   the home, and the home CSS are all already present.)
3. **De-2025 the copied HTML.** Apply replacements in this order (specific →
   general) so canonical/social URLs point at the real 2024 domain:
   - `https://devfest-milano-2025.web.app` → `https://2024.devfestmilano.it`
     (covers `config-url`, `canonical`, and `twitter:image`, including the
     `.web.app//images/...` double-slash case — the prefix replace fixes the
     host and leaves `/images/social-share.jpg`)
   - `https://devfestmilano.it/` (the 2025 `og:url`) → `https://2024.devfestmilano.it/`
   - `DevFest Milano 2025` → `DevFest Milano 2024`
   - `October 11, 2025` → `November 23, 2024`
   - `2025-10-11` → `2024-11-23`
   - `devfest-milano-2025` → `devfest-milano-2024` (any leftover non-URL refs)
   - remaining word-bounded `\b2025\b` → `2024`

   Note: the live 2024 domain is `2024.devfestmilano.it` (its `CNAME`), so the
   canonical/og/twitter URLs must use it — NOT a `.web.app` host.
4. The source path of the 2025 repo is a parameter (env `SRC_2025`, default
   `/Users/dave/Projects/devfestmilano2025`) so the script isn't tied to one
   machine layout.

## Components

- `scripts/static/build-home-2025look.mjs` (new) — does the copy + asset copy +
  de-2025 rewrite. Self-contained; reuses the `de2025()` replacement function
  (extracted/shared from `de2025.mjs` or duplicated minimally).

The existing `build-home.mjs` (clean-template home generator) is **retained**
but no longer wired into the default publish flow for this branch — it stays as
an alternative. (We do not delete it; it documents the data-driven home and may
be useful if the 2025 source is unavailable.)

## Data flow

2025 `index.html` ──copy──▶ 2024 root `index.html` ──de2025()──▶ final home.
`images/social-share.jpg` ──copy──▶ 2024 root.

No Firestore, no crawl, no network.

## Error handling

- If `SRC_2025/index.html` is missing → throw with a clear message naming the
  expected path (so the operator points `SRC_2025` correctly).
- If an expected hero asset is missing in BOTH source and destination → log a
  warning listing it (don't fail the build; the page still renders, just with a
  missing image).

## Verification

After running, assert on the produced 2024 root `index.html`:
- contains `DevFest Milano 2024`, the hero markup (`hero-image`,
  `backgrounds/home.jpg`, `hero-logo`), and the 2024 date.
- contains **zero** `2025` / `devfest-milano-2025` references.
- canonical / `config-url` / `og:url` / `twitter:image` all use the
  `https://2024.devfestmilano.it` host (no `.web.app`, no bare
  `devfestmilano.it`).
- contains **zero** `<script>` tags.
- nav links `/speakers /schedule /coc /faq /location /team` present and resolve
  to existing pages/dirs in the 2024 root.
- `images/social-share.jpg` exists in the 2024 root.
- Visual check: screenshot the served home and confirm the Duomo hero + graphic
  logo render, titled 2024.

The repo's `verify.mjs` (whole-site, anti-2025 + no-script) must still PASS on
the full 2024 site after this change.

## Out of scope

- The 2025 look on speakers-list / schedule / sessions / speaker-detail pages.
- Re-crawling or running the Hoverboard SPA.
- Any change to Firestore data.

## Success criteria

- 2024 home renders with the 2025 immersive hero (Duomo + graphic logo,
  transparent header), titled "DevFest Milano 2024", dated 23 Nov 2024.
- No 2025 references, no `<script>`, no broken assets/links on the home.
- Whole-site `verify.mjs` passes.
