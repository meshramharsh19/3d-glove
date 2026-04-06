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
  const REQUIRED_CLICKS_FOR_POLE_MODAL = 3;
  const POLE_RADIUS = 0.18;
  const CROSS_ARM_LENGTH = 2.5;
  const CROSS_ARM_RADIUS = 0.12;
  const INSULATOR_RADIUS = 0.08;
  const EARTH_RADIUS_METERS = 6378137;
  const poleEntities = new Map();
  const poleComponentEntities = new Map();
  const poleSearchIndex = new Map();
  const poleNumberIndex = new Map();
  const poleDataIndex = new Map();
  const poleFormState = {
    pendingCartesian: null,
    clickCount: 0,
    lastClickAt: 0,
  };

  let poleSectionOpenAnimationResetTimer = null;
  let poleSectionPositionRaf = null;

  let clickHandler = null;

  function getViewer() {
    return typeof viewer !== "undefined" ? viewer : window.viewer;
  }

  function normalizeHeadingDegrees(value) {
    if (!Number.isFinite(value)) {
      return 0;
    }

    return ((value % 360) + 360) % 360;
  }

  function getFallbackWireHeading(position) {
    const cartographic = Cesium.Cartographic.fromCartesian(position);
    const lonDeg = Cesium.Math.toDegrees(cartographic.longitude);
    const latDeg = Cesium.Math.toDegrees(cartographic.latitude);

    const seed = Math.abs(Math.round((lonDeg * 1000 + latDeg * 700) * 0.5));
    return (seed % 6) * 30;
  }

  function createRealisticPole(cesiumViewer, position, poleHeight, poleColor, wireHeading) {
    const components = [];

    const cartographic = Cesium.Cartographic.fromCartesian(position);
    const groundHeight = cartographic.height || 0;
    const longitude = cartographic.longitude;
    const latitude = cartographic.latitude;
    const heading = normalizeHeadingDegrees(wireHeading);
    const headingRad = Cesium.Math.toRadians(heading);

    const latCos = Math.max(0.2, Math.cos(latitude));

    function offsetPosition(eastMeters, northMeters, heightOffset = 0) {
      const rotatedEast = eastMeters * Math.cos(headingRad) - northMeters * Math.sin(headingRad);
      const rotatedNorth = eastMeters * Math.sin(headingRad) + northMeters * Math.cos(headingRad);

      return Cesium.Cartesian3.fromRadians(
        longitude + rotatedEast / (EARTH_RADIUS_METERS * latCos),
        latitude + rotatedNorth / EARTH_RADIUS_METERS,
        groundHeight + heightOffset
      );
    }

    const poleCenterHeight = groundHeight + poleHeight / 2;
    const polePosition = Cesium.Cartesian3.fromRadians(
      longitude,
      latitude,
      poleCenterHeight
    );

    const mainPole = cesiumViewer.entities.add({
      position: polePosition,
      cylinder: {
        length: poleHeight,
        topRadius: POLE_RADIUS,
        bottomRadius: POLE_RADIUS * 1.1,
        material: Cesium.Color.fromCssColorString(poleColor),
        outline: true,
        outlineColor: Cesium.Color.fromCssColorString("#2a3f2f"),
      },
    });

    components.push(mainPole);

    const transformer = cesiumViewer.entities.add({
      position: offsetPosition(-0.55, 0, poleHeight * 0.52),
      box: {
        dimensions: new Cesium.Cartesian3(0.55, 0.35, 0.65),
        material: Cesium.Color.fromCssColorString("#8a857b"),
        outline: true,
        outlineColor: Cesium.Color.fromCssColorString("#4a4a4a"),
      },
    });
    components.push(transformer);

    const transformerBrace = cesiumViewer.entities.add({
      polyline: {
        positions: [
          offsetPosition(-0.08, 0, poleHeight * 0.46),
          offsetPosition(-0.55, 0, poleHeight * 0.36),
        ],
        width: 2,
        material: Cesium.Color.fromCssColorString("#5f564d"),
      },
    });
    components.push(transformerBrace);

    const topArmHeight = poleHeight * 0.74;
    const supportArmHeight = poleHeight * 0.63;

    const topCrossArm = cesiumViewer.entities.add({
      position: offsetPosition(0, 0, topArmHeight),
      box: {
        dimensions: new Cesium.Cartesian3(CROSS_ARM_LENGTH, CROSS_ARM_RADIUS, CROSS_ARM_RADIUS),
        material: Cesium.Color.fromCssColorString("#5a6b5a"),
        outline: true,
        outlineColor: Cesium.Color.fromCssColorString("#2a3f2f"),
      },
    });
    components.push(topCrossArm);

    const backCrossArm = cesiumViewer.entities.add({
      position: offsetPosition(0, 0, topArmHeight - 0.08),
      box: {
        dimensions: new Cesium.Cartesian3(CROSS_ARM_RADIUS, CROSS_ARM_LENGTH * 0.7, CROSS_ARM_RADIUS),
        material: Cesium.Color.fromCssColorString("#55695c"),
        outline: true,
        outlineColor: Cesium.Color.fromCssColorString("#2a3f2f"),
      },
    });
    components.push(backCrossArm);

    const supportArm = cesiumViewer.entities.add({
      position: offsetPosition(0, 0, supportArmHeight),
      box: {
        dimensions: new Cesium.Cartesian3(CROSS_ARM_LENGTH * 0.65, CROSS_ARM_RADIUS * 0.9, CROSS_ARM_RADIUS * 0.9),
        material: Cesium.Color.fromCssColorString("#4f6154"),
        outline: true,
        outlineColor: Cesium.Color.fromCssColorString("#2a3f2f"),
      },
    });
    components.push(supportArm);

    const conductorOffsets = [-0.78, 0, 0.78];
    conductorOffsets.forEach((eastOffset, index) => {
      const insulator = cesiumViewer.entities.add({
        position: offsetPosition(eastOffset, 0, topArmHeight + CROSS_ARM_RADIUS * 0.9),
        sphere: {
          radius: INSULATOR_RADIUS,
          material: Cesium.Color.fromCssColorString("#e8d4c0"),
          outline: true,
          outlineColor: Cesium.Color.fromCssColorString("#8b6f47"),
        },
      });
      components.push(insulator);

      const conductor = cesiumViewer.entities.add({
        polyline: {
          positions: [
            offsetPosition(eastOffset, -2.6, topArmHeight + 0.02),
            offsetPosition(eastOffset, -0.9, topArmHeight - 0.06 - index * 0.01),
            offsetPosition(eastOffset, 0, topArmHeight - index * 0.015),
            offsetPosition(eastOffset, 0.9, topArmHeight - 0.06 - index * 0.01),
            offsetPosition(eastOffset, 2.6, topArmHeight + 0.02),
          ],
          width: 1.1,
          arcType: Cesium.ArcType.NONE,
          material: Cesium.Color.fromCssColorString("#2f2f2f"),
        },
      });
      components.push(conductor);
    });

    // Keep wire layout clean near the pole. Long service-drop lines looked noisy in dense scenes.

    return components;
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

    const poleColor = poleData?.type === "concrete" ? "#7a8c7a" : "#5a6b5a";
    const resolvedHeading = Number.isFinite(poleData?.wireHeading)
      ? poleData.wireHeading
      : getFallbackWireHeading(position);

    const components = createRealisticPole(
      cesiumViewer,
      position,
      resolvedPoleHeight,
      poleColor,
      resolvedHeading
    );

    components.forEach((comp) => {
      comp.show = false;
    });

    const mainPole = components[0];
    if (mainPole) {
      mainPole.id = poleId;
    }

    const entity = mainPole;

    poleEntities.set(poleId, entity);
    poleComponentEntities.set(poleId, components);
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
    const looksLikePoleNumber = /^(p[-\s]?\d+|\d+)$/i.test(query);
    const looksLikePoleKeyword = /^pole(?:\s*[:\-\s]?\s*)?(.*)$/i.test(query);

    if (!lowerQuery.startsWith(prefix) && !looksLikePoleNumber && !looksLikePoleKeyword) {
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

    if (looksLikePoleKeyword && !lowerQuery.startsWith(prefix)) {
      const match = query.match(/^pole(?:\s*[:\-\s]?\s*)?(.*)$/i);
      const keywordValue = String(match?.[1] || "").trim();

      return {
        isPoleQuery: true,
        value: keywordValue.toLowerCase(),
        mode: /^p[-\s]?\d+$/i.test(keywordValue) || /^\d+$/.test(keywordValue)
          ? "exact-pole-number"
          : "text",
      };
    }

    const value = query.slice(prefix.length).trim();
    const isPoleNumberAfterPrefix = /^(p[-\s]?\d+|\d+)$/i.test(value);

    return {
      isPoleQuery: true,
      value: value.toLowerCase(),
      mode: isPoleNumberAfterPrefix ? "exact-pole-number" : "text",
    };
  }

  function updatePoleVisibility(rawQuery) {
    const poleQuery = parsePoleQuery(rawQuery);
    const shouldShow = poleQuery.isPoleQuery && poleQuery.value.length > 0;

    poleComponentEntities.forEach((components, poleId) => {
      if (!shouldShow) {
        components.forEach((comp) => {
          comp.show = false;
        });
        return;
      }

      const searchableText = poleSearchIndex.get(poleId) || "";
      if (poleQuery.mode === "exact-pole-number") {
        const normalizedQuery = normalizePoleNumber(poleQuery.value);
        const normalizedPoleNumber = poleNumberIndex.get(poleId) || "";
        const isMatch = normalizedPoleNumber === normalizedQuery;
        components.forEach((comp) => {
          comp.show = isMatch;
        });
      } else {
        const isMatch = searchableText.includes(poleQuery.value);
        components.forEach((comp) => {
          comp.show = isMatch;
        });
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
      : query.replace(/^pole(?:\s*[:\-\s]?\s*)?/i, "").trim();
    const normalizedQuery = normalizePoleNumber(queryWithoutPrefix);

    const poleKeywordOnly = /^pole$/i.test(query);

    if (!normalizedQuery && !poleKeywordOnly) {
      return [];
    }

    const suggestions = [];

    poleEntities.forEach((_entity, poleId) => {
      const poleData = poleDataIndex.get(poleId) || {};
      const poleNumber = String(poleData.poleNumber || poleId);
      const normalizedPoleNumber = normalizePoleNumber(poleNumber);

      if (normalizedQuery && !normalizedPoleNumber.includes(normalizedQuery)) {
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
      const aStarts = normalizedQuery ? aNorm.startsWith(normalizedQuery) : false;
      const bStarts = normalizedQuery ? bNorm.startsWith(normalizedQuery) : false;

      if (aStarts !== bStarts) {
        return aStarts ? -1 : 1;
      }

      return a.poleNumber.localeCompare(b.poleNumber, undefined, { numeric: true });
    });

    return suggestions.slice(0, Math.max(1, limit));
  }

  function getPoleDataByNumber(poleNumber) {
    const normalizedTarget = normalizePoleNumber(poleNumber);
    if (!normalizedTarget) {
      return null;
    }

    for (const [poleId, poleData] of poleDataIndex.entries()) {
      const candidates = [
        normalizePoleNumber(poleData?.poleNumber),
        normalizePoleNumber(poleId),
        normalizePoleNumber(poleData?._id),
      ];

      if (candidates.some((candidate) => candidate === normalizedTarget)) {
        return poleData;
      }
    }

    return null;
  }

  function positionPoleSection() {
    const section = document.getElementById("poleSection");
    if (!section) {
      return;
    }

    const bannerSection = document.getElementById("bannerSection");
    const topbar = document.getElementById("topbar");

    const topbarBottom = topbar ? topbar.getBoundingClientRect().bottom : 62;
    const baseTop = Math.round(topbarBottom + 14);
    const minTop = Math.round(topbarBottom + 8);

    let sectionTop = baseTop;

    if (bannerSection && bannerSection.classList.contains("banner-visible")) {
      const bannerRect = bannerSection.getBoundingClientRect();
      sectionTop = Math.max(minTop, Math.round(bannerRect.bottom + 18));
    }

    const sectionHeight = section.offsetHeight || 220;
    const maxSectionTop = Math.max(minTop, Math.round(window.innerHeight - sectionHeight - 12));
    sectionTop = Math.max(minTop, Math.min(sectionTop, maxSectionTop));

    section.style.top = `${sectionTop}px`;
    section.style.right = "64px";
  }

  function schedulePoleSectionPosition() {
    if (poleSectionPositionRaf !== null) {
      return;
    }

    poleSectionPositionRaf = window.requestAnimationFrame(() => {
      poleSectionPositionRaf = null;
      positionPoleSection();
    });
  }

  function showPoleDetailsPanel(poleNumberOrData) {
    const poleData =
      typeof poleNumberOrData === "object" && poleNumberOrData !== null
        ? poleNumberOrData
        : getPoleDataByNumber(poleNumberOrData);

    if (!poleData) {
      return;
    }

    const section = document.getElementById("poleSection");
    if (!section) {
      return;
    }

    if (poleSectionOpenAnimationResetTimer) {
      window.clearTimeout(poleSectionOpenAnimationResetTimer);
      poleSectionOpenAnimationResetTimer = null;
    }

    section.classList.remove("pole-opening");
    void section.offsetWidth;
    section.classList.add("pole-opening");

    poleSectionOpenAnimationResetTimer = window.setTimeout(() => {
      section.classList.remove("pole-opening");
      poleSectionOpenAnimationResetTimer = null;
    }, 420);

    const poleNumberEl = document.getElementById("poleDataNumber");
    const poleTypeEl = document.getElementById("poleDataType");
    const poleVoltageEl = document.getElementById("poleDataVoltage");
    const poleHeightEl = document.getElementById("poleDataHeight");
    const poleDateEl = document.getElementById("poleDataDate");
    const poleHeadingEl = document.getElementById("poleDataHeading");
    const poleCoordsEl = document.getElementById("poleDataCoords");

    if (poleNumberEl) poleNumberEl.textContent = poleData.poleNumber || poleData._id || "-";
    if (poleTypeEl) poleTypeEl.textContent = poleData.type || "-";
    if (poleVoltageEl) poleVoltageEl.textContent = poleData.voltage || "-";
    if (poleHeightEl) poleHeightEl.textContent =
      Number.isFinite(poleData.poleHeight) ? `${poleData.poleHeight} m` : "-";
    if (poleDateEl) {
      poleDateEl.textContent = poleData.installationDate
        ? new Date(poleData.installationDate).toLocaleDateString()
        : "-";
    }
    if (poleHeadingEl) {
      poleHeadingEl.textContent = Number.isFinite(poleData.wireHeading)
        ? `${normalizeHeadingDegrees(poleData.wireHeading).toFixed(0)}°`
        : "-";
    }
    if (poleCoordsEl) {
      const lon = Number.isFinite(poleData?.position?.longitude)
        ? poleData.position.longitude.toFixed(6)
        : "-";
      const lat = Number.isFinite(poleData?.position?.latitude)
        ? poleData.position.latitude.toFixed(6)
        : "-";
      poleCoordsEl.textContent = `${lon}, ${lat}`;
    }

    section.classList.add("pole-visible");
    section.setAttribute("aria-hidden", "false");

    schedulePoleSectionPosition();
  }

  function closePoleDetailsPanel() {
    const section = document.getElementById("poleSection");
    if (!section) {
      return;
    }

    if (poleSectionOpenAnimationResetTimer) {
      window.clearTimeout(poleSectionOpenAnimationResetTimer);
      poleSectionOpenAnimationResetTimer = null;
    }

    section.classList.remove("pole-visible");
    section.classList.remove("pole-opening");
    section.setAttribute("aria-hidden", "true");
  }

  function focusPoleByNumber(poleNumber) {
    const target = normalizePoleNumber(poleNumber);
    if (!target) {
      return;
    }

    let targetEntity = null;

    poleEntities.forEach((entity, poleId) => {
      if (targetEntity || !poleComponentEntities.has(poleId)) {
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
    const activeElement = document.activeElement;

    if (modal && activeElement instanceof HTMLElement && modal.contains(activeElement)) {
      const focusFallback =
        document.getElementById("searchInput") ||
        document.getElementById("poleNumber") ||
        document.body;

      if (focusFallback instanceof HTMLElement) {
        focusFallback.focus();
      }
    }

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
    const viewerInstance = getViewer();
    const cameraHeading = viewerInstance
      ? normalizeHeadingDegrees(Cesium.Math.toDegrees(viewerInstance.camera.heading))
      : 0;

    if (!poleNumber || !type || !voltage || !installationDate || !Number.isFinite(poleHeight)) {
      return null;
    }

    return {
      poleNumber,
      type,
      voltage,
      poleHeight,
      wireHeading: cameraHeading,
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

    const now = Date.now();
    // Reset count if user paused for too long between clicks.
    if (now - poleFormState.lastClickAt > 2000) {
      poleFormState.clickCount = 0;
    }

    poleFormState.lastClickAt = now;
    poleFormState.clickCount += 1;

    if (poleFormState.clickCount < REQUIRED_CLICKS_FOR_POLE_MODAL) {
      return;
    }

    poleFormState.clickCount = 0;
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

    const sectionCloseBtn = document.getElementById("poleSectionCloseBtn");
    sectionCloseBtn?.addEventListener("click", closePoleDetailsPanel);

    const searchInput = document.getElementById("searchInput");
    searchInput?.addEventListener("input", (event) => {
      updatePoleVisibility(event.target?.value || "");
      schedulePoleSectionPosition();
    });

    window.addEventListener("resize", schedulePoleSectionPosition);
    document.addEventListener("DOMContentLoaded", schedulePoleSectionPosition);
    document.addEventListener("click", schedulePoleSectionPosition);
    window.addEventListener("scroll", schedulePoleSectionPosition, true);

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        closePoleDetailsPanel();
      }
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
  window.getPoleDataByNumber = getPoleDataByNumber;
  window.showPoleDetailsPanel = showPoleDetailsPanel;
  window.closePoleDetailsPanel = closePoleDetailsPanel;
})();
