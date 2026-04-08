/* eslint-disable no-undef */
// File: js/6_search_feature.js
// Yahaan 'ptaxDatabase' variable 'ptax_data.js' se seedha access ho jaayega.
// Realtime + KMZ dono ko support karega.

// DB search se banaye gaye temporary polygons ko track karne ke liye
let dbSearchPolygons = []; // track DB-drawn polygons for search
const ptaxDatabase = window.ptaxDatabase || {};

function renderPoleSuggestions(resultsContainer, rawQuery) {
  if (typeof window.getPoleSuggestions !== "function") {
    return 0;
  }

  const suggestions = window.getPoleSuggestions(rawQuery, 8);
  if (!Array.isArray(suggestions) || suggestions.length === 0) {
    return 0;
  }

  suggestions.forEach((suggestion) => {
    const item = document.createElement("div");
    item.className = "search-result-item";
    const typeLabel =
      typeof window.getPoleTypeLabel === "function"
        ? window.getPoleTypeLabel(suggestion.type)
        : suggestion.type;

    item.innerHTML = `
<div style="display: flex; align-items: center; justify-content: space-between;">
  <div>
    <strong>pole:${suggestion.poleNumber}</strong>
    <span class="search-result-badge pole">POLE</span><br>
    <small>${typeLabel} | ${suggestion.voltage}</small>
  </div>
</div>
`;

    item.onclick = () => {
      const searchInput = document.getElementById("searchInput");
      const results = document.getElementById("search-results");

      if (searchInput) {
        searchInput.value = `pole:${suggestion.poleNumber}`;
      }

      if (typeof window.filterPolesByQuery === "function") {
        window.filterPolesByQuery(`pole:${suggestion.poleNumber}`);
      }

      if (typeof window.focusPoleByNumber === "function") {
        window.focusPoleByNumber(suggestion.poleNumber);
      }

      if (typeof window.showPoleDetailsPanel === "function") {
        const poleData = typeof window.getPoleDataByNumber === "function"
          ? window.getPoleDataByNumber(suggestion.poleNumber)
          : null;
        window.showPoleDetailsPanel(poleData || suggestion);
      }

      if (results) {
        results.innerHTML = "";
      }
    };

    resultsContainer.appendChild(item);
  });

  return suggestions.length;
}

// ======================================================
// === NAYA HELPER FUNCTION: Property ke liye Pin URL ===
// ======================================================

/**
 * Property data ke "Nature of Property" ke hisaab se ek custom pin banata hai.
 * @param {object} propertyData ptaxDatabase se mila data object.
 * @returns {string} Pin ke liye ek data URL.
 */
function getPinUrlForProperty(propertyData) {
  // Default Pin (Red)
  const defaultPin = pinBuilder.fromColor(Cesium.Color.RED, 48).toDataURL();

  if (!propertyData) return defaultPin;

  const nature = propertyData["Nature of Property"]
    ? String(propertyData["Nature of Property"]).toLowerCase()
    : "unknown";

  // Helper: return a colored circular pin (keeps code synchronous)
  const makeColorPin = (cesiumColor) => {
    try {
      return pinBuilder.fromColor(cesiumColor, 48).toDataURL();
    } catch (e) {
      // fallback to default on any error
      console.warn("pinBuilder.fromColor failed, using default pin", e);
      return defaultPin;
    }
  };

  try {
    switch (nature) {
      case "residential":
      case "individual":
      case "row house":
        return makeColorPin(Cesium.Color.DODGERBLUE);

      case "hospital":
        return makeColorPin(Cesium.Color.RED);

      case "shopping mall":
        return makeColorPin(Cesium.Color.ORANGE);

      case "open plot":
        return makeColorPin(Cesium.Color.LIMEGREEN);

      case "apartments":
      case "building":
        return makeColorPin(Cesium.Color.DARKSLATEGRAY);

      default:
        return makeColorPin(Cesium.Color.GRAY);
    }
  } catch (e) {
    console.error("Pin icon creation error:", e);
    return defaultPin;
  }
}

// ======================================================
// === SEARCH: ptaxDatabase ke andar text search logic ===
// ======================================================

