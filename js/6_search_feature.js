/* eslint-disable no-undef */
// File: js/6_search_feature.js
// Logic bilkul change nahi kiya hai.
// Yahaan 'ptaxDatabase' variable 'ptax_data.js' se seedha access ho jaayega.

// === NAYA HELPER FUNCTION: Property ke liye Pin URL ===
/**
 * Property data ke "Nature of Property" ke hisaab se ek custom pin banata hai.
 * @param {object} propertyData ptaxDatabase se mila data object.
 * @returns {string} Pin ke liye ek data URL.
 */
function getPinUrlForProperty(propertyData) {
  // Default Pin (Laal)
  const defaultPin = pinBuilder
    .fromColor(Cesium.Color.RED, 48)
    .toDataURL();

  if (!propertyData) {
    return defaultPin;
  }

  const nature = propertyData["Nature of Property"]
    ? propertyData["Nature of Property"].toLowerCase()
    : "unknown";

  try {
    // Har type ke liye alag icon (Maki icons) aur color
    switch (nature) {
      case "residential":
      case "individual":
      case "row house":
        // 'home' icon, Neela color
        return pinBuilder
          .fromMakiIconId("home", Cesium.Color.DODGERBLUE, 48)
          .toDataURL();

      case "hospital":
        // 'hospital' icon, Laal color
        return pinBuilder
          .fromMakiIconId("hospital", Cesium.Color.RED, 48)
          .toDataURL();

      case "shopping mall":
        // 'shop' icon, Narangi color
        return pinBuilder
          .fromMakiIconId("shop", Cesium.Color.ORANGE, 48)
          .toDataURL();

      case "open plot":
        // 'park' icon, Hara color
        return pinBuilder
          .fromMakiIconId("park", Cesium.Color.LIMEGREEN, 48)
          .toDataURL();

      case "apartments":
      case "building":
        // 'building' icon, Gehra Gray color
        return pinBuilder
          .fromMakiIconId("building", Cesium.Color.DARKSLATEGRAY, 48)
          .toDataURL();

      default:
        // 'marker' (generic) icon, Gray color
        return pinBuilder
          .fromMakiIconId("marker", Cesium.Color.GRAY, 48)
          .toDataURL();
    }
  } catch (e) {
    console.error("Pin icon banate waqt error:", e);
    return defaultPin; // Error hone par default pin
  }
}
// === END NAYA HELPER FUNCTION ===

// === BADLAAV 3: Nayi JS Functions Search ke liye ===

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

  if (!query) {
    return; // Don't search for empty strings
  }

  // YEH AB 100% KAAM KAREGA
  if (!ptaxDatabase || Object.keys(ptaxDatabase).length === 0) {
    resultsContainer.innerHTML =
      '<div class="search-no-results">Property data not loaded yet.</div>';
    return;
  }

  const matches = [];
  // Define all keys you want to be searchable
  const searchKeys = [
    "Property Number",
    "Name of the Property Owner",
    "Telephone / Mobile Number",
    "UID number of Property Owner",
    "Address of Property",
    "Name of Occupier & Tenant",
    "UID number of Occupier",
    "e-mail-id",
    "Name of the Property",
    "Shop No., Office No. Etc.",
  ];

  // Iterate over the ptaxDatabase
  for (const houseId in ptaxDatabase) {
    if (ptaxDatabase.hasOwnProperty(houseId)) {
      const propertyData = ptaxDatabase[houseId];
      let isMatch = false;

      // Check houseId (which is also the Property Number)
      if (houseId.toLowerCase().includes(query)) {
        isMatch = true;
      }

      // Check other specified keys
      if (!isMatch) {
        for (const key of searchKeys) {
          const value = propertyData[key];
          if (value && String(value).toLowerCase().includes(query)) {
            isMatch = true;
            break; // Found a match in this property, move to next property
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
    resultsContainer.innerHTML =
      '<div class="search-no-results">No results found.</div>';
  } else {
    // Limit to 50 results for performance
    matches.slice(0, 50).forEach((match) => {
      const item = document.createElement("div");
      item.className = "search-result-item";
      item.innerHTML = `
    <strong>${match.data["Property Number"]}</strong><br>
    <small>${match.data["Name of the Property Owner"]}</small>
    <small>${match.data["Address of Property"]}</small>
  `;
      // Add click event to fly to the house
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
// === BADLAAV 2: MASTER FUNCTION KO REPLACE KIYA GAYA ===
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
    // HAAN, coordinates sahi hain. Pin add karo aur fly karo.
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

    // === YAHAN BADLAAV KIYA GAYA HAI ===
    // Property data ka istemaal karke custom pin URL pao
    const pinUrl = getPinUrlForProperty(propertyData);
    // === END BADLAAV ===

    searchPinEntity = viewer.entities.add({
      name: `Location of ${entity.name}`,
      position: pinPosition,
      billboard: {
        image: pinUrl, // Naya dynamic pinUrl yahan use karo
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM, // Pin ki noke (point) ko location par rakho
        heightReference: Cesium.HeightReference.RELATIVE_TO_GROUND, // 20 meter zameen se upar
        disableDepthTestDistance: Number.POSITIVE_INFINITY, // Pin hamesha model ke upar dikhega
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
    // NAHI, coordinates khaali hain (jaise H176). User ko warn karo.
    console.error(
      `✗ ERROR: Entity '${entity.name}' polygon is EMPTY in KMZ. Cannot place pin.`
    );
    // Click par alert accha nahi lagega, par search ke liye zaroori hai.
    // Hum yahaan sirf console log karenge.
  }
}

/**
 * NAYA FUNCTION: Fly nahi karega, sirf select karega.
 * @param {string} houseId The ID of the house (e.g., "H101")
 * @param {object} propertyData The data object for the selected property
 */
function flyToHouse(houseId, propertyData) {
  console.log(`Search initiated for: ${houseId}`);
  const resultsContainer = document.getElementById("search-results");
  const searchInput = document.getElementById("searchInput");

  if (!housesDataSource) {
    alert("House layer data is not loaded yet.");
    return;
  }

  // Step 1: KMZ file se entity dhoondho
  const entityToFind = housesDataSource.entities.values.find(
    (e) => e.name === houseId
  );

  if (entityToFind) {
    // Step 2: Naye master function ko call karo
    // === YAHAN BADLAAV KIYA GAYA HAI (BADLAAV 3) ===
    addPinAndFlyToEntity(entityToFind, propertyData); // Ab 'propertyData' bhi pass karo
    // === END BADLAAV ===

    // Corrupt data (empty polygon) ke liye warning
    if (
      !entityToFind.polygon ||
      !entityToFind.polygon.hierarchy ||
      !entityToFind.polygon.hierarchy.getValue(viewer.clock.currentTime)
        .positions.length
    ) {
      alert(
        `Cannot show location for '${houseId}'. The property's polygon data is empty in the KMZ file.`
      );
    }
  } else {
    console.error(
      `✗ FAILED: Entity with name ${houseId} NOT found in KMZ layer.`
    );
    alert(`Error: Could not find the visual entity for ${houseId}.`);
  }

  // Step 3: Search bar ko update karo
  searchInput.value = `${propertyData["Property Number"]} - ${propertyData["Name of the Property Owner"]}`;
  resultsContainer.innerHTML = "";
}
// === END BADLAAV 3 ===