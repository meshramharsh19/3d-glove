/* eslint-disable no-undef */
// File: js/7_main.js
// Yeh file saare event listeners ko attach karti hai aur app ko start karti hai.

document
  .getElementById("heading")
  .addEventListener("input", debounce(updateModelOrientation, 300));
document
  .getElementById("pitch")
  .addEventListener("input", debounce(updateModelOrientation, 300));
document
  .getElementById("roll")
  .addEventListener("input", debounce(updateModelOrientation, 300));
document
  .getElementById("longitude")
  .addEventListener("input", debounce(updateModelPosition, 300));
document
  .getElementById("latitude")
  .addEventListener("input", debounce(updateModelPosition, 300));
document
  .getElementById("height")
  .addEventListener("input", debounce(updateModelPosition, 300));
document.getElementById("scale").addEventListener(
  "input",
  debounce(() => {
    if (modelEntity) {
      modelEntity.model.scale = parseFloat(
        document.getElementById("scale").value || 1.0
      );
    }
  }, 300)
);

window.addEventListener("beforeunload", function () {
  for (const url in textureUrlCache) {
    URL.revokeObjectURL(textureUrlCache[url]);
  }

  if (currentModelUrl) {
    URL.revokeObjectURL(currentModelUrl);
  }
});

console.log("=== Cesium 3D Model + KMZ Layers Viewer Initialized ===");
console.log("Layer Stacking Order:");
console.log("  1. Cesium Globe (base)");
console.log("  2. .glb Model");
console.log("  3. Roads KMZ (paths.kmz)");
console.log("  4. Houses KMZ (HOUSES polygon.kmz)");
console.log("Features:");
console.log("  ✓ Depth testing enabled to prevent z-fighting");
console.log("  ✓ Height offsets for proper layer stacking");
console.log("  ✓ Model opacity control (doesn't affect globe)");
console.log("  ✓ Individual layer visibility toggles");

// =================================================================
// === BADLAAV 4: NAYA ON-CLICK PIN FEATURE (REPLACE KIYA GAYA) ===
// =================================================================
const handler =
  new Cesium.ScreenSpaceEventHandler(
    viewer.scene.canvas
  );

function handleHouseSelection(clickedEntity) {
  if (!clickedEntity) {
    return;
  }

  const propertyData = getCustomHouseData(clickedEntity);

  addPinAndFlyToEntity(
    clickedEntity,
    propertyData
  );

  // ✅ SHOW BUTTON
  showAddBannerButton(clickedEntity);
}

function isHouseLikeEntity(clickedEntity) {
  if (!clickedEntity || !(clickedEntity instanceof Cesium.Entity)) {
    return false;
  }

  if (housesDataSource && housesDataSource.entities.contains(clickedEntity)) {
    return true;
  }

  return Boolean(getCustomHouseData(clickedEntity));
}

handler.setInputAction(function (click) {

  // 1️⃣ Detect clicked object
  const pickedObject =
    viewer.scene.pick(click.position);

  // Check if manhole tool is active and get the ground position
  if (typeof window.handleManholeMapClick === "function") {
    try {
      const cartesianPosition = viewer.scene.pickPosition(click.position);
      if (Cesium.defined(cartesianPosition)) {
        console.log("🚰 Ground position picked:", cartesianPosition);
        window.handleManholeMapClick(cartesianPosition);
      }
    } catch (e) {
      console.warn("Error calculating manhole position:", e);
    }
  }

  // 2️⃣ Check valid entity
  if (
    Cesium.defined(pickedObject) &&
    Cesium.defined(pickedObject.id) &&
    pickedObject.id instanceof Cesium.Entity
  ) {

    const clickedEntity =
      pickedObject.id;

    // 3️⃣ If house clicked
    if (isHouseLikeEntity(clickedEntity)) {
      handleHouseSelection(clickedEntity);

    }

    else {

      // Clicked other entity
      if (searchPinEntity) {

        viewer.entities.remove(
          searchPinEntity
        );

        searchPinEntity = null;

      }

      viewer.selectedEntity =
        clickedEntity;

    }

  }

  else {

    // Clicked ground
    if (searchPinEntity) {

      viewer.entities.remove(
        searchPinEntity
      );

      searchPinEntity = null;

    }

    viewer.selectedEntity =
      undefined;

  }

},
Cesium.ScreenSpaceEventType.LEFT_CLICK);

handler.setInputAction(function (click) {
  const pickedObject = viewer.scene.pick(click.position);

  if (
    Cesium.defined(pickedObject) &&
    Cesium.defined(pickedObject.id) &&
    pickedObject.id instanceof Cesium.Entity
  ) {
    const clickedEntity = pickedObject.id;

    if (isHouseLikeEntity(clickedEntity)) {
      handleHouseSelection(clickedEntity);
    }
  }
}, Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK);
// === END: NAYA ON-CLICK PIN FEATURE ===

// ================================
// GLOBAL CLICK FOR STREET VIEW
// ================================
const streetViewHandler =
  new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);

let streetViewClickCount = 0;

streetViewHandler.setInputAction((movement) => {

  const cartesian = viewer.scene.pickPosition(movement.position);
  if (!cartesian) return;

  const cartographic =
    Cesium.Cartographic.fromCartesian(cartesian);

  const lat = Cesium.Math.toDegrees(cartographic.latitude);
  const lon = Cesium.Math.toDegrees(cartographic.longitude);

  // Save globally
  window.streetViewState.lat = lat;
  window.streetViewState.lon = lon;

  streetViewClickCount += 1;
  if (streetViewClickCount < 2) {
    return;
  }

  streetViewClickCount = 0;

  console.log("Global StreetView location:", lat, lon);

}, Cesium.ScreenSpaceEventType.LEFT_CLICK);


// === BADLAAV 4: Hide search results when clicking outside ===
document.addEventListener("click", function (event) {
  const searchContainer = document.getElementById("search-container");
  if (!searchContainer.contains(event.target)) {
    document.getElementById("search-results").innerHTML = "";
  }
});
// === END BADLAAV 4 ===

window.onload = function () {
  initMeasurementTool(viewer);

  document.getElementById("btnDistance").onclick = startDistanceMeasure;
  document.getElementById("btnArea").onclick = startAreaMeasure;
  document.getElementById("btnHeight").onclick = startHeightMeasure;
};


// Sabse aakhir mein, default model load karo
loadDefaultModel();