/**
 * Search properties in the ptaxDatabase based on user input.
 */
function searchProperties() {
  const query = document
    .getElementById("searchInput")
    .value.toLowerCase()
    .trim();
  const resultsContainer = document.getElementById("search-results");
  resultsContainer.innerHTML = ""; // Clear previous results

  const poleSuggestionCount = renderPoleSuggestions(resultsContainer, query);

  if (query.startsWith("pole:")) {
    if (poleSuggestionCount === 0) {
      resultsContainer.innerHTML =
        '<div class="search-no-results">No poles found.</div>';
    }
    return;
  }

  if (!query) {
    return; // Don't search for empty strings
  }

 if (!window.ptaxDatabase || Object.keys(window.ptaxDatabase).length === 0) {
  resultsContainer.innerHTML =
    '<div class="search-no-results">Property data not loaded yet.</div>';
  return;
}

  const matches = [];
  // Define all keys you want to be searchable
const searchKeys = [

 "propertyNumber",
 "propertyNo",
 "newPropertyNo",
 "oldPropertyNo",
 "ownerName",
 "address",
 "ward",
 "zone",
 "mobile",
 "hearingDate",
 "appealReason",
 "noticeReason"

];

  // Iterate over the ptaxDatabase
for (const houseId in window.ptaxDatabase){
    if (Object.prototype.hasOwnProperty.call(window.ptaxDatabase, houseId)) {
      const propertyData = window.ptaxDatabase[houseId];
      let isMatch = false;

      // Check houseId (which is also often the Property Number)
      if (houseId.toLowerCase().includes(query)) {
        isMatch = true;
      }

      // Check other specified keys
      if (!isMatch) {
        for (const key in propertyData) {

  const value = propertyData[key];

  if (
    value &&
    typeof value !== "object" &&
    String(value).toLowerCase().includes(query)
  ) {
    isMatch = true;
    break;
  }

}
      }

      if (isMatch) {
        matches.push({ id: houseId, data: propertyData });
      }
    }
  }

  // Display results
  if (matches.length === 0) {
    if (poleSuggestionCount === 0) {
      resultsContainer.innerHTML =
        '<div class="search-no-results">No results found.</div>';
    }
  } else {
    // Limit to 50 results for performance
    matches.slice(0, 50).forEach((match) => {
      const item = document.createElement("div");
      item.className = "search-result-item";

      const propertyNo =
  match.data.propertyNumber ||
  match.data.propertyNo ||
  match.data.newPropertyNo ||
  match.id;

const owner =
  match.data.ownerName ||
  match.data["Name of the Property Owner"] ||
  "";

item.innerHTML = `
<div style="display: flex; align-items: center; justify-content: space-between;">
  <div>
    <strong>${propertyNo}</strong>
    <span class="search-result-badge property">PROPERTY</span><br>
    <small>${owner}</small>
  </div>
</div>
`;

      // Click → camera fly
      item.onclick = () => flyToHouse(match.id, match.data);
      resultsContainer.appendChild(item);
    });
    if (matches.length > 50) {
      const moreResults = document.createElement("div");
      moreResults.className = "search-no-results";
      moreResults.textContent = `... and ${
        matches.length - 50
      } more results.`;
      resultsContainer.appendChild(moreResults);
    }
  }
}

// =================================================================
// === MASTER FUNCTION: Entity par pin laga kar fly karna ==========
// =================================================================

/**
 * Yeh master function hai. Yeh ek entity leta hai, uspar pin lagata hai,
 * aur wahaan fly karta hai.
 * @param {Cesium.Entity} entity - Woh entity jispar pin lagana hai.
 * @param {object | null} propertyData - ptax_data.js se mila data.
 */
