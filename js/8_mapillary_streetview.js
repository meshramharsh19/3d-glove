/* ===================================
   GLOBAL Mapillary Street View
   =================================== */

const MAPILLARY_TOKEN = "MLY|25798630363063795|78622829db0ff79862664ed5a4370a6b";

/* =========================================
   Mapillary Panorama Street View (GLOBAL)
   ========================================= */

function openStreetViewFromMap() {
  const { lat, lon } = window.streetViewState;

  if (!lat || !lon) {
    alert("Click on the map to select a location first.");
    return;
  }

  loadMapillaryPanorama(lat, lon);
}

async function loadMapillaryPanorama(lat, lon) {

  const panel = document.getElementById("streetViewPanel");
  panel.classList.remove("hidden");

  const viewerContainer = document.getElementById("mapillaryViewer");
  viewerContainer.innerHTML = "Loading panorama...";

const url =
  "https://graph.mapillary.com/images" +
  "?access_token=" + MAPILLARY_TOKEN +
  "&fields=id,is_pano,computed_geometry" +
  "&is_pano=true" +
  "&closeto=" + lon + "," + lat +
  "&radius=1000" +        // 🔥 increased radius
  "&limit=1";


  try {
    const res = await fetch(url);
    const data = await res.json();

    if (!data.data || data.data.length === 0) {
      viewerContainer.innerHTML =
        "No panorama available here. Try a main road.";
      return;
    }

    const imageId = data.data[0].id;

    // Destroy old viewer if exists
    if (mapillaryViewer) {
      mapillaryViewer.remove();
      mapillaryViewer = null;
    }

    // Create panorama viewer
    mapillaryViewer = new mapillary.Viewer({
      container: "mapillaryViewer",
      accessToken: MAPILLARY_TOKEN,
      imageId: imageId,
    });

  } catch (err) {
    console.error("Mapillary panorama error:", err);
    viewerContainer.innerHTML = "Failed to load panorama.";
  }
}

function closeStreetView() {
  document.getElementById("streetViewPanel")
    .classList.add("hidden");

  if (mapillaryViewer) {
    mapillaryViewer.remove();
    mapillaryViewer = null;
  }
}


function openStreetViewFromMap() {
  const { lat, lon } = window.streetViewState;

  if (!lat || !lon) {
    alert("Please click on the map to select a location.");
    return;
  }

  openStreetView(lat, lon);
}

async function openStreetView(lat, lon) {

  const panel = document.getElementById("streetViewPanel");
  const content = document.getElementById("streetViewContent");

  panel.classList.remove("hidden");
  content.innerHTML = "Loading street-level imagery...";

  const url =
    "https://graph.mapillary.com/images" +
    "?access_token=" + MAPILLARY_TOKEN +
    "&fields=id,thumb_1024_url,is_pano,compass_angle" +
    "&closeto=" + lon + "," + lat +
    "&radius=50" +
    "&limit=1";

  try {
    const res = await fetch(url);
    const data = await res.json();

    console.log("Mapillary response:", data);

    if (!data.data || data.data.length === 0) {
      content.innerHTML = "No street-level imagery available here.";
      return;
    }

    const img = data.data[0];

    content.innerHTML = `
      <img src="${img.thumb_1024_url}" />
      <div style="margin-top:8px;font-size:12px;color:#aaa;">
        Panorama: ${img.is_pano ? "Yes" : "No"}<br>
        Direction: ${Math.round(img.compass_angle || 0)}°
      </div>
    `;
  } catch (err) {
    console.error("Mapillary error:", err);
    content.innerHTML = "Failed to load street view.";
  }
}


function closeStreetView() {
  document.getElementById("streetViewPanel")
    .classList.add("hidden");
}
