// src/renderer/engine/EngineDefaults.ts
//
// Called by WorldBuilder BEFORE executing LLM-generated code.
// Guarantees every world has: ground, lighting, sky, fog.
// Claude's generated code only needs to add the DETAILS.
// This eliminates the black void problem entirely.

import * as THREE from 'three';
import type { SceneGraph } from '../../shared/schema/sceneGraph.schema';
import { ProceduralAssetLibrary } from './assets/ProceduralAssetLibrary';

// Deterministic seed from world name so variation is consistent per world
function worldSeed(name: string): number {
  let h = 2166136261;
  for (let i = 0; i < name.length; i++) {
    h ^= name.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// ── Ground cover per biome ────────────────────────────────────────────────────
const BIOME_GROUND: Record<SceneGraph['world']['biome'], 'grass' | 'dirt' | 'stone' | 'sand' | 'snow' | 'mud'> = {
  forest:  'grass',
  desert:  'sand',
  urban:   'stone',
  dungeon: 'stone',
  ocean:   'sand',
  tundra:  'snow',
  custom:  'dirt',
  };

// ── Core function ─────────────────────────────────────────────────────────────
export function injectBaseScene(
  scene:  THREE.Scene,
  graph:  SceneGraph,
): ProceduralAssetLibrary {
  const helpers = new ProceduralAssetLibrary(scene, worldSeed(graph.world.name));

  // 1. Lighting — always first (MeshStandardMaterial needs lights to be non-black)
  helpers.setupLighting({
    timeOfDay:  graph.world.timeOfDay,
    weather:    graph.world.weather,
    fogDensity: graph.atmosphere.fogDensity,
  });

  // 2. Ground — always present, scaled to world size
  const groundSize = graph.world.scale === 'small' ? 150
                   : graph.world.scale === 'large' ? 500
                   : 300;

  helpers.createGround({
    size:  groundSize,
    cover: BIOME_GROUND[graph.world.biome],
  });

  // 3. Fog override if graph specifies exact color + density
  if (graph.atmosphere.fogColor !== undefined && graph.atmosphere.fogDensity !== undefined) {
    scene.fog = new THREE.FogExp2(graph.atmosphere.fogColor, graph.atmosphere.fogDensity);
  }

  return helpers; // returned so WorldBuilder can pass to DynamicLoader as assets.helpers
}

// ── Updated DynamicLoader call signature ──────────────────────────────────────
// WorldBuilder uses this instead of calling DynamicLoader directly:
//
//   const helpers = injectBaseScene(scene, graph);
//   const assets: AssetMap = { textures: assetRegistry.textures, helpers };
//   await executeBuildScene(code, scene, assets);
//
// This guarantees that even if the generated code crashes, the base world exists.

// ── Updated loadFallbackScene ─────────────────────────────────────────────────
// Called when generated code fails AND before injectBaseScene was able to run.
// More complete than the original — produces a recognisable, lit world.
export function loadFallbackScene(scene: THREE.Scene, graph?: Partial<SceneGraph>): void {
  // Clear any partial state
  while (scene.children.length > 0) {
    scene.remove(scene.children[0]);
  }

  const helpers = new ProceduralAssetLibrary(scene, 0);

  helpers.setupLighting({
    timeOfDay: (graph?.world?.timeOfDay as SceneGraph['world']['timeOfDay']) ?? 'afternoon',
    weather:   (graph?.world?.weather as SceneGraph['world']['weather']) ?? 'clear',
  });

  helpers.createGround({ size: 300, cover: 'grass' });

  // A handful of trees so the world feels inhabited, not empty
  helpers.scatter(12, 15, 50, (x, z) =>
    helpers.createTree(x, z, { type: 'deciduous', scale: 0.8 + Math.random() * 0.4 })
  );
  helpers.scatter(5, 20, 40, (x, z) =>
    helpers.createRock(x, z, { scale: 0.4 + Math.random() * 0.6 })
  );

  // Visible indicator that this is a fallback
  const mat  = new THREE.MeshStandardMaterial({ color: 0xff4444, emissive: 0x880000, emissiveIntensity: 0.5 });
  const flag = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2, 0.1), mat);
  flag.position.set(0, 1, -5);
  flag.userData = { id: '_fallback_marker', type: 'debug' };
  scene.add(flag);

  console.warn('[EngineDefaults] Fallback scene loaded — check generated code for errors');
}