function addPinAndFlyToEntity(entity, propertyData) {
  console.log(`Adding pin and flying to entity: ${entity.name}`);

  // 1. Puraana pin (agar hai) toh remove karo
  if (searchPinEntity) {
    viewer.entities.remove(searchPinEntity);
    searchPinEntity = null;
  }

  // 2. Entity ko select karo taaki InfoBox khule
  viewer.selectedEntity = entity;
  if (housesDataSource) {
    housesDataSource.show = true;
    document.getElementById("housesToggle").checked = true;
  }

  // 3. Entity ke polygon coordinates nikaalo
  let positions = [];
  if (entity.polygon && entity.polygon.hierarchy) {
    const hierarchy = entity.polygon.hierarchy.getValue(
      viewer.clock.currentTime
    );
    if (hierarchy && hierarchy.positions) {
      positions = hierarchy.positions;
    }
  }

  // 4. Check karo ki coordinates valid hain (khaali toh nahi)
  if (positions && positions.length > 0) {
    console.log(
      `✓ Entity '${entity.name}' has valid polygon. Adding pin and flying.`
    );

    // Polygon ka center calculate karo
    const boundingSphere = Cesium.BoundingSphere.fromPoints(positions);
    const cartographicCenter = Cesium.Cartographic.fromCartesian(
      boundingSphere.center
    );

    // Pin ki position set karo (polygon ke center se 20 meter upar)
    const pinPosition = Cesium.Cartesian3.fromDegrees(
      Cesium.Math.toDegrees(cartographicCenter.longitude),
      Cesium.Math.toDegrees(cartographicCenter.latitude),
      20.0 // 20 meters
    );

    // Property data ka istemaal karke custom pin URL pao
    const pinUrl = getPinUrlForProperty(propertyData);

    searchPinEntity = viewer.entities.add({
      name: `Location of ${entity.name}`,
      position: pinPosition,
      billboard: {
        image: pinUrl,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        heightReference: Cesium.HeightReference.RELATIVE_TO_GROUND,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    });

    // Naye pin par fly karo
    viewer.flyTo(searchPinEntity, {
      duration: 1.5,
      offset: new Cesium.HeadingPitchRange(
        Cesium.Math.toRadians(0), // heading
        Cesium.Math.toRadians(-45), // pitch
        250 // range (distance)
      ),
    });
  } else {
    console.error(
      `✗ ERROR: Entity '${entity.name}' polygon is EMPTY in KMZ. Cannot place pin.`
    );
  }
}

/**
 * SEARCH → FLY + DRAW:
 * 1) Pehle KMZ / housesDataSource me entity dhoondta hai (old behaviour).
 * 2) Agar wahan nahi milta, to ptaxDatabase ke GeoJSON (__geometry) se
 *    polygon/point draw karke wahan fly karta hai.
 * 3) Har case me sirf SEARCHED polygon hi dikhega (baaki hide).
 *
 * @param {string} houseId      The ID / Property Number / Mongo _id
 * @param {object} propertyData The data object for the selected property
 */
function flyToHouse(houseId, propertyData) {
  console.log(`Search initiated for: ${houseId}`);

  window.selectedPTAXProperty = propertyData;

  const resultsContainer = document.getElementById("search-results");
  const searchInput = document.getElementById("searchInput");
  const houseKey = String(houseId); // normalize to string

  if (!housesDataSource) {
    alert("House layer data is not loaded yet.");
    return;
  }

  // --------------------------------------------------
  // 1️⃣ STEP 1 — KMZ / housesDataSource me entity dhoondho
  // --------------------------------------------------

  // Primary lookup by entity.name (existing behaviour)
  let entityToFind = housesDataSource.entities.values.find(
    (e) => String(e.name) === houseKey
  );

  // Fallback 1: common properties (Property Number, _id, etc.)
  if (!entityToFind) {
    entityToFind = housesDataSource.entities.values.find((e) => {
      const props =
        e.properties && typeof e.properties.getValue === "function"
          ? e.properties.getValue(viewer.clock.currentTime)
          : e.properties || {};

      const candidates = [
        props["Property Number"],
        props.propertyNumber,
        props.propertyNo,
        props._id,
        props["propertyNumber"],
        props["propertyNo"],
        e.name || null,
      ]
        .filter(Boolean)
        .map(String);

      return candidates.some((c) => c === houseKey);
    });
  }

  // Fallback 2: loose contains match (case-insensitive)
  if (!entityToFind) {
    const idLower = houseKey.toLowerCase();
    entityToFind = housesDataSource.entities.values.find((e) => {
      const props =
        e.properties && typeof e.properties.getValue === "function"
          ? e.properties.getValue(viewer.clock.currentTime)
          : e.properties || {};
      const candidates = [
        e.name,
        props["Property Number"],
        props.propertyNumber,
        props.propertyName,
        props._id,
      ]
        .filter(Boolean)
        .map(String);
      return candidates.some((c) => c.toLowerCase().includes(idLower));
    });
  }

  // ✅ CASE A: KMZ entity mil gayi → purana flow (pin + fly) + sirf yehi polygon dikhe
  if (entityToFind) {
    // 1) Pehle saare house polygons hide
    if (housesDataSource) {
      housesDataSource.entities.values.forEach((e) => {
        if (e.polygon) e.show = e === entityToFind;
      });
    }

    // 2) DB se banaye hue purane polygons hata do (agar koi ho)
    dbSearchPolygons.forEach((ent) => {
      try {
        viewer.entities.remove(ent);
      } catch (e) {}
    });
    dbSearchPolygons = [];

    // 3) Normal pin + fly
    addPinAndFlyToEntity(entityToFind, propertyData);

    const hasPoly =
      entityToFind.polygon &&
      entityToFind.polygon.hierarchy &&
      entityToFind.polygon.hierarchy.getValue(viewer.clock.currentTime)
        .positions.length;
    if (!hasPoly) {
      alert(
        `Cannot show location for '${houseKey}'. The property's polygon data is empty in the KML/KMZ.`
      );
    }

    try {
      searchInput.value = `${propertyData["Property Number"]} - ${
        propertyData["Name of the Property Owner"]
      }`;
    } catch (e) {}
    resultsContainer.innerHTML = "";
    return; // KMZ case handled
  }

  // --------------------------------------------------
  // 2️⃣ STEP 2 — KMZ nahi mila → ptaxDatabase geometry se draw karo
  // --------------------------------------------------
  console.warn(
    `No KMZ entity found for ${houseKey}. Trying ptaxDatabase geometry...`
  );

  const db = window.ptaxDatabase || {};

  // Prefer function parameter, phir direct key, phir "Property Number" match
  let entry =
    propertyData ||
    db[houseKey] ||
    Object.values(db).find(
      (e) =>
        String(e["Property Number"] || e.propertyNumber || "") === houseKey
    );

  const geom = entry && entry.__geometry;

  if (geom) {
    console.log("🎯 Using DB geometry for", houseKey, geom);

    // 0) Purana search pin hatao agar hai
    if (searchPinEntity) {
      viewer.entities.remove(searchPinEntity);
      searchPinEntity = null;
    }

    // 1) Saare KMZ polygons hide (sirf searched dikhana hai)
    if (housesDataSource) {
      housesDataSource.entities.values.forEach((e) => {
        if (e.polygon) e.show = false;
      });
    }

    // 2) Purane DB search polygons hata do
    dbSearchPolygons.forEach((ent) => {
      try {
        viewer.entities.remove(ent);
      } catch (e) {}
    });
    dbSearchPolygons = [];

    // ---------------- POLYGON / MULTIPOLYGON ----------------
    if (geom.type === "Polygon" || geom.type === "MultiPolygon") {
      // first ring of first polygon
      let ring;
      if (geom.type === "Polygon") {
        ring = Array.isArray(geom.coordinates[0][0])
          ? geom.coordinates[0]
          : geom.coordinates;
      } else {
        // MultiPolygon: [ [ [ [lon,lat], ... ] ] ]
        ring = Array.isArray(geom.coordinates[0][0][0])
          ? geom.coordinates[0][0]
          : geom.coordinates[0];
      }

      const positions = ring.map(function (c) {
        const lon = c[0];
        const lat = c[1];
        return Cesium.Cartesian3.fromDegrees(lon, lat, 0);
      });

      // Style (same as DB style)
      const style = entry.__style || entry.style || {
        color: "#00BFFF",
        opacity: 0.5,
      };
      const color = Cesium.Color.fromCssColorString(
        style.color || "#00BFFF"
      ).withAlpha(style.opacity != null ? style.opacity : 0.5);

      // 3) Naya polygon entity sirf isi property ka
      const polygonEntity = viewer.entities.add({
        name:
          entry["Property Number"] ||
          entry.propertyNumber ||
          `DB Parcel ${houseKey}`,
        polygon: {
          hierarchy: positions,
          material: color,
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          extrudedHeight: 20, // tweak height if needed
          outline: true,
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 1.5,
        },
        properties: entry,
      });

      console.log("Realtime search polygon drawn for", houseKey);

      // Track karo taaki next search par remove kar saken
      dbSearchPolygons.push(polygonEntity);

      // 4) Master function: pin + fly
      addPinAndFlyToEntity(polygonEntity, entry);

      // 5) UI update
      try {
        searchInput.value = `${
          entry["Property Number"] || houseKey
        } - ${entry["Name of the Property Owner"] || ""}`;
      } catch (e) {}
      resultsContainer.innerHTML = "";
      return;
    }

    // ---------------- POINT ----------------
    if (geom.type === "Point") {
      const lon = geom.coordinates[0];
      const lat = geom.coordinates[1];

      const pinUrl = getPinUrlForProperty(entry);

      // KMZ polygons already hidden, DB polygons cleared above
      searchPinEntity = viewer.entities.add({
        name: `Survey Point ${houseKey}`,
        position: Cesium.Cartesian3.fromDegrees(lon, lat, 20),
        billboard: {
          image: pinUrl,
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          heightReference: Cesium.HeightReference.RELATIVE_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          scale: 1.1,
        },
      });

      viewer.flyTo(searchPinEntity, {
        duration: 1.5,
        offset: new Cesium.HeadingPitchRange(
          Cesium.Math.toRadians(0),
          Cesium.Math.toRadians(-45),
          250
        ),
      });

      try {
        searchInput.value = `${
          entry["Property Number"] || houseKey
        } - ${entry["Name of the Property Owner"] || ""}`;
      } catch (e) {}
      resultsContainer.innerHTML = "";
      return;
    }
  }

  // --------------------------------------------------
  // 3️⃣ STEP 3 — KMZ + DB dono fail → error + debug logs
  // --------------------------------------------------
  console.error(
    `✗ FAILED: Entity / geometry for ${houseKey} NOT found in KMZ or ptaxDatabase.`
  );
  alert(
    `Error: Could not find any visual geometry for ${houseKey}. Check console for debugging info.`
  );

  console.log("Sample house entities (first 20):");
  housesDataSource.entities.values.slice(0, 20).forEach((e) => {
    const props =
      e.properties && typeof e.properties.getValue === "function"
        ? e.properties.getValue(viewer.clock.currentTime)
        : e.properties || {};
    console.log(
      "entity.name=",
      e.name,
      "props.Property Number=",
      props["Property Number"],
      "props.propertyNumber=",
      props.propertyNumber,
      "props._id=",
      props._id
    );
  });

  try {
    searchInput.value = `${propertyData["Property Number"] || houseKey} - ${
      propertyData["Name of the Property Owner"] || ""
    }`;
  } catch (e) {}
  resultsContainer.innerHTML = "";
}

// ============================
// RESET VIEW: show all houses
// ============================
function resetHouseLayerView() {
  // 1) All KMZ / DB houses polygons visible karo
  if (housesDataSource) {
    housesDataSource.show = true;
    housesDataSource.entities.values.forEach((e) => {
      if (e.polygon) e.show = true;
    });
  }

  // 2) Search ke liye banaye gaye temporary DB polygons hata do
  if (dbSearchPolygons && dbSearchPolygons.length) {
    dbSearchPolygons.forEach((ent) => {
      try {
        viewer.entities.remove(ent);
      } catch (e) {}
    });
    dbSearchPolygons = [];
  }

  // 3) Search pin bhi hata do (optional)
  if (typeof searchPinEntity !== "undefined" && searchPinEntity) {
    try {
      viewer.entities.remove(searchPinEntity);
    } catch (e) {}
    searchPinEntity = null;
  }

  console.log("🔁 House layer reset: all polygons visible again.");
}

// Global expose so 5_layer_manager.js can call it
window.resetHouseLayerView = resetHouseLayerView;
