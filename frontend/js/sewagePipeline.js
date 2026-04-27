/* eslint-disable no-undef */
(function () {
  let pipelinePoints = [];
  let previewEntity = null;
  let clickHandler = null;
  let isPointCaptureActive = false;
  const renderedPipelineEntityIds = new Set();
  const renderedPipelineEntities = new Map();
  const sewagePipelineDataIndex = new Map();
  let cachedPipelineCatalog = [];
  let pipelineCatalogLoadPromise = null;
  let areSavedPipelinesVisible = false;

  function resolveSewageApiBase() {
    if (window.GLOVE_BACKEND_URL) {
      return `${window.GLOVE_BACKEND_URL.replace(/\/$/, "")}/api/sewage`;
    }

    const { protocol, hostname, port } = window.location;
    const isLocalHost = hostname === "localhost" || hostname === "127.0.0.1";

    if (port === "4001") {
      return `${protocol}//${hostname}:4000/api/sewage`;
    }

    if (isLocalHost && port && port !== "4000") {
      return `${protocol}//${hostname}:4000/api/sewage`;
    }

    return "/api/sewage";
  }

  const SEWAGE_API_BASE = resolveSewageApiBase();

  function getViewer() {
    return typeof viewer !== "undefined" ? viewer : window.viewer;
  }

  function getInputValue(id) {
    return document.getElementById(id)?.value?.trim() || "";
  }

  function setStatus(message, isError) {
    const statusEl = document.getElementById("sewageStatus");
    if (!statusEl) {
      return;
    }

    statusEl.textContent = message;
    statusEl.classList.toggle("error", Boolean(isError));
  }

  function focusPipelineId() {
    window.requestAnimationFrame(() => {
      document.getElementById("pipelineId")?.focus();
    });
  }

  function updatePointCount() {
    const pointCountEl = document.getElementById("pipelinePointCount");
    if (pointCountEl) {
      pointCountEl.textContent = `${pipelinePoints.length} points selected`;
    }
  }

  function toCesiumPositions(points) {
    return points.map((point) =>
      Cesium.Cartesian3.fromDegrees(point.longitude, point.latitude, point.height || 0)
    );
  }

  function getPipelineRadiusMeters(diameterMm) {
    const parsedDiameter = Number(diameterMm);
    const safeDiameter = Number.isFinite(parsedDiameter) && parsedDiameter > 0 ? parsedDiameter : 600;
    return Math.max(0.08, safeDiameter / 2000);
  }

  function createPipeShape(radiusMeters, segments = 18) {
    const shape = [];
    for (let index = 0; index < segments; index += 1) {
      const angle = (index / segments) * Math.PI * 2;
      shape.push(
        new Cesium.Cartesian2(
          Math.cos(angle) * radiusMeters,
          Math.sin(angle) * radiusMeters
        )
      );
    }
    return shape;
  }

  function getPipeColor(status, isPreview) {
    const base = Cesium.Color.fromCssColorString("#6f7f8b");
    return isPreview ? base.withAlpha(0.75) : base.withAlpha(0.95);
  }

  function normalizePipelineId(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/[\s_]+/g, "-")
      .trim();
  }

  function buildPipelineSearchText(pipeline) {
    return [
      pipeline?.pipelineId,
      pipeline?._id,
      pipeline?.diameter,
      pipeline?.material,
      pipeline?.status,
      pipeline?.installationDate,
      Array.isArray(pipeline?.points) ? pipeline.points.length : "",
    ]
      .filter((value) => value !== undefined && value !== null && value !== "")
      .join(" ")
      .toLowerCase();
  }

  function indexSewagePipeline(pipeline, entity) {
    if (!pipeline) {
      return;
    }

    const pipelineKey = normalizePipelineId(pipeline.pipelineId || pipeline._id);
    if (pipelineKey) {
      sewagePipelineDataIndex.set(pipelineKey, pipeline);
    }

    if (entity && pipelineKey) {
      renderedPipelineEntities.set(pipelineKey, entity);
      renderedPipelineEntityIds.add(entity.id);
    }
  }

  async function fetchPipelineCatalog(refresh = false) {
    if (!refresh && cachedPipelineCatalog.length > 0) {
      return cachedPipelineCatalog;
    }

    if (pipelineCatalogLoadPromise) {
      return pipelineCatalogLoadPromise;
    }

    pipelineCatalogLoadPromise = (async () => {
      const response = await fetch(SEWAGE_API_BASE, {
        method: "GET",
      });

      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.message || "Failed to fetch pipelines");
      }

      cachedPipelineCatalog = Array.isArray(result.pipelines) ? result.pipelines : [];
      cachedPipelineCatalog.forEach((pipeline) => indexSewagePipeline(pipeline));
      return cachedPipelineCatalog;
    })();

    try {
      return await pipelineCatalogLoadPromise;
    } finally {
      pipelineCatalogLoadPromise = null;
    }
  }

  function getSewagePipelineSuggestions(rawQuery, limit = 8) {
    const query = String(rawQuery || "").trim().toLowerCase();
    if (!query) {
      return [];
    }

    const prefixMatch = query.match(/^(?:pipeline|sewage|pipe)\s*[:\-\s]?\s*(.*)$/i);
    const normalizedQuery = normalizePipelineId(prefixMatch ? prefixMatch[1] : query);

    const isPipelineQuery =
      Boolean(prefixMatch) ||
      /^(sg[-\s]?)?pipe[-\s]?\d+/i.test(query) ||
      query.includes("sewage") ||
      query.includes("pipeline");

    if (!isPipelineQuery && !normalizedQuery) {
      return [];
    }

    const suggestions = [];

    sewagePipelineDataIndex.forEach((pipeline, pipelineKey) => {
      const searchableText = buildPipelineSearchText(pipeline);
      if (normalizedQuery && !searchableText.includes(normalizedQuery)) {
        return;
      }

      suggestions.push({
        pipelineId: pipeline.pipelineId || pipeline._id || pipelineKey,
        diameter: pipeline.diameter,
        material: pipeline.material,
        status: pipeline.status,
      });
    });

    suggestions.sort((a, b) => {
      const aId = normalizePipelineId(a.pipelineId);
      const bId = normalizePipelineId(b.pipelineId);
      const aStarts = normalizedQuery ? aId.startsWith(normalizedQuery) : false;
      const bStarts = normalizedQuery ? bId.startsWith(normalizedQuery) : false;

      if (aStarts !== bStarts) {
        return aStarts ? -1 : 1;
      }

      return String(a.pipelineId).localeCompare(String(b.pipelineId), undefined, { numeric: true });
    });

    return suggestions.slice(0, Math.max(1, limit));
  }

  async function ensureSewagePipelineVisible() {
    if (!areSavedPipelinesVisible) {
      await loadPipelines();
    }
  }

  function focusSewagePipelineById(pipelineId) {
    const normalizedId = normalizePipelineId(pipelineId);
    if (!normalizedId) {
      return false;
    }

    const cesiumViewer = getViewer();
    if (!cesiumViewer) {
      return false;
    }

    const pipelineEntity = renderedPipelineEntities.get(normalizedId) ||
      cesiumViewer.entities.values.find((entity) => entity.name === `sewage-pipeline-${pipelineId}`);

    if (!pipelineEntity) {
      return false;
    }

    const pipelineData = sewagePipelineDataIndex.get(normalizedId) || {};
    const fallbackDiameter = Number(pipelineData.diameter) || 600;

    cesiumViewer.flyTo(pipelineEntity, {
      duration: 1.3,
      offset: new Cesium.HeadingPitchRange(
        Cesium.Math.toRadians(0),
        Cesium.Math.toRadians(-32),
        Math.max(180, fallbackDiameter * 2)
      ),
    });

    return true;
  }

  function updatePipelineVisibility(rawQuery) {
    const query = String(rawQuery || "").trim().toLowerCase();
    const prefixMatch = query.match(/^(?:pipeline|sewage|pipe)\s*[:\-\s]?\s*(.*)$/i);
    const normalizedQuery = normalizePipelineId(prefixMatch ? prefixMatch[1] : query);
    const shouldShow = Boolean(prefixMatch) || /^(sg[-\s]?)?pipe[-\s]?\d+/i.test(query);

    renderedPipelineEntities.forEach((entity, pipelineKey) => {
      if (!entity) {
        return;
      }

      if (!shouldShow) {
        entity.show = areSavedPipelinesVisible;
        return;
      }

      entity.show = !normalizedQuery || pipelineKey.includes(normalizedQuery);
    });
  }

  function upsertPreviewPolyline(points) {
    const cesiumViewer = getViewer();
    if (!cesiumViewer) {
      return;
    }

    if (previewEntity) {
      cesiumViewer.entities.remove(previewEntity);
      previewEntity = null;
    }

    if (!Array.isArray(points) || points.length < 2) {
      return;
    }

    previewEntity = cesiumViewer.entities.add({
      name: "Sewage Pipeline Preview",
      polylineVolume: {
        positions: toCesiumPositions(points),
        shape: createPipeShape(getPipelineRadiusMeters(getInputValue("pipelineDiameter"))),
        cornerType: Cesium.CornerType.ROUNDED,
        material: getPipeColor("", true),
      },
    });
  }

  function convertPointsToThreeVertices(points) {
    if (!Array.isArray(points) || points.length < 2) {
      return [];
    }

    const origin = points[0];
    const latScale = 111320;
    const lonScale = Math.max(0.2, Math.cos((origin.latitude * Math.PI) / 180)) * 111320;

    return points.map((point) => {
      const x = (point.longitude - origin.longitude) * lonScale;
      const y = point.height || 0;
      const z = -(point.latitude - origin.latitude) * latScale;
      return new THREE.Vector3(x, y, z);
    });
  }

  // Build a Three.js line for pipeline points and add it to the preview scene.
  function drawPipeline(points) {
    if (typeof THREE === "undefined") {
      return null;
    }

    const sceneManager = window.pipelineSceneManager;
    if (!sceneManager) {
      return null;
    }

    const vertices = convertPointsToThreeVertices(points);
    if (vertices.length < 2) {
      return null;
    }

    const geometry = new THREE.BufferGeometry().setFromPoints(vertices);
    const material = new THREE.LineBasicMaterial({ color: 0x22c55e });
    const line = new THREE.Line(geometry, material);

    sceneManager.addLine(line);
    return line;
  }

  function getPickCartographic(screenPosition) {
    const cesiumViewer = getViewer();
    if (!cesiumViewer) {
      return null;
    }

    const scene = cesiumViewer.scene;
    let cartesian = null;

    if (scene.pickPositionSupported) {
      cartesian = scene.pickPosition(screenPosition);
    }

    if (!cartesian) {
      const ray = cesiumViewer.camera.getPickRay(screenPosition);
      cartesian = scene.globe.pick(ray, scene);
    }

    if (!cartesian) {
      return null;
    }

    return Cesium.Cartographic.fromCartesian(cartesian);
  }

  function addPipelinePoint(lat, lng, height) {
    pipelinePoints.push({
      latitude: lat,
      longitude: lng,
      height: height || 0,
    });

    upsertPreviewPolyline(pipelinePoints);

    const sceneManager = window.pipelineSceneManager;
    if (sceneManager) {
      sceneManager.clearLines();
      drawPipeline(pipelinePoints);
    }

    updatePointCount();
    setStatus("Pipeline point added. Continue selecting points.", false);
  }

  function clearPipelinePoints() {
    pipelinePoints.length = 0;
    updatePointCount();

    const sceneManager = window.pipelineSceneManager;
    if (sceneManager) {
      sceneManager.clearLines();
    }

    if (previewEntity) {
      const cesiumViewer = getViewer();
      cesiumViewer?.entities?.remove(previewEntity);
      previewEntity = null;
    }
  }

  function buildPipelinePayload() {
    return {
      pipelineId: getInputValue("pipelineId"),
      diameter: Number(getInputValue("pipelineDiameter")),
      material: getInputValue("pipelineMaterial"),
      status: getInputValue("pipelineStatus"),
      installationDate: getInputValue("pipelineInstallationDate"),
      points: [...pipelinePoints],
    };
  }

  function validatePayload(payload) {
    if (!payload.pipelineId) {
      return "Pipeline ID is required";
    }

    if (!Number.isFinite(payload.diameter) || payload.diameter <= 0) {
      return "Diameter must be a valid number";
    }

    if (!payload.material) {
      return "Material is required";
    }

    if (!payload.status) {
      return "Status is required";
    }

    if (!payload.installationDate) {
      return "Installation date is required";
    }

    if (!Array.isArray(payload.points) || payload.points.length < 2) {
      return "Add at least two points to create a pipeline";
    }

    return "";
  }

  async function savePipeline() {
    const payload = buildPipelinePayload();
    const validationMessage = validatePayload(payload);

    if (validationMessage) {
      setStatus(validationMessage, true);
      return;
    }

    try {
      const response = await fetch(`${SEWAGE_API_BASE}/add`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.message || "Failed to save pipeline");
      }

      setStatus("Pipeline saved successfully", false);
      clearPipelinePoints();
      if (result?.pipeline) {
        cachedPipelineCatalog = [result.pipeline, ...cachedPipelineCatalog.filter(
          (pipeline) => normalizePipelineId(pipeline.pipelineId || pipeline._id) !== normalizePipelineId(result.pipeline.pipelineId || result.pipeline._id)
        )];
        indexSewagePipeline(result.pipeline);
      }
      if (document.getElementById("sewagePanel")?.classList.contains("hidden") === false) {
        focusPipelineId();
      }
      if (areSavedPipelinesVisible) {
        await loadPipelines();
      }
    } catch (error) {
      setStatus(error.message || "Failed to save pipeline", true);
    }
  }

  function renderSavedPipeline(pipeline) {
    const points = pipeline?.points;
    const pipelineId = pipeline?.pipelineId || pipeline?._id;
    const cesiumViewer = getViewer();
    if (!cesiumViewer || !Array.isArray(points) || points.length < 2) {
      return;
    }

    const entityName = `sewage-pipeline-${pipelineId}`;
    const existing = cesiumViewer.entities.values.find(
      (entity) => entity.name === entityName
    );

    if (existing) {
      indexSewagePipeline(pipeline, existing);
      return;
    }

    const entity = cesiumViewer.entities.add({
      name: entityName,
      polylineVolume: {
        positions: toCesiumPositions(points),
        shape: createPipeShape(getPipelineRadiusMeters(pipeline?.diameter)),
        cornerType: Cesium.CornerType.ROUNDED,
        material: getPipeColor(pipeline?.status, false),
      },
    });

    indexSewagePipeline(pipeline, entity);
  }

  function hidePipelines() {
    const cesiumViewer = getViewer();
    if (!cesiumViewer) {
      return;
    }

    renderedPipelineEntityIds.forEach((entityId) => {
      const entity = cesiumViewer.entities.getById(entityId);
      if (entity) {
        cesiumViewer.entities.remove(entity);
      }
    });

    renderedPipelineEntityIds.clear();
    renderedPipelineEntities.clear();
    areSavedPipelinesVisible = false;
    setStatus("Pipelines hidden", false);

    const loadBtn = document.getElementById("btnLoadPipelines");
    if (loadBtn) {
      loadBtn.textContent = "Load Pipelines";
    }
  }

  async function loadPipelines() {
    try {
      const pipelines = await fetchPipelineCatalog();
      pipelines.forEach((pipeline) => {
        renderSavedPipeline(pipeline);
      });

      areSavedPipelinesVisible = true;
      updatePipelineVisibility(document.getElementById("searchInput")?.value || "");
      setStatus(`Loaded ${pipelines.length} pipelines`, false);

      const loadBtn = document.getElementById("btnLoadPipelines");
      if (loadBtn) {
        loadBtn.textContent = "Hide Pipelines";
      }
    } catch (error) {
      setStatus(error.message || "Failed to load pipelines", true);
    }
  }

  async function toggleSavedPipelines() {
    if (areSavedPipelinesVisible) {
      hidePipelines();
      return;
    }

    await loadPipelines();
  }

  function toggleCapture(active) {
    isPointCaptureActive = active;
    const addPointBtn = document.getElementById("btnAddPipelinePoint");
    if (addPointBtn) {
      addPointBtn.classList.toggle("capture-active", active);
      addPointBtn.textContent = active ? "Adding Points..." : "Add Point";
    }

    setStatus(
      active
        ? "Click on map to add sewage pipeline points"
        : "Point capture paused",
      false
    );
  }

  function onSceneClick(movement) {
    if (!isPointCaptureActive) {
      return;
    }

    const cartographic = getPickCartographic(movement.position);
    if (!cartographic) {
      setStatus("Unable to capture point at clicked location", true);
      return;
    }

    const lat = Cesium.Math.toDegrees(cartographic.latitude);
    const lng = Cesium.Math.toDegrees(cartographic.longitude);
    const height = cartographic.height || 0;

    addPipelinePoint(lat, lng, height);
  }

  function initializeClickCapture() {
    const cesiumViewer = getViewer();
    if (!cesiumViewer) {
      return;
    }

    if (clickHandler) {
      clickHandler.destroy();
    }

    clickHandler = new Cesium.ScreenSpaceEventHandler(cesiumViewer.scene.canvas);
    clickHandler.setInputAction(onSceneClick, Cesium.ScreenSpaceEventType.LEFT_CLICK);
  }

  function setDefaultDate() {
    const dateInput = document.getElementById("pipelineInstallationDate");
    if (!dateInput || dateInput.value) {
      return;
    }

    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    dateInput.value = `${now.getFullYear()}-${month}-${day}`;
  }

  function bindUi() {
    const panel = document.getElementById("sewagePanel");
    const toolBtn = document.getElementById("btnPipelineTool");
    const closePanelBtn = document.getElementById("btnCloseSewagePanel");
    const addPointBtn = document.getElementById("btnAddPipelinePoint");
    const saveBtn = document.getElementById("btnSavePipeline");
    const loadBtn = document.getElementById("btnLoadPipelines");
    const clearBtn = document.getElementById("btnClearPipelinePoints");

    function setPanelVisibility(visible) {
      if (!panel) {
        return;
      }

      panel.classList.toggle("hidden", !visible);
      toolBtn?.classList.toggle("capture-active", visible);

      if (!visible && isPointCaptureActive) {
        toggleCapture(false);
      }

      if (visible) {
        setStatus("Use Add Point, then click multiple map locations.", false);
        focusPipelineId();
      }
    }

    toolBtn?.addEventListener("click", () => {
      const isHidden = panel?.classList.contains("hidden");
      setPanelVisibility(Boolean(isHidden));
      if (isHidden && !isPointCaptureActive) {
        toggleCapture(true);
      }
    });

    closePanelBtn?.addEventListener("click", () => {
      setPanelVisibility(false);
    });

    addPointBtn?.addEventListener("click", () => {
      toggleCapture(!isPointCaptureActive);
    });

    saveBtn?.addEventListener("click", savePipeline);
    loadBtn?.addEventListener("click", toggleSavedPipelines);

    clearBtn?.addEventListener("click", () => {
      clearPipelinePoints();
      setStatus("Pipeline points cleared", false);
      focusPipelineId();
    });
  }

  function initializeSewagePipelines() {
    initializeClickCapture();
    bindUi();
    setDefaultDate();
    updatePointCount();
    fetchPipelineCatalog().catch((error) => {
      console.warn("Failed to preload sewage pipeline catalog", error);
    });

    const loadBtn = document.getElementById("btnLoadPipelines");
    if (loadBtn) {
      loadBtn.textContent = "Load Pipelines";
    }

    setStatus("Pipelines hidden. Search specific pipeline to show it.", false);
    if (!document.getElementById("sewagePanel")?.classList.contains("hidden")) {
      focusPipelineId();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeSewagePipelines);
  } else {
    initializeSewagePipelines();
  }

  window.pipelinePoints = pipelinePoints;
  window.addPipelinePoint = addPipelinePoint;
  window.drawPipeline = drawPipeline;
  window.loadPipelines = loadPipelines;
  window.getSewagePipelineSuggestions = getSewagePipelineSuggestions;
  window.ensureSewagePipelineVisible = ensureSewagePipelineVisible;
  window.focusSewagePipelineById = focusSewagePipelineById;
  window.updateSewagePipelineVisibility = updatePipelineVisibility;
})();
