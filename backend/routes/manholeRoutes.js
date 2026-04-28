const express = require("express");
const Manhole = require("../models/Manhole");

const router = express.Router();

const MANHOLE_TYPE_LABELS = {
  sewage: "Sewage Manhole",
  water: "Water Manhole",
  stormwater: "Stormwater Manhole",
  electrical: "Electrical Manhole",
  communication: "Communication Manhole",
  gas: "Gas Manhole",
};

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function normalizeManholeType(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s\/-]+/g, "_");

  if (Object.prototype.hasOwnProperty.call(MANHOLE_TYPE_LABELS, normalized)) {
    return normalized;
  }

  return "sewage";
}

router.post("/add-manhole", async (req, res) => {
  try {
    const {
      manholeId,
      type,
      diameter,
      depth,
      material,
      status,
      position,
      x,
      y,
      z,
      description,
      installationDate,
      lastInspectionDate,
      notes,
    } = req.body;

    if (!manholeId || typeof manholeId !== "string" || !manholeId.trim()) {
      return res.status(400).json({
        success: false,
        message: "Manhole ID is required",
      });
    }

    const normalizedType = normalizeManholeType(type);

    const hasGeodeticPosition =
      position &&
      isFiniteNumber(position.longitude) &&
      isFiniteNumber(position.latitude) &&
      isFiniteNumber(position.height ?? 0);

    const hasLegacyCartesian = [x, y, z].every(isFiniteNumber);

    if (!hasGeodeticPosition && !hasLegacyCartesian) {
      return res.status(400).json({
        success: false,
        message:
          "Provide either position.longitude/latitude/height or legacy x, y, z coordinates",
      });
    }

    if (diameter !== undefined && !isFiniteNumber(diameter)) {
      return res.status(400).json({
        success: false,
        message: "diameter must be a valid number",
      });
    }

    if (depth !== undefined && !isFiniteNumber(depth)) {
      return res.status(400).json({
        success: false,
        message: "depth must be a valid number",
      });
    }

    if (installationDate) {
      const parsedDate = new Date(installationDate);
      if (Number.isNaN(parsedDate.getTime())) {
        return res.status(400).json({
          success: false,
          message: "installationDate must be a valid date",
        });
      }
    }

    if (lastInspectionDate) {
      const parsedDate = new Date(lastInspectionDate);
      if (Number.isNaN(parsedDate.getTime())) {
        return res.status(400).json({
          success: false,
          message: "lastInspectionDate must be a valid date",
        });
      }
    }

    const payload = {
      manholeId,
      type: normalizedType,
      diameter,
      depth,
      material,
      status,
      description,
      notes,
      position: hasGeodeticPosition
        ? {
            longitude: position.longitude,
            latitude: position.latitude,
            height: position.height ?? 0,
          }
        : undefined,
      x: hasLegacyCartesian ? x : undefined,
      y: hasLegacyCartesian ? y : undefined,
      z: hasLegacyCartesian ? z : undefined,
      installationDate: installationDate ? new Date(installationDate) : undefined,
      lastInspectionDate: lastInspectionDate
        ? new Date(lastInspectionDate)
        : undefined,
    };

    const manhole = await Manhole.create(payload);

    return res.status(201).json({
      success: true,
      message: "Manhole saved successfully",
      manhole,
    });
  } catch (error) {
    if (error && error.code === 11000) {
      const duplicateField = Object.keys(error.keyPattern || {})[0] || "manholeId";
      const duplicateValue = error.keyValue?.[duplicateField] ?? "unknown";

      return res.status(409).json({
        success: false,
        message: `Manhole with ID "${duplicateValue}" already exists. Please use a different ID.`,
        error: "DUPLICATE_ID",
        field: duplicateField,
        value: duplicateValue,
      });
    }

    return res.status(500).json({
      success: false,
      message: "Failed to save manhole",
      error: error.message,
    });
  }
});

router.get("/get-manholes", async (_req, res) => {
  try {
    const manholes = await Manhole.find().sort({ createdAt: 1 });

    return res.status(200).json({
      success: true,
      manholes,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to fetch manholes",
      error: error.message,
    });
  }
});

router.get("/get-manhole/:id", async (req, res) => {
  try {
    const manhole = await Manhole.findById(req.params.id);

    if (!manhole) {
      return res.status(404).json({
        success: false,
        message: "Manhole not found",
      });
    }

    return res.status(200).json({
      success: true,
      manhole,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to fetch manhole",
      error: error.message,
    });
  }
});

router.put("/update-manhole/:id", async (req, res) => {
  try {
    const manhole = await Manhole.findByIdAndUpdate(
      req.params.id,
      { ...req.body, updatedAt: new Date() },
      { new: true }
    );

    if (!manhole) {
      return res.status(404).json({
        success: false,
        message: "Manhole not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Manhole updated successfully",
      manhole,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to update manhole",
      error: error.message,
    });
  }
});

router.delete("/delete-manhole/:id", async (req, res) => {
  try {
    const manhole = await Manhole.findByIdAndDelete(req.params.id);

    if (!manhole) {
      return res.status(404).json({
        success: false,
        message: "Manhole not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Manhole deleted successfully",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to delete manhole",
      error: error.message,
    });
  }
});

module.exports = router;
