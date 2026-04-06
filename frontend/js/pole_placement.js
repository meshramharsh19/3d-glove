(function () {
  const DEFAULT_POLE_HEIGHT = 9;
  function resolvePoleApiBase() {
    if (window.GLOVE_BACKEND_URL) {
      return `${window.GLOVE_BACKEND_URL.replace(/\/$/, "")}/api/poles`;
    }

    const { protocol, hostname, port } = window.location;
    const isLocalHost = hostname === "localhost" || hostname === "127.0.0.1";

    // Docker/local setup: frontend on 4001, backend on 4000.
    if (port === "4001") {
      return `${protocol}//${hostname}:4000/api/poles`;
    }

    // VS Code Live Server and similar local static servers (5500/5501/5502...).
    if (isLocalHost && port && port !== "4000") {
      return `${protocol}//${hostname}:4000/api/poles`;
    }

    // If app is served from backend itself, relative API path works.
    return "/api/poles";
  }

  const POLE_API_BASE = resolvePoleApiBase();
  const POLE_RADIUS = 0.18;
  const poleEntities = new Map();
  const poleSearchIndex = new Map();
  const poleNumberIndex = new Map();
  const poleDataIndex = new Map();
  const poleFormState = {
    pendingCartesian: null,
  };

  let clickHandler = null;

  function getViewer() {
    return typeof viewer !== "undefined" ? viewer : window.viewer;
  }

  function createPoleEntity(
    position,
    poleId,
    poleHeight = DEFAULT_POLE_HEIGHT,
    poleData = null
  ) {
    const cesiumViewer = getViewer();
    if (!cesiumViewer) {
      return null;
    }

    if (poleEntities.has(poleId)) {
      return poleEntities.get(poleId);
    }

    const resolvedPoleHeight =
      typeof poleHeight === "number" && Number.isFinite(poleHeight) && poleHeight > 0
        ? poleHeight
        : DEFAULT_POLE_HEIGHT;

    const cartographic = Cesium.Cartographic.fromCartesian(position);
    const groundHeight = cartographic.height || 0;
    const poleCenterHeight = groundHeight + resolvedPoleHeight / 2;
    const polePosition = Cesium.Cartesian3.fromRadians(
      cartographic.longitude,
      cartographic.latitude,
      poleCenterHeight
    );

    const entity = cesiumViewer.entities.add({
      id: poleId,
      show: false,
      position: polePosition,
      cylinder: {
        length: resolvedPoleHeight,
        topRadius: POLE_RADIUS,
        bottomRadius: POLE_RADIUS,
        material: Cesium.Color.fromCssColorString("#4b5563"),
        outline: true,
        outlineColor: Cesium.Color.fromCssColorString("#1f2937"),
      },
    });

    poleEntities.set(poleId, entity);
    poleDataIndex.set(poleId, poleData || { _id: poleId });
    poleSearchIndex.set(poleId, buildPoleSearchText(poleData || { _id: poleId }));
    poleNumberIndex.set(
      poleId,
      normalizePoleNumber(poleData?.poleNumber || poleData?._id || poleId)
    );
    return entity;
  }

  function normalizePoleNumber(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/[\s-]/g, "");
  }

  function buildPoleSearchText(pole) {
    return [
      pole?._id,
      pole?.poleNumber,
      pole?.type,
      pole?.voltage,
      pole?.installationDate,
      pole?.position?.longitude,
      pole?.position?.latitude,
    ]
      .filter((value) => value !== undefined && value !== null && value !== "")
      .join(" ")
      .toLowerCase();
  }

  function parsePoleQuery(rawQuery) {
    const query = String(rawQuery || "").trim();
    const lowerQuery = query.toLowerCase();
    const prefix = "pole:";
    const looksLikePoleNumber = /^p[-\s]?\d+/i.test(query);

    if (!lowerQuery.startsWith(prefix) && !looksLikePoleNumber) {
      return {
        isPoleQuery: false,
        value: "",
      };
    }

    if (looksLikePoleNumber && !lowerQuery.startsWith(prefix)) {
      return {
        isPoleQuery: true,
        value: query.toLowerCase(),
        mode: "exact-pole-number",
      };
    }

    const value = query.slice(prefix.length).trim();
    const isPoleNumberAfterPrefix = /^p[-\s]?\d+$/i.test(value);

    return {
      isPoleQuery: true,
      value: value.toLowerCase(),
      mode: isPoleNumberAfterPrefix ? "exact-pole-number" : "text",
    };
  }

  function updatePoleVisibility(rawQuery) {
    const poleQuery = parsePoleQuery(rawQuery);
    const shouldShow = poleQuery.isPoleQuery && poleQuery.value.length > 0;

    poleEntities.forEach((entity, poleId) => {
      if (!shouldShow) {
        entity.show = false;
        return;
      }

      const searchableText = poleSearchIndex.get(poleId) || "";
      if (poleQuery.mode === "exact-pole-number") {
        const normalizedQuery = normalizePoleNumber(poleQuery.value);
        const normalizedPoleNumber = poleNumberIndex.get(poleId) || "";
        entity.show = normalizedPoleNumber === normalizedQuery;
      } else {
        entity.show = searchableText.includes(poleQuery.value);
      }
    });
  }

  function getPoleSuggestions(rawQuery, limit = 8) {
    const query = String(rawQuery || "").trim();
    if (!query) {
      return [];
    }

    const queryWithoutPrefix = query.toLowerCase().startsWith("pole:")
      ? query.slice(5).trim()
      : query;
    const normalizedQuery = normalizePoleNumber(queryWithoutPrefix);

    if (!normalizedQuery) {
      return [];
    }

    const suggestions = [];

    poleEntities.forEach((_entity, poleId) => {
      const poleData = poleDataIndex.get(poleId) || {};
      const poleNumber = String(poleData.poleNumber || poleId);
      const normalizedPoleNumber = normalizePoleNumber(poleNumber);

      if (!normalizedPoleNumber.includes(normalizedQuery)) {
        return;
      }

      suggestions.push({
        poleNumber,
        type: poleData.type || "-",
        voltage: poleData.voltage || "-",
      });
    });

    suggestions.sort((a, b) => {
      const aNorm = normalizePoleNumber(a.poleNumber);
      const bNorm = normalizePoleNumber(b.poleNumber);
      const aStarts = aNorm.startsWith(normalizedQuery);
      const bStarts = bNorm.startsWith(normalizedQuery);

      if (aStarts !== bStarts) {
        return aStarts ? -1 : 1;
      }

      return a.poleNumber.localeCompare(b.poleNumber, undefined, { numeric: true });
    });

    return suggestions.slice(0, Math.max(1, limit));
  }

  function focusPoleByNumber(poleNumber) {
    const target = normalizePoleNumber(poleNumber);
    if (!target) {
      return;
    }

    let targetEntity = null;

    poleEntities.forEach((entity, poleId) => {
      if (targetEntity) {
        return;
      }

      const number = poleNumberIndex.get(poleId) || "";
      if (number === target) {
        targetEntity = entity;
      }
    });

    const cesiumViewer = getViewer();
    if (!targetEntity || !cesiumViewer) {
      return;
    }

    cesiumViewer.flyTo(targetEntity, {
      duration: 1.2,
      offset: new Cesium.HeadingPitchRange(
        Cesium.Math.toRadians(0),
        Cesium.Math.toRadians(-40),
        120
      ),
    });
  }

  function getCartesianFromPole(pole) {
    if (
      pole?.position &&
      Number.isFinite(pole.position.longitude) &&
      Number.isFinite(pole.position.latitude)
    ) {
      return Cesium.Cartesian3.fromDegrees(
        pole.position.longitude,
        pole.position.latitude,
        Number.isFinite(pole.position.height) ? pole.position.height : 0
      );
    }

    if ([pole?.x, pole?.y, pole?.z].every((value) => Number.isFinite(value))) {
      return Cesium.Cartesian3.fromArray([pole.x, pole.y, pole.z]);
    }

    return null;
  }

  function getTodayDateString() {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${now.getFullYear()}-${month}-${day}`;
  }

  function setInputValue(id, value) {
    const element = document.getElementById(id);
    if (!element) {
      return;
    }

    element.value = value;
  }

  function openPoleModal(position) {
    poleFormState.pendingCartesian = position;

    const cartographic = Cesium.Cartographic.fromCartesian(position);
    const longitude = Cesium.Math.toDegrees(cartographic.longitude);
    const latitude = Cesium.Math.toDegrees(cartographic.latitude);
    const height = cartographic.height || 0;

    setInputValue("poleLongitude", longitude.toFixed(6));
    setInputValue("poleLatitude", latitude.toFixed(6));
    setInputValue("poleGroundHeight", height.toFixed(2));
    setInputValue("poleHeight", String(DEFAULT_POLE_HEIGHT));
    setInputValue("poleInstallationDate", getTodayDateString());

    const modal = document.getElementById("poleModal");
    if (modal) {
      modal.classList.add("is-open");
      modal.setAttribute("aria-hidden", "false");
    }

    const poleNumberInput = document.getElementById("poleNumber");
    if (poleNumberInput) {
      poleNumberInput.focus();
    }
  }

  function closePoleModal() {
    const modal = document.getElementById("poleModal");
    if (modal) {
      modal.classList.remove("is-open");
      modal.setAttribute("aria-hidden", "true");
    }

    poleFormState.pendingCartesian = null;
  }

  function getFormPayload() {
    if (!poleFormState.pendingCartesian) {
      return null;
    }

    const poleNumber = document.getElementById("poleNumber")?.value.trim();
    const type = document.getElementById("poleType")?.value.trim();
    const voltage = document.getElementById("poleVoltage")?.value.trim();
    const poleHeight = Number(document.getElementById("poleHeight")?.value);
    const installationDate = document.getElementById("poleInstallationDate")?.value;

    const cartographic = Cesium.Cartographic.fromCartesian(poleFormState.pendingCartesian);
    const longitude = Cesium.Math.toDegrees(cartographic.longitude);
    const latitude = Cesium.Math.toDegrees(cartographic.latitude);
    const height = cartographic.height || 0;

    if (!poleNumber || !type || !voltage || !installationDate || !Number.isFinite(poleHeight)) {
      return null;
    }

    return {
      poleNumber,
      type,
      voltage,
      poleHeight,
      installationDate,
      position: {
        longitude,
        latitude,
        height,
      },
      // Keep legacy cartesian coordinates so old render logic also remains compatible.
      x: poleFormState.pendingCartesian.x,
      y: poleFormState.pendingCartesian.y,
      z: poleFormState.pendingCartesian.z,
    };
  }

  function resetPoleForm() {
    const form = document.getElementById("poleForm");
    if (form) {
      form.reset();
    }
  }

  async function savePoleWithForm(event) {
    event.preventDefault();

    if (typeof axios === "undefined") {
      return;
    }

    const payload = getFormPayload();
    if (!payload) {
      alert("Please fill all required pole fields with valid values");
      return;
    }

    try {
      const response = await axios.post(`${POLE_API_BASE}/add-pole`, payload);
      const savedPole = response.data?.pole;
      const entityId = savedPole?._id || `pole-${Date.now()}`;

      createPoleEntity(
        poleFormState.pendingCartesian,
        entityId,
        Number.isFinite(savedPole?.poleHeight) ? savedPole.poleHeight : payload.poleHeight,
        savedPole || payload
      );

      console.log("Pole saved:", savedPole || response.data);
      const searchValue = document.getElementById("searchInput")?.value || "";
      updatePoleVisibility(searchValue);
      resetPoleForm();
      closePoleModal();
    } catch (error) {
      console.error("Failed to save pole:", error?.response?.data || error.message || error);
      alert("Failed to save pole. Check console for details.");
    }
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
        const cartesian = getCartesianFromPole(pole);
        if (!cartesian) {
          return;
        }

        createPoleEntity(cartesian, pole._id, pole.poleHeight, pole);
      });

      console.log(`Loaded ${poles.length} saved poles`);
      const searchValue = document.getElementById("searchInput")?.value || "";
      updatePoleVisibility(searchValue);
    } catch (error) {
      console.error("Failed to load poles:", error?.response?.data || error.message || error);
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

    openPoleModal(pickedPosition);
  }

  function initializePolePlacement() {
    const cesiumViewer = getViewer();
    if (!cesiumViewer) {
      return;
    }

    cesiumViewer.scene.globe.depthTestAgainstTerrain = true;

    if (clickHandler) {
      clickHandler.destroy();
    }

    clickHandler = new Cesium.ScreenSpaceEventHandler(cesiumViewer.scene.canvas);
    clickHandler.setInputAction(handleClick, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    const form = document.getElementById("poleForm");
    form?.addEventListener("submit", savePoleWithForm);

    const closeBtn = document.getElementById("poleModalClose");
    closeBtn?.addEventListener("click", closePoleModal);

    const cancelBtn = document.getElementById("poleModalCancel");
    cancelBtn?.addEventListener("click", closePoleModal);

    const modal = document.getElementById("poleModal");
    modal?.addEventListener("click", (event) => {
      if (event.target === modal) {
        closePoleModal();
      }
    });

    const searchInput = document.getElementById("searchInput");
    searchInput?.addEventListener("input", (event) => {
      updatePoleVisibility(event.target?.value || "");
    });

    loadPoles();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializePolePlacement);
  } else {
    initializePolePlacement();
  }

  window.loadPoles = loadPoles;
  window.filterPolesByQuery = updatePoleVisibility;
  window.getPoleSuggestions = getPoleSuggestions;
  window.focusPoleByNumber = focusPoleByNumber;
})();
