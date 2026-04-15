/* eslint-disable no-undef */
(function () {
  if (typeof THREE === "undefined") {
    return;
  }

  function createSceneManager() {
    const container = document.getElementById("pipelineThreePreview");
    if (!container) {
      return null;
    }

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x061226);

    const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 10000);
    camera.position.set(0, 28, 55);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    const ambient = new THREE.AmbientLight(0xffffff, 0.85);
    scene.add(ambient);

    const keyLight = new THREE.DirectionalLight(0x7ecbff, 0.6);
    keyLight.position.set(18, 30, 16);
    scene.add(keyLight);

    const grid = new THREE.GridHelper(120, 12, 0x2a5a8c, 0x173455);
    scene.add(grid);

    const lineGroup = new THREE.Group();
    lineGroup.name = "pipeline-lines";
    scene.add(lineGroup);

    function resizeRenderer() {
      const width = Math.max(240, container.clientWidth || 320);
      const height = Math.max(160, container.clientHeight || 190);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    }

    container.innerHTML = "";
    container.appendChild(renderer.domElement);
    resizeRenderer();

    function animate() {
      lineGroup.rotation.y += 0.003;
      renderer.render(scene, camera);
      window.requestAnimationFrame(animate);
    }

    animate();
    window.addEventListener("resize", resizeRenderer);

    function clearLines() {
      while (lineGroup.children.length) {
        const child = lineGroup.children[0];
        if (!child) {
          continue;
        }
        lineGroup.remove(child);
        child.geometry?.dispose?.();
        child.material?.dispose?.();
      }
    }

    return {
      scene,
      lineGroup,
      clearLines,
      addLine(line) {
        lineGroup.add(line);
      },
    };
  }

  function initializeSceneManager() {
    if (window.pipelineSceneManager) {
      return;
    }

    window.pipelineSceneManager = createSceneManager();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeSceneManager);
  } else {
    initializeSceneManager();
  }
})();
