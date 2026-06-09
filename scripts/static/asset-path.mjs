// Shared asset-path logic used by both the crawler and the localizer, kept in
// sync with the in-page version in page-serialize.mjs.
import { LIVE_ORIGINS, LIVE_ORIGIN } from './config.mjs';
export { LIVE_ORIGINS };
export const ASSET_EXT = /\.(png|jpe?g|gif|svg|webp|avif|ico|css|js|mjs|woff2?|ttf|otf|eot|mp4|webm|json|webmanifest)$/i;

// cyrb53 — identical to the in-page hash so local paths line up exactly.
export function cyrb53(str, seed = 0) {
  let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
  for (let i = 0, ch; i < str.length; i++) {
    ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
}

// Resolve a raw asset reference from Firestore (which may be an absolute URL,
// a root-relative path like "/images/logos/x.svg", or a site-relative path
// like "../images/logos/x.svg") into { local, remote }:
//   - local:  the root-relative path to use in the generated HTML
//   - remote: the absolute URL to download (null when the asset is expected to
//             already live under the site's own /images, /assets, etc.)
// Returns null when the reference is empty/unusable.
export function resolveAssetRef(raw) {
  if (!raw) return null;
  // LinkedIn CDN URLs are signed, short-lived, and not hotlinkable — they 403
  // on download. Treat them as no image so the page falls back to a placeholder
  // (which is what the live site does too).
  if (/(^|\.)licdn\.com\//i.test(raw)) return null;
  // Absolute http(s) URL -> hash into /assets and download.
  if (/^https?:\/\//i.test(raw)) {
    const local = localFor(raw);
    return local ? { local, remote: local.startsWith('/assets/') ? raw : null } : null;
  }
  // Site-local reference: normalize "../images/..", "./images/..", "images/.."
  // and "/images/.." all to a single root-relative "/images/..". These assets
  // are served from the site itself; point `remote` at the live origin so the
  // localizer can fetch any that aren't already on disk.
  const path = '/' + raw.replace(/^(\.\.?\/)+/, '').replace(/^\/+/, '');
  return { local: path, remote: LIVE_ORIGIN ? `${LIVE_ORIGIN}${path}` : null };
}

// Map an absolute asset URL to its local root-relative path.
export function localFor(absUrl, forceCss) {
  let u;
  try { u = new URL(absUrl); } catch (e) { return null; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  const extMatch = u.pathname.match(/\.[a-zA-Z0-9]+$/);
  let ext = extMatch ? extMatch[0].toLowerCase() : '';
  if (LIVE_ORIGINS.includes(u.origin) && !u.search && ASSET_EXT.test(u.pathname)) {
    return u.pathname;
  }
  if (forceCss) ext = '.css';
  return '/assets/' + cyrb53(u.href) + ext;
}

// Rewrite url() refs in a CSS body to local paths, pushing discovered assets
// onto `queue` as { local, url } pairs.
export function processCss(css, baseUrl, queue) {
  return css.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi, (m, q, ref) => {
    if (/^data:/i.test(ref) || ref.startsWith('#')) return m;
    let abs;
    try { abs = new URL(ref, baseUrl).href; } catch { return m; }
    const local = localFor(abs);
    if (!local) return m;
    if (queue) queue.push({ local, url: abs });
    return 'url(' + local + ')';
  });
}
