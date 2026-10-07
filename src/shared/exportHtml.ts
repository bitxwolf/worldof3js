import type { SceneGraph } from './schema/sceneGraph.schema';

/**
 * Patterns that must never appear in code embedded into standalone HTML exports.
 * If any match, the code is stripped entirely and only static scene objects render.
 */
export const EXPORT_BLOCKED_PATTERNS: ReadonlyArray<RegExp> = [
  // Constructor chain escape
  /\.constructor\b/,
  /\b__proto__\b/,
  /\bprototype\b/,
  /\bgetPrototypeOf\b/,
  /\bReflect\b/,
  /\bProxy\b/,
  // DOM / globals
  /\bdocument\b/,
  /\bwindow\b/,
  /\bglobalThis\b/,
  // Network
  /\bfetch\s*\(/,
  /\bXMLHttpRequest\b/,
  /\bWebSocket\b/,
  /\bimportScripts\b/,
  // Eval / code generation
  /\beval\s*\(/,
  /\bFunction\s*\(/,
  // Module / require
  /\bimport\s+/,
  /\bimport\s*\(/,
  /\brequire\s*\(/,
  // Storage
  /\blocalStorage\b/,
  /\bsessionStorage\b/,
  // Bracket notation to dangerous props
  /\[\s*['"`](?:constructor|__proto__|prototype|window|document|globalThis|eval|Function|fetch)\b/,
];

/**
 * Validate code for export safety. Returns the code if safe, empty string if dangerous.
 * Strips comments and string literals before checking to avoid false positives.
 */
export function validateExportCode(code: string | undefined): string {
  if (!code || typeof code !== 'string' || !code.trim()) return '';

  // Strip string literals and comments before pattern matching
  const stripped = code
    .replace(/\/\/.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/'(?:[^'\\]|\\.)*'/g, '""')
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/`(?:[^`\\]|\\.)*`/g, '""');

  for (const pattern of EXPORT_BLOCKED_PATTERNS) {
    if (pattern.test(stripped)) {
      return '';
    }
  }
  return code;
}

export function escapeHtml(str: unknown): string {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Generates a self-contained, standalone HTML world that runs directly in any modern browser.
 * Zero external installation required; Three.js loaded via CDN.
 */
export function generateStandaloneHtml(graph: SceneGraph & { code?: string }): string {
  const worldName = graph?.world?.name || 'World';
  const worldDesc = graph?.world?.description || 'An interactive 3D world created with Orbis.';
  const serializedGraph = JSON.stringify(graph).replace(/<\/script>/gi, '<\\/script>');
  const safeCode = validateExportCode(graph.code);

  const biome = graph?.world?.biome || 'forest';
  const groundColorHex =
    biome === 'forest' ? '0x2d4a22' :
    biome === 'desert' ? '0xd2b48c' :
    biome === 'urban' ? '0x334155' :
    biome === 'dungeon' ? '0x1e293b' :
    biome === 'tundra' ? '0xe2e8f0' :
    biome === 'canyon' ? '0x9a3412' :
    '0x3f3f46';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' https://cdnjs.cloudflare.com; style-src 'unsafe-inline'; img-src * data: blob:; connect-src 'none'; form-action 'none'; frame-ancestors 'none'; base-uri 'none'; object-src 'none';">
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(worldName)} - Orbis Standalone</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; overflow: hidden; background: #000; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    #canvas-container { width: 100vw; height: 100vh; display: block; }
    #overlay { position: absolute; top: 16px; left: 16px; color: #fff; background: rgba(10, 10, 20, 0.75); backdrop-filter: blur(8px); padding: 14px 18px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.15); max-width: 320px; pointer-events: none; }
    #overlay h2 { margin: 0 0 6px 0; font-size: 16px; font-weight: 600; color: #a5b4fc; }
    #overlay p { margin: 0; font-size: 12px; color: #94a3b8; line-height: 1.4; }
    #instructions { position: absolute; bottom: 20px; left: 50%; transform: translateX(-50%); background: rgba(0,0,0,0.7); backdrop-filter: blur(6px); color: #e2e8f0; padding: 8px 16px; border-radius: 20px; font-size: 11px; border: 1px solid rgba(255,255,255,0.1); pointer-events: none; }
    #crosshair { position: absolute; top: 50%; left: 50%; width: 6px; height: 6px; background: rgba(255,255,255,0.7); border-radius: 50%; transform: translate(-50%, -50%); pointer-events: none; }
    #dialogue { display: none; position: absolute; bottom: 60px; left: 50%; transform: translateX(-50%); background: rgba(15, 23, 42, 0.95); border: 1px solid #6366f1; border-radius: 12px; padding: 16px 20px; color: #fff; max-width: 480px; width: 90%; font-size: 13px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); }
    #dialogue-speaker { font-weight: bold; color: #34d399; margin-bottom: 4px; }
  </style>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/0.160.0/three.min.js"></script>
</head>
<body>
  <div id="overlay">
    <h2>${escapeHtml(worldName)}</h2>
    <p>${escapeHtml(worldDesc)}</p>
  </div>
  <div id="instructions">Click to explore · WASD move · Mouse look · Click NPC to talk · Esc to exit</div>
  <div id="crosshair"></div>
  <div id="dialogue">
    <div id="dialogue-speaker">NPC</div>
    <div id="dialogue-text">...</div>
  </div>

  <script>
    const graph = ${serializedGraph};
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(graph.skybox?.topColor || 0x111827);
    if (graph.atmosphere?.fogDensity) {
      scene.fog = new THREE.FogExp2(graph.atmosphere.fogColor || 0x1a1a2e, graph.atmosphere.fogDensity);
    }

    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    const startPos = graph.player?.spawn || graph.player?.startPosition || [0, 1.7, 5];
    camera.position.set(startPos[0], startPos[1] || 1.7, startPos[2]);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    document.body.appendChild(renderer.domElement);

    // Ambient light
    const ambient = new THREE.AmbientLight(0xffffff, graph.atmosphere?.ambientIntensity || 0.6);
    scene.add(ambient);

    // Sun light
    const sun = new THREE.DirectionalLight(0xfff4e0, 1.0);
    sun.position.set(40, 60, 20);
    sun.castShadow = true;
    scene.add(sun);

    // Ground plane
    const groundGeo = new THREE.PlaneGeometry(300, 300);
    const groundMat = new THREE.MeshStandardMaterial({ color: ${groundColorHex}, roughness: 0.9 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    // Procedural asset helpers – fallback stubs for standalone HTML export
    const assets = {
      textures: new Map(),
      helpers: {
        createTree: (x, z) => {
          const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 1.5, 6), new THREE.MeshStandardMaterial({ color: 0x8B4513 }));
          const crown = new THREE.Mesh(new THREE.ConeGeometry(1.0, 2.5, 6), new THREE.MeshStandardMaterial({ color: 0x2d6a4f }));
          trunk.position.set(x, 0.75, z); crown.position.set(x, 2.75, z);
          scene.add(trunk); scene.add(crown);
        },
        createRock: (x, z) => {
          const m = new THREE.Mesh(new THREE.DodecahedronGeometry(0.5 + Math.random() * 0.4, 0), new THREE.MeshStandardMaterial({ color: 0x808080, roughness: 0.9 }));
          m.position.set(x, 0.3, z); scene.add(m);
        },
        createRockCluster: (x, z) => { for (let i = 0; i < 3; i++) assets.helpers.createRock(x + (Math.random() - 0.5) * 2, z + (Math.random() - 0.5) * 2); },
        createBuilding: (x, z) => {
          const m = new THREE.Mesh(new THREE.BoxGeometry(4, 5, 4), new THREE.MeshStandardMaterial({ color: 0x64748b }));
          m.position.set(x, 2.5, z); scene.add(m);
        },
        createWater: (x, z) => {
          const m = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), new THREE.MeshStandardMaterial({ color: 0x1e90ff, transparent: true, opacity: 0.7 }));
          m.rotation.x = -Math.PI / 2; m.position.set(x, 0.05, z); scene.add(m);
        },
        createGrassField: () => {},
        createTorch: () => {},
        createWell: () => {},
        createPath: () => {},
        scatter: (count, r1, r2, fn) => {
          for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const r = r1 + Math.random() * (r2 - r1);
            fn(Math.cos(angle) * r, Math.sin(angle) * r, i);
          }
        }
      }
    };

    // Generated Scene Code execution
    try {
      ${(() => {
        if (!safeCode) return '// [Scene code omitted]';
        const trimmed = safeCode.trim();
        if (/^function\s*\(/.test(trimmed)) {
          return `(${trimmed.replace(/<\/script>/gi, '<\\/script>')})(scene, THREE, assets);`;
        }
        return `(new Function('scene', 'THREE', 'assets', ${JSON.stringify(safeCode)}))(scene, THREE, assets);`;
      })()}
    } catch(e) {
      console.warn('Scene code execution error:', e);
    }

    // Objects
    const interactables = [];
    if (graph.objects) {
      graph.objects.forEach(obj => {
        let geo = new THREE.BoxGeometry(1.5, 1.5, 1.5);
        if (obj.type === 'structure' || obj.type === 'building') {
          geo = new THREE.BoxGeometry(4, 4, 4);
        } else if (obj.type === 'foliage') {
          geo = new THREE.ConeGeometry(1.5, 4, 6);
        } else if (obj.type === 'item') {
          geo = new THREE.DodecahedronGeometry(0.5);
        }
        const mat = new THREE.MeshStandardMaterial({
          color: obj.type === 'foliage' ? 0x2e6f40 : obj.type === 'item' ? 0xf59e0b : 0x64748b,
          roughness: 0.7
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(...obj.position);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.userData = { ...obj };
        scene.add(mesh);
        if (obj.interactable) interactables.push(mesh);
      });
    }

    // NPCs
    if (graph.characters) {
      graph.characters.forEach(char => {
        const group = new THREE.Group();
        const body = new THREE.Mesh(
          new THREE.CylinderGeometry(0.3, 0.35, 1.2, 8),
          new THREE.MeshStandardMaterial({ color: 0x8b5cf6, roughness: 0.6 })
        );
        body.position.y = 0.6;
        body.castShadow = true;
        group.add(body);

        const head = new THREE.Mesh(
          new THREE.SphereGeometry(0.22, 12, 8),
          new THREE.MeshStandardMaterial({ color: 0xfbbf24, roughness: 0.5 })
        );
        head.position.y = 1.4;
        head.castShadow = true;
        group.add(head);

        group.position.set(...char.position);
        group.userData = { ...char, isNPC: true };
        scene.add(group);
        interactables.push(group);
      });
    }

    // Controls
    let isLocked = false;
    document.body.addEventListener('click', () => {
      if (!isLocked) document.body.requestPointerLock();
    });
    document.addEventListener('pointerlockchange', () => {
      isLocked = document.pointerLockElement === document.body;
    });

    const keys = { KeyW: false, KeyS: false, KeyA: false, KeyD: false };
    window.addEventListener('keydown', (e) => { if (keys[e.code] !== undefined) keys[e.code] = true; });
    window.addEventListener('keyup', (e) => { if (keys[e.code] !== undefined) keys[e.code] = false; });

    let yaw = 0, pitch = 0;
    window.addEventListener('mousemove', (e) => {
      if (!isLocked) return;
      yaw -= e.movementX * 0.002;
      pitch -= e.movementY * 0.002;
      pitch = Math.max(-Math.PI / 2.2, Math.min(Math.PI / 2.2, pitch));
      camera.rotation.set(0, 0, 0);
      camera.rotation.y = yaw;
      camera.rotation.x = pitch;
    });

    const raycaster = new THREE.Raycaster();
    window.addEventListener('click', () => {
      if (!isLocked) return;
      raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
      const hits = raycaster.intersectObjects(interactables, true);
      if (hits.length > 0) {
        let parent = hits[0].object;
        while (parent && !parent.userData?.name && parent.parent) parent = parent.parent;
        const data = parent?.userData;
        if (data && data.isNPC) {
          const dBox = document.getElementById('dialogue');
          document.getElementById('dialogue-speaker').innerText = data.name;
          document.getElementById('dialogue-text').innerText = data.dialogueSeed || (data.name + ' observes you quietly.');
          dBox.style.display = 'block';
          setTimeout(() => { dBox.style.display = 'none'; }, 5000);
        }
      }
    });

    // Loop
    const clock = new THREE.Clock();
    function animate() {
      requestAnimationFrame(animate);
      const delta = clock.getDelta();

      if (isLocked) {
        const move = new THREE.Vector3();
        if (keys.KeyW) move.z -= 1;
        if (keys.KeyS) move.z += 1;
        if (keys.KeyA) move.x -= 1;
        if (keys.KeyD) move.x += 1;
        if (move.lengthSq() > 0) {
          move.normalize().multiplyScalar(5 * delta);
          move.applyEuler(new THREE.Euler(0, yaw, 0));
          camera.position.add(move);
        }
      }

      renderer.render(scene, camera);
    }
    animate();

    window.addEventListener('resize', () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    });
  </script>
</body>
</html>`;
}
