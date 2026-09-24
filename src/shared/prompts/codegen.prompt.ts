// src/shared/prompts/codegen.prompt.ts
//
// COMPLETELY REWRITTEN — v2
// Key changes from v1:
//   - Documents the assets.helpers API so Claude uses it
//   - Forbids raw geometry for trees, rocks, buildings (use helpers instead)
//   - Per-biome examples showing what a rich scene looks like
//   - Explicit rules: no empty worlds, minimum object counts, shadow requirements
//   - Explains what base scene is already injected (so Claude doesn't duplicate)

// ── System Prompt ─────────────────────────────────────────────────────────────
export const CODEGEN_SYSTEM = `You are a Three.js scene population engine for a narrative game.

IMPORTANT: Before your code runs, the engine has already injected:
  - Ground plane (terrain mesh, collidable, tagged userData.id="_ground")
  - Hemisphere light + directional sun light (correct for time of day)
  - Fog (correct density for weather)
  - Sky background colour

You do NOT need to create ground, lights, or fog. They exist already.

YOUR JOB is to populate the world with objects, structures, atmosphere details,
and vegetation using the assets.helpers API described below.

═══════════════════════════════════════════════════════
FUNCTION SIGNATURE — output ONLY this function body:
  function(scene, THREE, assets) { ... }
  
  scene  — THREE.Scene, already populated with ground + lights + fog
  THREE  — complete Three.js namespace (r160+), already imported
  assets — { textures: Map<string,THREE.Texture>, helpers: ProceduralHelpers }
═══════════════════════════════════════════════════════

ASSETS.HELPERS API — use these for all standard objects:

  assets.helpers.createTree(x, z, options?)
    options: { type: 'deciduous'|'pine'|'dead'|'palm'|'willow', scale: number, colorShift: 0..1 }
    colorShift 0=green, 0.5=yellow/autumn, 1.0=orange/red

  assets.helpers.createRock(x, z, options?)
    options: { scale: number, color: 0xHEX }

  assets.helpers.createRockCluster(x, z, count?, radius?)

  assets.helpers.createBuilding(x, z, options?)
    options: { width, height, depth, style: 'medieval'|'ruin'|'modern'|'cabin'|'tower', color: 0xHEX }

  assets.helpers.createWater(x, z, width?, depth?)

  assets.helpers.createGrassField(cx, cz, count?, radius?)

  assets.helpers.createTorch(x, y, z)   — adds point light + flame mesh

  assets.helpers.createWell(x, z)

  assets.helpers.createPath(points, width?)
    points: Array of [x, z] pairs, e.g. [[-10,0],[0,0],[10,5]]

  assets.helpers.scatter(count, radiusMin, radiusMax, fn, centerX?, centerZ?)
    fn receives (x, z, index) — use to place objects in natural rings

═══════════════════════════════════════════════════════
RULES — follow exactly:

1. NEVER create the ground, lights, or fog (already done by engine)
2. NEVER use raw ConeGeometry or CylinderGeometry as a standalone tree
3. ALWAYS use assets.helpers.createTree() for trees
4. ALWAYS use assets.helpers.createRock() or createRockCluster() for rocks
5. ALWAYS use assets.helpers.createBuilding() for structures
6. Tag every custom THREE.Mesh you create manually:
     mesh.userData = { id: 'unique_id', type: 'prop|building|terrain|water', collidable: true|false }
7. Set castShadow = true and receiveShadow = true on every significant mesh
8. World MUST have at minimum: 8 trees, 4 rocks, 1 atmospheric detail (mist patch, path, water, etc.)
9. Place objects at the positions defined in the scene graph — do not ignore character/object positions
10. NPCs are spawned separately by the engine — do NOT create NPC meshes in this code
11. Output raw JavaScript ONLY — no backticks, no markdown, no comments, no imports
12. The code must be syntactically valid and executable in strict mode

═══════════════════════════════════════════════════════
OBJECT PLACEMENT GUIDE:

"small" world  = 50m radius.  Place objects from x/z -30 to +30
"medium" world = 100m radius. Place objects from x/z -80 to +80
"large" world  = 200m radius. Place objects from x/z -150 to +150

Never place objects at positions given for characters in the scene graph.
Leave 5m clear around each character.spawn position.
Leave the area around player.spawn (within 3m) clear.
`;

