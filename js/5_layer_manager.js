/* eslint-disable no-undef */
// File: js/5_layer_manager.js
// Updated: load all KMLs from MongoDB kmlUrl(s) only — no static KMZ/KML files are used.
// 'ptaxDatabase' variable (ptax_data.js) still accessible for popups/search.

// KMZ Layer toggle functions (now generic for data sources)
function toggleLayer(layerType) {
  const checkbox = document.getElementById(`${layerType}Toggle`);
  const isChecked = checkbox.checked;

  if (layerType === "model") {
    if (modelEntity) modelEntity.show = isChecked;
  } else if (layerType === "roads") {
    if (roadsDataSource) roadsDataSource.show = isChecked;
  } else if (layerType === "houses") {
    if (housesDataSource) housesDataSource.show = isChecked;
  } else if (layerType === "paths") {
    if (pathsDataSource) pathsDataSource.show = isChecked;
  }
}

// --- START: ROBUST HELPER FUNCTION ---
function getCustomHouseData(idOrEntity) {
  let id = null;
  if (typeof idOrEntity === 'object' && idOrEntity !== null) {
    const ent = idOrEntity;
    try {
      if (ent.properties && typeof ent.properties.getValue === 'function') {
        const props = ent.properties.getValue(viewer.clock.currentTime) || {};
        id = props['Property Number'] || props.propertyNumber || props['propertyNumber'] || props._id || null;
      } else if (ent.properties) {
        const props = ent.properties || {};
        id = props['Property Number'] || props.propertyNumber || props._id || null;
      }
    } catch (e) {}
    if (!id && ent.name) id = String(ent.name);
  } else {
    id = idOrEntity != null ? String(idOrEntity) : null;
  }
  if (!id) return null;
  if (window.ptaxDatabase && window.ptaxDatabase[id]) return window.ptaxDatabase[id];
  if (window.ptaxDatabase) {
    const cand = String(id).trim();
    const candNum = cand.replace(/[^0-9A-Za-z\-_]/g, "");
    if (window.ptaxDatabase[candNum]) return window.ptaxDatabase[candNum];
    for (const key in window.ptaxDatabase) {
      if (!window.ptaxDatabase.hasOwnProperty(key)) continue;
      try {
        const rec = window.ptaxDatabase[key];
        if (!rec) continue;
        const pn = rec['Property Number'] || rec.propertyNumber || rec['propertyNumber'] || rec.propertyNo || rec._id;
        if (!pn) continue;
        if (String(pn) === String(id) || String(pn) === candNum) return rec;
      } catch (e) {}
    }
  }
  return null;
}
// --- END ---

/**
 * loadDbPolygons()
 * - Fetches /api/3d/surveys
 * - For each feature with properties.kmlUrl it loads the KML and returns array of DataSources
 * - Attaches propertyNumber to loaded entities for search/popups
 */
