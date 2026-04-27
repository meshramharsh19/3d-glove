const mongoose = require("mongoose");

const MANHOLE_TYPES = [
  "sewage",
  "water",
  "stormwater",
  "electrical",
  "communication",
  "gas",
];

function normalizeManholeType(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s\/-]+/g, "_");

  if (MANHOLE_TYPES.includes(normalized)) {
    return normalized;
  }

  return "sewage";
}

const manholeSchema = new mongoose.Schema({
  manholeId: {
    type: String,
    unique: true,
    sparse: true,
  },

  type: {
    type: String,
    enum: MANHOLE_TYPES,
    default: "sewage",
  },

  diameter: {
    type: Number,
    description: "Manhole diameter in meters",
  },

  depth: {
    type: Number,
    description: "Depth of manhole in meters",
  },

  material: {
    type: String,
    enum: ["concrete", "brick", "pvc", "hdpe", "other"],
  },

  status: {
    type: String,
    enum: ["Active", "Maintenance", "Closed", "Planned"],
    default: "Active",
  },

  position: {
    longitude: Number,
    latitude: Number,
    height: {
      type: Number,
      default: 0,
    },
  },

  // Legacy cartesian coordinates
  x: Number,
  y: Number,
  z: Number,

  description: String,

  installationDate: Date,

  lastInspectionDate: Date,

  notes: String,

  createdAt: {
    type: Date,
    default: Date.now,
  },

  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("Manhole", manholeSchema);
