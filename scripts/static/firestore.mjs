// Minimal Firestore REST client.
// Reads public collections with the site's web API key and converts
// Firestore's typed JSON representation into plain JSON.
import { FIREBASE } from './config.mjs';

const BASE = `https://firestore.googleapis.com/v1/projects/${FIREBASE.projectId}/databases/${encodeURIComponent(
  FIREBASE.databaseId,
)}/documents`;

// Convert a single Firestore typed value -> plain JS value.
function fromValue(v) {
  if (v == null) return null;
  if ('nullValue' in v) return null;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('timestampValue' in v) return v.timestampValue;
  if ('stringValue' in v) return v.stringValue;
  if ('bytesValue' in v) return v.bytesValue;
  if ('referenceValue' in v) return v.referenceValue;
  if ('geoPointValue' in v) return v.geoPointValue;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(fromValue);
  if ('mapValue' in v) return fromFields(v.mapValue.fields || {});
  return null;
}

function fromFields(fields) {
  const obj = {};
  for (const [k, val] of Object.entries(fields)) obj[k] = fromValue(val);
  return obj;
}

// Document id is the last path segment of its resource name.
function docId(name) {
  return name.split('/').pop();
}

// Fetch every document under a documents-relative path, following pagination.
async function fetchPath(path) {
  const out = [];
  let pageToken = '';
  for (;;) {
    const url = new URL(`${BASE}/${path}`);
    url.searchParams.set('pageSize', '300');
    url.searchParams.set('key', FIREBASE.apiKey);
    if (pageToken) url.searchParams.set('pageToken', pageToken);

    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Firestore ${path} -> HTTP ${res.status}: ${await res.text()}`);
    }
    const data = await res.json();
    for (const doc of data.documents || []) {
      out.push({ id: docId(doc.name), ...fromFields(doc.fields || {}) });
    }
    if (!data.nextPageToken) break;
    pageToken = data.nextPageToken;
  }
  return out;
}

// Fetch every document in a top-level collection.
export async function fetchCollection(collection) {
  return fetchPath(collection);
}

// Fetch a subcollection at an explicit document path, e.g.
// fetchSubcollection('partners/<id>/items').
export async function fetchSubcollection(path) {
  return fetchPath(path);
}