async function loadDbPolygons() {
  const API_BASE = window.PTAX_API_BASE || 'http://localhost:5001';
  const surveysUrl = `${API_BASE}/api/3d/surveys`;
  console.log('Loading polygons from DB via:', surveysUrl);
  try {
    const resp = await fetch(surveysUrl);
    if (!resp.ok) throw new Error(`API returned ${resp.status}`);
    const data = await resp.json();
    const features = (data && data.features) ? data.features : [];

    // filter features that provide a kmlUrl (we support multiple urls: kmlUrl, houseKmlUrl, pathKmlUrl, roadKmlUrl)
    const kmlFeatures = features.filter(f => f.properties && (f.properties.kmlUrl || f.properties.houseKmlUrl || f.properties.pathKmlUrl || f.properties.roadKmlUrl));
    console.log(`Found ${kmlFeatures.length} features with KML URLs.`);

    const loadedDataSources = [];

    // Sequential load to avoid too many parallel requests
    for (let i = 0; i < kmlFeatures.length; i++) {
      const f = kmlFeatures[i];
      // prefer explicit property names if present
      const urls = [];
      if (f.properties.kmlUrl) urls.push(f.properties.kmlUrl);
      if (f.properties.houseKmlUrl) urls.push(f.properties.houseKmlUrl);
      if (f.properties.pathKmlUrl) urls.push(f.properties.pathKmlUrl);
      if (f.properties.roadKmlUrl) urls.push(f.properties.roadKmlUrl);

      // also accept a comma-separated list in kmlUrl
      if (urls.length === 0 && f.properties.kmlUrl && String(f.properties.kmlUrl).includes(',')) {
        urls.push(...String(f.properties.kmlUrl).split(',').map(s => s.trim()).filter(Boolean));
      }

      const propId = f.properties.propertyNumber || f.properties['Property Number'] || f.properties._id || null;

      for (const kmlUrl of urls) {
        try {
          let ds;
          try {
            ds = await Cesium.KmlDataSource.load(kmlUrl, { camera: viewer.scene.camera, canvas: viewer.scene.canvas, clampToGround: true });
          } catch (errDirect) {
            // fallback: fetch text and load blob
            console.warn('Direct KmlDataSource.load failed for', kmlUrl, errDirect);
            const kResp = await fetch(kmlUrl);
            if (!kResp.ok) throw new Error(`Failed fetching KML text ${kmlUrl}: ${kResp.status}`);
            const kmlText = await kResp.text();
            const blob = new Blob([kmlText], { type: 'application/vnd.google-earth.kml+xml' });
            const blobUrl = URL.createObjectURL(blob);
            ds = await Cesium.KmlDataSource.load(blobUrl, { camera: viewer.scene.camera, canvas: viewer.scene.canvas, clampToGround: true });
            URL.revokeObjectURL(blobUrl);
          }

          // attach property id to loaded entities for search compatibility
          const entities = ds.entities.values;
          for (let ei = 0; ei < entities.length; ei++) {
            const ent = entities[ei];
            try {
              ent.properties = ent.properties || {};
              if (propId && !ent.properties['Property Number']) {
                try { if (typeof ent.properties.addProperty === 'function') ent.properties.addProperty('Property Number'); } catch (e) {}
                ent.properties['Property Number'] = propId;
                ent.properties.propertyNumber = propId;
              }
              if (propId && (!ent.name || String(ent.name).trim().length === 0)) ent.name = String(propId);
            } catch (e) {}
          }

          // ---- Remove KML's Survey Point markers so only the app's default pin remains ----
          try {
            const entsCopy = ds.entities.values.slice();
            for (let ei2 = 0; ei2 < entsCopy.length; ei2++) {
              const e = entsCopy[ei2];
              const name = e.name ? String(e.name).toLowerCase() : '';
              if (name.includes('survey point') || name === 'survey point') { ds.entities.remove(e); continue; }
              try {
                const desc = e.description ? (typeof e.description.getValue === 'function' ? String(e.description.getValue(viewer.clock.currentTime)).toLowerCase() : String(e.description).toLowerCase()) : '';
                if (desc.includes('survey point')) { ds.entities.remove(e); continue; }
              } catch (err) { /* ignore */ }
              if (Cesium.defined(e.point) && !Cesium.defined(e.polygon) && !Cesium.defined(e.polyline) && (name === '' || name.includes('point') || name.includes('marker') || name.includes('survey'))) { ds.entities.remove(e); continue; }
              try {
                if (e.billboard && e.billboard.image) {
                  const img = (typeof e.billboard.image.getValue === 'function') ? e.billboard.image.getValue(viewer.clock.currentTime) : e.billboard.image;
                  if (img && String(img).toLowerCase().includes('maps.google.com/mapfiles/kml/paddle')) { ds.entities.remove(e); continue; }
                }
              } catch (err) { /* ignore */ }
            }
            console.log('Cleaned KML: removed KML survey point icons (if any).');
          } catch (cleanupErr) {
            console.warn('Failed to clean KML survey points:', cleanupErr);
          }

          // push to result list and add to viewer (caller may move entities into combined DS)
          viewer.dataSources.add(ds);
          loadedDataSources.push(ds);
          console.log('Loaded KML from', kmlUrl, 'for property', propId || '(no id)');
        } catch (kErr) {
          console.warn('Failed to load KML URL', kmlUrl, kErr);
        }
      }
    }

    return loadedDataSources;
  } catch (err) {
    console.error('loadDbPolygons failed:', err);
    throw err;
  }
}

