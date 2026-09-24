import { ipcMain, dialog, app, type FileFilter } from 'electron';
import * as fs from 'fs/promises';
import * as path from 'path';
import pdf from 'pdf-parse';
import { IPC_CHANNELS } from '../../shared/constants';
import type { IPCResult, SavedWorld } from '../../shared/ipc.types';
import type { SceneGraph } from '../../shared/schema/sceneGraph.schema';

const allowedPaths = new Set<string>();

export function registerFileHandlers(): void {
  ipcMain.handle(
    IPC_CHANNELS.FILE_OPEN_DIALOG,
    async (_event, filters?: FileFilter[]): Promise<IPCResult<string | null>> => {
      try {
        const result = await dialog.showOpenDialog({
          properties: ['openFile'],
          filters: filters ?? [
            { name: 'Story Documents', extensions: ['txt', 'md', 'pdf'] },
            { name: 'All Files', extensions: ['*'] },
          ],
        });
        if (result.canceled || result.filePaths.length === 0) {
          return { success: true, data: null };
        }
        allowedPaths.add(path.resolve(result.filePaths[0]));
        return { success: true, data: result.filePaths[0] };
      } catch (err: unknown) {
        const error = err instanceof Error ? err : new Error(String(err));
        return { success: false, error: { name: error.name, message: error.message } };
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.FILE_READ,
    async (_event, filePath: string): Promise<IPCResult<string>> => {
      try {
        const normalizedPath = path.resolve(filePath);
        if (filePath.includes('..')) {
          throw new Error('Path traversal not allowed');
        }

        const safeExtensions = new Set(['.txt', '.md', '.pdf']);
        const ext = path.extname(normalizedPath).toLowerCase();
        const isSafeExtension = safeExtensions.has(ext);

        const userDataDir = app.getPath('userData');
        if (!normalizedPath.startsWith(userDataDir) && !allowedPaths.has(normalizedPath) && !isSafeExtension) {
          throw new Error('Access to this file path is denied');
        }

        if (filePath.toLowerCase().endsWith('.pdf')) {
          const buffer = await fs.readFile(normalizedPath);
          const pdfData = await pdf(buffer);
          return { success: true, data: pdfData.text };
        }

        const content = await fs.readFile(normalizedPath, 'utf-8');
        return { success: true, data: content };
      } catch (err: unknown) {
        const error = err instanceof Error ? err : new Error(String(err));
        return { success: false, error: { name: error.name, message: error.message } };
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.FILE_SAVE_WORLD,
    async (_event, worldData: SavedWorld): Promise<IPCResult<string | null>> => {
      try {
        const result = await dialog.showSaveDialog({
          title: 'Save World',
          defaultPath: `${worldData.name || 'world'}.json`,
          filters: [{ name: 'World Files', extensions: ['json'] }],
        });

        if (result.canceled || !result.filePath) {
          return { success: true, data: null };
        }

        allowedPaths.add(path.resolve(result.filePath));
        await fs.writeFile(result.filePath, JSON.stringify(worldData, null, 2), 'utf-8');
        return { success: true, data: result.filePath };
      } catch (err: unknown) {
        const error = err instanceof Error ? err : new Error(String(err));
        return { success: false, error: { name: error.name, message: error.message } };
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.FILE_LOAD_WORLD,
    async (): Promise<IPCResult<SavedWorld | null>> => {
      try {
        const result = await dialog.showOpenDialog({
          title: 'Load World',
          properties: ['openFile'],
          filters: [{ name: 'World Files', extensions: ['json'] }],
        });

        if (result.canceled || result.filePaths.length === 0) {
          return { success: true, data: null };
        }

        allowedPaths.add(path.resolve(result.filePaths[0]));
        const content = await fs.readFile(result.filePaths[0], 'utf-8');
        const parsed = JSON.parse(content) as SavedWorld;
        return { success: true, data: parsed };
      } catch (err: unknown) {
        const error = err instanceof Error ? err : new Error(String(err));
        return { success: false, error: { name: error.name, message: error.message } };
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.FILE_EXPORT_HTML,
    async (_event, graph: SceneGraph & { code?: string }): Promise<IPCResult<string | null>> => {
      try {
        const result = await dialog.showSaveDialog({
          title: 'Export Standalone HTML World',
          defaultPath: `${graph.world.name || 'world'}.html`,
          filters: [{ name: 'HTML Files', extensions: ['html'] }],
        });

        if (result.canceled || !result.filePath) {
          return { success: true, data: null };
        }

        allowedPaths.add(path.resolve(result.filePath));
        const serializedGraph = JSON.stringify(graph).replace(/<\/script>/gi, '<\\/script>');

        const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${graph.world.name} - Story Engine Standalone</title>
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
    <h2>${graph.world.name}</h2>
    <p>${graph.world.description}</p>
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
    const startPos = graph.player?.startPosition || [0, 1.7, 5];
    camera.position.set(startPos[0], startPos[1], startPos[2]);

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

    // Generated Scene Code
    ${graph.code || ''}

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

        await fs.writeFile(result.filePath, html, 'utf-8');
        return { success: true, data: result.filePath };
      } catch (err: unknown) {
        const error = err instanceof Error ? err : new Error(String(err));
        return { success: false, error: { name: error.name, message: error.message } };
      }
    }
  );
}

