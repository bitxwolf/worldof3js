import { useRef, useEffect, useCallback, useState } from 'react';
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
import { UpdatePromptBar } from '../HUD/UpdatePromptBar';
import { GenerationOverlay } from '../HUD/GenerationOverlay';
import { DialogueBox } from '../HUD/DialogueBox';
import { InteractHint } from '../HUD/InteractHint';
import { ProceduralAssetLibrary } from '../../engine/assets/ProceduralAssetLibrary';
import { imageToGeometry } from '../../engine/assets/img2threejsAdapter';
import { presetRegistry } from '../../engine/presets/PresetRegistry';
import { useInventoryStore } from '../../store/inventoryStore';
import { EventSystem } from '../../engine/EventSystem';
import type { SceneGraph } from '../../../shared/schema/sceneGraph.schema';

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
    isNight,
    toggleDayNight,
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
  const activeNPC = useNPCStore((s) => s.activeNPC);

  // Engine refs
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const terrainMeshRef = useRef<THREE.Mesh | null>(null);
  const sunLightRef = useRef<THREE.DirectionalLight | null>(null);
  const sunMeshRef = useRef<THREE.Group | null>(null);
  const starFieldRef = useRef<THREE.Points | null>(null);
  const ambientLightRef = useRef<THREE.AmbientLight | null>(null);
  const sceneGraphGroupRef = useRef<THREE.Group | null>(null);
  const selectionBoxRef = useRef<THREE.BoxHelper | null>(null);
  const npcCharacterRef = useRef<THREE.Group | null>(null);
  const pointerLockRef = useRef<PointerLockControls | null>(null);

  // Movement in walk mode
  const moveKeysRef = useRef({ forward: false, backward: false, left: false, right: false });
  const playerVelocityRef = useRef(new THREE.Vector3());
  const playerDirectionRef = useRef(new THREE.Vector3());
  const scratchVec3Ref = useRef(new THREE.Vector3());
  const nearbyNPCNameRef = useRef<string | null>(null);
  const [nearbyNPCName, setNearbyNPCName] = useState<string | null>(null);
  const [dialogueOpen, setDialogueOpen] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const streamCleanupRef = useRef<(() => void) | null>(null);

  // Crosshair interaction state
  const [crosshairActive, setCrosshairActive] = useState(false);
  const crosshairActiveRef = useRef(false);
  const hoveredNPCObjRef = useRef<THREE.Object3D | null>(null);
  const hoveredInteractableRef = useRef<THREE.Object3D | null>(null);
  const [interactActionText, setInteractActionText] = useState<string | null>(null);
  const eventSystemRef = useRef<EventSystem | null>(null);
  const isApplyingPatchRef = useRef<boolean>(false);
  const interactRaycasterRef = useRef(new THREE.Raycaster());
  const uploadedImages = useWorldStore((state) => state.uploadedImages);

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

  const buildNpcCharacter = (biome?: BiomeType): THREE.Group => {
    const archetypeMap: Record<BiomeType, string> = {
      cyber: 'npc_cyber_cyborg',
      ruins: 'npc_arcane_mystic',
      canyon: 'npc_desert_scavenger',
      pine: 'npc_forest_guardian',
      alien: 'npc_steam_alchemist',
    };
    const archetypeId = (biome && archetypeMap[biome]) || 'npc_cyber_cyborg';
    const npcMesh = presetRegistry.spawn(archetypeId);
    npcMesh.name = `NPC_${archetypeId}`;
    return npcMesh;
  };

  const disposeHierarchy = (obj: THREE.Object3D) => {
    if ((obj as THREE.Mesh).geometry) {
      (obj as THREE.Mesh).geometry.dispose();
    }
    if ((obj as THREE.Mesh).material) {
      const mats = Array.isArray((obj as THREE.Mesh).material)
        ? ((obj as THREE.Mesh).material as THREE.Material[])
        : [(obj as THREE.Mesh).material as THREE.Material];
      mats.forEach((m) => {
        if (!m) return;
        m.dispose();
        const textureKeys = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap', 'alphaMap'];
        for (const key of textureKeys) {
          const tex = (m as unknown as Record<string, unknown>)[key];
          if (tex && typeof tex === 'object' && 'isTexture' in tex && (tex as { isTexture: boolean }).isTexture) {
            (tex as THREE.Texture).dispose();
          }
        }
      });
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
          if (pseudoRandom(itemSeed + 2) > 0.6) {
            entity = presetRegistry.spawn('tree_layered_canopy', { scale: 0.7 + pseudoRandom(itemSeed + 3) * 0.6 });
          } else if (pseudoRandom(itemSeed + 2) > 0.35) {
            entity = buildOrganicConiferTree(itemSeed, 0.8 + pseudoRandom(itemSeed + 3) * 0.5);
          } else if (pseudoRandom(itemSeed + 2) > 0.2) {
            entity = presetRegistry.spawn('grass_tuft_dense', { scale: 0.8 + pseudoRandom(itemSeed + 3) * 0.5 });
          } else {
            entity = buildProceduralRock(itemSeed, 0.8 + pseudoRandom(itemSeed + 3) * 0.9);
          }
        } else if (biome === 'cyber') {
          entity = buildCyberMonolith(itemSeed, 0.6 + pseudoRandom(itemSeed + 3) * 0.8);
        } else if (biome === 'alien') {
          entity = buildAlienMushroom(itemSeed, 0.8 + pseudoRandom(itemSeed + 3) * 0.7);
        } else if (biome === 'ruins') {
          if (pseudoRandom(itemSeed + 2) > 0.5) {
            entity = presetRegistry.spawn('prop_rune_obelisk', { scale: 0.75 + pseudoRandom(itemSeed + 3) * 0.6 });
          } else {
            entity = buildAncientRuinPillar(itemSeed, 0.7 + pseudoRandom(itemSeed + 3) * 0.8);
          }
        } else if (biome === 'canyon') {
          entity = buildProceduralRock(itemSeed, 1.2 + pseudoRandom(itemSeed + 3) * 1.5);
        }

        if (entity) {
          entity.position.set(x, y, z);
          entity.rotation.y = pseudoRandom(itemSeed + 4) * Math.PI * 2;
          group.add(entity);
        }
      }

      // 5. Spawn In-scene NPC character from high-detail 3D preset registry
      const npcMesh = buildNpcCharacter(biome);
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

    // 5b. Default Visible Sun & Celestial Sky
    const sunGroup = new THREE.Group();
    sunGroup.name = 'Celestial_Sun';
    sunGroup.userData = { id: 'default_sun_mesh', name: 'Default Sun', type: 'Lights/SunMesh' };

    // Glowing sun core sphere
    const sunCoreGeo = new THREE.SphereGeometry(7, 32, 32);
    const sunCoreMat = new THREE.MeshBasicMaterial({
      color: 0xfffae0,
      fog: false,
    });
    const sunCore = new THREE.Mesh(sunCoreGeo, sunCoreMat);
    sunCore.name = 'Sun_Core';
    sunGroup.add(sunCore);

    // Atmospheric corona glow halo
    const coronaGeo = new THREE.SphereGeometry(11, 24, 24);
    const coronaMat = new THREE.MeshBasicMaterial({
      color: 0xffe082,
      transparent: true,
      opacity: 0.35,
      side: THREE.BackSide,
      fog: false,
    });
    const corona = new THREE.Mesh(coronaGeo, coronaMat);
    corona.name = 'Sun_Corona';
    sunGroup.add(corona);

    // Moon mesh for night mode
    const moonGeo = new THREE.SphereGeometry(5, 32, 32);
    const moonMat = new THREE.MeshBasicMaterial({
      color: 0xd6e4ff,
      fog: false,
    });
    const moon = new THREE.Mesh(moonGeo, moonMat);
    moon.name = 'Celestial_Moon';
    moon.visible = false;
    sunGroup.add(moon);

    sunGroup.position.set(80, 115, 60);
    scene.add(sunGroup);
    sunMeshRef.current = sunGroup;

    // 5c. Night Starfield
    const starCount = 1200;
    const starGeo = new THREE.BufferGeometry();
    const starPositions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const u = Math.random();
      const v = Math.random();
      const theta = u * 2.0 * Math.PI;
      const phi = Math.acos(2.0 * v - 1.0);
      const r = 380 + Math.random() * 80;
      starPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      starPositions[i * 3 + 1] = Math.abs(r * Math.cos(phi)) + 20; // upper hemisphere
      starPositions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    const starMat = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 1.8,
      transparent: true,
      opacity: 0.85,
      sizeAttenuation: false,
      fog: false,
    });
    const starField = new THREE.Points(starGeo, starMat);
    starField.name = 'Night_StarField';
    starField.visible = false;
    scene.add(starField);
    starFieldRef.current = starField;

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
        const rendererInfo = renderer.info;
        const estimatedMB = parseFloat(((rendererInfo.memory.geometries * 0.05) + (rendererInfo.memory.textures * 0.5)).toFixed(1));
        useUIStore.getState().setTelemetry({ bufferMemoryMB: estimatedMB });
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

        // Project movement onto horizontal plane (ignore pitch)
        const forward = scratchVec3Ref.current;
        camera.getWorldDirection(forward);
        forward.y = 0;
        forward.normalize();
        const right = new THREE.Vector3().crossVectors(forward, camera.up).normalize();
        camera.position.addScaledVector(forward, -vel.z * delta);
        camera.position.addScaledVector(right, -vel.x * delta);

        const currentSeed = useUIStore.getState().seed;
        const elev = useUIStore.getState().tuningParams.elevation;
        const groundH = getElevation(camera.position.x, camera.position.z, currentSeed, elev);
        camera.position.y = THREE.MathUtils.lerp(camera.position.y, groundH + 2.4, 0.2);

      } else {
        controls.update();
      }

      // ── Process all active NPCs in scene: idle bob, smooth lookAt, and HUD proximity ──
      const currentSeed = useUIStore.getState().seed;
      const elev = useUIStore.getState().tuningParams.elevation;
      const allNPCs: THREE.Object3D[] = [];
      scene.traverse((obj) => {
        if (
          obj instanceof THREE.Group &&
          (obj.userData?.type === 'npc' || obj.userData?.isNPC === true || obj.name?.toLowerCase().includes('npc'))
        ) {
          allNPCs.push(obj);
        }
      });
      if (npcCharacterRef.current && !allNPCs.includes(npcCharacterRef.current)) {
        allNPCs.push(npcCharacterRef.current);
      }

      let closestNPCName: string | null = null;
      let minNpcDist = 4.0;
      const dummyObj = new THREE.Object3D();
      const tempPos = new THREE.Vector3();

      for (const npc of allNPCs) {
        npc.getWorldPosition(tempPos);

        // Ground snapping + subtle idle hovering bob
        const groundY = getElevation(npc.position.x, npc.position.z, currentSeed, elev);
        npc.position.y = groundY + Math.sin(time * 2.0) * 0.08;

        const dist = camera.position.distanceTo(tempPos);
        if (dist <= minNpcDist) {
          minNpcDist = dist;
          closestNPCName = npc.userData?.name || 'NPC';
        }

        // Smooth look-at player when within 10 units
        if (dist > 0.01 && dist < 10) {
          scratchVec3Ref.current.set(camera.position.x, npc.position.y, camera.position.z);
          dummyObj.position.copy(npc.position);
          dummyObj.lookAt(scratchVec3Ref.current);
          npc.quaternion.slerp(dummyObj.quaternion, 0.08);
        }
      }

      if (closestNPCName !== nearbyNPCNameRef.current) {
        nearbyNPCNameRef.current = closestNPCName;
        setNearbyNPCName(closestNPCName);
      }

      const hudCoordsEl = document.getElementById('hudCoords');
      if (hudCoordsEl) {
        hudCoordsEl.textContent = `CAM: X: ${camera.position.x.toFixed(1)} Y: ${camera.position.y.toFixed(1)} Z: ${camera.position.z.toFixed(1)}`;
      }

      // Sync live player position to worldStore so save & autosave record exact location
      if (cameraMode === 'walk' || pointerLockRef.current?.isLocked) {
        useWorldStore.getState().setPlayerPosition([
          Number(camera.position.x.toFixed(2)),
          Number(camera.position.y.toFixed(2)),
          Number(camera.position.z.toFixed(2)),
        ]);
      }

      // ── EventSystem Tick (proximity, time, flag triggers) ──
      if (eventSystemRef.current) {
        eventSystemRef.current.tick(delta, camera.position, scene);
      }

      // F5: Crosshair interactable detection & hover highlight (NPCs, Doors, Items, Props)
      if (pointerLockRef.current?.isLocked) {
        const raycaster = interactRaycasterRef.current;
        raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
        const hits = raycaster.intersectObjects(scene.children, true);
        const hitNPC = hits.find((h) =>
          h.object.userData?.interactable === true ||
          h.object.userData?.type === 'npc' ||
          h.object.userData?.isNPC === true ||
          h.object.name?.toLowerCase().includes('npc')
        );

        let hitInteractable: THREE.Object3D | null = null;
        let detectedActionText: string | null = null;

        for (const h of hits) {
          if (h.distance > 4.5) continue;
          let obj: THREE.Object3D | null = h.object;
          while (obj && obj !== scene) {
            const uData = obj.userData || {};
            const nameLower = (obj.name || '').toLowerCase();
            const typeLower = (uData.type || '').toLowerCase();
            const idLower = (uData.id || '').toLowerCase();

            // Pickable item
            if (uData.pickable === true || typeLower === 'item' || nameLower.includes('item') || typeLower.includes('key')) {
              hitInteractable = obj;
              detectedActionText = `Pick up ${uData.name || obj.name || 'item'}`;
              break;
            }
            // Door / gate
            if (
              uData.locked !== undefined ||
              typeLower.includes('door') ||
              nameLower.includes('door') ||
              idLower.includes('door') ||
              typeLower.includes('gate') ||
              nameLower.includes('gate')
            ) {
              hitInteractable = obj;
              detectedActionText = uData.locked !== false ? 'Open door' : 'Examine door';
              break;
            }
            // Generic interactable or structure
            if (uData.interactable === true || (uData.id && sceneGraph?.events?.some((ev) => ev.target === uData.id))) {
              hitInteractable = obj;
              detectedActionText = `Interact with ${uData.name || obj.name || 'object'}`;
              break;
            }
            obj = obj.parent;
          }
          if (hitInteractable) break;
        }

        // Proximity fallback within 3.5m radius
        if (!hitInteractable && !hitNPC) {
          const INTERACT_RADIUS = 3.5;
          const pPos = camera.position;
          const tempP = new THREE.Vector3();

          scene.traverse((obj) => {
            if (hitInteractable) return;
            const uData = obj.userData || {};
            const nameLower = (obj.name || '').toLowerCase();
            const typeLower = (uData.type || '').toLowerCase();
            const idLower = (uData.id || '').toLowerCase();

            if (
              uData.locked !== undefined ||
              uData.pickable === true ||
              typeLower.includes('door') ||
              nameLower.includes('door') ||
              idLower.includes('door') ||
              typeLower === 'item' ||
              nameLower.includes('item') ||
              uData.interactable === true
            ) {
              obj.getWorldPosition(tempP);
              if (tempP.distanceTo(pPos) <= INTERACT_RADIUS) {
                hitInteractable = obj;
                if (uData.pickable === true || typeLower === 'item' || nameLower.includes('item')) {
                  detectedActionText = `Pick up ${uData.name || obj.name || 'item'}`;
                } else if (uData.locked !== undefined || typeLower.includes('door') || nameLower.includes('door') || idLower.includes('door')) {
                  detectedActionText = uData.locked !== false ? 'Open door' : 'Examine door';
                } else {
                  detectedActionText = `Interact with ${uData.name || obj.name || 'object'}`;
                }
              }
            }
          });
        }

        hoveredInteractableRef.current = hitInteractable;
        setInteractActionText(detectedActionText);

        const isInteractable = Boolean(hitNPC || hitInteractable);
        if (isInteractable !== crosshairActiveRef.current) {
          crosshairActiveRef.current = isInteractable;
          setCrosshairActive(isInteractable);
        }

        const currentHovered = hitNPC ? hitNPC.object : null;
        if (currentHovered !== hoveredNPCObjRef.current) {
          // Restore unhovered object material
          if (hoveredNPCObjRef.current instanceof THREE.Mesh) {
            const prevMats = Array.isArray(hoveredNPCObjRef.current.material)
              ? hoveredNPCObjRef.current.material
              : [hoveredNPCObjRef.current.material];
            prevMats.forEach((m) => {
              if (m && 'emissive' in m && (m as unknown as { _origEmissive?: THREE.Color })._origEmissive) {
                (m as THREE.MeshStandardMaterial).emissive.copy((m as unknown as { _origEmissive: THREE.Color })._origEmissive);
                (m as THREE.MeshStandardMaterial).emissiveIntensity = (m as unknown as { _origEmissiveIntensity?: number })._origEmissiveIntensity ?? 0;
              }
            });
          }
          hoveredNPCObjRef.current = currentHovered;
          // Apply subtle rim/emissive highlight to hovered NPC mesh
          if (currentHovered instanceof THREE.Mesh) {
            const mats = Array.isArray(currentHovered.material)
              ? currentHovered.material
              : [currentHovered.material];
            mats.forEach((m) => {
              if (m && 'emissive' in m) {
                const stdMat = m as THREE.MeshStandardMaterial;
                if (!(stdMat as unknown as { _origEmissive?: THREE.Color })._origEmissive) {
                  (stdMat as unknown as { _origEmissive: THREE.Color })._origEmissive = stdMat.emissive.clone();
                  (stdMat as unknown as { _origEmissiveIntensity: number })._origEmissiveIntensity = stdMat.emissiveIntensity;
                }
                stdMat.emissive.setHex(0x34d399); // Subtle emerald highlight
                stdMat.emissiveIntensity = 0.35;
              }
            });
          }
        }
      }

      // F7: Live buffer memory estimate (every 60 frames)
      if (frameCount % 60 === 0) {
        const rendererInfo = renderer.info;
        const estimatedMB = parseFloat(((rendererInfo.memory.geometries * 0.05) + (rendererInfo.memory.textures * 0.5)).toFixed(1));
        useUIStore.getState().setTelemetry({ bufferMemoryMB: estimatedMB });
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
      streamCleanupRef.current?.();
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
      // Dispose all geometries and materials in the scene
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry?.dispose();
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          for (const m of mats) {
            if (m instanceof THREE.Material) {
              // Dispose any textures attached to the material
              for (const key of Object.keys(m)) {
                const val = (m as unknown as Record<string, unknown>)[key];
                if (val && typeof val === 'object' && 'isTexture' in val) {
                  (val as THREE.Texture).dispose();
                }
              }
              m.dispose();
            }
          }
        }
      });
      renderer.info.reset();
      const after = renderer.info.memory;
      console.info(`[VRAM GC] Disposed geometries, materials, and textures. Before: ${beforeGeo}G/${beforeTex}T → After: ${after.geometries}G/${after.textures}T`);
    };
    window.addEventListener('engine:gc-request', handleGC);
    return () => window.removeEventListener('engine:gc-request', handleGC);
  }, []);

  // Handle smart-edit events from SmartEditBar
  useEffect(() => {
    const handleSmartEdit = async (e: Event) => {
      const { instruction } = (e as CustomEvent<{ instruction: string }>).detail;
      try {
        const renderer = rendererRef.current;
        const screenshot = renderer?.domElement.toDataURL('image/jpeg', 0.75);
        const result = await window.electronAPI.updateWorld({
          currentGraph: useWorldStore.getState().sceneGraph!,
          updatePrompt: instruction,
          screenshot,
        });
        if (result.success) {
          useWorldStore.getState().patchSceneGraph(result.data);
          window.dispatchEvent(new CustomEvent('engine:smart-edit-done', { detail: { success: true } }));
        } else {
          window.dispatchEvent(new CustomEvent('engine:smart-edit-done', { detail: { success: false, error: result.error.message } }));
        }
      } catch (err) {
        window.dispatchEvent(new CustomEvent('engine:smart-edit-done', { detail: { success: false, error: String(err) } }));
      }
    };

    // Live partial world patch from UpdatePromptBar (Task 4.4)
    const handleApplyWorldPatch = (e: Event) => {
      const { partial } = (e as CustomEvent<{ partial: Partial<SceneGraph> }>).detail || {};
      const scene = sceneRef.current;
      const group = sceneGraphGroupRef.current;
      if (!partial || !scene || !group) return;

      isApplyingPatchRef.current = true;

      // 1. Add / patch objects in partial without wiping the scene
      if (partial.objects && partial.objects.length > 0) {
        for (const obj of partial.objects) {
          // Remove existing object with matching id if already present
          let existing: THREE.Object3D | null = null;
          group.traverse((c) => {
            if (!existing && (c.userData?.id === obj.id || c.name === obj.id)) existing = c;
          });
          if (existing) {
            group.remove(existing);
            disposeHierarchy(existing);
          }

          const typeLower = (obj.type || '').toLowerCase();
          const nameLower = (obj.name || '').toLowerCase();
          let mesh: THREE.Object3D;

          if (
            typeLower.includes('bonfire') ||
            nameLower.includes('bonfire') ||
            typeLower.includes('campfire') ||
            typeLower.includes('fire')
          ) {
            const fireGroup = new THREE.Group();
            fireGroup.name = obj.name || 'Bonfire';

            // Logs
            const logMat = new THREE.MeshStandardMaterial({ color: 0x4a2e18, roughness: 0.9 });
            for (let i = 0; i < 4; i++) {
              const logMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 1.4, 6), logMat);
              logMesh.rotation.z = Math.PI / 2;
              logMesh.rotation.y = (i * Math.PI) / 4;
              logMesh.position.y = 0.15;
              fireGroup.add(logMesh);
            }

            // Glowing flames
            const flameMat = new THREE.MeshBasicMaterial({ color: 0xff5500 });
            const flameMesh = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.1, 7), flameMat);
            flameMesh.position.y = 0.6;
            fireGroup.add(flameMesh);

            // Flickering light
            const fireLight = new THREE.PointLight(0xff7722, 2.5, 15);
            fireLight.position.y = 1.0;
            fireGroup.add(fireLight);

            mesh = fireGroup;
          } else {
            let geo: THREE.BufferGeometry;
            let color = 0x8b5cf6;
            if (
              typeLower.includes('structure') ||
              typeLower.includes('building') ||
              typeLower.includes('tower') ||
              typeLower.includes('hut')
            ) {
              geo = new THREE.BoxGeometry(3, 4, 3);
              color = 0x64748b;
            } else if (typeLower.includes('foliage') || typeLower.includes('tree')) {
              geo = new THREE.ConeGeometry(1.2, 3.5, 6);
              color = 0x15803d;
            } else if (typeLower.includes('item') || typeLower.includes('key') || typeLower.includes('gem')) {
              geo = new THREE.DodecahedronGeometry(0.4);
              color = 0xf59e0b;
            } else {
              geo = new THREE.BoxGeometry(1.5, 1.5, 1.5);
              color = 0xa855f7;
            }
            mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.7 }));
          }

          if (obj.position && obj.position.length >= 3) {
            mesh.position.set(obj.position[0], obj.position[1], obj.position[2]);
          }
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          mesh.userData = {
            id: obj.id,
            name: obj.name,
            type: obj.type,
            collidable: obj.collidable ?? true,
            interactable: obj.interactable ?? true,
            pickable: obj.pickable ?? (obj.type === 'item'),
            locked: obj.locked ?? false,
          };
          group.add(mesh);
        }
      }

      // 2. Add / patch characters
      if (partial.characters && partial.characters.length > 0) {
        for (const char of partial.characters) {
          let existing: THREE.Object3D | null = null;
          group.traverse((c) => {
            if (!existing && (c.userData?.id === char.id || c.name === char.name)) existing = c;
          });
          if (existing) {
            group.remove(existing);
            disposeHierarchy(existing);
          }
          const npcMesh = buildNpcCharacter();
          npcMesh.name = `NPC_${char.name.replace(/\s+/g, '_')}`;
          npcMesh.userData = { ...npcMesh.userData, id: char.id, name: char.name };
          npcMesh.position.set(char.position[0], char.position[1] || 0, char.position[2]);
          group.add(npcMesh);
        }
      }

      // 3. Register any new events
      if (partial.events && partial.events.length > 0 && eventSystemRef.current) {
        eventSystemRef.current.appendEvents(partial.events);
      }

      // 4. Update atmosphere
      if (partial.atmosphere && scene.fog instanceof THREE.FogExp2) {
        if (partial.atmosphere.fogColor) scene.fog.color.set(partial.atmosphere.fogColor);
        if (partial.atmosphere.fogDensity !== undefined) scene.fog.density = partial.atmosphere.fogDensity;
      }
      if (partial.skybox && partial.skybox.topColor) {
        scene.background = new THREE.Color(partial.skybox.topColor);
      }

      syncSceneHierarchy(scene);
    };

    window.addEventListener('engine:smart-edit', handleSmartEdit);
    window.addEventListener('engine:apply-world-patch', handleApplyWorldPatch);
    return () => {
      window.removeEventListener('engine:smart-edit', handleSmartEdit);
      window.removeEventListener('engine:apply-world-patch', handleApplyWorldPatch);
    };
  }, [syncSceneHierarchy]);

  // Sync Biome and Seed changes
  useEffect(() => {
    if (useWorldStore.getState().isCustomWorldActive) return;
    generateWorld(activeBiome);
  }, [activeBiome, seed, generateWorld]);

  // Sync if sceneGraph is updated and build world
  useEffect(() => {
    // If a live patch is being applied, skip full scene rebuild
    if (isApplyingPatchRef.current) {
      isApplyingPatchRef.current = false;
      return;
    }

    // Note: sceneGraph.world.biome is used for atmosphere/lighting context only,
    // NOT to trigger the preset world builder (that would overwrite the generated world).
    const scene = sceneRef.current;
    const group = sceneGraphGroupRef.current;
    if (scene && group && sceneGraph) {
      // 0. Setup / update EventSystem for the active world
      if (!eventSystemRef.current) {
        eventSystemRef.current = new EventSystem({
          onTeleport: (pos) => {
            if (cameraRef.current) cameraRef.current.position.set(pos[0], pos[1], pos[2]);
          },
        });
      }
      if (sceneGraph.events && sceneGraph.events.length > 0) {
        eventSystemRef.current.registerAll(sceneGraph.events);
      }

      // Restore player position if specified in graph or saved world
      if (cameraRef.current && sceneGraph.player) {
        const startPos = sceneGraph.player.spawn || sceneGraph.player.startPosition;
        if (startPos) {
          cameraRef.current.position.set(startPos[0], startPos[1] || 2.4, startPos[2]);
        }
      }

      // Clear existing procedural scatter
      while (group.children.length > 0) {
        const obj = group.children[0];
        group.remove(obj);
        disposeHierarchy(obj);
      }

      // Execute LLM-generated code directly into the scene (only when code exists)
      if (generatedCode) {
        try {
          const worldSeed = useUIStore.getState().seed;
          const elev = useUIStore.getState().tuningParams.elevation;
          const helpers = new ProceduralAssetLibrary(group, worldSeed, (x, z) => getElevation(x, z, worldSeed, elev));
          const assets = { helpers, textures: new Map() };
          const buildFn = new Function('scene', 'THREE', 'assets', `"use strict";\n${generatedCode}`);
          buildFn(group, THREE, assets);
          useUIStore.getState().addIpcLog('[WORLDBUILDER] LLM-generated world built successfully.', 'success');
          useUIStore.getState().setGeneratorMeta({
            generator: 'ProceduralAssetLibrary.v2',
            lodStrategy: 'Dynamic Geometry Tier 1',
            zodValidation: 'Passed (Strict)',
          });
          useWorldStore.getState().setCustomWorldActive(true);
        } catch (err) {
          console.warn('[ThreeViewport] LLM code execution failed:', err);
          useUIStore.getState().addIpcLog(`[WORLDBUILDER] Code execution error: ${String(err)}`, 'error');
          useUIStore.getState().setGeneratorMeta({ zodValidation: 'Failed' });
        }
      }

      // Spawn graph objects as fallback meshes
      if (sceneGraph.objects) {
        for (const obj of sceneGraph.objects) {
          // Skip if procedural code already placed this entity
          let alreadyBuilt = false;
          group.traverse((child) => {
            if (child.userData?.id === obj.id || child.name === obj.id) alreadyBuilt = true;
          });
          if (alreadyBuilt) continue;

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

          const isItem = obj.type === 'item' || obj.id?.includes('item') || obj.name?.toLowerCase().includes('item');
          const isDoor =
            obj.type === 'door' ||
            obj.id?.includes('door') ||
            obj.name?.toLowerCase().includes('door') ||
            obj.locked !== undefined;

          const currentFlags = useWorldStore.getState().flags || {};
          const isAlreadyUnlocked = Boolean(
            currentFlags[`${obj.id}_unlocked`] ||
            (isDoor && currentFlags.door_unlocked)
          );

          mesh.userData = {
            id: obj.id,
            name: obj.name,
            type: obj.type,
            collidable: isAlreadyUnlocked ? false : (obj.collidable ?? !isItem),
            interactable: obj.interactable ?? (isDoor || isItem),
            pickable: obj.pickable ?? isItem,
            locked: isAlreadyUnlocked ? false : (obj.locked ?? (isDoor ? true : false)),
            description: obj.description || '',
          };
          if (isAlreadyUnlocked && isDoor) {
            mesh.rotation.y += Math.PI / 2;
          }
          group.add(mesh);
        }
      }

      // Spawn NPC characters from scene graph
      if (sceneGraph.characters) {
        const charImages = uploadedImages.filter((img) => (img.tag || '').toLowerCase() === 'character');
        for (let i = 0; i < sceneGraph.characters.length; i++) {
          const char = sceneGraph.characters[i];
          const charPortrait =
            char.image ||
            (char.assetUrl && char.assetUrl.startsWith('data:image') ? char.assetUrl : null) ||
            (charImages[i] || charImages[0])?.base64;

          if (charPortrait) {
            imageToGeometry(charPortrait, {
              id: char.id,
              name: char.name,
            })
              .then((avatar) => {
                avatar.position.set(char.position[0], 0, char.position[2]);
                group.add(avatar);
                if (sceneRef.current) syncSceneHierarchy(sceneRef.current);
              })
              .catch((err) => {
                console.warn(`[ThreeViewport] Failed to generate avatar for ${char.name}:`, err);
                const npcMesh = buildNpcCharacter();
                npcMesh.name = `NPC_${char.name.replace(/\s+/g, '_')}`;
                npcMesh.userData = { ...npcMesh.userData, id: char.id, name: char.name };
                npcMesh.position.set(char.position[0], 0, char.position[2]);
                group.add(npcMesh);
              });
          } else {
            const npcMesh = buildNpcCharacter();
            npcMesh.name = `NPC_${char.name.replace(/\s+/g, '_')}`;
            npcMesh.userData = { ...npcMesh.userData, id: char.id, name: char.name };
            npcMesh.position.set(char.position[0], 0, char.position[2]);
            group.add(npcMesh);
          }
        }
      }

      const hudNpcEl = document.getElementById('hudNpcCount');
      if (hudNpcEl) hudNpcEl.textContent = `${sceneGraph.characters?.length ?? 0} characters`;
      if (sceneRef.current) syncSceneHierarchy(sceneRef.current);
    }
  }, [sceneGraph, generatedCode, syncSceneHierarchy, uploadedImages]);

  // Spawn 3D extruded avatar whenever a character portrait is uploaded in ImageUploader
  useEffect(() => {
    const charImage = uploadedImages.find((img) => (img.tag || '').toLowerCase() === 'character');
    if (!charImage) return;

    let cancelled = false;
    imageToGeometry(charImage.base64, {
      name: 'Custom Character',
    })
      .then((customAvatar) => {
        if (cancelled) return;
        const scene = sceneRef.current;
        if (!scene) return;

        if (npcCharacterRef.current) {
          const prevPos = npcCharacterRef.current.position.clone();
          const parent = npcCharacterRef.current.parent || scene;
          parent.remove(npcCharacterRef.current);
          disposeHierarchy(npcCharacterRef.current);

          customAvatar.position.copy(prevPos);
          parent.add(customAvatar);
          npcCharacterRef.current = customAvatar;
        } else {
          const cam = cameraRef.current;
          const spawnX = cam ? cam.position.x : 3;
          const spawnZ = cam ? cam.position.z - 4 : 5;
          const currentSeed = useUIStore.getState().seed;
          const elev = useUIStore.getState().tuningParams.elevation;
          const spawnY = getElevation(spawnX, spawnZ, currentSeed, elev);
          customAvatar.position.set(spawnX, spawnY, spawnZ);
          scene.add(customAvatar);
          npcCharacterRef.current = customAvatar;
        }
        syncSceneHierarchy(scene);
        useUIStore.getState().addIpcLog('[img2threejs] 3D extruded avatar spawned from portrait.', 'success');
      })
      .catch((err) => {
        console.warn('[ThreeViewport] Failed to build avatar from uploaded image:', err);
      });

    return () => {
      cancelled = true;
    };
  }, [uploadedImages, syncSceneHierarchy]);

  // Sync Wireframe toggle
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        mats.forEach((m) => {
          if (m instanceof THREE.Material && 'wireframe' in m) {
            (m as THREE.MeshStandardMaterial).wireframe = wireframe;
          }
        });
      }
    });
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

  // Sync Day/Night mode, Celestial Sun/Moon Position, Lighting & Atmosphere
  useEffect(() => {
    const sunLight = sunLightRef.current;
    const sunMesh = sunMeshRef.current;
    const ambientLight = ambientLightRef.current;
    const starField = starFieldRef.current;
    const scene = sceneRef.current;
    if (!sunLight || !scene) return;

    if (isNight) {
      // ── Night Mode (Moonlight, Deep Midnight Sky & Stars) ──
      const moonAngle = 60 * (Math.PI / 180);
      const moonDist = 75;
      const moonX = Math.cos(moonAngle) * moonDist;
      const moonY = Math.sin(moonAngle) * moonDist;
      const moonZ = -35;

      sunLight.position.set(moonX, moonY, moonZ);
      sunLight.color.setHex(0x8ba2cc);
      sunLight.intensity = 0.22;

      if (ambientLight) {
        ambientLight.color.setHex(0x0f172a);
        ambientLight.intensity = 0.15;
      }

      if (sunMesh) {
        sunMesh.position.set(moonX * 2.2, moonY * 2.2, moonZ * 2.2);
        const core = sunMesh.getObjectByName('Sun_Core');
        const corona = sunMesh.getObjectByName('Sun_Corona');
        const moon = sunMesh.getObjectByName('Celestial_Moon');
        if (core) core.visible = false;
        if (corona) corona.visible = false;
        if (moon) moon.visible = true;
      }

      if (starField) {
        starField.visible = true;
      }

      scene.background = new THREE.Color(0x060814);
      if (scene.fog) {
        scene.fog.color.setHex(0x060814);
      }
    } else {
      // ── Day Mode (Default Sun & Daylight Atmosphere) ──
      const rad = (tuningParams.sunAngle * Math.PI) / 180;
      const sunDist = 70;
      const sunX = Math.cos(rad) * sunDist;
      const sunY = Math.max(14, Math.sin(rad) * sunDist);
      const sunZ = 30;

      sunLight.position.set(sunX, sunY, sunZ);

      // Biome-specific daylight illumination
      if (activeBiome === 'canyon') {
        sunLight.color.setHex(0xffedd5);
        if (ambientLight) ambientLight.color.setHex(0xfdba74);
      } else if (activeBiome === 'cyber') {
        sunLight.color.setHex(0xf43f5e);
        if (ambientLight) ambientLight.color.setHex(0x38bdf8);
      } else if (activeBiome === 'alien') {
        sunLight.color.setHex(0xa855f7);
        if (ambientLight) ambientLight.color.setHex(0x2dd4bf);
      } else if (activeBiome === 'ruins') {
        sunLight.color.setHex(0xfb923c);
        if (ambientLight) ambientLight.color.setHex(0xfde68a);
      } else {
        sunLight.color.setHex(0xfffae0);
        if (ambientLight) ambientLight.color.setHex(0xdde6ff);
      }
      sunLight.intensity = 1.35;
      if (ambientLight) ambientLight.intensity = 0.45;

      if (sunMesh) {
        sunMesh.position.set(sunX * 2.4, sunY * 2.4, sunZ * 2.4);
        const core = sunMesh.getObjectByName('Sun_Core');
        const corona = sunMesh.getObjectByName('Sun_Corona');
        const moon = sunMesh.getObjectByName('Celestial_Moon');
        if (core) core.visible = true;
        if (corona) corona.visible = true;
        if (moon) moon.visible = false;
      }

      if (starField) {
        starField.visible = false;
      }

      let skyColor = 0x111827;
      let fogColor = 0x0f172a;
      if (activeBiome === 'canyon') {
        skyColor = 0x9a3412;
        fogColor = 0x29150d;
      } else if (activeBiome === 'cyber') {
        skyColor = 0x111318;
        fogColor = 0x090514;
      } else if (activeBiome === 'alien') {
        skyColor = 0x064e3b;
        fogColor = 0x041b18;
      } else if (activeBiome === 'ruins') {
        skyColor = 0x44403c;
        fogColor = 0x1c1917;
      } else {
        skyColor = 0x1e3a5f;
        fogColor = 0x0f172a;
      }

      scene.background = new THREE.Color(skyColor);
      if (scene.fog) {
        scene.fog.color.setHex(fogColor);
      }
    }
  }, [isNight, tuningParams.sunAngle, activeBiome]);

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

  // Sync Inspector transform controls to 3D scene & selection box
  useEffect(() => {
    if (!selectedNode) {
      if (selectionBoxRef.current) {
        selectionBoxRef.current.visible = false;
      }
      return;
    }
    const scene = sceneRef.current;
    if (!scene) return;
    let target: THREE.Object3D | undefined = undefined;
    scene.traverse((child: THREE.Object3D) => {
      if (
        child.uuid === selectedNode.id ||
        child.userData?.id === selectedNode.id ||
        (child.name && child.name === selectedNode.name)
      ) {
        target = child;
      }
    });
    const selectedObj = target as unknown as THREE.Object3D | undefined;
    if (selectedObj) {
      selectedObj.position.set(selectedNode.position[0], selectedNode.position[1], selectedNode.position[2]);
      if (selectionBoxRef.current) {
        if ((selectedObj as THREE.Mesh).geometry || selectedObj.children.length > 0) {
          selectionBoxRef.current.setFromObject(selectedObj);
          selectionBoxRef.current.visible = true;
        } else {
          selectionBoxRef.current.visible = false;
        }
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

  // GLTF Export event listener (Point 79)
  useEffect(() => {
    // run once on mount — event listener for GLTF export
    const handleExport = async () => {
      const scene = sceneRef.current;
      if (!scene) return;
      try {
        const { GLTFExporter } = await import('three/examples/jsm/exporters/GLTFExporter.js');
        const exporter = new GLTFExporter();
        exporter.parse(
          scene,
          (gltf) => {
            const output = JSON.stringify(gltf, null, 2);
            const blob = new Blob([output], { type: 'application/json' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = `world_${Date.now()}.gltf`;
            link.click();
            URL.revokeObjectURL(link.href);
            useUIStore.getState().showNotification('World exported as GLTF!', 3000, 'success');
          },
          (err) => {
            console.error('[Export] GLTF export failed:', err);
            useUIStore.getState().showNotification('GLTF export failed', 3000, 'error');
          },
          { binary: false }
        );
      } catch (err) {
        console.error('[Export] GLTFExporter not available:', err);
      }
    };
    window.addEventListener('engine:export-gltf', handleExport);
    return () => window.removeEventListener('engine:export-gltf', handleExport);
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
          const pointerLock = pointerLockRef.current;
          if (!pointerLock || !pointerLock.isLocked) break;

          const cam = cameraRef.current;
          const scene = sceneRef.current;
          if (!cam || !scene) break;

          const INTERACT_RADIUS = 4.5;
          const playerPos = cam.position;

          // 1. Check if an item, door, or interactable object is targeted
          const interactTarget = hoveredInteractableRef.current;
          if (interactTarget) {
            const uData = interactTarget.userData || {};
            const typeLower = (uData.type || '').toLowerCase();
            const nameLower = (interactTarget.name || '').toLowerCase();
            const targetId = uData.id || interactTarget.name;

            // 1A. Pick up item
            if (
              uData.pickable === true ||
              typeLower === 'item' ||
              nameLower.includes('item') ||
              typeLower.includes('key')
            ) {
              const itemData = {
                id: targetId || `item_${Date.now()}`,
                name: uData.name || interactTarget.name || 'Mystery Item',
                description: uData.description || 'An item discovered in the world.',
                icon:
                  uData.icon ||
                  (typeLower.includes('key') ? '🗝️' : typeLower.includes('gem') ? '💎' : '📦'),
              };
              const added = useInventoryStore.getState().addItem(itemData);
              if (added) {
                useUIStore.getState().showNotification(`Acquired: ${itemData.name}`, 3500, 'success');
                // Trigger any interaction event associated with picking up
                eventSystemRef.current?.handleInteraction(itemData.id, undefined, scene);
                // Remove mesh from scene
                const parent = interactTarget.parent || scene;
                parent.remove(interactTarget);
                disposeHierarchy(interactTarget);
                hoveredInteractableRef.current = null;
                setInteractActionText(null);
                syncSceneHierarchy(scene);
              }
              break;
            }

            // 1B. Door or unlockable object
            const isDoor =
              uData.locked !== undefined ||
              typeLower.includes('door') ||
              nameLower.includes('door') ||
              typeLower.includes('gate');
            const selectedItem = useInventoryStore.getState().getSelectedItem();

            // Check if EventSystem handles it (e.g. item_use, interaction)
            const eventHandled = eventSystemRef.current?.handleInteraction(
              targetId,
              selectedItem?.id,
              scene
            );

            if (eventHandled) {
              setInteractActionText(null);
              break;
            }

            if (isDoor) {
              if (uData.locked === true) {
                useUIStore.getState().showNotification('The door is locked tight.', 2500, 'info');
              } else if (uData.locked === false) {
                useUIStore.getState().showNotification('The door stands open.', 2500, 'info');
              } else {
                interactTarget.userData.locked = false;
                interactTarget.userData.collidable = false;
                interactTarget.rotation.y += Math.PI / 2; // Door swings open
                useWorldStore.getState().setFlag('door_unlocked', true);
                if (targetId) {
                  useWorldStore.getState().setFlag(`${targetId}_unlocked`, true);
                }
                useUIStore.getState().showNotification('The door creaks open', 3500, 'success');
                setInteractActionText('Examine door');
              }
              break;
            }

            if (eventHandled) {
              break;
            }
          }

          // 2. Otherwise find nearest NPC within interaction radius
          let targetObject: THREE.Object3D | null = null;
          if (hoveredNPCObjRef.current) {
            const hPos = new THREE.Vector3();
            hoveredNPCObjRef.current.getWorldPosition(hPos);
            if (hPos.distanceTo(playerPos) <= INTERACT_RADIUS) {
              targetObject = hoveredNPCObjRef.current;
            }
          }

          if (!targetObject) {
            let minDistance = INTERACT_RADIUS;
            const tempPos = new THREE.Vector3();
            scene.traverse((obj) => {
              const uType = (obj.userData?.type || '').toLowerCase();
              if (!uType.includes('npc') && !obj.userData?.isNPC && !obj.name?.toLowerCase().includes('npc')) return;
              obj.getWorldPosition(tempPos);
              const dist = tempPos.distanceTo(playerPos);
              if (dist <= minDistance) {
                minDistance = dist;
                targetObject = obj;
              }
            });
          }

          if (!targetObject) break;
          const targetNPC = { object: targetObject };

          const npcData = targetNPC.object.userData;
          const character = useWorldStore.getState().sceneGraph?.characters?.find(
            (c) => c.id === npcData.id || c.name === npcData.name
          );
          if (character) {
            setActiveNPC(character);
            setDialogueOpen(true);
            useUIStore.getState().setRightInspectorTab('npc');
            useUIStore.getState().setRightInspectorOpen(true);
          } else {
            // Fallback: create a minimal character record for the default NPC
            setActiveNPC({
              id: targetNPC.object.uuid,
              name: npcData.name || targetNPC.object.name.replace(/_/g, ' '),
              description: 'A wandering ranger who protects the wilds.',
              position: [targetNPC.object.position.x, targetNPC.object.position.y, targetNPC.object.position.z] as [number, number, number],
              personality: 'Wise and cautious forest ranger',
              backstory: 'A wandering ranger who protects the wilds.',
              dialogueStyle: 'Greetings, traveler. What brings you to these lands?',
            } as any);
            setDialogueOpen(true);
            useUIStore.getState().setRightInspectorTab('npc');
            useUIStore.getState().setRightInspectorOpen(true);
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
        case 'KeyN': {
          if (!dialogueOpen && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
            toggleDayNight();
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
      {cameraMode === 'walk' && <Crosshair active={crosshairActive} />}

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

      {/* Interaction HUD for NPCs, Doors, Items, Props */}
      {cameraMode === 'walk' && (nearbyNPCName || interactActionText) && !dialogueOpen && (
        <InteractHint npcName={nearbyNPCName} actionText={interactActionText} />
      )}

      {/* NPC Dialogue Box */}
      {activeNPC && dialogueOpen && (
        <DialogueBox
          npcName={activeNPC.name}
          npcGreeting={(activeNPC as any).dialogueStyle || (activeNPC as any).dialogueSeed || `Greetings, traveler.`}
          onSendMessage={(msg) => {
            setIsStreaming(true);
            setStreamingText('');
            useNPCStore.getState().addDialogueMessage(activeNPC.id, { sender: 'player', text: msg });
            // Send via IPC if available
            if (window.electronAPI?.npcReply) {
              streamCleanupRef.current?.();
              let accumulatedText = '';

              const unsubChunk = window.electronAPI.onStreamChunk?.((chunk: string) => {
                accumulatedText += chunk;
                setStreamingText(accumulatedText);
              });

              const cleanup = () => {
                unsubChunk?.();
                unsubEnd?.();
                unsubError?.();
                streamCleanupRef.current = null;
              };

              const unsubEnd = window.electronAPI.onStreamEnd?.(() => {
                if (accumulatedText.trim()) {
                  useNPCStore.getState().addDialogueMessage(activeNPC.id, { sender: 'npc', text: accumulatedText.trim() });
                }
                setStreamingText('');
                setIsStreaming(false);
                addIpcLog(`[NPC:RESPONSE] Received ${accumulatedText.length} chars from agent stream.`, 'success');
                cleanup();
              });

              const unsubError = window.electronAPI.onStreamError?.((err: string) => {
                console.warn('[NPC:STREAM_ERROR]', err);
                setIsStreaming(false);
                setStreamingText('');
                addIpcLog(`[NPC:ERROR] Stream error: ${err}`, 'error');
                cleanup();
              });

              streamCleanupRef.current = cleanup;

              (window.electronAPI.npcReply({
                npcId: activeNPC.id,
                playerMessage: msg,
                character: {
                  name: activeNPC.name,
                  personality: activeNPC.personality,
                  backstory: (activeNPC as any).backstory || activeNPC.description,
                  dialogueStyle: (activeNPC as any).dialogueStyle || (activeNPC as any).dialogueSeed,
                },
              } as any) as Promise<any>).then((res: { success: boolean; data?: string }) => {
                if (res?.success && res?.data && !accumulatedText.trim()) {
                  setStreamingText(res.data);
                  useNPCStore.getState().addDialogueMessage(activeNPC.id, { sender: 'npc', text: res.data });
                  setIsStreaming(false);
                  cleanup();
                } else if (!window.electronAPI.onStreamEnd && accumulatedText.trim()) {
                  useNPCStore.getState().addDialogueMessage(activeNPC.id, { sender: 'npc', text: accumulatedText.trim() });
                  setStreamingText('');
                  setIsStreaming(false);
                  cleanup();
                }
              }).catch(() => {
                setIsStreaming(false);
                cleanup();
              });
            } else {
              // Fallback: mock response
              setTimeout(() => {
                const reply = 'The winds whisper of ancient tales...';
                setStreamingText(reply);
                useNPCStore.getState().addDialogueMessage(activeNPC.id, { sender: 'npc', text: reply });
                setIsStreaming(false);
              }, 800);
            }
          }}
          onClose={() => {
            streamCleanupRef.current?.();
            streamCleanupRef.current = null;
            setDialogueOpen(false);
            setActiveNPC(null);
            setIsStreaming(false);
            setStreamingText('');
          }}
          streamingText={streamingText}
          isStreaming={isStreaming}
        />
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
          onClick={toggleDayNight}
          title={isNight ? 'Shift to Day (Sun) [Shortcut: N]' : 'Shift to Night (Moon & Stars) [Shortcut: N]'}
          className={`px-2.5 py-1 rounded-md bg-black/60 mac-subtle-blur border border-white/10 text-xs transition cursor-pointer flex items-center space-x-1.5 ${
            isNight ? 'text-indigo-300 border-indigo-500/30 hover:bg-white/20 shadow-sm' : 'text-amber-400 hover:bg-white/20'
          }`}
        >
          <i className={`ph ${isNight ? 'ph-moon' : 'ph-sun'} text-sm`} />
          <span className="font-medium">{isNight ? 'Night' : 'Day'}</span>
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

      {/* World Update Prompt Bar */}
      <UpdatePromptBar />

      {/* Spotlight Prompt Bar */}
      <SpotlightPromptBar />
      <DebugPanel />

      {/* Toast notifications */}
      <NotificationToast />
    </main>
  );
};
