(function () {
  const POLE_API_BASE = "/api/poles";
  const POLE_HEIGHT = 6;
  const POLE_RADIUS = 0.18;
  const poleEntities = new Map();

  function getViewer() {
    return typeof viewer !== "undefined" ? viewer : window.viewer;
  }

  function createPoleEntity(position, poleId) {
    const cesiumViewer = getViewer();
    if (!cesiumViewer) {
      return null;
    }

    const cartographic = Cesium.Cartographic.fromCartesian(position);
    const groundHeight = cartographic.height || 0;
    const poleCenterHeight = groundHeight + POLE_HEIGHT / 2;
    const polePosition = Cesium.Cartesian3.fromRadians(
      cartographic.longitude,
      cartographic.latitude,
      poleCenterHeight
    );

    const entity = cesiumViewer.entities.add({
      id: poleId,
      position: polePosition,
      cylinder: {
        length: POLE_HEIGHT,
        topRadius: POLE_RADIUS,
        bottomRadius: POLE_RADIUS,
        material: Cesium.Color.fromCssColorString("#4b5563"),
        outline: true,
        outlineColor: Cesium.Color.fromCssColorString("#1f2937"),
      },
    });

    poleEntities.set(poleId, entity);
    return entity;
  }

  async function loadPoles() {
    const cesiumViewer = getViewer();
    if (!cesiumViewer || typeof axios === "undefined") {
      return;
    }

    try {
      const response = await axios.get(`${POLE_API_BASE}/get-poles`);
      const poles = response.data?.poles || [];

      poles.forEach((pole) => {
        const cartesian = Cesium.Cartesian3.fromArray([pole.x, pole.y, pole.z]);
        createPoleEntity(cartesian, pole._id);
      });

      console.log(`Loaded ${poles.length} saved poles`);
    } catch (error) {
      console.error("Failed to load poles:", error);
    }
  }

  async function savePole(position) {
    if (typeof axios === "undefined") {
      return;
    }

    try {
      await axios.post(`${POLE_API_BASE}/add-pole`, {
        x: position.x,
        y: position.y,
        z: position.z,
      });
    } catch (error) {
      console.error("Failed to save pole:", error);
    }
  }

  function handleClick(clickPosition) {
    const cesiumViewer = getViewer();
    if (!cesiumViewer) {
      return;
    }

    const ray = cesiumViewer.camera.getPickRay(clickPosition.position);
    const pickedPosition = cesiumViewer.scene.globe.pick(ray, cesiumViewer.scene);

    if (!pickedPosition) {
      return;
    }

    const poleId = `pole-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // Render instantly so the user gets immediate visual feedback.
    createPoleEntity(pickedPosition, poleId);

    // Persist the clicked 3D position in MongoDB.
    savePole(pickedPosition);
  }

  function initializePolePlacement() {
    const cesiumViewer = getViewer();
    if (!cesiumViewer) {
      return;
    }

    cesiumViewer.scene.globe.depthTestAgainstTerrain = true;
    cesiumViewer.screenSpaceEventHandler.setInputAction(
      handleClick,
      Cesium.ScreenSpaceEventType.LEFT_CLICK
    );

    loadPoles();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializePolePlacement);
  } else {
    initializePolePlacement();
  }

  window.loadPoles = loadPoles;
})();