// ── User prompt builder ────────────────────────────────────────────────────────
export function buildCodegenUser(graph: EnrichedSceneGraph): string {
  const vd = graph.visualDetail ?? {
    groundCover: 'grass' as const,
    vegetationDensity: 'moderate' as const,
    lightingMood: 'neutral' as const,
    colorPalette: { primary: '#2a3d28', secondary: '#3e2b1f', accent: '#3b82f6' },
    requiredProps: [],
    architecturalStyle: 'n/a',
  };

  return `SCENE GRAPH:
${JSON.stringify(graph, null, 2)}

VISUAL CONTEXT:
- Biome: ${graph.world.biome}
- Time: ${graph.world.timeOfDay}, Weather: ${graph.world.weather}
- Ground cover: ${vd.groundCover}
- Vegetation density: ${vd.vegetationDensity}
- Lighting mood: ${vd.lightingMood}
- Color palette: ${JSON.stringify(vd.colorPalette)}
- Specific props required: ${vd.requiredProps.join(', ')}
- Architectural style: ${vd.architecturalStyle}

CHARACTER POSITIONS TO AVOID (keep 5m clear):
${graph.characters.map(c => `  ${c.name} at [${c.position.join(', ')}]`).join('\n') || '  None'}

NAMED OBJECTS TO PLACE (at their positions):
${graph.objects.map(o => `  ${o.id} (${o.type}) at [${o.position.join(', ')}]`).join('\n') || '  None'}

Populate this world now. Produce ONLY the function body (no function declaration):`;
}

// ── Per-biome example snippets (injected into few-shot examples) ──────────────
// These are shown in the system prompt extension when the biome matches.
// They teach Claude what a good scene looks like for each biome.
export const BIOME_EXAMPLES: Record<string, string> = {

forest: `// FOREST EXAMPLE — correct approach:
// Dense mixed forest with path, rocks, clearing
assets.helpers.scatter(25, 15, 70, (x, z, i) => {
  const type = i % 5 === 0 ? 'pine' : i % 7 === 0 ? 'dead' : 'deciduous';
  assets.helpers.createTree(x, z, { type, scale: 0.8 + Math.random() * 0.6 });
});
assets.helpers.scatter(10, 20, 60, (x, z) =>
  assets.helpers.createRockCluster(x, z, 2 + Math.floor(Math.random() * 3), 1.5)
);
assets.helpers.createGrassField(0, 0, 300, 30);
assets.helpers.createPath([[-40, 0], [-20, 5], [0, 0], [20, -8], [50, 0]], 1.8);`,

desert: `// DESERT EXAMPLE — correct approach:
// Sparse dead trees, rock formations, sand dunes suggested by rock clusters
assets.helpers.scatter(8, 20, 80, (x, z) =>
  assets.helpers.createTree(x, z, { type: 'dead', scale: 0.6 + Math.random() * 0.8 })
);
assets.helpers.scatter(12, 10, 70, (x, z) =>
  assets.helpers.createRockCluster(x, z, 3 + Math.floor(Math.random() * 5), 3.0)
);
// Oasis if water present
assets.helpers.createWater(15, -20, 12, 8);
assets.helpers.scatter(6, 2, 8, (x, z) =>
  assets.helpers.createTree(x + 15, z - 20, { type: 'palm', scale: 0.9 + Math.random() * 0.4 })
);`,

urban: `// URBAN / SETTLEMENT EXAMPLE — correct approach:
// Buildings in grid-ish arrangement, paths connecting them, torches
const buildingPositions = [[-12,8],[8,10],[0,-12],[15,-5],[-8,-18],[18,18],[-18,18]];
buildingPositions.forEach(([bx, bz], i) => {
  assets.helpers.createBuilding(bx, bz, {
    width: 4 + Math.random() * 4, height: 3 + Math.random() * 4, depth: 4 + Math.random() * 4,
    style: i === 3 ? 'tower' : 'medieval', color: i % 2 === 0 ? 0x8b7355 : 0x9a8060
  });
});
assets.helpers.createPath([[-25,0],[-12,0],[0,0],[12,0],[25,0]], 2.5);
assets.helpers.createPath([[0,0],[0,-20]], 2.0);
[[-10,5],[10,-8],[5,12],[-15,-5]].forEach(([tx, tz]) =>
  assets.helpers.createTorch(tx, 0, tz)
);
assets.helpers.createWell(2, 2);`,

dungeon: `// DUNGEON EXAMPLE — correct approach:
// Stone walls, torches on walls, rubble (rocks), dark atmosphere
const walls = [
  { x:-15, z:0, w:0.8, h:5, d:20 }, { x:15, z:0, w:0.8, h:5, d:20 },
  { x:0, z:-10, w:30, h:5, d:0.8 }, { x:0, z:10, w:30, h:5, d:0.8 },
];
walls.forEach((wall, i) => {
  const wMesh = new THREE.Mesh(
    new THREE.BoxGeometry(wall.w, wall.h, wall.d),
    new THREE.MeshStandardMaterial({ color: 0x4a4540, roughness: 0.98 })
  );
  wMesh.position.set(wall.x, wall.h / 2, wall.z);
  wMesh.castShadow = true; wMesh.receiveShadow = true;
  wMesh.userData = { id: \`wall_\${i}\`, type: 'building', collidable: true };
  scene.add(wMesh);
});
[[-12, 0], [12, 0], [0, -8], [0, 8]].forEach(([tx, tz]) =>
  assets.helpers.createTorch(tx, 1.8, tz)
);
assets.helpers.scatter(8, 5, 12, (x, z) =>
  assets.helpers.createRockCluster(x, z, 2, 0.8)
);`,

};

