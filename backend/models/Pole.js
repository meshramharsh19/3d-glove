const mongoose = require("mongoose");

const POLE_TYPES = [
  "electric",
  "light",
  "communication",
  "traffic_signal",
  "cctv_surveillance",
];

function normalizePoleType(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s\/-]+/g, "_");

  if (normalized === "electric_pole" || normalized === "concrete") {
    return "electric";
  }

  if (normalized === "light_pole") {
    return "light";
  }

  if (normalized === "communication_pole") {
    return "communication";
  }

  if (normalized === "traffic_signal_pole") {
    return "traffic_signal";
  }

  if (
    normalized === "cctv_surveillance_pole" ||
    normalized === "cctv" ||
    normalized === "surveillance_pole"
  ) {
    return "cctv_surveillance";
  }

  if (POLE_TYPES.includes(normalized)) {
    return normalized;
  }

  return "electric";
}

const poleSchema = new mongoose.Schema({
  poleNumber: {
    type: String,
    trim: true,
  },
  type: {
    type: String,
    trim: true,
    enum: POLE_TYPES,
    default: "electric",
    set: normalizePoleType,
  },
  voltage: {
    type: String,
    trim: true,
  },
  poleHeight: {
    type: Number,
    min: 0,
  },
  wireHeading: {
    type: Number,
    min: 0,
    max: 360,
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
