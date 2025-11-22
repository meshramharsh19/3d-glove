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
const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
handler.setInputAction(function (click) {
  // 1. Dekho ki user ne kya click kiya
  const pickedObject = viewer.scene.pick(click.position);

  // 2. Check karo ki woh ek valid entity hai
  if (
    Cesium.defined(pickedObject) &&
    Cesium.defined(pickedObject.id) &&
    pickedObject.id instanceof Cesium.Entity
  ) {
    const clickedEntity = pickedObject.id;

    // 3. Check karo ki woh hamare 'houses' layer ka hissa hai
    if (housesDataSource && housesDataSource.entities.contains(clickedEntity)) {
      // === YAHAN BADLAAV KIYA GAYA HAI ===
      // 4. Agar hai, toh property data nikaalo
      const houseId = clickedEntity.name;
      const propertyData = getCustomHouseData(houseId); // YEH AB 100% KAAM KAREGA

      // 5. Pin add karne wala function call karo (data ke saath)
      addPinAndFlyToEntity(clickedEntity, propertyData);
      // === END BADLAAV ===
    } else {
      // User ne model ya roads par click kiya
      // Puraana pin (agar hai) toh hata do
      if (searchPinEntity) {
        viewer.entities.remove(searchPinEntity);
        searchPinEntity = null;
      }
      // Default behavior ko chalne do (yaani model/road select ho jaayega)
      viewer.selectedEntity = clickedEntity; // Manual select
    }
  } else {
    // User ne zameen par click kiya
    // Puraana pin (agar hai) toh hata do
    if (searchPinEntity) {
      viewer.entities.remove(searchPinEntity);
      searchPinEntity = null;
    }
    viewer.selectedEntity = undefined; // InfoBox band karo
  }
}, Cesium.ScreenSpaceEventType.LEFT_CLICK);
// === END: NAYA ON-CLICK PIN FEATURE ===

// === BADLAAV 4: Hide search results when clicking outside ===
document.addEventListener("click", function (event) {
  const searchContainer = document.getElementById("search-container");
  if (!searchContainer.contains(event.target)) {
    document.getElementById("search-results").innerHTML = "";
  }
});
// === END BADLAAV 4 ===

// Sabse aakhir mein, default model load karo
loadDefaultModel();