const express = require("express");
const Pole = require("../models/Pole");

const router = express.Router();

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

router.post("/add-pole", async (req, res) => {
  try {
    const {
      poleNumber,
      type,
      voltage,
      poleHeight,
      wireHeading,
      installationDate,
      position,
      x,
      y,
      z,
    } = req.body;

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

    if (poleHeight !== undefined && !isFiniteNumber(poleHeight)) {
      return res.status(400).json({
        success: false,
        message: "poleHeight must be a valid number",
      });
    }

    if (wireHeading !== undefined && !isFiniteNumber(wireHeading)) {
      return res.status(400).json({
        success: false,
        message: "wireHeading must be a valid number",
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

    const payload = {
      poleNumber,
      type,
      voltage,
      poleHeight,
      wireHeading,
      installationDate: installationDate ? new Date(installationDate) : undefined,
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
    };

    const pole = await Pole.create(payload);

    return res.status(201).json({
      success: true,
      message: "Pole saved successfully",
      pole,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to save pole",
      error: error.message,
    });
  }
});

router.get("/get-poles", async (_req, res) => {
  try {
    const poles = await Pole.find().sort({ createdAt: 1 });

    return res.status(200).json({
      success: true,
      poles,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to fetch poles",
      error: error.message,
    });
  }
});

module.exports = router;
