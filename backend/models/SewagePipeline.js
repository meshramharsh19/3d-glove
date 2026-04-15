const mongoose = require("mongoose");

const ALLOWED_MATERIALS = ["PVC", "RCC", "HDPE"];
const ALLOWED_STATUSES = ["Planned", "Active", "Maintenance"];

const pipelinePointSchema = new mongoose.Schema(
  {
    latitude: {
      type: Number,
      required: true,
      min: -90,
      max: 90,
    },
    longitude: {
      type: Number,
      required: true,
      min: -180,
      max: 180,
    },
    height: {
      type: Number,
      default: 0,
    },
  },
  { _id: false }
);

const sewagePipelineSchema = new mongoose.Schema(
  {
    pipelineId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    diameter: {
      type: Number,
      required: true,
      min: 1,
    },
    material: {
      type: String,
      required: true,
      enum: ALLOWED_MATERIALS,
      trim: true,
    },
    status: {
      type: String,
      required: true,
      enum: ALLOWED_STATUSES,
      trim: true,
    },
    installationDate: {
      type: Date,
      required: true,
    },
    points: {
      type: [pipelinePointSchema],
      validate: {
        validator(points) {
          return Array.isArray(points) && points.length >= 2;
        },
        message: "A pipeline must contain at least 2 points",
      },
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("SewagePipeline", sewagePipelineSchema);
