/*************************************************
 * ROAD SURVEY – 3D SIDE (FINAL WORKING FILE)
 * Only frontend – no backend/db changes
 *************************************************/

const API_BASE = "http://localhost:5001";

/* ------------------------------------------------
   1️⃣ LOAD EXISTING ROAD SURVEYS FROM DB
------------------------------------------------ */
fetch(`${API_BASE}/api/road-surveys`)
  .then(res => res.json())
  .then(data => {
    if (!data || !data.features) return;
    data.features.forEach(feature => {
      addRoadPolygonTo3D(feature);
    });
  })
  .catch(err => console.error("Road survey load error:", err));

/* ------------------------------------------------
   2️⃣ REALTIME – NEW ROAD WITHOUT REFRESH
------------------------------------------------ */
if (typeof socket !== "undefined") {
  socket.on("3d:road:new", (feature) => {
    addRoadPolygonTo3D(feature);
  });
}

/* ------------------------------------------------
   3️⃣ ADD ROAD POLYGON + MARKER TO CESIUM
------------------------------------------------ */
function addRoadPolygonTo3D(feature) {
  if (!feature || !feature.geometry || !feature.properties) return;

  // Polygon coordinates
  const coords = feature.geometry.coordinates[0].flat();

  // ---- POLYGON ----
  const polygonEntity = viewer.entities.add({
    polygon: {
      hierarchy: Cesium.Cartesian3.fromDegreesArray(coords),
      material: Cesium.Color.BLUE.withAlpha(0),
      outline: true,
      outlineColor: Cesium.Color.WHITE
    }
  });

  // 🔥 VERY IMPORTANT: PropertyBag
  polygonEntity.properties = new Cesium.PropertyBag({
    hasVideo: feature.properties.hasVideo === true,
    videoUrl: feature.properties.videoUrl || ""
  });

  polygonEntity.allowPicking = true;

  // ---- CENTER MARKER (CLICK FRIENDLY) ----
  if (feature.properties.centroid) {
    viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(
        feature.properties.centroid[0],
        feature.properties.centroid[1]
      ),
      billboard: {
        image: "/icons/survey-pin.png",
        width: 28,
        height: 28
      },
      properties: new Cesium.PropertyBag({
        hasVideo: feature.properties.hasVideo === true,
        videoUrl: feature.properties.videoUrl || ""
      })
    });
  }
}

/* ------------------------------------------------
   4️⃣ CLICK HANDLER (CESIUM CORRECT WAY)
------------------------------------------------ */
viewer.screenSpaceEventHandler.setInputAction((click) => {
  const picked = viewer.scene.pick(click.position);

  if (!picked || !picked.id || !picked.id.properties) return;

  const hasVideo = picked.id.properties.hasVideo.getValue();

  if (hasVideo) {
    const videoUrl = picked.id.properties.videoUrl.getValue();
    showPopup(videoUrl);
  }
}, Cesium.ScreenSpaceEventType.LEFT_CLICK);

/* ------------------------------------------------
   5️⃣ POPUP + VIDEO + ROLE CHECK
------------------------------------------------ */
function showPopup(videoUrl) {
  const popup = document.getElementById("roadPopup");
  const iframe = document.getElementById("roadIframe");

  if (!popup || !iframe) {
    console.error("Popup or iframe missing");
    return;
  }

  popup.classList.remove("hidden");

  // IMPORTANT: reset first
  iframe.src = "";
  iframe.src = videoUrl;
}



/* ------------------------------------------------
   6️⃣ OPTIONAL: CLOSE POPUP (if button used)
------------------------------------------------ */
function closePopup() {
  const popup = document.getElementById("roadPopup");
  const video = document.getElementById("roadVideo");

  if (video) {
    video.pause();
    video.src = "";
    video.style.display = "none";
  }
  if (popup) popup.classList.add("hidden");
}

