const express = require("express");
const SewagePipeline = require("../models/SewagePipeline");

const router = express.Router();

const ALLOWED_MATERIALS = ["PVC", "RCC", "HDPE"];
const ALLOWED_STATUSES = ["Planned", "Active", "Maintenance"];

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function validatePoints(points) {
  if (!Array.isArray(points) || points.length < 2) {
    return "points must be an array with at least 2 points";
  }

  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];
    const latitude = point?.latitude;
    const longitude = point?.longitude;
    const height = point?.height ?? 0;

    if (!isFiniteNumber(latitude) || latitude < -90 || latitude > 90) {
      return `points[${index}].latitude must be a valid latitude`;
    }

    if (!isFiniteNumber(longitude) || longitude < -180 || longitude > 180) {
      return `points[${index}].longitude must be a valid longitude`;
    }

    if (!isFiniteNumber(height)) {
      return `points[${index}].height must be a valid number`;
    }
  }

  return "";
}

router.post("/add", async (req, res) => {
  try {
    const { pipelineId, diameter, material, status, installationDate, points } = req.body;

    if (!pipelineId || !String(pipelineId).trim()) {
      return res.status(400).json({
        success: false,
        message: "pipelineId is required",
      });
    }

    if (!isFiniteNumber(diameter) || diameter <= 0) {
      return res.status(400).json({
        success: false,
        message: "diameter must be a valid number greater than 0",
      });
    }

    if (!ALLOWED_MATERIALS.includes(material)) {
      return res.status(400).json({
        success: false,
        message: `material must be one of: ${ALLOWED_MATERIALS.join(", ")}`,
      });
    }

    if (!ALLOWED_STATUSES.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `status must be one of: ${ALLOWED_STATUSES.join(", ")}`,
      });
    }

    const parsedDate = new Date(installationDate);
    if (!installationDate || Number.isNaN(parsedDate.getTime())) {
      return res.status(400).json({
        success: false,
        message: "installationDate must be a valid date",
      });
    }

    const pointValidationError = validatePoints(points);
    if (pointValidationError) {
      return res.status(400).json({
        success: false,
        message: pointValidationError,
      });
    }

    const payload = {
      pipelineId: String(pipelineId).trim(),
      diameter,
      material,
      status,
      installationDate: parsedDate,
      points: points.map((point) => ({
        latitude: point.latitude,
        longitude: point.longitude,
        height: point.height ?? 0,
      })),
    };

    const pipeline = await SewagePipeline.create(payload);

    return res.status(201).json({
      success: true,
      message: "Sewage pipeline saved successfully",
      pipeline,
    });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "pipelineId already exists",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Failed to save sewage pipeline",
      error: error.message,
    });
  }
});

router.get("/", async (_req, res) => {
  try {
    const pipelines = await SewagePipeline.find().sort({ createdAt: 1 });

    return res.status(200).json({
      success: true,
      pipelines,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to fetch sewage pipelines",
      error: error.message,
    });
  }
});

module.exports = router;
