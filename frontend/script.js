Cesium.Ion.defaultAccessToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiI5NDUyNzI0NS0xNzZmLTQ4ZDctYWY3MC1jMmY1MzQxZTc3NjkiLCJpZCI6MjY2NDUwLCJpYXQiOjE3MzkyNTQ2OTF9.ms2EiPBrQb7no-Hk3OX1haugWxAl6bYpbWhj-SH8aXA";

        const viewer = new Cesium.Viewer("cesiumContainer", {
            imageryProvider: new Cesium.UrlTemplateImageryProvider({
                url: "https://a.tile.openstreetmap.org/{z}/{x}/{y}.png",
            }),
            terrainProvider: Cesium.createWorldTerrain(),
            scene3DOnly: false,
            shouldAnimate: true,
            shadows: false,
            sceneMode: Cesium.SceneMode.SCENE3D
        });

        // Disable default double-click behavior
        viewer.cesiumWidget.screenSpaceEventHandler.removeInputAction(Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK);

        let modelEntity = null;
        let uploadedFiles = {};
        let textureUrlCache = {};
        let debugMode = true;
        let currentModelUrl = null;
        let worker = null;
        let workerBusy = false;
        let memoryCheckInterval = null;

        // Show loading overlay
        function showLoading(message) {
            document.getElementById('loading-text').textContent = message;
            document.getElementById('loading-overlay').style.display = 'flex';
            document.getElementById('memory-warning').style.display =
                navigator.deviceMemory < 4 ? 'block' : 'none';

            // Start memory monitoring
            if (!memoryCheckInterval) {
                memoryCheckInterval = setInterval(() => {
                    const memory = performance.memory;
                    if (memory) {
                        const usedMB = Math.round(memory.usedJSHeapSize / 1048576);
                        const totalMB = Math.round(memory.totalJSHeapSize / 1048576);
                        document.getElementById('debug-text').innerHTML += `Memory: ${usedMB}MB / ${totalMB}MB<br>`;
                    }
                }, 2000);
            }
        }

        // Hide loading overlay
        function hideLoading() {
            document.getElementById('loading-overlay').style.display = 'none';
            if (memoryCheckInterval) {
                clearInterval(memoryCheckInterval);
                memoryCheckInterval = null;
            }
        }

        // Update progress bar
        function updateProgress(percent) {
            document.getElementById('progress-fill').style.width = `${percent}%`;
        }

        // Optimize memory by clearing cached data
        function optimizeMemory() {
            // Clear texture cache
            for (const url in textureUrlCache) {
                URL.revokeObjectURL(textureUrlCache[url]);
            }
            textureUrlCache = {};

            // Clear uploaded files cache
            uploadedFiles = {};

            // Clear model URL
            if (currentModelUrl) {
                URL.revokeObjectURL(currentModelUrl);
                currentModelUrl = null;
            }

            // Clear worker if exists
            if (worker) {
                worker.terminate();
                worker = null;
            }

            // Clear debug info
            document.getElementById('debug-text').innerHTML = '';
            document.getElementById('status-text').innerHTML = 'Memory optimized';

            console.log('Memory optimized');
        }

        // Debug logging function
        function debugLog(message, data = null) {
            if (debugMode) {
                console.log(message, data || '');
                updateDebugInfo();
            }
        }

        function updateDebugInfo() {
            const debugElement = document.getElementById('debug-info');
            const debugText = document.getElementById('debug-text');

            let info = `Uploaded files: ${Object.keys(uploadedFiles).length}<br>`;
            info += `Texture cache: ${Object.keys(textureUrlCache).length}<br>`;
            info += `Available textures: ${Object.keys(uploadedFiles).filter(name =>
                /\.(jpg|jpeg|png|bmp|tga|tif|tiff)$/i.test(name)).join(', ')}<br>`;

            debugText.innerHTML = info;
            debugElement.style.display = 'block';
        }

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
            var mu = arc / (a * (1 - Math.pow(e, 2) / 4.0 - (3 * Math.pow(e, 4)) / 64.0 - (5 * Math.pow(e, 6)) / 256.0));

            var ei = (1 - Math.pow(1 - e * e, 1 / 2.0)) / (1 + Math.pow(1 - e * e, 1 / 2.0));
            var ca = (3 * ei) / 2 - (27 * Math.pow(ei, 3)) / 32.0;
            var cb = (21 * Math.pow(ei, 2)) / 16 - (55 * Math.pow(ei, 4)) / 32;
            var cc = (151 * Math.pow(ei, 3)) / 96;
            var cd = (1097 * Math.pow(ei, 4)) / 512;

            var phi1 = mu + ca * Math.sin(2 * mu) + cb * Math.sin(4 * mu) + cc * Math.sin(6 * mu) + cd * Math.sin(8 * mu);

            var n0 = a / Math.pow(1 - Math.pow(e * Math.sin(phi1), 2), 1 / 2.0);
            var r0 = (a * (1 - e * e)) / Math.pow(1 - Math.pow(e * Math.sin(phi1), 2), 3 / 2.0);

            var fact1 = (n0 * Math.tan(phi1)) / r0;
            var _a1 = 500000 - easting;
            var dd0 = _a1 / (n0 * k0);

            var fact2 = (dd0 * dd0) / 2;
            var t0 = Math.pow(Math.tan(phi1), 2);
            var Q0 = e1sq * Math.pow(Math.cos(phi1), 2);

            var fact3 = ((5 + 3 * t0 + 10 * Q0 - 4 * Q0 * Q0 - 9 * e1sq) * Math.pow(dd0, 4)) / 24;
            var fact4 = ((61 + 90 * t0 + 298 * Q0 + 45 * t0 * t0 - 252 * e1sq - 3 * Q0 * Q0) * Math.pow(dd0, 6)) / 720;

            var lof1 = _a1 / (n0 * k0);
            var lof2 = ((1 + 2 * t0 + Q0) * Math.pow(dd0, 3)) / 6.0;
            var lof3 = ((5 - 2 * Q0 + 28 * t0 - 3 * Math.pow(Q0, 2) + 8 * e1sq + 24 * Math.pow(t0, 2)) * Math.pow(dd0, 5)) / 120;

            var _a2 = (lof1 - lof2 + lof3) / Math.cos(phi1);
            var _a3 = (_a2 * 180) / Math.PI;

            var latitude = (180 * (phi1 - fact1 * (fact2 + fact3 + fact4))) / Math.PI;

            if (!northernHemisphere) {
                latitude = -latitude;
            }

            var longitude = ((zone > 0 && 6 * zone - 183.0) || 3.0) - _a3;

            return {
                latitude: latitude,
                longitude: longitude,
            };
        }

        // Helper function to find file by extension (case-insensitive)
        function findFileByExtension(files, extension) {
            const ext = extension.toLowerCase();
            return Object.keys(files).find((fileName) => fileName.toLowerCase().endsWith(ext));
        }

        // Helper function to find MTL file for OBJ
        function findMtlForObj(objFileName, files) {
            const baseName = objFileName.replace(/\.obj$/i, "");
            const exactMatch = baseName + ".mtl";
            if (files[exactMatch]) {
                return exactMatch;
            }

            const baseNameLower = baseName.toLowerCase();
            return Object.keys(files).find((fileName) => {
                const fileNameLower = fileName.toLowerCase();
                return fileNameLower === baseNameLower + ".mtl";
            });
        }

        // Enhanced texture URL cache creation with better matching
        function createTextureUrlCache() {
            textureUrlCache = {};
            const textureFiles = Object.entries(uploadedFiles).filter(([fileName, file]) =>
                /\.(jpg|jpeg|png|bmp|tga|tif|tiff)$/i.test(fileName)
            );

            debugLog(`Creating texture cache for ${textureFiles.length} texture files`);

            textureFiles.forEach(([fileName, file]) => {
                const blobUrl = URL.createObjectURL(file);
                const baseName = fileName.toLowerCase();
                const nameWithoutExt = baseName.replace(/\.[^.]+$/, '');

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
                    blobUrl: blobUrl.substring(0, 50) + '...',
                    materialId: materialMatch ? materialMatch[1] : 'none'
                });
            });

            debugLog('Texture cache created', Object.keys(textureUrlCache));
        }

        // Enhanced texture URL resolver
        function resolveTextureUrl(requestedUrl) {
            debugLog(`Resolving texture: ${requestedUrl}`);

            const fileName = requestedUrl.split(/[/\\]/).pop();
            const fileNameLower = fileName.toLowerCase();
            const nameWithoutExt = fileNameLower.replace(/\.[^.]+$/, '');

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
                if (fileNameLower.includes(cachedName) || cachedName.includes(fileNameLower)) {
                    debugLog(`✓ Fuzzy match found: ${cachedName} for ${fileName}`);
                    return textureUrlCache[cachedName];
                }

                if (fileNameLower.length > 5 && cachedName.length > 5) {
                    for (let i = 0; i <= fileNameLower.length - 5; i++) {
                        const substring = fileNameLower.substring(i, i + 5);
                        if (cachedName.includes(substring)) {
                            debugLog(`✓ Substring match found: ${cachedName} for ${fileName} (${substring})`);
                            return textureUrlCache[cachedName];
                        }
                    }
                }
            }

            debugLog(`✗ No texture match found for: ${fileName}`);
            debugLog(`Available textures:`, availableTextures);

            return requestedUrl;
        }

        // Update file status display
        function updateFileStatus() {
            const statusElement = document.getElementById("status-text");
            const fileNames = Object.keys(uploadedFiles);

            if (fileNames.length === 0) {
                statusElement.innerHTML = "No files uploaded";
                return;
            }

            let statusHtml = `<strong>Uploaded (${fileNames.length} files):</strong><br>`;

            const objFiles = fileNames.filter((name) => name.toLowerCase().endsWith(".obj"));
            const mtlFiles = fileNames.filter((name) => name.toLowerCase().endsWith(".mtl"));
            const glbFiles = fileNames.filter((name) => name.toLowerCase().endsWith(".glb"));
            const gltfFiles = fileNames.filter((name) => name.toLowerCase().endsWith(".gltf"));
            const textureFiles = fileNames.filter((name) =>
                /\.(jpg|jpeg|png|bmp|tga|tif|tiff)$/i.test(name)
            );

            if (glbFiles.length > 0) {
                statusHtml += `<span class="file-found">✓ ${glbFiles.length} GLB file(s)</span><br>`;
            }

            if (gltfFiles.length > 0) {
                statusHtml += `<span class="file-found">✓ ${gltfFiles.length} GLTF file(s)</span><br>`;
            }

            if (objFiles.length > 0) {
                statusHtml += `<span class="file-found">✓ ${objFiles.length} OBJ file(s)</span><br>`;

                objFiles.forEach((objFile) => {
                    const mtlFile = findMtlForObj(objFile, uploadedFiles);
                    if (mtlFile) {
                        statusHtml += `<span class="file-found">✓ MTL found: ${mtlFile}</span><br>`;
                    } else {
                        statusHtml += `<span class="file-missing">✗ No MTL for: ${objFile}</span><br>`;
                    }
                });
            }

            if (mtlFiles.length > 0) {
                statusHtml += `<span class="file-found">✓ ${mtlFiles.length} MTL file(s)</span><br>`;
            }

            if (textureFiles.length > 0) {
                statusHtml += `<span class="file-found">✓ ${textureFiles.length} texture(s)</span><br>`;

                textureFiles.forEach(fileName => {
                    const materialMatch = fileName.match(/material(\d+)/i);
                    if (materialMatch) {
                        statusHtml += `<small>- Material ${materialMatch[1]}: ${fileName}</small><br>`;
                    }
                });
            }

            statusHtml += "<br><small>Files: " + fileNames.join(", ") + "</small>";

            statusElement.innerHTML = statusHtml;
        }

        // File input handlers
        const fileInput = document.getElementById("fileInput");
        const uploadInput = document.getElementById("modelUpload");

        // Location file handler
        fileInput.addEventListener("change", () => {
            const file = fileInput.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    const fileContent = e.target.result;
                    const dataArray = fileContent.split(/\s+/);

                    const zone = parseInt(dataArray[2], 10);
                    const easting = parseFloat(dataArray[3]);
                    const northing = parseFloat(dataArray[4]);
                    const northernHemisphere = true;

                    const latLng = utmToLatLng(zone, easting, northing, northernHemisphere);

                    document.getElementById("latitude").value = latLng.latitude.toFixed(6);
                    document.getElementById("longitude").value = latLng.longitude.toFixed(6);
                    updateModelPosition();
                };
                reader.readAsText(file);
            }
        });

        // Model upload handler
        uploadInput.addEventListener("change", (event) => {
            const files = Array.from(event.target.files);

            // Show loading overlay
            showLoading(`Processing ${files.length} files...`);
            updateProgress(5);

            // Clear previous model if exists
            if (modelEntity) {
                viewer.entities.remove(modelEntity);
                modelEntity = null;
            }

            // Clear previous uploaded files
            uploadedFiles = {};

            // Process files in batches
            setTimeout(() => {
                files.forEach((file) => {
                    uploadedFiles[file.name] = file;
                });

                debugLog("Files uploaded", Object.keys(uploadedFiles));
                updateProgress(30);
                createTextureUrlCache();
                updateFileStatus();
                updateProgress(50);

                const glbFile = findFileByExtension(uploadedFiles, ".glb");
                const gltfFile = findFileByExtension(uploadedFiles, ".gltf");
                const objFileName = findFileByExtension(uploadedFiles, ".obj");
                const daeFile = findFileByExtension(uploadedFiles, ".dae");

                if (glbFile) {
                    handleGenericModelFile(uploadedFiles[glbFile]);
                } else if (gltfFile) {
                    handleGenericModelFile(uploadedFiles[gltfFile]);
                } else if (objFileName) {
                    handleObjFile(uploadedFiles[objFileName]);
                } else if (daeFile) {
                    handleGenericModelFile(uploadedFiles[daeFile]);
                }

                updateProgress(90);
            }, 100);
        });

        function handleObjFile(objFile) {
            const objReader = new FileReader();

            objReader.onload = function (e) {
                const objContent = e.target.result;
                const mtlFileName = findMtlForObj(objFile.name, uploadedFiles);

                if (mtlFileName) {
                    debugLog("Found MTL file", mtlFileName);
                    loadObjWithMtl(objContent, uploadedFiles[mtlFileName], objFile.name);
                } else {
                    debugLog("No MTL file found, loading OBJ only");
                    loadObjOnly(objContent, objFile.name);
                }
            };

            objReader.readAsText(objFile);
        }

        function loadObjWithMtl(objContent, mtlFile, objFileName) {
            const mtlReader = new FileReader();

            mtlReader.onload = function (e) {
                const mtlContent = e.target.result;
                debugLog("MTL content loaded", `Length: ${mtlContent.length}`);

                try {
                    const manager = new THREE.LoadingManager();
                    manager.setURLModifier((url) => resolveTextureUrl(url));

                    const mtlLoader = new THREE.MTLLoader(manager);
                    const materials = mtlLoader.parse(mtlContent, "");
                    materials.preload();

                    debugLog("Materials loaded", Object.keys(materials.materials));

                    const objLoader = new THREE.OBJLoader(manager);
                    objLoader.setMaterials(materials);

                    const object = objLoader.parse(objContent);

                    object.traverse((child) => {
                        if (child.isMesh) {
                            debugLog(`Mesh found: ${child.name}`, {
                                material: child.material ? child.material.type : 'none',
                                hasTexture: !!(child.material && child.material.map)
                            });

                            if (child.material) {
                                if (child.material.map) {
                                    child.material.needsUpdate = true;
                                    debugLog(`Texture applied to mesh: ${child.name}`);
                                }

                                child.material.side = THREE.DoubleSide;
                                if (child.material.transparent === undefined) {
                                    child.material.transparent = false;
                                }
                            }
                        }
                    });

                    convertAndAddToCesium(object, objFileName);
                } catch (error) {
                    console.error("Error loading MTL file:", error);
                    loadObjOnly(objContent, objFileName);
                }
            };

            mtlReader.readAsText(mtlFile);
        }

        function loadObjOnly(objContent, objFileName) {
            try {
                const objLoader = new THREE.OBJLoader();
                const object = objLoader.parse(objContent);

                object.traverse((child) => {
                    if (child.isMesh) {
                        child.material = new THREE.MeshLambertMaterial({
                            color: 0x888888,
                            side: THREE.DoubleSide,
                        });
                    }
                });

                convertAndAddToCesium(object, objFileName);
            } catch (error) {
                console.error("Error loading OBJ file:", error);
                alert("Error loading OBJ file. Please check the file format.");
            }
        }

        function convertAndAddToCesium(object, fileName) {
            if (modelEntity) {
                viewer.entities.remove(modelEntity);
            }

            const scene = new THREE.Scene();
            scene.add(object);

            const ambientLight = new THREE.AmbientLight(0x404040, 0.8);
            scene.add(ambientLight);

            const directionalLight1 = new THREE.DirectionalLight(0xffffff, 1.0);
            directionalLight1.position.set(1, 1, 1);
            scene.add(directionalLight1);

            const directionalLight2 = new THREE.DirectionalLight(0xffffff, 0.6);
            directionalLight2.position.set(-1, -1, -1);
            scene.add(directionalLight2);

            const exporter = new THREE.GLTFExporter();
            exporter.parse(
                scene,
                function (gltf) {
                    let modelUrl;

                    if (gltf instanceof ArrayBuffer) {
                        modelUrl = URL.createObjectURL(
                            new Blob([gltf], { type: "model/gltf-binary" })
                        );
                    } else {
                        modelUrl = URL.createObjectURL(
                            new Blob([JSON.stringify(gltf)], { type: "model/gltf+json" })
                        );
                    }

                    addModelToCesium(modelUrl, fileName);
                },
                {
                    binary: true,
                    embedImages: true,
                    includeCustomExtensions: false,
                    animations: [],
                    maxTextureSize: 4096,
                    forcePowerOfTwoTextures: false,
                    truncateDrawRange: false,
                }
            );
        }

        // Enhanced GLB model handling with proper ground clamping
        function addModelToCesium(modelUrl, fileName) {
            // Clean up previous model URL if exists
            if (currentModelUrl) {
                URL.revokeObjectURL(currentModelUrl);
            }
            currentModelUrl = modelUrl;

            const longitude = parseFloat(document.getElementById("longitude").value);
            const latitude = parseFloat(document.getElementById("latitude").value);
            const height = 0; // Set height to 0 for ground clamping

            console.log(`Positioning model at: ${latitude}, ${longitude}, height: ${height}`);

            // Create position
            const position = Cesium.Cartesian3.fromDegrees(longitude, latitude, height);

            const hpr = new Cesium.HeadingPitchRoll(
                Cesium.Math.toRadians(parseFloat(document.getElementById("heading").value || 0)),
                Cesium.Math.toRadians(parseFloat(document.getElementById("pitch").value || 0)),
                Cesium.Math.toRadians(parseFloat(document.getElementById("roll").value || 0))
            );

            // Add heightReference to clamp model to ground
            modelEntity = viewer.entities.add({
                name: fileName,
                position: position,
                heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
                orientation: Cesium.Transforms.headingPitchRollQuaternion(position, hpr),
                model: {
                    uri: modelUrl,
                    scale: parseFloat(document.getElementById("scale").value || 1.0),
                    minimumPixelSize: 128,
                    maximumScale: 20000,
                    allowPicking: true,
                    show: true,
                    heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
                    shadows: Cesium.ShadowMode.ENABLED,
                    imageBasedLightingFactor: new Cesium.Cartesian2(1.0, 1.0),
                    colorBlendMode: Cesium.ColorBlendMode.HIGHLIGHT,
                    colorBlendAmount: 0.5
                },
            });

            // Enhanced camera positioning for ground-level models
            const cameraOffset = new Cesium.HeadingPitchRange(
                Cesium.Math.toRadians(0),
                Cesium.Math.toRadians(-15),
                1000
            );

            // Set camera to look at model from optimal angle
            viewer.trackedEntity = modelEntity;

            // Wait for terrain to load, then adjust camera
            setTimeout(() => {
                viewer.zoomTo(modelEntity, cameraOffset).then(() => {
                    console.log("Model positioned and camera adjusted");
                });
            }, 1000);

            // Hide loading overlay
            setTimeout(hideLoading, 500);

            console.log("GLB Model added to Cesium with ground clamping:", fileName);
        }

        // Generic model file handler with terrain awareness
        function handleGenericModelFile(file) {
            console.log(`Loading ${file.name} with terrain clamping`);

            // Use blob URL directly without converting to base64
            const modelUrl = URL.createObjectURL(file);

            // For GLB files, ensure height is set to 0 for ground clamping
            if (file.name.toLowerCase().endsWith('.glb')) {
                document.getElementById("height").value = "0";
                console.log("GLB file detected - height set to 0 for ground clamping");
            }

            addModelToCesium(modelUrl, file.name);
        }

        // Update functions with enhanced terrain awareness
        function updateModelOrientation() {
            if (modelEntity) {
                const position = modelEntity.position.getValue();
                const heading = Cesium.Math.toRadians(parseFloat(document.getElementById("heading").value || 0));
                const pitch = Cesium.Math.toRadians(parseFloat(document.getElementById("pitch").value || 0));
                const roll = Cesium.Math.toRadians(parseFloat(document.getElementById("roll").value || 0));

                const hpr = new Cesium.HeadingPitchRoll(heading, pitch, roll);
                const orientation = Cesium.Transforms.headingPitchRollQuaternion(position, hpr);
                modelEntity.orientation = orientation;
            }
        }

        function updateModelPosition() {
            if (modelEntity) {
                const longitude = parseFloat(document.getElementById("longitude").value);
                const latitude = parseFloat(document.getElementById("latitude").value);
                const height = 0; // Set height to 0 for ground clamping

                const position = Cesium.Cartesian3.fromDegrees(longitude, latitude, height);
                modelEntity.position = position;

                const hpr = new Cesium.HeadingPitchRoll(
                    Cesium.Math.toRadians(parseFloat(document.getElementById("heading").value || 0)),
                    Cesium.Math.toRadians(parseFloat(document.getElementById("pitch").value || 0)),
                    Cesium.Math.toRadians(parseFloat(document.getElementById("roll").value || 0))
                );

                modelEntity.orientation = Cesium.Transforms.headingPitchRollQuaternion(position, hpr);

                // Enhanced zoom with terrain consideration
                const cameraOffset = new Cesium.HeadingPitchRange(
                    Cesium.Math.toRadians(0),
                    Cesium.Math.toRadians(-15),
                    1000
                );

                viewer.zoomTo(modelEntity, cameraOffset);

                console.log(`Model repositioned to: ${latitude}, ${longitude}, height: ${height}`);
            }
        }

        // Reset to ground level with proper terrain clamping
        function resetToGroundLevel() {
            document.getElementById("height").value = "0";
            updateModelPosition();
            console.log("Model height reset to ground level (0)");
        }

        function centerOnModel() {
            if (modelEntity) {
                const cameraOffset = new Cesium.HeadingPitchRange(
                    Cesium.Math.toRadians(0),
                    Cesium.Math.toRadians(-15),
                    1000
                );
                viewer.zoomTo(modelEntity, cameraOffset);
            }
        }

        // Debounce function to limit the rate at which a function can fire
        function debounce(func, wait) {
            let timeout;
            return function(...args) {
                const context = this;
                clearTimeout(timeout);
                timeout = setTimeout(() => func.apply(context, args), wait);
            };
        }

        // Event listeners with debounce
        document.getElementById("heading").addEventListener("input", debounce(updateModelOrientation, 300));
        document.getElementById("pitch").addEventListener("input", debounce(updateModelOrientation, 300));
        document.getElementById("roll").addEventListener("input", debounce(updateModelOrientation, 300));
        document.getElementById("longitude").addEventListener("input", debounce(updateModelPosition, 300));
        document.getElementById("latitude").addEventListener("input", debounce(updateModelPosition, 300));
        document.getElementById("height").addEventListener("input", debounce(updateModelPosition, 300));
        document.getElementById("scale").addEventListener("input", debounce(() => {
            if (modelEntity) {
                modelEntity.model.scale = parseFloat(document.getElementById("scale").value || 1.0);
            }
        }, 300));

        // Clean up on page unload
        window.addEventListener('beforeunload', function() {
            // Revoke texture URLs
            for (const url in textureUrlCache) {
                URL.revokeObjectURL(textureUrlCache[url]);
            }

            // Revoke model URL
            if (currentModelUrl) {
                URL.revokeObjectURL(currentModelUrl);
            }
        });

        console.log("Optimized 3D Model Viewer initialized");