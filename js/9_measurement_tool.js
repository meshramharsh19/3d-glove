/* ================================
   Measurement Tool – CesiumJS
   Supports: Distance | Area | Height
   ================================ */

let measureHandler;
let activeMode = null;
let positions = [];
let activeShape = null;
let pointEntities = [];

/* ---------- INIT ---------- */
function initMeasurementTool(viewer) {
  if (!viewer) {
    console.error("Viewer not found");
    return;
  }
  measureHandler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
}

/* ---------- COMMON HELPERS ---------- */
function addPoint(viewer, position) {
  const point = viewer.entities.add({
    position,
    point: {
      pixelSize: 8,
      color: Cesium.Color.YELLOW,
      disableDepthTestDistance: Number.POSITIVE_INFINITY
    }
  });
  pointEntities.push(point);
}

function clearEntities(viewer) {
  if (activeShape) viewer.entities.remove(activeShape);
  pointEntities.forEach(p => viewer.entities.remove(p));

  activeShape = null;
  positions = [];
  pointEntities = [];
}

function resetMeasurement() {
  if (!measureHandler) return;

  measureHandler.removeInputAction(Cesium.ScreenSpaceEventType.LEFT_CLICK);
  measureHandler.removeInputAction(Cesium.ScreenSpaceEventType.RIGHT_CLICK);

  clearEntities(viewer);
  activeMode = null;

  if (typeof clearMeasurePanel === "function") {
    clearMeasurePanel();
  }
}

/* ================================
   DISTANCE MEASUREMENT
   ================================ */
function startDistanceMeasure() {
  resetMeasurement();
  activeMode = "DISTANCE";

  measureHandler.setInputAction((click) => {
    const pos = viewer.scene.pickPosition(click.position);
    if (!Cesium.defined(pos)) return;

    positions.push(pos);
    addPoint(viewer, pos);

    if (positions.length === 2) {
      activeShape = viewer.entities.add({
        polyline: {
          positions,
          width: 3,
          material: Cesium.Color.CYAN
        }
      });

      const distance = Cesium.Cartesian3.distance(
        positions[0],
        positions[1]
      );

      updateMeasurePanel("DISTANCE", distance.toFixed(2) + " meters");

      measureHandler.removeInputAction(
        Cesium.ScreenSpaceEventType.LEFT_CLICK
      );
    }
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
}

/* ================================
   AREA MEASUREMENT
   LEFT CLICK → ADD POINT
   RIGHT CLICK → FINISH
   ================================ */
function startAreaMeasure() {
  resetMeasurement();
  activeMode = "AREA";

  measureHandler.setInputAction((click) => {
    const pos = viewer.scene.pickPosition(click.position);
    if (!Cesium.defined(pos)) return;

    positions.push(pos);
    addPoint(viewer, pos);

    if (positions.length >= 3) {
      if (activeShape) viewer.entities.remove(activeShape);

      activeShape = viewer.entities.add({
        polygon: {
          hierarchy: positions,
          material: Cesium.Color.BLUE.withAlpha(0.4),
          outline: true,
          outlineColor: Cesium.Color.BLUE
        }
      });
    }
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
}

function finishAreaMeasurement() {
  if (activeMode !== "AREA") return;

  if (positions.length < 3) {
    alert("Select at least 3 points to calculate area");
    return;
  }

  const area = calculatePolygonArea(positions);

  updateMeasurePanel(
    "AREA",
    area.toFixed(2) + " sq.m"
  );

  measureHandler.removeInputAction(
    Cesium.ScreenSpaceEventType.LEFT_CLICK
  );
}


/* ---------- AREA CALCULATION ---------- */
function calculatePolygonArea(cartesianPositions) {
  const cartographics = cartesianPositions.map(p =>
    Cesium.Cartographic.fromCartesian(p)
  );

  let area = 0;
  for (let i = 0; i < cartographics.length; i++) {
    const p1 = cartographics[i];
    const p2 = cartographics[(i + 1) % cartographics.length];

    area +=
      (p2.longitude - p1.longitude) *
      (2 + Math.sin(p1.latitude) + Math.sin(p2.latitude));
  }

  return Math.abs(area * 6378137 * 6378137 / 2);
}

/* ================================
   HEIGHT MEASUREMENT (BUILDINGS)
   ================================ */
function startHeightMeasure() {
  resetMeasurement();
  activeMode = "HEIGHT";

  measureHandler.setInputAction((click) => {
    const pos = viewer.scene.pickPosition(click.position);
    if (!Cesium.defined(pos)) return;

    positions.push(pos);
    addPoint(viewer, pos);

    if (positions.length === 2) {
      const base = Cesium.Cartographic.fromCartesian(positions[0]);
      const top = Cesium.Cartographic.fromCartesian(positions[1]);
      const height = top.height - base.height;

      activeShape = viewer.entities.add({
        polyline: {
          positions,
          width: 4,
          material: Cesium.Color.RED
        }
      });

      updateMeasurePanel("HEIGHT", height.toFixed(2) + " meters");

      measureHandler.removeInputAction(
        Cesium.ScreenSpaceEventType.LEFT_CLICK
      );
    }
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
}
