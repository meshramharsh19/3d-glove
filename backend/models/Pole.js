const mongoose = require("mongoose");

const poleSchema = new mongoose.Schema({
  poleNumber: {
    type: String,
    trim: true,
  },
  type: {
    type: String,
    trim: true,
  },
  voltage: {
    type: String,
    trim: true,
  },
  poleHeight: {
    type: Number,
    min: 0,
  },
  installationDate: {
    type: Date,
  },
  position: {
    longitude: {
      type: Number,
      min: -180,
      max: 180,
    },
    latitude: {
      type: Number,
      min: -90,
      max: 90,
    },
    height: {
      type: Number,
      default: 0,
    },
  },
  // Legacy cartesian coordinates kept for backward compatibility.
  x: {
    type: Number,
  },
  y: {
    type: Number,
  },
  z: {
    type: Number,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("Pole", poleSchema);
