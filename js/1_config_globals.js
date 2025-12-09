/* eslint-disable no-undef */
// File: js/1_config_globals.js
// Logic bilkul change nahi kiya hai.

// Configure Cesium to handle CORS issues with KMZ files
Cesium.Ion.defaultAccessToken =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiI5NDUyNzI0NS0xNzZmLTQ4ZDctYWY3MC1jMmY1MzQxZTc3NjkiLCJpZCI6MjY2NDUwLCJpYXQiOjE3MzkyNTQ2OTF9.ms2EiPBrQb7no-Hk3OX1haugWxAl6bYpbWhj-SH8aXA";

// CRITICAL: Set base URL to avoid CORS issues with workers
window.CESIUM_BASE_URL =
  "https://cesium.com/downloads/cesiumjs/releases/1.104/Build/Cesium/";

const viewer = new Cesium.Viewer("cesiumContainer", {
  baseLayer: Cesium.ImageryLayer.fromProviderAsync(
    Cesium.IonImageryProvider.fromAssetId(2, {
      accessToken: Cesium.Ion.defaultAccessToken,
    })
  ),
  terrainProvider: Cesium.createWorldTerrain(),
  scene3DOnly: false,
  shouldAnimate: true,
  shadows: false,
  sceneMode: Cesium.SceneMode.SCENE3D,
});

// CRITICAL: Enable depth testing against terrain to prevent z-fighting
viewer.scene.globe.depthTestAgainstTerrain = true;

// Disable default double-click behavior
viewer.cesiumWidget.screenSpaceEventHandler.removeInputAction(
  Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK
);

let modelEntity = null;
let roadsDataSource = null;
let housesDataSource = null;
let uploadedFiles = {};
let textureUrlCache = {};
let debugMode = true;
let currentModelUrl = null;
let memoryCheckInterval = null;
let searchPinEntity = null;
const pinBuilder = new Cesium.PinBuilder();