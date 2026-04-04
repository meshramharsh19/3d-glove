const express = require("express");
const Pole = require("../models/Pole");

const router = express.Router();

router.post("/add-pole", async (req, res) => {
  try {
    const { x, y, z } = req.body;

    if ([x, y, z].some((value) => typeof value !== "number" || Number.isNaN(value))) {
      return res.status(400).json({
        success: false,
        message: "x, y, z must be valid numbers",
      });
    }

    const pole = await Pole.create({ x, y, z });

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
