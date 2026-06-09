// In-browser serialization logic, kept as a plain string so it can be injected
// via page.evaluate / page.addScriptTag. It:
//   - auto-scrolls to trigger lazy rendering,
//   - detects the not-found page,
//   - inlines adoptedStyleSheets into real <style> nodes (DSD does NOT
//     serialize constructable stylesheets, which Lit/Polymer rely on),
//   - removes all scripts and dynamic/backend hooks,
//   - rewrites asset URLs to local paths and records them,
//   - serializes the whole document with Declarative Shadow DOM.
//
// LIVE_ORIGINS are the origins whose asset paths we preserve as-is.

export const PAGE_FUNCTIONS = `
// Deterministic non-crypto hash (cyrb53) — must match the Node downloader.
function cyrb53(str, seed = 0) {
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

const LIVE_ORIGINS = window.__LIVE_ORIGINS || [location.origin];
const ASSET_EXT = /\\.(png|jpe?g|gif|svg|webp|avif|ico|css|js|mjs|woff2?|ttf|otf|eot|mp4|webm|json|webmanifest)$/i;

const __assets = new Map(); // localPath -> absUrl
let __galleryIdx = 0;       // per-page gallery cursor

// Speaker/gallery photos are served by an image-optimization layer under
// /assets/ that now returns 403 (the live site shows them broken). Replace
// them with the original Firestore image URLs (injected as window.__ORIGINALS)
// and force the lazy-image's inner <img> visible (it defaults to opacity:0
// via aria-hidden under :host([fade]), and needs JS to load otherwise).
function fixLazyImage(el) {
  const sr = el.shadowRoot;
  let img = sr && sr.querySelector('#image');
  const alt = el.getAttribute('alt') || '';
  let original = null;
  // 1) Prefer the URL the browser actually loaded (covers speakers, gallery,
  //    partner/company logos, etc.). The /assets src attribute is a stale
  //    placeholder that 403s; currentSrc is the real CDN URL.
  const cur = img && img.currentSrc;
  if (cur && /^https?:/i.test(cur) && !/\\/assets\\//.test(cur)) original = cur;
  // 2) Fallback to Firestore originals (when the image had not loaded yet).
  if (!original) {
    const O = window.__ORIGINALS || { people: {}, gallery: [] };
    if (O.people && O.people[alt]) original = O.people[alt];
    else if ((el.getAttribute('class') || '').includes('grid-item') && O.gallery && O.gallery.length) {
      original = O.gallery[__galleryIdx++ % O.gallery.length];
    }
  }
  if (!original) return;
  const local = recordAsset(original);
  if (!local) return;
  el.setAttribute('src', local);
  if (sr) {
    if (!img) {
      img = document.createElement('img');
      img.id = 'image';
      sr.appendChild(img);
    }
    img.setAttribute('src', local);
    img.setAttribute('alt', alt);
    img.removeAttribute('aria-hidden');
    img.setAttribute('data-loc', '1');
  }
  el.setAttribute('data-loc', '1');
}

// The speakers grid renders each speaker as TWO sibling grid children:
// <a class="speaker card"> and a <div class="contacts"> (social icons +
// company logo). The live app positions .contacts over the card via JS; without
// JS it flows as a separate grid cell (card, contacts, card, ...), breaking the
// layout. Move each .contacts inside its preceding card so it flows below the
// bio (it already has margin-top:16px) and the grid holds one cell per speaker.
function fixSpeakerLayout(root) {
  if (!root.querySelectorAll) return;
  // The speakers grid renders each speaker as a <a class="speaker card"> plus a
  // separate sibling <div class="contacts"> (social links + company logo) that
  // the live app positions over the card via JS. Without JS each .contacts
  // flows as its own grid cell, scrambling the layout. The data is irregular
  // (not every speaker has contacts), so the robust fix is to drop .contacts
  // from the grid — the cards then form a clean responsive grid. Social links
  // and company logos remain on each speaker's detail page.
  root.querySelectorAll('.contacts').forEach((c) => c.remove());
  // Company-logo badges overlaying the photo are usually broken (the /assets
  // logos 403); remove them so they don't show as empty boxes.
  root.querySelectorAll('.badges').forEach((b) => b.remove());
}

// The header's nav colors and active-tab underline are computed by JS at
// runtime (text turns white over the hero, the paper-tabs selection bar is
// positioned in script). Frozen statically this breaks: subpage nav text stays
// white-on-white, and the selection bar lands under the wrong tab. Fix with CSS:
// drop the JS selection bar, underline the actually-selected tab, and on pages
// without a hero force a solid header with dark text. window.__SOLID_HEADER is
// set per route by the crawler (true for every route except '/').
function fixHeader(root) {
  if (!root.querySelectorAll) return;
  // Hide the JS-positioned selection bar (lives inside paper-tabs' shadow root).
  root.querySelectorAll('paper-tabs').forEach((t) => {
    if (t.shadowRoot) {
      const s = document.createElement('style');
      s.textContent = '#selectionBar{display:none!important}';
      t.shadowRoot.appendChild(s);
    }
  });
  if (root.querySelector && root.querySelector('paper-tab')) {
    let css = 'paper-tab.iron-selected{border-bottom:3px solid #1a73e8!important}';
    if (window.__SOLID_HEADER) {
      css += 'app-toolbar,app-header,app-header-layout{background:#fff!important}' +
        'paper-tab,.toolbar-logo,[main-title],app-toolbar a,app-toolbar span{color:#202124!important}';
    }
    const s = document.createElement('style');
    s.textContent = css;
    (root === document ? document.head : root).appendChild(s);
  }
}

// Remove non-functional dynamic UI (no backend in the static archive).
function removeDynamicUI(root) {
  if (!root.querySelectorAll) return;
  const TAGS = ['auth-required', 'feedback-block', 'feedback-dialog', 'mwc-snackbar',
    'notification-toggle', 'paper-fab', 'signin-dialog', 'subscribe-dialog', 'subscribe-block',
    'google-map', 'google-maps-api'];
  TAGS.forEach((t) => root.querySelectorAll(t).forEach((e) => e.remove()));
  // Google Maps JS-API error box ("This page didn't load Google Maps correctly").
  root.querySelectorAll('[class*="gm-err"]').forEach((e) => e.remove());
  // Ticket purchase links.
  root.querySelectorAll('a[href]').forEach((a) => {
    if (/gdg\\.community\\.dev|cohost|eventbrite|ticket/i.test(a.getAttribute('href') || '')) a.remove();
  });
  // Sign in / Get free ticket / Sign out controls (by text).
  root.querySelectorAll('paper-tab, paper-button, mwc-button, button, a').forEach((e) => {
    const t = (e.textContent || '').trim().toLowerCase();
    if (t === 'sign in' || t === 'sign out' || t === 'get free ticket') e.remove();
  });
}

function recordAsset(absUrl, forceCss) {
  let u;
  try { u = new URL(absUrl); } catch (e) { return null; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  const extMatch = u.pathname.match(/\\.[a-zA-Z0-9]+$/);
  let ext = extMatch ? extMatch[0].toLowerCase() : '';
  let local;
  if (LIVE_ORIGINS.includes(u.origin) && !u.search && ASSET_EXT.test(u.pathname)) {
    local = u.pathname; // keep clean same-app path, e.g. /images/logo.png
  } else {
    if (forceCss) ext = '.css';
    local = '/assets/' + cyrb53(absUrl) + ext;
  }
  __assets.set(local, u.href);
  return local;
}

function toAbs(url) {
  try { return new URL(url, location.href).href; } catch (e) { return null; }
}

function rewriteSrcset(value) {
  return value
    .split(',')
    .map((part) => {
      const seg = part.trim();
      if (!seg) return '';
      const sp = seg.split(/\\s+/);
      const abs = toAbs(sp[0]);
      const local = abs && recordAsset(abs);
      if (local) sp[0] = local;
      return sp.join(' ');
    })
    .filter(Boolean)
    .join(', ');
}

function rewriteCssUrls(css) {
  return css.replace(/url\\(\\s*(['"]?)([^'")]+)\\1\\s*\\)/gi, (m, q, ref) => {
    if (/^data:/i.test(ref) || ref.startsWith('#')) return m;
    const abs = toAbs(ref);
    const local = abs && recordAsset(abs);
    return local ? 'url(' + local + ')' : m;
  });
}

function processElement(el) {
  // Already handled by fixLazyImage — don't re-localize (would re-hash).
  if (el.getAttribute && el.getAttribute('data-loc')) return;
  // Localize src on any element (incl. custom elements like <lazy-image>),
  // except framed external documents.
  if (el.hasAttribute && el.hasAttribute('src') && el.tagName !== 'IFRAME' && el.tagName !== 'FRAME') {
    const abs = toAbs(el.getAttribute('src'));
    const local = abs && recordAsset(abs);
    if (local) el.setAttribute('src', local);
  }
  if (el.hasAttribute && el.hasAttribute('srcset')) {
    el.setAttribute('srcset', rewriteSrcset(el.getAttribute('srcset')));
  }
  if (el.tagName === 'IMG' && el.hasAttribute('data-src')) {
    const abs = toAbs(el.getAttribute('data-src'));
    const local = abs && recordAsset(abs);
    if (local) el.setAttribute('data-src', local);
  }
  if (el.tagName === 'VIDEO' && el.hasAttribute('poster')) {
    const abs = toAbs(el.getAttribute('poster'));
    const local = abs && recordAsset(abs);
    if (local) el.setAttribute('poster', local);
  }
  if (el.tagName === 'LINK') {
    const rel = (el.getAttribute('rel') || '').toLowerCase();
    const href = el.getAttribute('href');
    if (href && /stylesheet|icon|apple-touch-icon|mask-icon|preload|prefetch/.test(rel)) {
      // Skip script preloads (we strip JS).
      const as = (el.getAttribute('as') || '').toLowerCase();
      if (as === 'script' || /modulepreload/.test(rel)) { el.remove(); return; }
      const abs = toAbs(href);
      const local = abs && recordAsset(abs, rel.includes('stylesheet'));
      if (local) el.setAttribute('href', local);
    }
  }
  if (el.hasAttribute && el.hasAttribute('style')) {
    el.setAttribute('style', rewriteCssUrls(el.getAttribute('style')));
  }
}

function walk(root) {
  // Inline adopted stylesheets into a real <style> at the top of this root.
  const sheets = root.adoptedStyleSheets || [];
  if (sheets.length) {
    let css = '';
    for (const sheet of sheets) {
      try { for (const r of sheet.cssRules) css += r.cssText + '\\n'; } catch (e) {}
    }
    if (css) {
      const style = document.createElement('style');
      style.setAttribute('data-inlined', 'adopted');
      style.textContent = rewriteCssUrls(css);
      root.insertBefore(style, root.firstChild);
    }
    try { root.adoptedStyleSheets = []; } catch (e) {}
  }
  // Process <style> text content for url() refs.
  root.querySelectorAll && root.querySelectorAll('style').forEach((s) => {
    if (s.getAttribute('data-inlined') === 'adopted') return;
    s.textContent = rewriteCssUrls(s.textContent || '');
  });

  const all = root.querySelectorAll ? root.querySelectorAll('*') : [];
  for (const el of all) {
    if (el.tagName === 'LAZY-IMAGE') fixLazyImage(el);
    processElement(el);
    if (el.shadowRoot) walk(el.shadowRoot);
  }
}

function collectShadowRoots(root, acc) {
  const all = root.querySelectorAll ? root.querySelectorAll('*') : [];
  for (const el of all) {
    if (el.shadowRoot) { acc.push(el.shadowRoot); collectShadowRoots(el.shadowRoot, acc); }
  }
  return acc;
}

const BACKEND_RE = /firestore\\.googleapis|firebaseio|identitytoolkit|securetoken|firebaseinstallations|fcmregistrations|googletagmanager|google-analytics|apis\\.google|accounts\\.google|firebase\\.googleapis/i;

function removeScriptsAndDynamic() {
  const roots = [document, ...collectShadowRoots(document, [])];
  for (const root of roots) {
    if (!root.querySelectorAll) continue;
    root.querySelectorAll('script').forEach((s) => s.remove());
    // Strip backend connection hints / PWA manifest / script preloads — the
    // archive must not reference live Firebase/analytics endpoints.
    root.querySelectorAll('link, meta').forEach((el) => {
      const ref = el.getAttribute('href') || el.getAttribute('content') || '';
      const rel = (el.getAttribute('rel') || '').toLowerCase();
      if (BACKEND_RE.test(ref)) el.remove();
      else if (rel === 'manifest') el.remove();
      else if (/preload|modulepreload|prefetch/.test(rel) && (el.getAttribute('as') || '') === 'script') el.remove();
    });
    // Polymer style registries (iron-flex etc.): inert without Polymer's JS and
    // they emit visible CSS-comment text nodes. Remove them.
    root.querySelectorAll('dom-module').forEach((m) => m.remove());
    // Strip inline event handler attributes everywhere.
    root.querySelectorAll('*').forEach((el) => {
      for (const a of [...el.attributes]) {
        if (/^on/i.test(a.name)) el.removeAttribute(a.name);
      }
    });
    removeDynamicUI(root);
    fixSpeakerLayout(root);
    fixHeader(root);
  }
  // Remove stray CSS-comment text nodes (e.g. "/* Most common used flex... */")
  // that Polymer leaves in the light DOM and that render as visible text.
  const skip = new Set(['STYLE', 'SCRIPT', 'TEMPLATE', 'TEXTAREA']);
  const walker = document.createTreeWalker(document.documentElement, NodeFilter.SHOW_TEXT);
  const dead = [];
  let n;
  while ((n = walker.nextNode())) {
    const t = (n.nodeValue || '').trim();
    if (!t) continue;
    const parent = n.parentElement;
    if (parent && skip.has(parent.tagName)) continue;
    if (t.startsWith('/*')) dead.push(n);
  }
  dead.forEach((node) => node.remove());
}

window.__deepText = function () {
  let text = '';
  function rec(root) {
    text += (root.textContent || '');
    const all = root.querySelectorAll ? root.querySelectorAll('*') : [];
    for (const el of all) if (el.shadowRoot) rec(el.shadowRoot);
  }
  rec(document.body || document.documentElement);
  return text.replace(/\\s+/g, ' ').trim().length;
};

window.__isNotFound = function () {
  return !!document.querySelector('not-found-page') ||
    !!(document.body && document.body.querySelector && document.body.querySelector('not-found-page'));
};

window.__autoScroll = async function () {
  await new Promise((resolve) => {
    let y = 0;
    const step = () => {
      window.scrollBy(0, 600);
      y += 600;
      if (y < document.body.scrollHeight && y < 40000) setTimeout(step, 60);
      else { window.scrollTo(0, 0); resolve(); }
    };
    step();
  });
};

// Re-process an already-serialized local page: fix lazy-image photos using
// window.__ORIGINALS, then re-serialize. Used by the offline post-process pass
// (no asset-URL rewriting — paths are already local).
window.__fixAndSerialize = function () {
  removeScriptsAndDynamic();
  const roots = [document, ...collectShadowRoots(document, [])];
  for (const root of roots) {
    if (!root.querySelectorAll) continue;
    root.querySelectorAll('lazy-image').forEach((el) => fixLazyImage(el));
  }
  const allRoots = collectShadowRoots(document, []);
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  const htmlAttrs = [...document.documentElement.attributes]
    .map((a) => a.name + '="' + esc(a.value) + '"')
    .join(' ');
  let inner;
  try {
    inner = document.documentElement.getHTML({ serializableShadowRoots: true, shadowRoots: allRoots });
  } catch (e) {
    inner = document.documentElement.innerHTML;
  }
  const html = '<!doctype html>\\n<html ' + htmlAttrs + '>' + inner + '</html>';
  const assets = Array.from(__assets, ([local, url]) => ({ local, url }));
  return { html, assets };
};

window.__serialize = function () {
  removeScriptsAndDynamic();
  // Inline document-level adopted stylesheets into <head>.
  const docSheets = document.adoptedStyleSheets || [];
  if (docSheets.length) {
    let css = '';
    for (const sheet of docSheets) {
      try { for (const r of sheet.cssRules) css += r.cssText + '\\n'; } catch (e) {}
    }
    if (css) {
      const style = document.createElement('style');
      style.textContent = css;
      document.head.appendChild(style);
    }
    try { document.adoptedStyleSheets = []; } catch (e) {}
  }
  walk(document);

  const allRoots = collectShadowRoots(document, []);
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  const htmlAttrs = [...document.documentElement.attributes]
    .map((a) => a.name + '="' + esc(a.value) + '"')
    .join(' ');
  let inner;
  try {
    inner = document.documentElement.getHTML({ serializableShadowRoots: true, shadowRoots: allRoots });
  } catch (e) {
    inner = document.documentElement.innerHTML; // fallback (no DSD)
  }
  const html = '<!doctype html>\\n<html ' + htmlAttrs + '>' + inner + '</html>';
  const assets = Array.from(__assets, ([local, url]) => ({ local, url }));
  return { html, assets };
};
`;
