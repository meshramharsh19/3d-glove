(function () {
  const DEFAULT_MANHOLE_TYPE = "sewage";
  
  function resolveManholeApiBase() {
    if (window.GLOVE_BACKEND_URL) {
      return `${window.GLOVE_BACKEND_URL.replace(/\/$/, "")}/api/manholes`;
    }

    const { protocol, hostname, port } = window.location;
    const isLocalHost = hostname === "localhost" || hostname === "127.0.0.1";

    if (port === "4001") {
      return `${protocol}//${hostname}:4000/api/manholes`;
    }

    if (isLocalHost && port && port !== "4000") {
      return `${protocol}//${hostname}:4000/api/manholes`;
    }

    return "/api/manholes";
  }

  const MANHOLE_API_BASE = resolveManholeApiBase();
  const MANHOLE_RADIUS = 0.5;
  
  const MANHOLE_TYPE_CONFIG = {
    sewage: {
      label: "Sewage Manhole",
      color: "#8b6914",
      icon: "🚰",
    },
    water: {
      label: "Water Manhole",
      color: "#1e90ff",
      icon: "💧",
    },
    stormwater: {
      label: "Stormwater Manhole",
      color: "#4169e1",
      icon: "🌊",
    },
    electrical: {
      label: "Electrical Manhole",
      color: "#ffa500",
      icon: "⚡",
    },
    communication: {
      label: "Communication Manhole",
      color: "#228b22",
      icon: "📡",
    },
    gas: {
      label: "Gas Manhole",
      color: "#dc143c",
      icon: "🔥",
    },
  };

  const manholeEntities = new Map();
  const manholeComponentEntities = new Map();
  const manholeSearchIndex = new Map();
  const manholeIdIndex = new Map();
  const manholeDataIndex = new Map();
  const manholeFormState = {
    pendingCartesian: null,
  };
  let areSavedManholesVisible = false;

  let manholeClickHandler = null;
  let isManholeCaptureActive = false;

  function getViewer() {
    return typeof viewer !== "undefined" ? viewer : window.viewer;
  }

  function normalizeManholeType(value) {
    const normalized = String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[\s\/-]+/g, "_");

    if (Object.prototype.hasOwnProperty.call(MANHOLE_TYPE_CONFIG, normalized)) {
      return normalized;
    }

    return DEFAULT_MANHOLE_TYPE;
  }

  function getTodayDateString() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function createManholeVisualization(cartesianPosition, manholeType) {
    const typeKey = normalizeManholeType(manholeType);
    const config = MANHOLE_TYPE_CONFIG[typeKey] || MANHOLE_TYPE_CONFIG[DEFAULT_MANHOLE_TYPE];
    const cesiumViewer = getViewer();

    if (!cesiumViewer) {
      return [];
    }

    const components = [];

    const mainEntity = cesiumViewer.entities.add({
      position: cartesianPosition,
      cylinder: {
        length: 0.3,
        topRadius: MANHOLE_RADIUS,
        bottomRadius: MANHOLE_RADIUS,
        material: Cesium.Color.fromCssColorString(config.color),
        outline: true,
        outlineColor: Cesium.Color.BLACK,
      },
    });
    components.push(mainEntity);

    return components;
  }

  function addManholeToScene(manholeData, options = {}) {
    const cesiumViewer = getViewer();
    if (!cesiumViewer) {
      return;
    }

    const { _id, position, type } = manholeData;
    if (!_id) {
      return;
    }

    if (manholeEntities.has(_id)) {
      const existingComponents = manholeComponentEntities.get(_id) || [];
      const shouldShowExisting = options.show !== undefined ? Boolean(options.show) : areSavedManholesVisible;
      existingComponents.forEach((component) => {
        if (component) {
          component.show = shouldShowExisting;
        }
      });
      return;
    }

    if (!position || !position.longitude || !position.latitude) {
      return;
    }

    const cartographic = Cesium.Cartographic.fromDegrees(
      position.longitude,
      position.latitude,
      position.height || 0
    );
    const cartesianPosition = Cesium.Ellipsoid.WGS84.cartographicToCartesian(cartographic);

    const components = createManholeVisualization(cartesianPosition, type);
    if (components.length === 0) {
      return;
    }

    const shouldShow = options.show !== undefined ? Boolean(options.show) : areSavedManholesVisible;
    components.forEach((component) => {
      if (component) {
        component.show = shouldShow;
      }
    });

    const typeKey = normalizeManholeType(type);
    const config = MANHOLE_TYPE_CONFIG[typeKey];
    const searchableText = `${manholeData.manholeId || ""} ${type} ${manholeData.description || ""}`.toLowerCase();

    manholeEntities.set(_id, components[0]);
    manholeComponentEntities.set(_id, components);
    manholeDataIndex.set(_id, manholeData);
    manholeSearchIndex.set(_id, searchableText);
    manholeIdIndex.set(_id, (manholeData.manholeId || "").toLowerCase());

    const clickEntity = cesiumViewer.entities.add({
      position: cartesianPosition,
      ellipsoid: {
        radii: new Cesium.Cartesian3(MANHOLE_RADIUS + 0.1, MANHOLE_RADIUS + 0.1, 0.5),
        material: Cesium.Color.fromCssColorString(config.color).withAlpha(0.1),
        outline: false,
      },
      properties: {
        type: "manhole",
        manholeId: _id,
      },
    });

    clickEntity.show = shouldShow;

    components.push(clickEntity);
  }

  function loadAllManholes() {
    console.log("📡 Fetching all manholes from API:", MANHOLE_API_BASE);
    return fetch(`${MANHOLE_API_BASE}/get-manholes`)
      .then((res) => {
        console.log("📡 Response status:", res.status);
        return res.json();
      })
      .then((data) => {
        console.log("📡 Manhole data received:", data);
        if (data.success && Array.isArray(data.manholes)) {
          console.log(`✅ Loading ${data.manholes.length} manholes`);
          data.manholes.forEach((manhole) => {
            addManholeToScene(manhole, { show: areSavedManholesVisible });
          });
        } else {
          console.warn("⚠️ API response missing manholes array or success flag");
        }
      })
      .catch((error) => {
        console.error("❌ Error loading manholes:", error);
      });
  }

  function normalizeManholeSearchValue(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/^manhole\s*[:\-\s]?/i, "")
      .replace(/^mh\s*:/i, "mh")
      .replace(/\s+/g, "");
  }

  function updateManholeVisibility(rawQuery) {
    const query = String(rawQuery || "").trim().toLowerCase();
    const normalizedQuery = normalizeManholeSearchValue(query);
    const isManholeScopedQuery = /^(?:manhole|mh)\s*[:\-\s]?/i.test(query);

    manholeComponentEntities.forEach((components, dbId) => {
      const businessId = normalizeManholeSearchValue(manholeIdIndex.get(dbId) || "");
      const shouldShowTarget = isManholeScopedQuery
        ? (!normalizedQuery || businessId.includes(normalizedQuery) || normalizedQuery.includes(businessId))
        : areSavedManholesVisible;

      (components || []).forEach((component) => {
        if (component) {
          component.show = shouldShowTarget;
        }
      });
    });
  }

  function focusManholeById(manholeId) {
    const cesiumViewer = getViewer();
    if (!cesiumViewer) {
      return false;
    }

    const normalizedTarget = normalizeManholeSearchValue(manholeId);
    if (!normalizedTarget) {
      return false;
    }

    let matchedDbId = null;
    manholeIdIndex.forEach((businessId, dbId) => {
      const normalizedBusinessId = normalizeManholeSearchValue(businessId || "");
      if (!matchedDbId && (normalizedBusinessId === normalizedTarget || normalizedBusinessId.includes(normalizedTarget))) {
        matchedDbId = dbId;
      }
    });

    if (!matchedDbId) {
      return false;
    }

    const mainEntity = manholeEntities.get(matchedDbId);
    if (!mainEntity) {
      return false;
    }

    const components = manholeComponentEntities.get(matchedDbId) || [];
    components.forEach((component) => {
      if (component) {
        component.show = true;
      }
    });

    cesiumViewer.flyTo(mainEntity, {
      duration: 1.2,
      offset: new Cesium.HeadingPitchRange(
        Cesium.Math.toRadians(0),
        Cesium.Math.toRadians(-35),
        140
      ),
    });

    return true;
  }

  function saveManholeToApi(payload) {
    return fetch(`${MANHOLE_API_BASE}/add-manhole`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    })
      .then((res) => res.json());
  }

  function openManholeForm(cartesianPosition) {
    console.log("📝 Opening manhole form at position:", cartesianPosition);
    manholeFormState.pendingCartesian = cartesianPosition;

    const typeSelect = document.getElementById("manholeType");
    if (typeSelect) {
      typeSelect.value = DEFAULT_MANHOLE_TYPE;
    }
    setInputValue("manholeDiameter", "1.0");
    setInputValue("manholeDepth", "2.0");
    setInputValue("manholeInstallationDate", getTodayDateString());

    const modal = document.getElementById("manholeModal");
    if (modal) {
      modal.classList.add("is-open");
      modal.setAttribute("aria-hidden", "false");
      console.log("✅ Manhole modal opened");
    } else {
      console.error("❌ Manhole modal element not found");
    }

    const manholeIdInput = document.getElementById("manholeId");
    if (manholeIdInput) {
      window.requestAnimationFrame(() => {
        manholeIdInput.focus();
      });
    }
  }

  function setInputValue(elementId, value) {
    const element = document.getElementById(elementId);
    if (element) {
      element.value = value;
    }
  }

  function closeManholeModal() {
    const modal = document.getElementById("manholeModal");
    const activeElement = document.activeElement;

    if (modal && activeElement instanceof HTMLElement && modal.contains(activeElement)) {
      const focusFallback =
        document.getElementById("searchInput") ||
        document.getElementById("manholeId") ||
        document.body;

      if (focusFallback instanceof HTMLElement) {
        focusFallback.focus();
      }
    }

    if (modal) {
      modal.classList.remove("is-open");
      modal.setAttribute("aria-hidden", "true");
    }

    manholeFormState.pendingCartesian = null;
  }

  function getFormPayload() {
    if (!manholeFormState.pendingCartesian) {
      return null;
    }

    const manholeId = document.getElementById("manholeId")?.value.trim();
    const type = normalizeManholeType(document.getElementById("manholeType")?.value.trim());
    const diameter = Number(document.getElementById("manholeDiameter")?.value);
    const depth = Number(document.getElementById("manholeDepth")?.value);
    const material = document.getElementById("manholeMaterial")?.value.trim();
    const status = document.getElementById("manholeStatus")?.value.trim() || "Active";
    const description = document.getElementById("manholeDescription")?.value.trim();
    const installationDate = document.getElementById("manholeInstallationDate")?.value;

    const cartographic = Cesium.Cartographic.fromCartesian(manholeFormState.pendingCartesian);
    const longitude = Cesium.Math.toDegrees(cartographic.longitude);
    const latitude = Cesium.Math.toDegrees(cartographic.latitude);
    const height = cartographic.height || 0;

    if (!manholeId || !type || !Number.isFinite(diameter) || !Number.isFinite(depth) || !installationDate) {
      return null;
    }

    return {
      manholeId,
      type,
      diameter,
      depth,
      material,
      status,
      description,
      installationDate,
      position: {
        longitude,
        latitude,
        height,
      },
      x: manholeFormState.pendingCartesian.x,
      y: manholeFormState.pendingCartesian.y,
      z: manholeFormState.pendingCartesian.z,
    };
  }

  function resetManholeForm() {
    const form = document.getElementById("manholeForm");
    if (form) {
      form.reset();
    }
  }

  function toggleManholeCapture(active) {
    isManholeCaptureActive = Boolean(active);
    console.log("🚰 Manhole capture mode:", isManholeCaptureActive ? "ACTIVE" : "INACTIVE");

    const manholeToolBtn = document.getElementById("btnManholeTool");
    if (manholeToolBtn) {
      manholeToolBtn.classList.toggle("capture-active", isManholeCaptureActive);
      manholeToolBtn.title = isManholeCaptureActive ? "Manhole Tool (active)" : "Manhole Tool";
      manholeToolBtn.setAttribute("aria-label", isManholeCaptureActive ? "Manhole Tool active" : "Manhole Tool");
    }
  }

  function handleWorldClick(cartesianPosition) {
    console.log("🗺️ handleWorldClick called with position:", cartesianPosition);
    if (isManholeCaptureActive) {
      console.log("✅ Opening manhole form...");
      openManholeForm(cartesianPosition);
    } else {
      console.log("⚠️ Manhole capture not active");
    }
  }

  function setupEventListeners() {
    const submitBtn = document.getElementById("saveManholeBtn");
    if (submitBtn) {
      submitBtn.addEventListener("click", async () => {
        console.log("💾 Save Manhole button clicked");
        const payload = getFormPayload();
        if (!payload) {
          console.warn("⚠️ Form payload is invalid");
          alert("Please fill in all required fields");
          return;
        }

        console.log("💾 Payload ready:", payload);
        try {
          const response = await saveManholeToApi(payload);
          console.log("💾 API Response:", response);
          if (response.success) {
            alert("Manhole saved successfully!");
            addManholeToScene(response.manhole);
            resetManholeForm();
            closeManholeModal();
            toggleManholeCapture(false);
          } else {
            alert(`Error: ${response.message}`);
          }
        } catch (error) {
          console.error("❌ Error saving manhole:", error);
          alert("Failed to save manhole");
        }
      });
    } else {
      console.warn("⚠️ Save button not found");
    }

    const cancelBtn = document.getElementById("cancelManholeBtn");
    if (cancelBtn) {
      cancelBtn.addEventListener("click", () => {
        closeManholeModal();
        toggleManholeCapture(false);
      });
    }

    const manholeToolBtn = document.getElementById("btnManholeTool");
    if (manholeToolBtn) {
      console.log("✅ Manhole tool button found and listener attached");
      manholeToolBtn.addEventListener("click", () => {
        console.log("🚰 Manhole tool toggled:", !isManholeCaptureActive);
        toggleManholeCapture(!isManholeCaptureActive);
      });
    } else {
      console.warn("⚠️ Manhole tool button not found");
    }

    // Setup click handler for world clicks (after DOM is ready)
    setupWorldClickHandler();
  }

  function setupWorldClickHandler() {
    // Don't create our own click handler - instead, hook into the existing one
    // The pole_placement.js already has the global click handler set up
    // We'll expose a function that the main 7_main.js can call
    
    console.log("✅ Manhole click handler integration ready");
    console.log("   (Using existing Cesium click handler from pole_placement.js)");
  }

  // This function is called from the main click handler in 7_main.js
  window.handleManholeMapClick = function(cartesianPosition) {
    console.log("🚰 handleManholeMapClick called, active:", isManholeCaptureActive, "position:", cartesianPosition);
    if (isManholeCaptureActive && cartesianPosition) {
      console.log("✅ Manhole mode active - opening form");
      handleWorldClick(cartesianPosition);
    } else {
      console.log("⚠️ Skipped: active=", isManholeCaptureActive, "position=", cartesianPosition);
    }
  };

  // Expose global functions
  window.toggleManholeCapture = toggleManholeCapture;
  window.openManholeForm = openManholeForm;
  window.closeManholeModal = closeManholeModal;
  window.addManholeToScene = addManholeToScene;
  window.loadAllManholes = loadAllManholes;
  window.getManholeTypeLabel = (type) => {
    const typeKey = normalizeManholeType(type);
    return MANHOLE_TYPE_CONFIG[typeKey]?.label || "Manhole";
  };
  window.getManholeDataById = (id) => manholeDataIndex.get(id);
  window.ensureManholesLoaded = loadAllManholes;
  window.updateManholeVisibility = updateManholeVisibility;
  window.focusManholeById = focusManholeById;
  window.getManholeSuggestions = function (rawQuery, limit = 8) {
    const query = normalizeManholeSearchValue(rawQuery);
    if (!query) {
      return [];
    }

    const suggestions = [];
    manholeEntities.forEach((_entity, manholeId) => {
      const manholeData = manholeDataIndex.get(manholeId) || {};
      const searchableText = manholeSearchIndex.get(manholeId) || "";
      const normalizedBusinessId = normalizeManholeSearchValue(manholeData?.manholeId || "");

      if (searchableText.includes(query) || normalizedBusinessId.includes(query) || query.includes(normalizedBusinessId)) {
        suggestions.push({
          ...manholeData,
          _id: manholeId,
        });

        if (suggestions.length >= limit) {
          return;
        }
      }
    });

    return suggestions;
  };

  // Load all manholes when the module initializes
  document.addEventListener("DOMContentLoaded", () => {
    console.log("🚰 Manhole module initializing...");
    loadAllManholes();
    updateManholeVisibility("");
    setupEventListeners();
  });

  // Also try to initialize if DOM is already loaded
  if (document.readyState === "loading") {
    // DOM still loading, DOMContentLoaded event will fire
  } else {
    // DOM already loaded
    console.log("🚰 Manhole module initializing (DOM already loaded)...");
    loadAllManholes();
    updateManholeVisibility("");
    setupEventListeners();
  }
})();
