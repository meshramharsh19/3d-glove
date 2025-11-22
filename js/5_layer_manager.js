/* eslint-disable no-undef */
// File: js/5_layer_manager.js
// Logic bilkul change nahi kiya hai.
// Yahaan 'ptaxDatabase' variable 'ptax_data.js' se seedha access ho jaayega.

// KMZ Layer toggle functions
function toggleLayer(layerType) {
  const checkbox = document.getElementById(`${layerType}Toggle`);
  const isChecked = checkbox.checked;

  if (layerType === "model") {
    if (modelEntity) {
      modelEntity.show = isChecked;
    }
  } else if (layerType === "roads") {
    if (roadsDataSource) {
      roadsDataSource.show = isChecked;
    }
  } else if (layerType === "houses") {
    if (housesDataSource) {
      housesDataSource.show = isChecked;
    }
  }
}

// Alternative KMZ loading function using JSZip to manually extract KML
async function loadKMZAlternative(url) {
  try {
    console.log(`Fetching KMZ from: ${url}`);
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    console.log(`KMZ fetched, size: ${arrayBuffer.byteLength} bytes`);

    // Use JSZip to extract the KMZ (which is a ZIP file)
    const zip = await JSZip.loadAsync(arrayBuffer);
    console.log("KMZ unzipped, files:", Object.keys(zip.files));

    // Find the KML file (usually doc.kml or the first .kml file)
    let kmlFile = null;
    for (const filename in zip.files) {
      if (filename.toLowerCase().endsWith(".kml")) {
        kmlFile = zip.files[filename];
        console.log(`Found KML file: ${filename}`);
        break;
      }
    }

    if (!kmlFile) {
      throw new Error("No KML file found in KMZ archive");
    }

    // Extract the KML content as text
    const kmlText = await kmlFile.async("text");
    console.log(`KML extracted, length: ${kmlText.length} characters`);

    // Create a blob URL for the KML content
    const kmlBlob = new Blob([kmlText], {
      type: "application/vnd.google-earth.kml+xml",
    });
    const kmlBlobUrl = URL.createObjectURL(kmlBlob);

    // Load the KML using Cesium (KML doesn't need workers for decompression)
    const dataSource = await Cesium.KmlDataSource.load(kmlBlobUrl, {
      camera: viewer.scene.camera,
      canvas: viewer.scene.canvas,
      clampToGround: true,
    });

    // Clean up blob URL
    URL.revokeObjectURL(kmlBlobUrl);

    console.log(`✓ KMZ loaded successfully from ${url}`);
    return dataSource;
  } catch (error) {
    console.error(`Failed to load KMZ with JSZip method:`, error);
    throw error;
  }
}

// --- START: NEW FEATURE HELPER FUNCTION ---
// This function now reads from the global ptaxDatabase variable
function getCustomHouseData(id) {
  // ptaxDatabase global variable 'ptax_data.js' se aa raha hai
  // YEH AB 100% KAAM KAREGA
  if (ptaxDatabase && ptaxDatabase[id]) {
    return ptaxDatabase[id];
  }
  // Agar ID nahi mila toh null return karein
  return null;
}
// --- END: NEW FEATURE HELPER FUNCTION ---

