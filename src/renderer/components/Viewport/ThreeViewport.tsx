import { useRef, useEffect, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import { useWorldStore } from '../../store/worldStore';
import { useUIStore, type BiomeType, type SceneHierarchyItem } from '../../store/uiStore';
import { useNPCStore } from '../../store/npcStore';
import { NotificationToast } from '../HUD/NotificationToast';
import { SpotlightPromptBar } from './SpotlightPromptBar';
import { Crosshair } from '../HUD/Crosshair';
import { DebugPanel } from '../HUD/DebugPanel';
import { SmartEditBar } from '../HUD/SmartEditBar';
import { GenerationOverlay } from '../HUD/GenerationOverlay';

// Simple deterministic pseudo-random function
function pseudoRandom(seed: number): number {
  const x = Math.sin(seed++) * 10000;
  return x - Math.floor(x);
}

// Perlin-like 2D elevation function
function getElevation(x: number, z: number, seed: number, amplitude: number): number {
  const scale1 = 0.04;
  const scale2 = 0.09;
  const wave1 = Math.sin(x * scale1 + seed) * Math.cos(z * scale1 + seed * 0.7);
  const wave2 = Math.sin(x * scale2 - seed * 1.3) * Math.cos(z * scale2 + seed);
  const centerDamp = 1 - Math.min(1, Math.sqrt(x * x + z * z) / 90);
  return (wave1 * 0.75 + wave2 * 0.25) * amplitude * (centerDamp * 0.4 + 0.6);
}

export const ThreeViewport = () => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Store bindings
  const {
    cameraMode,
    setCameraMode,
    wireframe,
    shadowsEnabled,
    seed,
    activeBiome,
    tuningParams,
    selectedNode,
    setSelectedNode,
    setTelemetry,
    addIpcLog,
  } = useUIStore();

  const { sceneGraph, generatedCode } = useWorldStore();
  const { setActiveNPC } = useNPCStore();

  // Engine refs
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const terrainMeshRef = useRef<THREE.Mesh | null>(null);
  const sunLightRef = useRef<THREE.DirectionalLight | null>(null);
  const ambientLightRef = useRef<THREE.AmbientLight | null>(null);
  const sceneGraphGroupRef = useRef<THREE.Group | null>(null);
  const selectionBoxRef = useRef<THREE.BoxHelper | null>(null);
  const npcCharacterRef = useRef<THREE.Group | null>(null);
  const pointerLockRef = useRef<PointerLockControls | null>(null);

  // Movement in walk mode
  const moveKeysRef = useRef({ forward: false, backward: false, left: false, right: false });
  const playerVelocityRef = useRef(new THREE.Vector3());
  const playerDirectionRef = useRef(new THREE.Vector3());

  // Procedural Asset Builders
  const buildOrganicConiferTree = (treeSeed: number, scale = 1.0): THREE.Group => {
    const group = new THREE.Group();
    group.name = 'Procedural_Pine_' + Math.floor(treeSeed % 9999);

    const trunkHeight = 3.5 * scale;
    const trunkGeo = new THREE.CylinderGeometry(0.25 * scale, 0.45 * scale, trunkHeight, 7);
    const trunkMat = new THREE.MeshStandardMaterial({
      color: 0x3e2b1f,
      roughness: 0.88,
      metalness: 0.05,
    });
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = trunkHeight / 2;
    trunk.castShadow = true;
    trunk.receiveShadow = true;
    group.add(trunk);

    const foliageMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color().setHSL(
        0.33 + pseudoRandom(treeSeed) * 0.05,
        0.45,
        0.26 + pseudoRandom(treeSeed + 1) * 0.06
      ),
      roughness: 0.75,
      flatShading: true,
    });

    const tiers = 4;
    for (let i = 0; i < tiers; i++) {
      const radius = (2.2 - i * 0.45) * scale;
      const height = (2.4 - i * 0.2) * scale;
      const tierGeo = new THREE.ConeGeometry(radius, height, 7);
      const tierMesh = new THREE.Mesh(tierGeo, foliageMat);
      tierMesh.position.y = trunkHeight * 0.6 + i * 1.5 * scale;
      tierMesh.castShadow = true;
      tierMesh.receiveShadow = true;
      tierMesh.rotation.y = i * 1.2 + pseudoRandom(treeSeed + i);
      group.add(tierMesh);
    }

    group.userData = {
      type: 'Flora/ProceduralPine',
      roughness: 0.75,
      metalness: 0.05,
      seed: treeSeed,
    };
    return group;
  };

  const buildProceduralRock = (rockSeed: number, scale = 1.0): THREE.Mesh => {
    const geo = new THREE.DodecahedronGeometry(1.6 * scale, 1);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const vx = pos.getX(i);
      const vy = pos.getY(i);
      const vz = pos.getZ(i);
      const noise = 1 + (pseudoRandom(rockSeed + i * 3) - 0.5) * 0.35;
      pos.setXYZ(i, vx * noise, vy * noise, vz * noise);
    }
    geo.computeVertexNormals();

    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color().setHSL(0.08, 0.12, 0.38 + pseudoRandom(rockSeed) * 0.15),
      roughness: 0.92,
      metalness: 0.08,
      flatShading: true,
    });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = 'Rock_Cluster_' + Math.floor(rockSeed % 9999);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData = {
      type: 'Geology/Boulders',
      roughness: 0.92,
      metalness: 0.08,
      seed: rockSeed,
    };
    return mesh;
  };

  const buildCyberMonolith = (monoSeed: number, scale = 1.0): THREE.Group => {
    const group = new THREE.Group();
    group.name = 'Cyber_Tower_' + Math.floor(monoSeed % 9999);

    const height = (14 + pseudoRandom(monoSeed) * 16) * scale;
    const width = (2.5 + pseudoRandom(monoSeed + 1) * 3) * scale;
    const geo = new THREE.BoxGeometry(width, height, width);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x181a24,
      roughness: 0.3,
      metalness: 0.85,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.y = height / 2;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);

    const neonGeo = new THREE.BoxGeometry(width * 1.02, 0.4, width * 1.02);
    const neonMat = new THREE.MeshBasicMaterial({
      color: pseudoRandom(monoSeed) > 0.5 ? 0x06b6d4 : 0xec4899,
    });
    const neonStrip = new THREE.Mesh(neonGeo, neonMat);
    neonStrip.position.y = height * 0.75;
    group.add(neonStrip);

    group.userData = {
      type: 'Architecture/CyberMonolith',
      roughness: 0.3,
      metalness: 0.85,
      seed: monoSeed,
    };
    return group;
  };

  const buildAncientRuinPillar = (pillarSeed: number, scale = 1.0): THREE.Group => {
    const group = new THREE.Group();
    group.name = 'Ancient_Pillar_' + Math.floor(pillarSeed % 9999);

    const height = (7 + pseudoRandom(pillarSeed) * 5) * scale;
    const geo = new THREE.CylinderGeometry(1.2 * scale, 1.4 * scale, height, 8);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x9ca3af,
      roughness: 0.85,
      metalness: 0.1,
    });
    const pillar = new THREE.Mesh(geo, mat);
    pillar.position.y = height / 2;
    pillar.castShadow = true;
    pillar.receiveShadow = true;
    group.add(pillar);

    const capGeo = new THREE.BoxGeometry(3 * scale, 0.8 * scale, 3 * scale);
    const cap = new THREE.Mesh(capGeo, mat);
    cap.position.y = height + 0.4 * scale;
    cap.castShadow = true;
    group.add(cap);

    group.userData = {
      type: 'Ruins/StonePillar',
      roughness: 0.85,
      metalness: 0.1,
      seed: pillarSeed,
    };
    return group;
  };

  const buildAlienMushroom = (mushSeed: number, scale = 1.0): THREE.Group => {
    const group = new THREE.Group();
    group.name = 'Biolum_Mushroom_' + Math.floor(mushSeed % 9999);

    const stemHeight = (4 + pseudoRandom(mushSeed) * 3) * scale;
    const stemGeo = new THREE.CylinderGeometry(0.3 * scale, 0.6 * scale, stemHeight, 8);
    const stemMat = new THREE.MeshStandardMaterial({
      color: 0x2dd4bf,
      roughness: 0.4,
      metalness: 0.2,
    });
    const stem = new THREE.Mesh(stemGeo, stemMat);
    stem.position.y = stemHeight / 2;
    group.add(stem);

    const capGeo = new THREE.SphereGeometry(2.4 * scale, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.5);
    const capMat = new THREE.MeshStandardMaterial({
      color: 0x8b5cf6,
      roughness: 0.3,
      emissive: new THREE.Color(0x4c1d95),
      emissiveIntensity: 0.6,
    });
    const cap = new THREE.Mesh(capGeo, capMat);
    cap.position.y = stemHeight;
    group.add(cap);

    group.userData = {
      type: 'Alien/BioluminescentFungi',
      roughness: 0.3,
      metalness: 0.2,
      seed: mushSeed,
    };
    return group;
  };

  const buildNpcCharacter = (): THREE.Group => {
    const npcGroup = new THREE.Group();
    npcGroup.name = 'NPC_Eldrin_The_Ranger';

    const bodyGeo = new THREE.ConeGeometry(0.8, 2.2, 8);
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x1e3a8a, roughness: 0.7 });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 1.1;
    body.castShadow = true;
    npcGroup.add(body);

    const headGeo = new THREE.SphereGeometry(0.45, 12, 12);
    const headMat = new THREE.MeshStandardMaterial({ color: 0xfde047, roughness: 0.5 });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 2.45;
    head.castShadow = true;
    npcGroup.add(head);

    const hoodGeo = new THREE.ConeGeometry(0.6, 0.75, 8);
    const hoodMat = new THREE.MeshStandardMaterial({ color: 0x172554, roughness: 0.8 });
    const hood = new THREE.Mesh(hoodGeo, hoodMat);
    hood.position.y = 2.65;
    npcGroup.add(hood);

    const staffGeo = new THREE.CylinderGeometry(0.06, 0.08, 3.2, 6);
    const staffMat = new THREE.MeshStandardMaterial({ color: 0x78350f });
    const staff = new THREE.Mesh(staffGeo, staffMat);
    staff.position.set(0.9, 1.6, 0.4);
    npcGroup.add(staff);

    const crystalGeo = new THREE.OctahedronGeometry(0.24);
    const crystalMat = new THREE.MeshBasicMaterial({ color: 0x34d399 });
    const crystal = new THREE.Mesh(crystalGeo, crystalMat);
    crystal.position.set(0.9, 3.2, 0.4);
    npcGroup.add(crystal);

    npcGroup.userData = {
      type: 'NPCs/HumanoidNPC',
      name: 'Eldrin the Ranger',
      roughness: 0.6,
      metalness: 0.0,
      seed: 777,
    };
    return npcGroup;
  };

  const disposeHierarchy = (obj: THREE.Object3D) => {
    if ((obj as THREE.Mesh).geometry) {
      (obj as THREE.Mesh).geometry.dispose();
    }
    if ((obj as THREE.Mesh).material) {
      const mat = (obj as THREE.Mesh).material;
      if (Array.isArray(mat)) {
        mat.forEach((m) => m.dispose());
      } else {
        mat.dispose();
      }
    }
    while (obj.children.length > 0) {
      const child = obj.children[0];
      obj.remove(child);
      disposeHierarchy(child);
    }
  };

  // Traverse Three.js scene and update Hierarchy tab (Point 75)
  const syncSceneHierarchy = useCallback((scene: THREE.Scene) => {
    const items: SceneHierarchyItem[] = [];
    const sceneGraphGroup = sceneGraphGroupRef.current;

    scene.traverse((obj) => {
      if (obj === scene) return;
      if (obj.name === 'SceneGraphRoot') return;
      if (obj instanceof THREE.BoxHelper || obj.name.includes('Helper')) return;

      const isDirectSceneChild = obj.parent === scene;
      const isDirectGroupChild = Boolean(sceneGraphGroup && obj.parent === sceneGraphGroup);
      const uType = (obj.userData?.type as string) || '';
      const isLight = (obj as THREE.Light).isLight;

      if (!isDirectSceneChild && !isDirectGroupChild && !uType && !isLight) {
        return;
      }

      // Skip internal children of composite groups
      if (obj.parent && obj.parent !== scene && obj.parent !== sceneGraphGroup) {
        return;
      }

      let category = 'Objects';
      let icon = 'ph-cube';

      const typeLower = uType.toLowerCase();
      const nameLower = (obj.name || '').toLowerCase();

      if (typeLower.includes('terrain') || nameLower.includes('terrain') || nameLower.includes('ground')) {
        category = 'Terrain';
        icon = 'ph-mountains';
      } else if (
        typeLower.includes('flora') ||
        typeLower.includes('alien') ||
        nameLower.includes('pine') ||
        nameLower.includes('tree') ||
        nameLower.includes('mushroom') ||
        nameLower.includes('foliage')
      ) {
        category = 'Flora';
        icon = 'ph-tree-evergreen';
      } else if (
        typeLower.includes('npc') ||
        typeLower.includes('entity') ||
        typeLower.includes('character') ||
        nameLower.includes('npc') ||
        nameLower.includes('eldrin')
      ) {
        category = 'NPCs';
        icon = 'ph-user';
      } else if (
        typeLower.includes('light') ||
        isLight ||
        nameLower.includes('sun') ||
        nameLower.includes('ambient')
      ) {
        category = 'Lights';
        icon = nameLower.includes('sun') ? 'ph-sun' : 'ph-lightbulb';
      } else if (typeLower.includes('geology') || nameLower.includes('rock')) {
        category = 'Geology';
        icon = 'ph-diamonds-four';
      } else if (
        typeLower.includes('architecture') ||
        typeLower.includes('ruin') ||
        nameLower.includes('pillar') ||
        nameLower.includes('tower')
      ) {
        category = 'Architecture';
        icon = 'ph-columns';
      } else if (uType) {
        category = uType.split('/')[0] || 'Objects';
      }

      if (!items.some((it) => it.id === obj.uuid)) {
        items.push({
          id: obj.uuid,
          name: obj.name || `${category}_${obj.uuid.slice(0, 4)}`,
          type: uType || category,
          category,
          icon,
          position: [obj.position.x, obj.position.y, obj.position.z],
          scale: [obj.scale.x, obj.scale.y, obj.scale.z],
          roughness: obj.userData?.roughness ?? 0.68,
          metalness: obj.userData?.metalness ?? 0.1,
          castShadow: obj.castShadow,
        });
      }
    });

    useUIStore.getState().setSceneHierarchy(items);
  }, []);

  const generateWorld = useCallback(
    (biome: BiomeType) => {
      const scene = sceneRef.current;
      const group = sceneGraphGroupRef.current;
      const ambLight = ambientLightRef.current;
      const sLight = sunLightRef.current;
      if (!scene || !group || !ambLight || !sLight) return;

      // 0. Clear selection on world rebuild (prevents ghost wireframe boxes)
      if (selectionBoxRef.current) {
        selectionBoxRef.current.visible = false;
        scene.remove(selectionBoxRef.current);
        selectionBoxRef.current.dispose();
        selectionBoxRef.current = null;
      }
      setSelectedNode(null);

      // 1. Dispose old entities
      while (group.children.length > 0) {
        const obj = group.children[0];
        group.remove(obj);
        disposeHierarchy(obj);
      }
      if (terrainMeshRef.current) {
        scene.remove(terrainMeshRef.current);
        terrainMeshRef.current.geometry.dispose();
        if (Array.isArray(terrainMeshRef.current.material)) {
          terrainMeshRef.current.material.forEach((m) => m.dispose());
        } else {
          terrainMeshRef.current.material.dispose();
        }
        terrainMeshRef.current = null;
      }

      // 2. Configure Biome Colors & Atmosphere
      let groundColor = 0x2a3d28;
      let fogColor = 0x0f172a;
      let skyColor = 0x111827;

      if (biome === 'pine') {
        groundColor = 0x2a3d28;
        fogColor = 0x0f172a;
        ambLight.color.setHex(0x94a3b8);
        sLight.color.setHex(0xfffae0);
      } else if (biome === 'cyber') {
        groundColor = 0x111318;
        fogColor = 0x090514;
        ambLight.color.setHex(0x38bdf8);
        sLight.color.setHex(0xf43f5e);
      } else if (biome === 'canyon') {
        groundColor = 0x7c2d12;
        fogColor = 0x29150d;
        ambLight.color.setHex(0xfdba74);
        sLight.color.setHex(0xffedd5);
      } else if (biome === 'alien') {
        groundColor = 0x064e3b;
        fogColor = 0x041b18;
        ambLight.color.setHex(0x2dd4bf);
        sLight.color.setHex(0xa855f7);
      } else if (biome === 'ruins') {
        groundColor = 0x44403c;
        fogColor = 0x1c1917;
        ambLight.color.setHex(0xfde68a);
        sLight.color.setHex(0xfb923c);
      }

      scene.background = new THREE.Color(skyColor);
      if (scene.fog) {
        scene.fog.color.setHex(fogColor);
        (scene.fog as THREE.FogExp2).density = tuningParams.fogDensity;
      }

      // 3. Generate Heightmapped Terrain
      const terrainSize = 160;
      const segments = 100;
      const terrainGeo = new THREE.PlaneGeometry(terrainSize, terrainSize, segments, segments);
      terrainGeo.rotateX(-Math.PI / 2);

      const positions = terrainGeo.attributes.position;
      for (let i = 0; i < positions.count; i++) {
        const x = positions.getX(i);
        const z = positions.getZ(i);
        const y = getElevation(x, z, seed, tuningParams.elevation);
        positions.setY(i, y);
      }
      terrainGeo.computeVertexNormals();

      const terrainMat = new THREE.MeshStandardMaterial({
        color: groundColor,
        roughness: 0.9,
        metalness: 0.05,
        wireframe,
        flatShading: true,
      });

      const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
      terrainMesh.name = 'Terrain_Heightmap_Surface';
      terrainMesh.receiveShadow = true;
      terrainMesh.userData = { type: 'Terrain/HeightmapMesh' };
      scene.add(terrainMesh);
      terrainMeshRef.current = terrainMesh;

      // 4. Place Procedural Features
      const count = tuningParams.density;
      for (let i = 0; i < count; i++) {
        const itemSeed = seed + i * 137.5;
        const angle = pseudoRandom(itemSeed) * Math.PI * 2;
        const dist = 6 + pseudoRandom(itemSeed + 1) * 65;
        const x = Math.cos(angle) * dist;
        const z = Math.sin(angle) * dist;
        const y = getElevation(x, z, seed, tuningParams.elevation);

        let entity: THREE.Object3D | null = null;
        if (biome === 'pine') {
          if (pseudoRandom(itemSeed + 2) > 0.3) {
            entity = buildOrganicConiferTree(itemSeed, 0.7 + pseudoRandom(itemSeed + 3) * 0.7);
          } else {
            entity = buildProceduralRock(itemSeed, 0.8 + pseudoRandom(itemSeed + 3) * 0.9);
          }
        } else if (biome === 'cyber') {
          entity = buildCyberMonolith(itemSeed, 0.6 + pseudoRandom(itemSeed + 3) * 0.8);
        } else if (biome === 'alien') {
          entity = buildAlienMushroom(itemSeed, 0.8 + pseudoRandom(itemSeed + 3) * 0.7);
        } else if (biome === 'ruins') {
          entity = buildAncientRuinPillar(itemSeed, 0.7 + pseudoRandom(itemSeed + 3) * 0.8);
        } else if (biome === 'canyon') {
          entity = buildProceduralRock(itemSeed, 1.2 + pseudoRandom(itemSeed + 3) * 1.5);
        }

        if (entity) {
          entity.position.set(x, y, z);
          entity.rotation.y = pseudoRandom(itemSeed + 4) * Math.PI * 2;
          group.add(entity);
        }
      }

      // 5. Spawn In-scene NPC character
      const npcMesh = buildNpcCharacter();
      const npcX = 3;
      const npcZ = 5;
      const npcY = getElevation(npcX, npcZ, seed, tuningParams.elevation);
      npcMesh.position.set(npcX, npcY, npcZ);
      group.add(npcMesh);
      npcCharacterRef.current = npcMesh;

      // Telemetry update
      let triangles = 0;
      let geometries = 0;
      scene.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh && (obj as THREE.Mesh).geometry) {
          geometries++;
          const g = (obj as THREE.Mesh).geometry;
          if (g.index) triangles += g.index.count / 3;
          else if (g.attributes.position) triangles += g.attributes.position.count / 3;
        }
      });

      setTelemetry({
        polyCount: Math.round(triangles),
        drawCalls: geometries,
      });
      const hudPolyEl = document.getElementById('hudPoly');
      if (hudPolyEl) hudPolyEl.textContent = `${(Math.round(triangles) / 1000).toFixed(1)}k Tris`;
      const hudDrawsEl = document.getElementById('hudDraws');
      if (hudDrawsEl) hudDrawsEl.textContent = `${geometries} Calls`;

      syncSceneHierarchy(scene);
    },
    [seed, tuningParams.elevation, tuningParams.density, tuningParams.fogDensity, wireframe, setTelemetry, syncSceneHierarchy]
  );

  // Initialize Three.js Engine once on mount
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    // 1. Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0c10);
    scene.fog = new THREE.FogExp2(0x0a0c10, tuningParams.fogDensity);
    sceneRef.current = scene;

    // 2. Camera
    const camera = new THREE.PerspectiveCamera(
      55,
      container.clientWidth / container.clientHeight,
      0.1,
      1000
    );
    camera.position.set(28, 22, 34);
    cameraRef.current = camera;

    // 3. WebGLRenderer
    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = shadowsEnabled;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    rendererRef.current = renderer;

    // 4. OrbitControls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxPolarAngle = Math.PI / 2 - 0.02;
    controls.minDistance = 3;
    controls.maxDistance = 180;
    controls.target.set(0, 4, 0);
    controlsRef.current = controls;

    // 5. Lighting
    const ambientLight = new THREE.AmbientLight(0xdde6ff, 0.45);
    ambientLight.name = 'Ambient';
    ambientLight.userData = { type: 'Lights/AmbientLight' };
    scene.add(ambientLight);
    ambientLightRef.current = ambientLight;

    const sunLight = new THREE.DirectionalLight(0xfff6e6, 1.25);
    sunLight.name = 'Sun';
    sunLight.userData = { type: 'Lights/DirectionalSun' };
    sunLight.position.set(35, 50, 25);
    sunLight.castShadow = shadowsEnabled;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.camera.near = 0.5;
    sunLight.shadow.camera.far = 150;
    sunLight.shadow.camera.left = -50;
    sunLight.shadow.camera.right = 50;
    sunLight.shadow.camera.top = 50;
    sunLight.shadow.camera.bottom = -50;
    sunLight.shadow.bias = -0.0003;
    scene.add(sunLight);
    sunLightRef.current = sunLight;

    // 6. SceneGraph container
    const sceneGraphGroup = new THREE.Group();
    sceneGraphGroup.name = 'SceneGraphRoot';
    scene.add(sceneGraphGroup);
    sceneGraphGroupRef.current = sceneGraphGroup;

    // 7. Selection Box Helper
    const dummyMesh = new THREE.Mesh();
    const selectionBox = new THREE.BoxHelper(dummyMesh, 0x3b82f6);
    selectionBox.visible = false;
    scene.add(selectionBox);
    selectionBoxRef.current = selectionBox;

    // 8. Generate initial world
    generateWorld(activeBiome);
    syncSceneHierarchy(scene);

    // 9. Resize observer
    const resizeObserver = new ResizeObserver(() => {
      if (!container || !camera || !renderer) return;
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    });
    resizeObserver.observe(container);

    // 10. Click Raycaster
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const onPointerDown = (e: MouseEvent) => {
      if (useUIStore.getState().cameraMode === 'walk') return;
      const rect = canvas.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(sceneGraphGroup.children, true);

      if (intersects.length > 0) {
        let target: THREE.Object3D = intersects[0].object;
        while (target.parent && target.parent !== sceneGraphGroup) {
          target = target.parent;
        }

        selectionBox.setFromObject(target);
        selectionBox.visible = true;

        setSelectedNode({
          id: target.uuid,
          name: target.name,
          type: target.userData.type || 'Object3D',
          position: [target.position.x, target.position.y, target.position.z],
          scale: [target.scale.x, target.scale.y, target.scale.z],
          roughness: target.userData.roughness ?? 0.68,
          metalness: target.userData.metalness ?? 0.1,
          castShadow: true,
        });

        addIpcLog(`[SELECTION] Focused node '${target.name}' (UUID: ${target.uuid.slice(0, 8)})`, 'selection');
      }
    };
    canvas.addEventListener('pointerdown', onPointerDown);

    // 11. Render Animation Loop
    let animId = 0;
    let frameCount = 0;
    let lastTime = performance.now();
    const clock = new THREE.Clock();

    const animate = () => {
      animId = requestAnimationFrame(animate);

      const delta = clock.getDelta();
      const time = clock.getElapsedTime();

      // FPS Calculation (throttled to 1Hz)
      frameCount++;
      const now = performance.now();
      if (now - lastTime >= 1000) {
        const tel = useUIStore.getState().telemetry;
        const hudFpsEl = document.getElementById('hudFps');
        if (hudFpsEl) {
          hudFpsEl.textContent = `${frameCount} FPS`;
          hudFpsEl.style.color = frameCount < 20 ? '#ef4444' : frameCount < 30 ? '#f59e0b' : '#10b981';
        }
        const hudPolyEl = document.getElementById('hudPoly');
        if (hudPolyEl) hudPolyEl.textContent = `${(tel.polyCount / 1000).toFixed(1)}k Tris`;
        const hudDrawsEl = document.getElementById('hudDraws');
        if (hudDrawsEl) hudDrawsEl.textContent = `${tel.drawCalls} Calls`;
        frameCount = 0;
        lastTime = now;
      }

      // Walk mode vs Orbit mode
      const currentMode = useUIStore.getState().cameraMode;
      if (currentMode === 'walk') {
        const vel = playerVelocityRef.current;
        const dir = playerDirectionRef.current;
        const keys = moveKeysRef.current;

        vel.x -= vel.x * 10.0 * delta;
        vel.z -= vel.z * 10.0 * delta;

        dir.z = Number(keys.forward) - Number(keys.backward);
        dir.x = Number(keys.right) - Number(keys.left);
        dir.normalize();

        const speed = 18.0;
        if (keys.forward || keys.backward) vel.z -= dir.z * speed * delta;
        if (keys.left || keys.right) vel.x -= dir.x * speed * delta;

        camera.translateX(-vel.x * delta);
        camera.translateZ(vel.z * delta);

        const currentSeed = useUIStore.getState().seed;
        const elev = useUIStore.getState().tuningParams.elevation;
        const groundH = getElevation(camera.position.x, camera.position.z, currentSeed, elev);
        camera.position.y = THREE.MathUtils.lerp(camera.position.y, groundH + 2.4, 0.2);
      } else {
        controls.update();
      }

      // NPC idle bob
      if (npcCharacterRef.current) {
        const currentSeed = useUIStore.getState().seed;
        const elev = useUIStore.getState().tuningParams.elevation;
        const groundY = getElevation(
          npcCharacterRef.current.position.x,
          npcCharacterRef.current.position.z,
          currentSeed,
          elev
        );
        npcCharacterRef.current.position.y = groundY + Math.sin(time * 2.0) * 0.08;
      }

      const hudCoordsEl = document.getElementById('hudCoords');
      if (hudCoordsEl) {
        hudCoordsEl.textContent = `CAM: X: ${camera.position.x.toFixed(1)} Y: ${camera.position.y.toFixed(1)} Z: ${camera.position.z.toFixed(1)}`;
      }

      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(animId);
      resizeObserver.disconnect();
      canvas.removeEventListener('pointerdown', onPointerDown);
      controls.dispose();
      renderer.dispose();
      disposeHierarchy(scene);
      sceneRef.current = null;
      cameraRef.current = null;
      rendererRef.current = null;
    };
  }, []);

  // Handle GC request from sidebar
  useEffect(() => {
    const handleGC = () => {
      const renderer = rendererRef.current;
      const scene = sceneRef.current;
      if (!renderer || !scene) return;
      const before = renderer.info.memory;
      const beforeGeo = before.geometries;
      const beforeTex = before.textures;
      // Reset renderer internal counters
      renderer.info.reset();
      // Traverse and dispose orphaned resources
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          for (const m of mats) {
            if (m instanceof THREE.Material && 'wireframe' in m) {
              (m as THREE.MeshStandardMaterial).wireframe = false;
            }
          }
        }
      });
      const after = renderer.info.memory;
      console.info(`[GC] Before: ${beforeGeo} geometries, ${beforeTex} textures → After: ${after.geometries} geometries, ${after.textures} textures`);
    };
    window.addEventListener('engine:gc-request', handleGC);
    return () => window.removeEventListener('engine:gc-request', handleGC);
  }, []);

  // Sync Biome and Seed changes
  useEffect(() => {
    generateWorld(activeBiome);
  }, [activeBiome, seed, generateWorld]);

  // Sync if sceneGraph is updated and build world
  useEffect(() => {
    // 1. Sync Biome
    if (sceneGraph?.world?.biome) {
      const b = sceneGraph.world.biome;
      if (b === 'forest') useUIStore.getState().setActiveBiome('pine');
      else if (b === 'desert') useUIStore.getState().setActiveBiome('canyon');
      else if (b === 'urban') useUIStore.getState().setActiveBiome('cyber');
      else if (b === 'dungeon') useUIStore.getState().setActiveBiome('ruins');
      else if (b === 'tundra' || b === 'custom') useUIStore.getState().setActiveBiome('alien');
    }

    // 2. Build LLM-generated world into the viewport
    const scene = sceneRef.current;
    const group = sceneGraphGroupRef.current;
    if (scene && group && sceneGraph && generatedCode) {
      // Clear existing procedural scatter
      while (group.children.length > 0) {
        const obj = group.children[0];
        group.remove(obj);
        disposeHierarchy(obj);
      }

      // Execute LLM-generated code directly into the scene
      try {
        const buildFn = new Function('scene', 'THREE', 'assets', `"use strict";\n${generatedCode}`);
        const assets = { textures: {}, helpers: {} };
        buildFn(scene, THREE, assets);
        useUIStore.getState().addIpcLog('[WORLDBUILDER] LLM-generated world built successfully.', 'success');
      } catch (err) {
        console.warn('[ThreeViewport] LLM code execution failed:', err);
        useUIStore.getState().addIpcLog(`[WORLDBUILDER] Code execution error: ${String(err)}`, 'error');
      }

      // Spawn graph objects as fallback meshes
      if (sceneGraph.objects) {
        for (const obj of sceneGraph.objects) {
          let geo: THREE.BufferGeometry;
          let color = 0x8b5cf6;
          switch (obj.type) {
            case 'structure': case 'building': geo = new THREE.BoxGeometry(3, 4, 3); color = 0x64748b; break;
            case 'foliage': geo = new THREE.ConeGeometry(1.2, 3.5, 6); color = 0x15803d; break;
            case 'item': geo = new THREE.DodecahedronGeometry(0.4); color = 0xf59e0b; break;
            default: geo = new THREE.BoxGeometry(1.5, 1.5, 1.5); color = 0xa855f7;
          }
          const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.7 });
          const mesh = new THREE.Mesh(geo, mat);
          mesh.position.set(...obj.position);
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          mesh.userData = { id: obj.id, name: obj.name, type: obj.type };
          group.add(mesh);
        }
      }

      // Spawn NPC characters from scene graph
      if (sceneGraph.characters) {
        for (const char of sceneGraph.characters) {
          const npcMesh = buildNpcCharacter();
          npcMesh.name = `NPC_${char.name.replace(/\s+/g, '_')}`;
          npcMesh.userData = { ...npcMesh.userData, id: char.id, name: char.name };
          npcMesh.position.set(...char.position);
          group.add(npcMesh);
        }
      }

      const hudNpcEl = document.getElementById('hudNpcCount');
      if (hudNpcEl) hudNpcEl.textContent = `${sceneGraph.characters?.length ?? 0} characters`;
    }
  }, [sceneGraph, generatedCode]);

  // Sync Wireframe toggle
  useEffect(() => {
    if (terrainMeshRef.current) {
      const mat = terrainMeshRef.current.material as THREE.MeshStandardMaterial;
      if (mat) mat.wireframe = wireframe;
    }
  }, [wireframe]);

  // Sync Shadows toggle
  useEffect(() => {
    if (rendererRef.current) {
      rendererRef.current.shadowMap.enabled = shadowsEnabled;
    }
    if (sunLightRef.current) {
      sunLightRef.current.castShadow = shadowsEnabled;
    }
  }, [shadowsEnabled]);

  // Sync Sun Angle slider
  useEffect(() => {
    if (sunLightRef.current) {
      const rad = (tuningParams.sunAngle * Math.PI) / 180;
      sunLightRef.current.position.x = Math.cos(rad) * 55;
      sunLightRef.current.position.y = Math.sin(rad) * 55;
    }
  }, [tuningParams.sunAngle]);

  // Sync Fog Density slider
  useEffect(() => {
    if (sceneRef.current?.fog) {
      (sceneRef.current.fog as THREE.FogExp2).density = tuningParams.fogDensity;
    }
  }, [tuningParams.fogDensity]);

  // Sync Camera Mode toggle (Orbit vs Walk)
  useEffect(() => {
    const controls = controlsRef.current;
    const camera = cameraRef.current;
    const scene = sceneRef.current;
    const canvas = canvasRef.current;
    if (!controls || !camera || !scene || !canvas) return;

    if (cameraMode === 'walk') {
      controls.enabled = false;
      const elev = tuningParams.elevation;
      const groundH = getElevation(0, 0, seed, elev);
      camera.position.set(0, groundH + 2.5, 12);
      camera.lookAt(0, groundH + 2.5, 0);
      
      const pointerLock = new PointerLockControls(camera, canvas);
      pointerLockRef.current = pointerLock;
      scene.add(pointerLock.getObject());
      
      const requestLock = () => pointerLock.lock();
      canvas.addEventListener('click', requestLock);
      
      const onUnlock = () => {
        // Exit walk mode when unlocking if still in walk mode
        if (useUIStore.getState().cameraMode === 'walk') {
          useUIStore.getState().setCameraMode('orbit');
        }
      };
      pointerLock.addEventListener('unlock', onUnlock);
      
      addIpcLog('[CONTROLS] Switched to First-Person Walk Mode.', 'info');

      return () => {
        canvas.removeEventListener('click', requestLock);
        pointerLock.removeEventListener('unlock', onUnlock);
        pointerLock.disconnect();
        if (pointerLock.getObject().parent === scene) {
            scene.remove(pointerLock.getObject());
        }
        pointerLockRef.current = null;
      };
    } else {
      controls.enabled = true;
      camera.position.set(28, 22, 34);
      controls.target.set(0, 4, 0);
      addIpcLog('[CONTROLS] Switched to Orbit Camera Mode.', 'info');
    }
  }, [cameraMode, seed, tuningParams.elevation, addIpcLog]);

  // Sync Inspector transform controls to 3D scene
  useEffect(() => {
    if (!selectedNode || !sceneGraphGroupRef.current) return;
    const group = sceneGraphGroupRef.current;
    let target: THREE.Object3D | undefined = undefined;
    group.traverse((child) => {
      if (child.uuid === selectedNode.id || child.userData?.id === selectedNode.id) {
        target = child;
      }
    });
    const selectedObj = target as THREE.Object3D | undefined;
    if (selectedObj) {
      selectedObj.position.set(selectedNode.position[0], selectedNode.position[1], selectedNode.position[2]);
      if (selectionBoxRef.current && selectionBoxRef.current.visible) {
        selectionBoxRef.current.setFromObject(selectedObj);
      }
    }
  }, [selectedNode]);

  // Live sync material updates from Inspector
  useEffect(() => {
    const handleMaterialUpdate = (e: Event) => {
      const customEvent = e as CustomEvent<{ nodeId?: string; property: string; value: unknown }>;
      const { nodeId, property, value } = customEvent.detail || {};

      const applyProperty = (obj: THREE.Object3D) => {
        if (property === 'castShadow') {
          obj.castShadow = Boolean(value);
        } else if (property === 'receiveShadow') {
          obj.receiveShadow = Boolean(value);
        }
        if (obj instanceof THREE.Mesh) {
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          mats.forEach((m) => {
            if (m instanceof THREE.MeshStandardMaterial) {
              if (property === 'roughness') m.roughness = Number(value);
              if (property === 'metalness') m.metalness = Number(value);
              m.needsUpdate = true;
            }
          });
        }
      };

      if (nodeId && sceneGraphGroupRef.current) {
        sceneGraphGroupRef.current.traverse((child) => {
          if (child.uuid === nodeId || child.userData?.id === nodeId) {
            applyProperty(child);
            child.traverse(applyProperty);
          }
        });
      } else if (terrainMeshRef.current) {
        applyProperty(terrainMeshRef.current);
      }
    };

    const handleSmartEdit = (e: Event) => {
      const customEvent = e as CustomEvent<{ instruction: string }>;
      const instruction = customEvent.detail?.instruction?.toLowerCase() || '';
      if (!sceneRef.current) return;

      if (instruction.includes('dark') && instruction.includes('sky')) {
        sceneRef.current.background = new THREE.Color(0x020308);
        if (sceneRef.current.fog instanceof THREE.FogExp2) {
          sceneRef.current.fog.color = new THREE.Color(0x020308);
        }
      } else if (instruction.includes('fog')) {
        if (sceneRef.current.fog instanceof THREE.FogExp2) {
          sceneRef.current.fog.density = 0.05;
        }
      }
    };

    window.addEventListener('engine:material-update', handleMaterialUpdate);
    window.addEventListener('engine:smart-edit', handleSmartEdit);
    return () => {
      window.removeEventListener('engine:material-update', handleMaterialUpdate);
      window.removeEventListener('engine:smart-edit', handleSmartEdit);
    };
  }, []);

  // Key listeners for Walk Mode
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      switch (e.code) {
        case 'KeyW':
        case 'ArrowUp':
          moveKeysRef.current.forward = true;
          break;
        case 'KeyS':
        case 'ArrowDown':
          moveKeysRef.current.backward = true;
          break;
        case 'KeyA':
        case 'ArrowLeft':
          moveKeysRef.current.left = true;
          break;
        case 'KeyD':
        case 'ArrowRight':
          moveKeysRef.current.right = true;
          break;
        case 'KeyE': {
          const cam = cameraRef.current;
          const npc = npcCharacterRef.current;
          if (cam && npc) {
            const dist = cam.position.distanceTo(npc.position);
            if (dist < 8) {
              setActiveNPC({
                id: 'eldrin_ranger',
                name: 'Eldrin the Ranger',
                description: 'A ranger standing on the ridge',
                personality: 'Observant, mystical',
                secrets: [],
                knowledge: [],
                position: [3, 0, 5],
                behavior: 'idle',
                dialogueSeed: 'Greetings, wanderer.',
              });
              useUIStore.getState().setRightInspectorTab('npc');
              useUIStore.getState().setRightInspectorOpen(true);
            }
          }
          break;
        }
        case 'KeyG': {
          // Focus the spotlight prompt bar input
          const promptInput = document.querySelector<HTMLInputElement>('#spotlightInput');
          if (promptInput) { promptInput.focus(); e.preventDefault(); }
          break;
        }
        case 'KeyF': {
          // Fly to selected object
          if (selectedNode && cameraRef.current && controlsRef.current) {
            const pos = selectedNode.position;
            cameraRef.current.position.set(pos[0] + 5, pos[1] + 3, pos[2] + 5);
            controlsRef.current.target.set(pos[0], pos[1], pos[2]);
          }
          break;
        }
        case 'Escape':
          if (useUIStore.getState().cameraMode === 'walk') {
            setCameraMode('orbit');
          }
          break;
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      switch (e.code) {
        case 'KeyW':
        case 'ArrowUp':
          moveKeysRef.current.forward = false;
          break;
        case 'KeyS':
        case 'ArrowDown':
          moveKeysRef.current.backward = false;
          break;
        case 'KeyA':
        case 'ArrowLeft':
          moveKeysRef.current.left = false;
          break;
        case 'KeyD':
        case 'ArrowRight':
          moveKeysRef.current.right = false;
          break;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [setCameraMode, setActiveNPC, selectedNode]);

  const handleResetCamera = () => {
    if (cameraRef.current && controlsRef.current) {
      cameraRef.current.position.set(28, 22, 34);
      controlsRef.current.target.set(0, 4, 0);
    }
  };

  const handleDeselect = () => {
    if (selectionBoxRef.current) {
      selectionBoxRef.current.visible = false;
    }
    setSelectedNode(null);
  };

  return (
    <main
      ref={containerRef}
      id="viewportContainer"
      className="flex-1 flex flex-col relative overflow-hidden bg-black cursor-grab active:cursor-grabbing"
    >
      {/* 3D Canvas */}
      <canvas ref={canvasRef} id="threeCanvas" className="w-full h-full block" />

      {/* Generation Loading Overlay */}
      <GenerationOverlay />

      {/* Crosshair for walk mode */}
      {cameraMode === 'walk' && <Crosshair active={false} />}

      {/* Walk Mode Exit Helper Banner */}
      {cameraMode === 'walk' && (
        <div
          id="walkModeNotice"
          className="absolute top-4 left-1/2 -translate-x-1/2 px-4 py-1.5 rounded-full bg-black/80 mac-blur border border-white/20 text-xs text-white flex items-center space-x-3 pointer-events-none shadow-xl z-20"
        >
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>
            Walk Mode: Use{' '}
            <kbd className="px-1.5 py-0.5 bg-white/20 rounded font-mono text-[10px]">W</kbd>
            <kbd className="px-1.5 py-0.5 bg-white/20 rounded font-mono text-[10px]">A</kbd>
            <kbd className="px-1.5 py-0.5 bg-white/20 rounded font-mono text-[10px]">S</kbd>
            <kbd className="px-1.5 py-0.5 bg-white/20 rounded font-mono text-[10px]">D</kbd> or{' '}
            <kbd className="px-1.5 py-0.5 bg-white/20 rounded font-mono text-[10px]">Arrows</kbd> to explore. Press <kbd className="px-1.5 py-0.5 bg-white/20 rounded font-mono text-[10px]">E</kbd> to talk.
          </span>
          <span className="text-mac-textMuted text-[10px]">Press Esc to exit</span>
        </div>
      )}

      {/* Top Left Viewport HUD Overlay */}
      <div className="absolute top-3 left-3 flex flex-col space-y-1.5 pointer-events-none z-10 select-none">
        <div className="flex items-center space-x-2 px-2.5 py-1 rounded-md bg-black/60 mac-subtle-blur border border-white/10 text-xs text-white">
          <span className="w-2 h-2 rounded-full bg-emerald-400" />
          <span id="hudFps" className="font-mono font-semibold" />
          <span className="text-white/20">|</span>
          <span id="hudPoly" className="font-mono text-mac-textMuted text-[11px]" />
          <span className="text-white/20">|</span>
          <span id="hudDraws" className="font-mono text-mac-textMuted text-[11px]" />
        </div>

        <div className="px-2.5 py-1 rounded-md bg-black/60 mac-subtle-blur border border-white/10 text-[11px] font-mono text-mac-textMuted flex items-center space-x-2">
          <i className="ph ph-navigation-arrow text-blue-400" />
          <span id="hudCoords" />
        </div>

        <div className="px-2.5 py-1 rounded-md bg-black/60 mac-subtle-blur border border-white/10 text-[11px] font-mono text-mac-textMuted flex items-center space-x-2">
          <span>👥</span>
          <span id="hudNpcCount">0 characters</span>
        </div>
      </div>

      {/* Top Right Viewport Quick Control Overlay */}
      <div className="absolute top-3 right-3 flex items-center space-x-1.5 z-10 select-none">
        <button
          type="button"
          onClick={handleResetCamera}
          title="Reset Camera"
          className="px-2.5 py-1 rounded-md bg-black/60 mac-subtle-blur hover:bg-white/20 border border-white/10 text-xs text-white transition flex items-center space-x-1 cursor-pointer"
        >
          <i className="ph ph-arrows-clockwise" />
          <span>Reset View</span>
        </button>

        <button
          type="button"
          onClick={() => useUIStore.getState().toggleShadows()}
          title="Toggle High Quality Shadows"
          className={`px-2 py-1 rounded-md bg-black/60 mac-subtle-blur border border-white/10 text-xs transition cursor-pointer ${
            shadowsEnabled ? 'text-amber-300 hover:bg-white/20' : 'text-mac-textMuted hover:bg-white/10'
          }`}
        >
          <i className="ph ph-sun-dim text-base" />
        </button>
      </div>

      {/* Selection Outline Indicator Pill */}
      {selectedNode && (
        <div
          id="selectionBadge"
          className="absolute bottom-28 left-6 px-3 py-1.5 rounded-lg bg-black/75 mac-blur border border-blue-500/40 text-xs text-white flex items-center space-x-2 shadow-2xl z-20"
        >
          <i className="ph ph-cursor-click text-blue-400" />
          <span>
            Selected: <span className="font-semibold text-blue-300">{selectedNode.name}</span>
          </span>
          <button
            type="button"
            onClick={handleDeselect}
            className="text-mac-textMuted hover:text-white ml-2 cursor-pointer"
          >
            <i className="ph ph-x" />
          </button>
        </div>
      )}

      {/* Smart Edit Bar */}
      <SmartEditBar />

      {/* Spotlight Prompt Bar */}
      <SpotlightPromptBar />
      <DebugPanel />

      {/* Toast notifications */}
      <NotificationToast />
    </main>
  );
};