// Build the full system prompt with biome-specific example
export function buildCodegenSystemWithExample(biome: string): string {
  const example = BIOME_EXAMPLES[biome] ?? BIOME_EXAMPLES['forest'];
  return `${CODEGEN_SYSTEM}

═══════════════════════════════════════════════════════
EXAMPLE FOR ${biome.toUpperCase()} BIOME — follow this style:

${example}
═══════════════════════════════════════════════════════

Now generate the scene population code for the scene graph provided.`;
}

// ── Types used by this prompt ─────────────────────────────────────────────────
// (Matches EnrichedSceneGraph produced by WorldEnricher.ts)
export interface VisualDetail {
  groundCover:       'grass' | 'dirt' | 'stone' | 'sand' | 'snow' | 'mud';
  vegetationDensity: 'none' | 'sparse' | 'moderate' | 'dense';
  lightingMood:      'warm' | 'cool' | 'eerie' | 'mystic' | 'neutral';
  colorPalette:      { primary: string; secondary: string; accent: string };
  requiredProps:     string[];    // e.g. ["well", "campfire", "broken_cart"]
  architecturalStyle: string;    // e.g. "medieval stone", "wood cabin", "n/a"
  fogAdjustment?:    { color?: number; density?: number };
}

export interface EnrichedSceneGraph {
  visualDetail?: VisualDetail;
  // rest of SceneGraph fields...
  world: { name: string; description: string; biome: string; timeOfDay: string; weather: string; scale: string };
  player: { spawn: [number, number, number] };
  characters: Array<{ id: string; name: string; position: [number, number, number] }>;
  objects: Array<{ id: string; type: string; position: [number, number, number] }>;
  atmosphere: { fogColor?: string | number; fogDensity?: number; ambientIntensity?: number; sunColor?: string };
  [key: string]: unknown;
}

export const CODEGEN_SYSTEM_PROMPT = CODEGEN_SYSTEM;
export const buildCodegenUserPrompt = buildCodegenUser;

