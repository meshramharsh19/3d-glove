// File: js/3_utils.js
// Logic bilkul change nahi kiya hai.

// UTM to Lat/Long conversion function
function utmToLatLng(zone, easting, northing, northernHemisphere) {
  if (!northernHemisphere) {
    northing = 10000000 - northing;
  }

  var a = 6378137;
  var e = 0.081819191;
  var e1sq = 0.006739497;
  var k0 = 0.9996;

  var arc = northing / k0;
  var mu =
    arc /
    (a *
      (1 -
        Math.pow(e, 2) / 4.0 -
        (3 * Math.pow(e, 4)) / 64.0 -
        (5 * Math.pow(e, 6)) / 256.0));

  var ei =
    (1 - Math.pow(1 - e * e, 1 / 2.0)) / (1 + Math.pow(1 - e * e, 1 / 2.0));
  var ca = (3 * ei) / 2 - (27 * Math.pow(ei, 3)) / 32.0;
  var cb = (21 * Math.pow(ei, 2)) / 16 - (55 * Math.pow(ei, 4)) / 32;
  var cc = (151 * Math.pow(ei, 3)) / 96;
  var cd = (1097 * Math.pow(ei, 4)) / 512;

  var phi1 =
    mu +
    ca * Math.sin(2 * mu) +
    cb * Math.sin(4 * mu) +
    cc * Math.sin(6 * mu) +
    cd * Math.sin(8 * mu);

  var n0 = a / Math.pow(1 - Math.pow(e * Math.sin(phi1), 2), 1 / 2.0);
  var r0 =
    (a * (1 - e * e)) / Math.pow(1 - Math.pow(e * Math.sin(phi1), 2), 3 / 2.0);

  var fact1 = (n0 * Math.tan(phi1)) / r0;
  var _a1 = 500000 - easting;
  var dd0 = _a1 / (n0 * k0);

  var fact2 = (dd0 * dd0) / 2;
  var t0 = Math.pow(Math.tan(phi1), 2);
  var Q0 = e1sq * Math.pow(Math.cos(phi1), 2);

  var fact3 =
    ((5 + 3 * t0 + 10 * Q0 - 4 * Q0 * Q0 - 9 * e1sq) * Math.pow(dd0, 4)) / 24;
  var fact4 =
    ((61 + 90 * t0 + 298 * Q0 + 45 * t0 * t0 - 252 * e1sq - 3 * Q0 * Q0) *
      Math.pow(dd0, 6)) /
    720;

  var lof1 = _a1 / (n0 * k0);
  var lof2 = ((1 + 2 * t0 + Q0) * Math.pow(dd0, 3)) / 6.0;
  var lof3 =
    ((5 -
      2 * Q0 +
      28 * t0 -
      3 * Math.pow(Q0, 2) +
      8 * e1sq +
      24 * Math.pow(t0, 2)) *
      Math.pow(dd0, 5)) /
    120;

  var _a2 = (lof1 - lof2 + lof3) / Math.cos(phi1);
  var _a3 = (_a2 * 180) / Math.PI;

  var latitude = (180 * (phi1 - fact1 * (fact2 + fact3 + fact4))) / Math.PI;

  if (!northernHemisphere) {
    latitude = -latitude;
  }

  var longitude = ((zone > 0 && 6 * zone - 183.0) || 3.0) - _a3;

  return { latitude: latitude, longitude: longitude };
}

function findFileByExtension(files, extension) {
  const ext = extension.toLowerCase();
  return Object.keys(files).find((fileName) =>
    fileName.toLowerCase().endsWith(ext)
  );
}

function findMtlForObj(objFileName, files) {
  const baseName = objFileName.replace(/\.obj$/i, "");
  const exactMatch = baseName + ".mtl";
  if (files[exactMatch]) return exactMatch;

  const baseNameLower = baseName.toLowerCase();
  return Object.keys(files).find((fileName) => {
    const fileNameLower = fileName.toLowerCase();
    return fileNameLower === baseNameLower + ".mtl";
  });
}

function createTextureUrlCache() {
  textureUrlCache = {};
  const textureFiles = Object.entries(uploadedFiles).filter(
    ([fileName, file]) =>
      /\.(jpg|jpeg|png|bmp|tga|tif|tiff)$/i.test(fileName)
  );

  debugLog(
    `Creating texture cache for ${textureFiles.length} texture files`
  );

  textureFiles.forEach(([fileName, file]) => {
    const blobUrl = URL.createObjectURL(file);
    const baseName = fileName.toLowerCase();
    const nameWithoutExt = baseName.replace(/\.[^.]+$/, "");

    textureUrlCache[baseName] = blobUrl;
    textureUrlCache[nameWithoutExt] = blobUrl;

    const materialMatch = fileName.match(/material(\d+)_map_K[da]/i);
    if (materialMatch) {
      const materialId = materialMatch[1];
      textureUrlCache[`material${materialId}`] = blobUrl;
      textureUrlCache[`material${materialId}_map_kd`] = blobUrl;
      textureUrlCache[`material${materialId}_map_kd.png`] = blobUrl;
    }

    debugLog(`Cached texture: ${fileName}`, {
      blobUrl: blobUrl.substring(0, 50) + "...",
      materialId: materialMatch ? materialMatch[1] : "none",
    });
  });

  debugLog("Texture cache created", Object.keys(textureUrlCache));
}

function resolveTextureUrl(requestedUrl) {
  debugLog(`Resolving texture: ${requestedUrl}`);

  const fileName = requestedUrl.split(/[/\\]/).pop();
  const fileNameLower = fileName.toLowerCase();
  const nameWithoutExt = fileNameLower.replace(/\.[^.]+$/, "");

  if (textureUrlCache[fileNameLower]) {
    debugLog(`✓ Exact match found: ${fileName}`);
    return textureUrlCache[fileNameLower];
  }

  if (textureUrlCache[nameWithoutExt]) {
    debugLog(`✓ Match without extension: ${nameWithoutExt}`);
    return textureUrlCache[nameWithoutExt];
  }

  const materialMatch = fileName.match(/material(\d+)/i);
  if (materialMatch) {
    const materialId = materialMatch[1];
    const materialKey = `material${materialId}`;

    if (textureUrlCache[materialKey]) {
      debugLog(`✓ Material ID match: ${materialKey}`);
      return textureUrlCache[materialKey];
    }
  }

  const availableTextures = Object.keys(textureUrlCache);
  for (let cachedName of availableTextures) {
    if (
      fileNameLower.includes(cachedName) ||
      cachedName.includes(fileNameLower)
    ) {
      debugLog(`✓ Fuzzy match found: ${cachedName} for ${fileName}`);
      return textureUrlCache[cachedName];
    }

    if (fileNameLower.length > 5 && cachedName.length > 5) {
      for (let i = 0; i <= fileNameLower.length - 5; i++) {
        const substring = fileNameLower.substring(i, i + 5);
        if (cachedName.includes(substring)) {
          debugLog(
            `✓ Substring match found: ${cachedName} for ${fileName} (${substring})`
          );
          return textureUrlCache[cachedName];
        }
      }
    }
  }

  debugLog(`✗ No texture match found for: ${fileName}`);
  debugLog(`Available textures:`, availableTextures);

  return requestedUrl;
}

function debounce(func, wait) {
  let timeout;
  return function (...args) {
    const context = this;
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(context, args), wait);
  };
}