// Load KMZ layers
function loadKMZLayers() {
  showLoading("Loading KMZ layers...");
  updateProgress(10);

  console.log("=== Loading KMZ files with JSZip (no workers needed) ===");
  console.log("Current page URL:", window.location.href);

  const roadsPromise = loadKMZAlternative("./paths.kmz").catch(
    (error) => {
      console.error("Roads KMZ load error:", error);
      throw new Error(`Roads KMZ failed: ${error.message}`);
    }
  );

  const housesPromise = loadKMZAlternative("./HOUSES polygon.kmz").catch(
    (error) => {
      console.error("Houses KMZ load error:", error);
      throw new Error(`Houses KMZ failed: ${error.message}`);
    }
  );

  updateProgress(30);

  Promise.all([roadsPromise, housesPromise])
    .then(([roadsData, housesData]) => {
      roadsDataSource = roadsData;
      housesDataSource = housesData;

      updateProgress(60);

      // --- START: NEW FEATURE - CUSTOM INFOBOX LOGIC ---
      console.log("Customizing house info popups...");

      // Fields ka order aur labels define karein
      const fieldMap = [
        { key: "Property Number", label: "Property ID" },
        { key: "Name of the Property Owner", label: "Owner Name" },
        { key: "Usage of Property", label: "Usage" },
        { key: "Carpet/Built-up area (Sq.M)", label: "Area" },
        { key: "Nature of Property", label: "Nature" },
        { key: "Age of Building", label: "Building Age" },
        { key: "Year of Construction", label: "Year Built" },
        { key: "Number of Floors", label: "Floors" },
        {
          key: "Floor wise type of construction",
          label: "Construction",
        },
        { key: "Shop No., Office No. Etc.", label: "Unit No." },
        { key: "Telephone / Mobile Number", label: "Mobile" },
        { key: "e-mail-id", label: "Email" },
        { key: "Address of Property", label: "Address" },
        { key: "Postal Pin code of Property", label: "Pincode" },
        { key: "UID number of Property Owner", label: "Owner UID" },
        { key: "Type of Owner", label: "Owner Type" },
        { key: "Name of Occupier & Tenant", label: "Occupier" },
        { key: "UID number of Occupier", label: "Occupier UID" },
        { key: "Category of Property", label: "Category" },
        { key: "Assessment year", label: "Assessment Year" },
        { key: "Old Assessment Value", label: "Old Value" },
        { key: "Old Assessment Year", label: "Old Year" },
        { key: "Latitude", label: "Latitude" },
        { key: "Longitude", label: "Longitude" },
        { key: "Photograph of Building", label: "Photo" },
      ];

      const houseEntities = housesDataSource.entities.values;
      for (let i = 0; i < houseEntities.length; i++) {
        const entity = houseEntities[i];
        if (Cesium.defined(entity.polygon)) {
          const originalKmzName = entity.name;
          const houseInfo = getCustomHouseData(originalKmzName); // Use original name to get data
          let descriptionHtml = "";

          if (houseInfo) {
            // Data mila! Dynamic table banayein.
            let tableRows = "";

            fieldMap.forEach((field) => {
              if (houseInfo.hasOwnProperty(field.key)) {
                let value = houseInfo[field.key];

                // Kuch fields ke liye special formatting
                if (field.key === "Photograph of Building" && value) {
                  value = `<a href="${value}" target="_blank">View Photo</a>`;
                } else if (field.key === "e-mail-id" && value) {
                  value = `<a href="mailto:${value}">${value}</a>`;
                } else if (field.key === "Carpet/Built-up area (Sq.M)") {
                  value = `${value} Sq.M`;
                } else if (value === null || value === "") {
                  value = "N/A";
                }

                tableRows += `
                        <tr>
                            <td>${field.label}</td>
                            <td>${value}</td>
                        </tr>
                    `;
              }
            });

            descriptionHtml = `
                        <div class="ptax-infobox">
                            <h3>Property Details (${houseInfo["Property Number"]})</h3>
                            <div class="table-container">
                                <table class="property-table">
                                    ${tableRows}
                                </table>
                            </div>
                        </div>
                    `;
          } else {
            // Is ID ke liye data nahi mila
            descriptionHtml = `
                        <div class="ptax-infobox">
                            <h3>Property Details</h3>
                            <p style="color: #e74c3c; font-weight: bold;">
                                No detailed records found for house ID: ${originalKmzName}
                            </p>
                        </div>
                    `;
          }

          // Entity description ko naye HTML se set karein
          entity.description = descriptionHtml;

          // Geometry ko adjust karein (jaisa pehle tha)
          entity.polygon.heightReference =
            Cesium.HeightReference.RELATIVE_TO_GROUND;
          entity.polygon.height = 3.0;
          entity.polygon.extrudedHeight = 15.0;
          entity.polygon.outline = true;
          entity.polygon.outlineColor = Cesium.Color.BLACK;
          entity.polygon.outlineWidth = 2.0;
        }
      }
      console.log(`${houseEntities.length} house popups customized.`);
      // --- END: NEW FEATURE ---

      // Adjust roads height slightly above ground to stack properly
      const roadEntities = roadsDataSource.entities.values;
      for (let i = 0; i < roadEntities.length; i++) {
        const entity = roadEntities[i];

        if (Cesium.defined(entity.polyline)) {
          entity.polyline.clampToGround = false;
          // Set a small offset above the ground to ensure visibility over the 3D model
          const positions = entity.polyline.positions.getValue(
            Cesium.JulianDate.now()
          );
          const updatedPositions = [];
          for (let j = 0; j < positions.length; j++) {
            const cartographic = Cesium.Cartographic.fromCartesian(
              positions[j]
            );
            cartographic.height = 1.0; // Raise polyline 1 meter above terrain/model
            updatedPositions.push(
              Cesium.Cartesian3.fromRadians(
                cartographic.longitude,
                cartographic.latitude,
                cartographic.height
              )
            );
          }
          entity.polyline.positions = updatedPositions;
        }

        if (Cesium.defined(entity.polygon)) {
          entity.polygon.heightReference =
            Cesium.HeightReference.RELATIVE_TO_GROUND;
          entity.polygon.height = 1.0;
        }
      }

      updateProgress(80);

      // Initially hide layers
      roadsDataSource.show = false;
      housesDataSource.show = false;

      // Add to viewer
      viewer.dataSources.add(roadsDataSource);
      viewer.dataSources.add(housesDataSource);

      updateProgress(100);

      // Update UI status
      document.getElementById("roadsStatus").textContent = "Loaded";
      document.getElementById("roadsStatus").className =
        "layer-status status-loaded";

      document.getElementById("housesStatus").textContent = "Loaded";
      document.getElementById("housesStatus").className =
        "layer-status status-loaded";

      console.log("✓ KMZ layers loaded successfully");
      console.log(`  - Roads: ${roadEntities.length} entities`);
      console.log(`  - Houses: ${houseEntities.length} entities`);

      hideLoading();
    })
    .catch((error) => {
      console.error("=== KMZ Loading Error Details ===");
      console.error("Error message:", error.message);
      console.error("Error stack:", error.stack);
      console.error("Full error:", error);

      document.getElementById("roadsStatus").textContent = "Error";
      document.getElementById("roadsStatus").className =
        "layer-status status-error";

      document.getElementById("housesStatus").textContent = "Error";
      document.getElementById("housesStatus").className =
        "layer-status status-error";

      hideLoading();

      let errorMsg = "Error loading KMZ files.\n\n";
      errorMsg += "Possible issues:\n";
      errorMsg +=
        "1. Check file names are exactly: 'paths.kmz' and 'HOUSES polygon.kmz'\n";
      errorMsg +=
        "2. Files must be in the same directory as index.html\n";
      errorMsg += "3. Check browser console for detailed errors\n\n";
      errorMsg += "Error details: " + error.message;

      alert(errorMsg);
    });
}