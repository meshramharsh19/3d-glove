// ptax.data.js
// Replaces static data with live data from digitalTwin API.
// It normalizes server response into the same shape your search code expects
// and assigns the result to window.ptaxDatabase.

// CONFIG: update if your API runs on different host/port
const PTAX_API_BASE = window.PTAX_API_BASE || 'http://localhost:5001';
const PTAX_API_ENDPOINT = `${PTAX_API_BASE}/api/3d/surveys`;


/**
 * 
 * Fetch JSON helper
 */
async function fetchJson(url) {
  const r = await fetch(url, { cache: 'no-cache' });
  if (!r.ok) throw new Error(`Fetch failed: ${r.status} ${r.statusText}`);
  return r.json();
}

/**
 * Convert GeoJSON FeatureCollection -> ptaxDatabase object keyed by Property Number (or _id fallback)
 */
function featureCollectionToPtaxDatabase(fc) {
  const out = {};
  if (!fc || !Array.isArray(fc.features)) return out;

  for (const f of fc.features) {
    const p = f.properties || {};
    // determine a key that matches your UI: prefer 'Property Number'
    const propNumber =
      (p.propertyNumber && String(p.propertyNumber)) ||
      (p['Property Number'] && String(p['Property Number'])) ||
      (p.propertyNo && String(p.propertyNo)) ||
      (p._id && String(p._id));

    const houseId = propNumber ? propNumber : (p._id ? String(p._id) : null);
    if (!houseId) continue;

    // Build entry expected by existing code; keep original keys used by searchKeys
    const entry = Object.assign({}, p);

    // Fill UI-expected fields if missing
    if (!entry['Property Number']) entry['Property Number'] = propNumber;
    if (!entry['Name of the Property Owner'] && p.ownerName) entry['Name of the Property Owner'] = p.ownerName;
    if (!entry['Address of Property'] && p.propertyAddress) entry['Address of Property'] = p.propertyAddress;
    if (!entry['Name of the Property'] && p.propertyName) entry['Name of the Property'] = p.propertyName;
    if (!entry['Telephone / Mobile Number'] && p.mobileNumber) entry['Telephone / Mobile Number'] = p.mobileNumber;
    if (!entry['e-mail-id'] && p.email) entry['e-mail-id'] = p.email;

    // store internal helpers for later use if needed
    entry.__geometry = f.geometry || null;
    entry.__kmlUrl = p.kmlUrl || null;
    entry.__style = p.style || { color: '#00BFFF', opacity: 0.5 };

    out[houseId] = entry;
  }
  return out;
}

/**
 * Initialize the global ptaxDatabase (populates window.ptaxDatabase)
 * Optional search param will call server with ?search=...
 */
async function initPtaxDatabase(search = '') {
  try {
    const url = search ? `${PTAX_API_ENDPOINT}?search=${encodeURIComponent(search)}` : PTAX_API_ENDPOINT;
    const fc = await fetchJson(url);
    const db = featureCollectionToPtaxDatabase(fc);
    // assign globally so existing code continues to work unchanged
    window.ptaxDatabase = db;
    console.log('ptaxDatabase initialized with', Object.keys(db).length, 'entries');
    return db;
  } catch (err) {
    console.error('Failed to initialize ptaxDatabase from API:', err);
    // keep existing ptaxDatabase if present, else set empty object
    window.ptaxDatabase = window.ptaxDatabase || {};
    return window.ptaxDatabase;
  }
}

// Auto-init on script load (non-blocking)
if (typeof window !== 'undefined') {
  // attempt init immediately
  initPtaxDatabase().catch(() => {});
}

// Export for module setups (optional)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { initPtaxDatabase, featureCollectionToPtaxDatabase };
}

// Auto-init on script load (non-blocking)
if (typeof window !== 'undefined') {
  // attempt init immediately
  initPtaxDatabase().catch(() => {});
}

// Export for module setups (optional)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { initPtaxDatabase, featureCollectionToPtaxDatabase };
}

/* -------------------------------
 * 🔴 REALTIME UPDATES VIA SOCKET.IO
 * ------------------------------- */
if (typeof window !== 'undefined' && typeof io !== 'undefined') {
  // Use same base as API (http://localhost:5001 by default)
  const socket = io(PTAX_API_BASE);

  socket.on('connect', () => {
    console.log('✅ WebSocket connected in ptax_data.js:', socket.id);
  });

  // Backend emits this in /api/save-survey
  socket.on('3d:survey:new', (feature) => {
    console.log('📡 Realtime feature from backend:', feature);

    // 1) Update ptaxDatabase with this single feature
    const fc = { type: 'FeatureCollection', features: [feature] };
    const newEntries = featureCollectionToPtaxDatabase(fc);

    // merge into existing global DB
    window.ptaxDatabase = window.ptaxDatabase || {};
    Object.assign(window.ptaxDatabase, newEntries);

    // 2) Tell 3D map to draw this feature live (if function is defined)
    if (typeof window.handleRealtimeSurveyFeature === 'function') {
      window.handleRealtimeSurveyFeature(feature);
    }
  });
}