// loadKMZLayers now loads only DB-based KMLs and does not touch any static files
function loadKMZLayers() {
  showLoading('Loading layers from DB...');
  updateProgress(10);

  // load dynamic KMLs from DB
  const dbPolygonsPromise = loadDbPolygons().catch(err => { console.error('DB polygons load failed', err); return []; });
  updateProgress(30);

  dbPolygonsPromise.then(async (dbLoadedSources) => {
    // combine all loaded data sources into a single housesDataSource for backward compatibility
    const combinedHousesDS = new Cesium.CustomDataSource('houses-from-db');
    dbLoadedSources.forEach(ds => {
      ds.entities.values.forEach(ent => combinedHousesDS.entities.add(ent));
      try { viewer.dataSources.remove(ds, true); } catch (e) {}
    });

    housesDataSource = combinedHousesDS;

    updateProgress(60);

    // --- popup customization (uses ptaxDatabase where available) ---
    console.log('Customizing popups for DB-loaded houses...');
    const fieldMap = [
      { key: 'Property Number', label: 'Property ID' },
      { key: 'Name of the Property Owner', label: 'Owner Name' },
      { key: 'Usage of Property', label: 'Usage' },
      { key: 'Carpet/Built-up area (Sq.M)', label: 'Area' },
      { key: 'Nature of Property', label: 'Nature' },
      { key: 'Age of Building', label: 'Building Age' },
      { key: 'Year of Construction', label: 'Year Built' },
      { key: 'Number of Floors', label: 'Floors' },
      { key: 'Floor wise type of construction', label: 'Construction' },
      { key: 'Shop No., Office No. Etc.', label: 'Unit No.' },
      { key: 'Telephone / Mobile Number', label: 'Mobile' },
      { key: 'e-mail-id', label: 'Email' },
      { key: 'Address of Property', label: 'Address' },
      { key: 'Postal Pin code of Property', label: 'Pincode' },
      { key: 'UID number of Property Owner', label: 'Owner UID' },
      { key: 'Type of Owner', label: 'Owner Type' },
      { key: 'Name of Occupier & Tenant', label: 'Occupier' },
      { key: 'UID number of Occupier', label: 'Occupier UID' },
      { key: 'Category of Property', label: 'Category' },
      { key: 'Assessment year', label: 'Assessment Year' },
      { key: 'Old Assessment Value', label: 'Old Value' },
      { key: 'Old Assessment Year', label: 'Old Year' },
      { key: 'Latitude', label: 'Latitude' },
      { key: 'Longitude', label: 'Longitude' },
      { key: 'Photograph of Building', label: 'Photo' },
    ];

    const houseEntities = housesDataSource.entities.values;
    for (let i = 0; i < houseEntities.length; i++) {
      const entity = houseEntities[i];
      if (Cesium.defined(entity.polygon)) {
        const houseInfo = getCustomHouseData(entity);
        let descriptionHtml = '';
        if (houseInfo) {
          let tableRows = '';
          fieldMap.forEach((field) => {
            if (houseInfo.hasOwnProperty(field.key)) {
              let value = houseInfo[field.key];
              if (field.key === 'Photograph of Building' && value) value = `<a href="${value}" target="_blank">View Photo</a>`;
              else if (field.key === 'e-mail-id' && value) value = `<a href="mailto:${value}">${value}</a>`;
              else if (field.key === 'Carpet/Built-up area (Sq.M)') value = `${value} Sq.M`;
              else if (value === null || value === '') value = 'N/A';
              tableRows += `<tr><td>${field.label}</td><td>${value}</td></tr>`;
            }
          });
          descriptionHtml = `<div class="ptax-infobox"><h3>Property Details (${houseInfo['Property Number'] || houseInfo.propertyNumber || houseInfo._id})</h3><div class="table-container"><table class="property-table">${tableRows}</table></div></div>`;
        } else {
          const originalKmzName = entity.name || '(unknown)';
          descriptionHtml = `<div class="ptax-infobox"><h3>Property Details</h3><p style="color:#e74c3c;font-weight:bold;">No detailed records found for house ID: ${originalKmzName}</p></div>`;
        }
        entity.description = descriptionHtml;
        // geometry tweaks
        try {
          if (entity.polygon) {
            entity.polygon.heightReference = Cesium.HeightReference.RELATIVE_TO_GROUND;
            entity.polygon.height = 3.0;
            entity.polygon.extrudedHeight = 15.0;
            entity.polygon.outline = true;
            entity.polygon.outlineColor = Cesium.Color.BLACK;
            entity.polygon.outlineWidth = 2.0;
          }
        } catch (e) {}
      }
    }

    console.log(`${houseEntities.length} house popups customized.`);

    updateProgress(80);

    // set initial visibility - only houses layer added for now
    housesDataSource.show = false;

    // add result data source
    viewer.dataSources.add(housesDataSource);

    updateProgress(100);

    document.getElementById('housesStatus').textContent = 'Loaded';
    document.getElementById('housesStatus').className = 'layer-status status-loaded';

    console.log('✓ DB KML layers loaded successfully');

    hideLoading();
  }).catch(err => {
    console.error('Failed loading DB KMLs', err);
    hideLoading();
    alert('Failed loading dynamic KML layers. See console for details.');
  });
}
