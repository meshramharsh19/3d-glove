/* eslint-disable no-undef */
(function () {
  let areaHandler = null;
  let isAreaCaptureActive = false;
  let areaPointsCartesian = [];
  let areaPointEntities = [];
  let areaPolygonEntity = null;
  let areaOutlineEntity = null;

  function getViewer() {
    return typeof viewer !== "undefined" ? viewer : window.viewer;
  }

  function getPickCartesian(screenPosition) {
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

    return cartesian;
  }

  function cartesianToLonLat(cartesian) {
    const cartographic = Cesium.Cartographic.fromCartesian(cartesian);
    return {
      longitude: Cesium.Math.toDegrees(cartographic.longitude),
      latitude: Cesium.Math.toDegrees(cartographic.latitude),
      height: cartographic.height || 0,
    };
  }

  function normalizePolygon(points) {
    const cloned = points.map((point) => ({
      longitude: point.longitude,
      latitude: point.latitude,
    }));

    if (cloned.length > 2) {
      const first = cloned[0];
      const last = cloned[cloned.length - 1];
      if (first.longitude !== last.longitude || first.latitude !== last.latitude) {
        cloned.push({ ...first });
      }
    }

    return cloned;
  }

  function pointInPolygon(point, polygonPoints) {
    let inside = false;

    for (let i = 0, j = polygonPoints.length - 1; i < polygonPoints.length; j = i++) {
      const xi = polygonPoints[i].longitude;
      const yi = polygonPoints[i].latitude;
      const xj = polygonPoints[j].longitude;
      const yj = polygonPoints[j].latitude;

      const intersects =
        yi > point.latitude !== yj > point.latitude &&
        point.longitude < ((xj - xi) * (point.latitude - yi)) / ((yj - yi) || 1e-12) + xi;

      if (intersects) {
        inside = !inside;
      }
    }

    return inside;
  }

  function orientation(a, b, c) {
    const value = (b.latitude - a.latitude) * (c.longitude - b.longitude) -
      (b.longitude - a.longitude) * (c.latitude - b.latitude);

    if (Math.abs(value) < 1e-12) {
      return 0;
    }

    return value > 0 ? 1 : 2;
  }

  function onSegment(a, b, c) {
    return (
      Math.min(a.longitude, c.longitude) <= b.longitude &&
      b.longitude <= Math.max(a.longitude, c.longitude) &&
      Math.min(a.latitude, c.latitude) <= b.latitude &&
      b.latitude <= Math.max(a.latitude, c.latitude)
    );
  }

  function segmentsIntersect(p1, q1, p2, q2) {
    const o1 = orientation(p1, q1, p2);
    const o2 = orientation(p1, q1, q2);
    const o3 = orientation(p2, q2, p1);
    const o4 = orientation(p2, q2, q1);

    if (o1 !== o2 && o3 !== o4) {
      return true;
    }

    if (o1 === 0 && onSegment(p1, p2, q1)) return true;
    if (o2 === 0 && onSegment(p1, q2, q1)) return true;
    if (o3 === 0 && onSegment(p2, p1, q2)) return true;
    if (o4 === 0 && onSegment(p2, q1, q2)) return true;

    return false;
  }

  function lineIntersectsPolygon(linePoints, polygonPoints) {
    if (!Array.isArray(linePoints) || linePoints.length < 2 || polygonPoints.length < 3) {
      return false;
    }

    if (linePoints.some((point) => pointInPolygon(point, polygonPoints))) {
      return true;
    }

    for (let i = 0; i < linePoints.length - 1; i += 1) {
      const a = linePoints[i];
      const b = linePoints[i + 1];

      for (let j = 0; j < polygonPoints.length - 1; j += 1) {
        const c = polygonPoints[j];
        const d = polygonPoints[j + 1];

        if (segmentsIntersect(a, b, c, d)) {
          return true;
        }
      }
    }

    return false;
  }

  function calculateAreaSqMeters(pointsLonLat) {
    if (!Array.isArray(pointsLonLat) || pointsLonLat.length < 3) {
      return 0;
    }

    const cartographics = pointsLonLat.map((point) => ({
      longitude: Cesium.Math.toRadians(point.longitude),
      latitude: Cesium.Math.toRadians(point.latitude),
    }));

    let area = 0;
    for (let i = 0; i < cartographics.length; i += 1) {
      const p1 = cartographics[i];
      const p2 = cartographics[(i + 1) % cartographics.length];

      area += (p2.longitude - p1.longitude) * (2 + Math.sin(p1.latitude) + Math.sin(p2.latitude));
    }

    return Math.abs((area * 6378137 * 6378137) / 2);
  }

  function clearAreaSelection() {
    const cesiumViewer = getViewer();
    if (!cesiumViewer) {
      return;
    }

    if (areaPolygonEntity) {
      cesiumViewer.entities.remove(areaPolygonEntity);
      areaPolygonEntity = null;
    }

    if (areaOutlineEntity) {
      cesiumViewer.entities.remove(areaOutlineEntity);
      areaOutlineEntity = null;
    }

    areaPointEntities.forEach((entity) => cesiumViewer.entities.remove(entity));
    areaPointEntities = [];
    areaPointsCartesian = [];

    updateAreaActionButton();
  }

  function updateAreaActionButton() {
    const btn = document.getElementById("btnAreaReportAction");
    if (!btn) {
      return;
    }

    if (isAreaCaptureActive) {
      btn.classList.add("capture-active");
      btn.textContent = "✓";
      btn.title = `Finalize Area (${areaPointsCartesian.length} pts)`;
      btn.setAttribute("aria-label", "Finalize Area Selection");
      return;
    }

    btn.classList.remove("capture-active");
    if (areaPointsCartesian.length >= 3) {
      btn.textContent = "📄";
      btn.title = "Download Area Report";
      btn.setAttribute("aria-label", "Download Area Report");
      return;
    }

    btn.textContent = "⬠";
    btn.title = "Area Report: Start Selection";
    btn.setAttribute("aria-label", "Start Area Selection");
  }

  function drawAreaPreview(isClosed) {
    const cesiumViewer = getViewer();
    if (!cesiumViewer) {
      return;
    }

    if (areaOutlineEntity) {
      cesiumViewer.entities.remove(areaOutlineEntity);
      areaOutlineEntity = null;
    }

    if (areaPolygonEntity) {
      cesiumViewer.entities.remove(areaPolygonEntity);
      areaPolygonEntity = null;
    }

    if (areaPointsCartesian.length >= 2) {
      areaOutlineEntity = cesiumViewer.entities.add({
        polyline: {
          positions: isClosed
            ? [...areaPointsCartesian, areaPointsCartesian[0]]
            : areaPointsCartesian,
          width: 3,
          material: Cesium.Color.fromCssColorString("#00f5c5"),
          clampToGround: true,
        },
      });
    }

    if (isClosed && areaPointsCartesian.length >= 3) {
      areaPolygonEntity = cesiumViewer.entities.add({
        polygon: {
          hierarchy: areaPointsCartesian,
          material: Cesium.Color.fromCssColorString("#00f5c5").withAlpha(0.22),
          outline: true,
          outlineColor: Cesium.Color.fromCssColorString("#00f5c5"),
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          classificationType: Cesium.ClassificationType.TERRAIN,
        },
      });
    }
  }

  function addAreaPoint(cartesian) {
    const cesiumViewer = getViewer();
    if (!cesiumViewer) {
      return;
    }

    areaPointsCartesian.push(cartesian);
    const pointEntity = cesiumViewer.entities.add({
      position: cartesian,
      point: {
        pixelSize: 9,
        color: Cesium.Color.fromCssColorString("#00f5c5"),
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 1,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    });

    areaPointEntities.push(pointEntity);
    drawAreaPreview(false);
    updateAreaActionButton();
  }

  function setAreaCaptureActive(active) {
    isAreaCaptureActive = Boolean(active);
    updateAreaActionButton();

    if (isAreaCaptureActive) {
      alert("Area selection started. Left click points and double click to finish.");
    }
  }

  function ensureDataReady() {
    const tasks = [];

    if (typeof window.loadPoles === "function") {
      tasks.push(Promise.resolve(window.loadPoles()).catch(() => null));
    }

    if (typeof window.ensureManholesLoaded === "function") {
      tasks.push(Promise.resolve(window.ensureManholesLoaded()).catch(() => null));
    }

    if (typeof window.getAllSewagePipelines === "function") {
      tasks.push(Promise.resolve(window.getAllSewagePipelines()).catch(() => null));
    }

    return Promise.all(tasks);
  }

  function getPropertyPolygons() {
    const cesiumViewer = getViewer();
    if (!cesiumViewer || !housesDataSource || !housesDataSource.entities) {
      return [];
    }

    const currentTime = cesiumViewer.clock.currentTime;

    return housesDataSource.entities.values
      .filter((entity) => entity && entity.polygon)
      .map((entity) => {
        let positions = [];

        try {
          const hierarchy = entity.polygon.hierarchy?.getValue
            ? entity.polygon.hierarchy.getValue(currentTime)
            : entity.polygon.hierarchy;

          positions = hierarchy?.positions || [];
        } catch (_error) {
          positions = [];
        }

        const points = positions.map(cartesianToLonLat);
        const propertyData = typeof window.getCustomHouseData === "function"
          ? window.getCustomHouseData(entity)
          : null;

        return {
          entity,
          points,
          propertyData,
          propertyNumber: propertyData?.["Property Number"] ||
            propertyData?.propertyNumber ||
            entity?.name ||
            "Unknown",
          owner: propertyData?.["Name of the Property Owner"] || "N/A",
          usage: propertyData?.["Usage of Property"] || "N/A",
          address: propertyData?.["Address of Property"] || "N/A",
        };
      })
      .filter((item) => item.points.length >= 3);
  }

  function filterItemsByPolygon(areaPolygon) {
    const poles = typeof window.getAllPoleData === "function" ? window.getAllPoleData() : [];
    const manholes = typeof window.getAllManholeData === "function" ? window.getAllManholeData() : [];

    const properties = getPropertyPolygons().filter((property) => {
      if (!Array.isArray(property.points) || property.points.length < 3) {
        return false;
      }

      if (property.points.some((point) => pointInPolygon(point, areaPolygon))) {
        return true;
      }

      return lineIntersectsPolygon(property.points, areaPolygon);
    });

    const poleMatches = poles.filter((pole) => {
      const point = pole?.position;
      if (!point || !Number.isFinite(point.longitude) || !Number.isFinite(point.latitude)) {
        return false;
      }

      return pointInPolygon({ longitude: point.longitude, latitude: point.latitude }, areaPolygon);
    });

    const manholeMatches = manholes.filter((manhole) => {
      const point = manhole?.position;
      if (!point || !Number.isFinite(point.longitude) || !Number.isFinite(point.latitude)) {
        return false;
      }

      return pointInPolygon({ longitude: point.longitude, latitude: point.latitude }, areaPolygon);
    });

    return Promise.resolve(
      Promise.resolve(typeof window.getAllSewagePipelines === "function"
        ? window.getAllSewagePipelines()
        : [])
        .then((pipelines) => {
          const safePipelines = Array.isArray(pipelines) ? pipelines : [];

          const pipelineMatches = safePipelines.filter((pipeline) => {
            const points = Array.isArray(pipeline?.points)
              ? pipeline.points
                .filter((point) => Number.isFinite(point?.longitude) && Number.isFinite(point?.latitude))
                .map((point) => ({ longitude: point.longitude, latitude: point.latitude }))
              : [];

            return lineIntersectsPolygon(points, areaPolygon);
          });

          return {
            properties,
            poles: poleMatches,
            manholes: manholeMatches,
            pipelines: pipelineMatches,
          };
        })
    );
  }

  function formatDateForFilename() {
    const now = new Date();
    const yy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    const hh = String(now.getHours()).padStart(2, "0");
    const min = String(now.getMinutes()).padStart(2, "0");
    return `${yy}${mm}${dd}-${hh}${min}`;
  }

  function toTableRows(items, columns) {
    return items
      .map((item) => `
        <tr>
          ${columns
            .map((column) => `<td>${column.format(item)}</td>`)
            .join("")}
        </tr>
      `)
      .join("");
  }

  function buildDocHtml(report) {
    const areaKm2 = (report.areaSqM / 1000000).toFixed(4);

    const propertyRows = toTableRows(report.properties, [
      { format: (item) => item.propertyNumber || "N/A" },
      { format: (item) => item.owner || "N/A" },
      { format: (item) => item.usage || "N/A" },
      { format: (item) => item.address || "N/A" },
    ]);

    const poleRows = toTableRows(report.poles, [
      { format: (item) => item.poleNumber || "N/A" },
      { format: (item) => item.type || "N/A" },
      { format: (item) => item.voltage || "N/A" },
      { format: (item) => Number.isFinite(item.position?.latitude) ? item.position.latitude.toFixed(6) : "N/A" },
      { format: (item) => Number.isFinite(item.position?.longitude) ? item.position.longitude.toFixed(6) : "N/A" },
    ]);

    const manholeRows = toTableRows(report.manholes, [
      { format: (item) => item.manholeId || "N/A" },
      { format: (item) => item.type || "N/A" },
      { format: (item) => item.material || "N/A" },
      { format: (item) => Number.isFinite(item.position?.latitude) ? item.position.latitude.toFixed(6) : "N/A" },
      { format: (item) => Number.isFinite(item.position?.longitude) ? item.position.longitude.toFixed(6) : "N/A" },
    ]);

    const pipelineRows = toTableRows(report.pipelines, [
      { format: (item) => item.pipelineId || item._id || "N/A" },
      { format: (item) => item.diameter || "N/A" },
      { format: (item) => item.material || "N/A" },
      { format: (item) => item.status || "N/A" },
      { format: (item) => Array.isArray(item.points) ? item.points.length : 0 },
    ]);

    const boundaryRows = report.boundary
      .map((point, index) => `<tr><td>${index + 1}</td><td>${point.latitude.toFixed(6)}</td><td>${point.longitude.toFixed(6)}</td></tr>`)
      .join("");

    return `
      <html>
      <head>
        <meta charset="UTF-8" />
        <title>Selected Area Infrastructure Report</title>
        <style>
          body { font-family: Calibri, Arial, sans-serif; font-size: 12px; color: #1f2937; }
          h1 { font-size: 22px; margin-bottom: 8px; }
          h2 { font-size: 16px; margin-top: 22px; margin-bottom: 8px; color: #0f4c5c; }
          .meta { margin-bottom: 14px; }
          .summary-box { border: 1px solid #d6dce5; background: #f7fafc; padding: 10px; border-radius: 6px; }
          .summary-grid { width: 100%; border-collapse: collapse; margin-top: 6px; }
          .summary-grid td { border: 1px solid #d6dce5; padding: 6px; }
          table { width: 100%; border-collapse: collapse; margin-top: 8px; }
          th, td { border: 1px solid #cbd5e1; padding: 6px; text-align: left; }
          th { background: #edf2f7; }
          .muted { color: #6b7280; }
        </style>
      </head>
      <body>
        <h1>Selected Area Infrastructure Report</h1>
        <div class="meta">Generated on: ${new Date().toLocaleString()}</div>

        <div class="summary-box">
          <strong>Area Summary</strong>
          <table class="summary-grid">
            <tr><td>Total Area (sq.m)</td><td>${report.areaSqM.toFixed(2)}</td></tr>
            <tr><td>Total Area (sq.km)</td><td>${areaKm2}</td></tr>
            <tr><td>Properties</td><td>${report.properties.length}</td></tr>
            <tr><td>Poles</td><td>${report.poles.length}</td></tr>
            <tr><td>Pipelines</td><td>${report.pipelines.length}</td></tr>
            <tr><td>Manholes</td><td>${report.manholes.length}</td></tr>
          </table>
        </div>

        <h2>Boundary Coordinates</h2>
        <table>
          <thead><tr><th>#</th><th>Latitude</th><th>Longitude</th></tr></thead>
          <tbody>${boundaryRows || "<tr><td colspan='3'>No boundary points</td></tr>"}</tbody>
        </table>

        <h2>Properties Inside Area</h2>
        <table>
          <thead><tr><th>Property No.</th><th>Owner</th><th>Usage</th><th>Address</th></tr></thead>
          <tbody>${propertyRows || "<tr><td colspan='4'>No properties found</td></tr>"}</tbody>
        </table>

        <h2>Poles Inside Area</h2>
        <table>
          <thead><tr><th>Pole No.</th><th>Type</th><th>Voltage</th><th>Latitude</th><th>Longitude</th></tr></thead>
          <tbody>${poleRows || "<tr><td colspan='5'>No poles found</td></tr>"}</tbody>
        </table>

        <h2>Pipelines Crossing/Inside Area</h2>
        <table>
          <thead><tr><th>Pipeline ID</th><th>Diameter (mm)</th><th>Material</th><th>Status</th><th>Points</th></tr></thead>
          <tbody>${pipelineRows || "<tr><td colspan='5'>No pipelines found</td></tr>"}</tbody>
        </table>

        <h2>Manholes Inside Area</h2>
        <table>
          <thead><tr><th>Manhole ID</th><th>Type</th><th>Material</th><th>Latitude</th><th>Longitude</th></tr></thead>
          <tbody>${manholeRows || "<tr><td colspan='5'>No manholes found</td></tr>"}</tbody>
        </table>

        <p class="muted">This report is generated from map-visible survey datasets and spatial selection.</p>
      </body>
      </html>
    `;
  }

  function downloadPdf(report) {
    const jsPdfCtor = window.jspdf?.jsPDF;
    if (!jsPdfCtor) {
      throw new Error("PDF library not loaded");
    }

    const doc = new jsPdfCtor({ orientation: "p", unit: "pt", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 40;
    const lineGap = 16;
    let cursorY = margin;

    const addLine = (text = "", fontSize = 10, isBold = false) => {
      if (cursorY > pageHeight - margin) {
        doc.addPage();
        cursorY = margin;
      }

      doc.setFont("helvetica", isBold ? "bold" : "normal");
      doc.setFontSize(fontSize);
      const wrapped = doc.splitTextToSize(String(text), pageWidth - margin * 2);
      doc.text(wrapped, margin, cursorY);
      cursorY += wrapped.length * (lineGap - 2);
      cursorY += 4;
    };

    addLine("Selected Area Infrastructure Report", 16, true);
    addLine(`Generated on: ${new Date().toLocaleString()}`, 10, false);
    addLine("", 8, false);

    addLine("Area Summary", 12, true);
    addLine(`Total Area (sq.m): ${report.areaSqM.toFixed(2)}`);
    addLine(`Total Area (sq.km): ${(report.areaSqM / 1000000).toFixed(4)}`);
    addLine(`Properties: ${report.properties.length}`);
    addLine(`Poles: ${report.poles.length}`);
    addLine(`Pipelines: ${report.pipelines.length}`);
    addLine(`Manholes: ${report.manholes.length}`);
    addLine("", 8, false);

    addLine("Boundary Coordinates", 12, true);
    if (report.boundary.length === 0) {
      addLine("No boundary points found.");
    } else {
      report.boundary.forEach((point, index) => {
        addLine(`${index + 1}. Lat: ${point.latitude.toFixed(6)}, Lon: ${point.longitude.toFixed(6)}`);
      });
    }
    addLine("", 8, false);

    addLine("Properties Inside Area", 12, true);
    if (report.properties.length === 0) {
      addLine("No properties found.");
    } else {
      report.properties.forEach((item, index) => {
        addLine(`${index + 1}. ${item.propertyNumber || "N/A"} | ${item.owner || "N/A"} | ${item.usage || "N/A"}`);
      });
    }
    addLine("", 8, false);

    addLine("Poles Inside Area", 12, true);
    if (report.poles.length === 0) {
      addLine("No poles found.");
    } else {
      report.poles.forEach((item, index) => {
        const lat = Number.isFinite(item.position?.latitude) ? item.position.latitude.toFixed(6) : "N/A";
        const lon = Number.isFinite(item.position?.longitude) ? item.position.longitude.toFixed(6) : "N/A";
        addLine(`${index + 1}. ${item.poleNumber || "N/A"} | ${item.type || "N/A"} | ${item.voltage || "N/A"} | ${lat}, ${lon}`);
      });
    }
    addLine("", 8, false);

    addLine("Pipelines Crossing/Inside Area", 12, true);
    if (report.pipelines.length === 0) {
      addLine("No pipelines found.");
    } else {
      report.pipelines.forEach((item, index) => {
        addLine(`${index + 1}. ${item.pipelineId || item._id || "N/A"} | ${item.diameter || "N/A"}mm | ${item.material || "N/A"} | ${item.status || "N/A"}`);
      });
    }
    addLine("", 8, false);

    addLine("Manholes Inside Area", 12, true);
    if (report.manholes.length === 0) {
      addLine("No manholes found.");
    } else {
      report.manholes.forEach((item, index) => {
        const lat = Number.isFinite(item.position?.latitude) ? item.position.latitude.toFixed(6) : "N/A";
        const lon = Number.isFinite(item.position?.longitude) ? item.position.longitude.toFixed(6) : "N/A";
        addLine(`${index + 1}. ${item.manholeId || "N/A"} | ${item.type || "N/A"} | ${item.material || "N/A"} | ${lat}, ${lon}`);
      });
    }

    doc.save(`area-infra-report-${formatDateForFilename()}.pdf`);
  }

  async function exportSelectedAreaReport(options = {}) {
    const { closeAfterDownload = false } = options;

    if (areaPointsCartesian.length < 3) {
      alert("Please select an area first. Use Area Select and double click to complete polygon.");
      return;
    }

    await ensureDataReady();

    const areaPolygon = normalizePolygon(areaPointsCartesian.map(cartesianToLonLat));
    const selected = await filterItemsByPolygon(areaPolygon);

    const report = {
      boundary: areaPolygon.slice(0, -1),
      areaSqM: calculateAreaSqMeters(areaPolygon.slice(0, -1)),
      properties: selected.properties,
      poles: selected.poles,
      pipelines: selected.pipelines,
      manholes: selected.manholes,
    };

    downloadPdf(report);

    alert(
      `Report downloaded. Properties: ${report.properties.length}, Poles: ${report.poles.length}, Pipelines: ${report.pipelines.length}, Manholes: ${report.manholes.length}`
    );

    if (closeAfterDownload) {
      clearAreaSelection();
      setAreaCaptureActive(false);
    }
  }

  function initializeAreaHandler() {
    const cesiumViewer = getViewer();
    if (!cesiumViewer) {
      return;
    }

    areaHandler = new Cesium.ScreenSpaceEventHandler(cesiumViewer.scene.canvas);

    areaHandler.setInputAction((movement) => {
      if (!isAreaCaptureActive) {
        return;
      }

      const cartesian = getPickCartesian(movement.position);
      if (!cartesian) {
        return;
      }

      addAreaPoint(cartesian);
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    areaHandler.setInputAction(async () => {
      if (!isAreaCaptureActive || areaPointsCartesian.length < 3) {
        return;
      }

      drawAreaPreview(true);
      setAreaCaptureActive(false);

      try {
        await exportSelectedAreaReport({ closeAfterDownload: true });
      } catch (error) {
        console.error("Failed to auto-export area report", error);
        alert(error.message || "Failed to export selected area report");
      }
    }, Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK);
  }

  function bindUi() {
    const actionBtn = document.getElementById("btnAreaReportAction");

    actionBtn?.addEventListener("click", () => {
      if (isAreaCaptureActive) {
        if (areaPointsCartesian.length < 3) {
          alert("At least 3 points required to finalize area.");
          return;
        }

        drawAreaPreview(true);
        setAreaCaptureActive(false);
        alert("Area finalized. Click the same button again to download report.");
        return;
      }

      if (areaPointsCartesian.length >= 3) {
        exportSelectedAreaReport().catch((error) => {
          console.error("Failed to export area report", error);
          alert(error.message || "Failed to export selected area report");
        });
        return;
      }

      clearAreaSelection();
      setAreaCaptureActive(true);
    });

    updateAreaActionButton();
  }

  function initializeAreaReportTool() {
    initializeAreaHandler();
    bindUi();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeAreaReportTool);
  } else {
    initializeAreaReportTool();
  }

  window.clearAreaSelection = clearAreaSelection;
  window.exportSelectedAreaReport = exportSelectedAreaReport;
})();
