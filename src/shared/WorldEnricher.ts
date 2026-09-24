// src/renderer/engine/WorldEnricher.ts
//
// Pipeline Step 1.5 — sits between WorldParser and SceneCodegen.
// Takes the sparse SceneGraph (entities, positions, story) and makes a focused
// second LLM call to extract ALL the visual detail Claude needs to produce
// a rich-looking world: ground cover, vegetation density, color palette,
// specific props, architectural style, lighting mood.
//
// Why a separate step and not part of WorldParser?
//  - WorldParser focuses on narrative extraction (who, where, what happens)
//  - Enricher focuses on visual design (how it looks, what fills space)
//  - Separation keeps both prompts focused → better output from each
//
// Pipeline:
//   Text input → WorldParser → SceneGraph → [WorldEnricher] → EnrichedSceneGraph → CodeGen

import type { SceneGraph } from './schema/sceneGraph.schema';
import type { EnrichedSceneGraph, VisualDetail } from './prompts/codegen.prompt';
import { z } from 'zod';

// ── Zod schema for enrichment output ─────────────────────────────────────────
const VisualDetailSchema = z.object({
  groundCover: z.enum(['grass', 'dirt', 'stone', 'sand', 'snow', 'mud']),
  vegetationDensity: z.enum(['none', 'sparse', 'moderate', 'dense']),
  lightingMood: z.enum(['warm', 'cool', 'eerie', 'mystic', 'neutral']),
  colorPalette: z.object({
    primary:   z.string().regex(/^#[0-9a-fA-F]{6}$/),
    secondary: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    accent:    z.string().regex(/^#[0-9a-fA-F]{6}$/),
  }),
  requiredProps: z.array(z.string().max(30)).max(12),
  architecturalStyle: z.string().max(50),
  fogAdjustment: z.object({
    color:   z.number().int().min(0).max(0xffffff).optional(),
    density: z.number().min(0).max(0.1).optional(),
  }).optional(),
});

// ── System prompt ─────────────────────────────────────────────────────────────
const ENRICHER_SYSTEM = `You are a visual art director for a Three.js game world.
You receive a story-based scene graph and output ONLY a JSON object
describing the visual design of the world.

Output raw JSON only. No markdown. No backticks. No prose.

JSON schema:
{
  "groundCover": "grass" | "dirt" | "stone" | "sand" | "snow" | "mud",
  "vegetationDensity": "none" | "sparse" | "moderate" | "dense",
  "lightingMood": "warm" | "cool" | "eerie" | "mystic" | "neutral",
  "colorPalette": {
    "primary":   "#RRGGBB",   // dominant environment color
    "secondary": "#RRGGBB",   // secondary surface color
    "accent":    "#RRGGBB"    // highlight / emissive color
  },
  "requiredProps": ["well", "campfire", "broken_cart", ...],  // max 12 specific props that must appear
  "architecturalStyle": "medieval stone" | "wood cabin" | "ancient ruins" | "modern" | "n/a",
  "fogAdjustment": {           // optional — only include if specific fog needed
    "color":   0xRRGGBB,
    "density": 0.0..0.1
  }
}

REASONING GUIDE:
- biome=forest + weather=fog + night → groundCover=mud, vegetationDensity=dense, lightingMood=eerie
- biome=desert + afternoon + clear → groundCover=sand, vegetationDensity=sparse, lightingMood=warm
- biome=dungeon → groundCover=stone, vegetationDensity=none, lightingMood=eerie
- biome=urban → groundCover=stone, vegetationDensity=sparse, architecturalStyle=from world description
- requiredProps: look at character names, event descriptions, object names for clues
  e.g. "blacksmith forge" → requiredProps includes "forge", "anvil", "barrel"
  e.g. "ancient magic well" → requiredProps includes "well", "rune_stones", "moss_patches"
  e.g. "tavern" → requiredProps includes "tavern_sign", "barrels", "torch"`;

// ── User prompt builder ────────────────────────────────────────────────────────
function buildEnricherUser(graph: SceneGraph): string {
  return `World name: ${graph.world.name}
Description: ${graph.world.description}
Biome: ${graph.world.biome}, Time: ${graph.world.timeOfDay}, Weather: ${graph.world.weather}
Characters: ${graph.characters.map(c => `${c.name} (${c.personality})`).join(', ') || 'none'}
Objects mentioned: ${graph.objects.map(o => o.type).join(', ') || 'none'}
Events: ${graph.events.map(e => e.action.type).join(', ') || 'none'}

Determine the visual design for this world. Output JSON only:`;
}

// ── Biome defaults — used when enrichment LLM call fails ──────────────────────
const BIOME_DEFAULTS: Record<SceneGraph['world']['biome'], VisualDetail> = {
  forest:  { groundCover: 'grass',  vegetationDensity: 'dense',    lightingMood: 'neutral', colorPalette: { primary: '#2d5a1b', secondary: '#4a7a35', accent: '#8b6914' }, requiredProps: ['logs', 'mushrooms'],       architecturalStyle: 'n/a' },
  desert:  { groundCover: 'sand',   vegetationDensity: 'sparse',   lightingMood: 'warm',    colorPalette: { primary: '#c4a55a', secondary: '#d4b46a', accent: '#c84020' }, requiredProps: ['cactus', 'skull'],         architecturalStyle: 'n/a' },
  urban:   { groundCover: 'stone',  vegetationDensity: 'sparse',   lightingMood: 'neutral', colorPalette: { primary: '#8b7355', secondary: '#6b6560', accent: '#c87030' }, requiredProps: ['well', 'barrels', 'torch'], architecturalStyle: 'medieval stone' },
  dungeon: { groundCover: 'stone',  vegetationDensity: 'none',     lightingMood: 'eerie',   colorPalette: { primary: '#4a4540', secondary: '#3a3530', accent: '#ff6020' }, requiredProps: ['torch', 'rubble', 'chain'], architecturalStyle: 'ancient ruins' },
  ocean:   { groundCover: 'sand',   vegetationDensity: 'sparse',   lightingMood: 'cool',    colorPalette: { primary: '#1a6090', secondary: '#c4a55a', accent: '#30c0d0' }, requiredProps: ['driftwood', 'rocks'],       architecturalStyle: 'n/a' },
  tundra:  { groundCover: 'snow',   vegetationDensity: 'sparse',   lightingMood: 'cool',    colorPalette: { primary: '#e8eef4', secondary: '#8090b0', accent: '#a0c8e0' }, requiredProps: ['ice_rock', 'dead_tree'],    architecturalStyle: 'n/a' },
  custom:  { groundCover: 'dirt',   vegetationDensity: 'moderate', lightingMood: 'neutral', colorPalette: { primary: '#6b4c35', secondary: '#4a7a35', accent: '#8b6914' }, requiredProps: ['rocks', 'logs'],           architecturalStyle: 'n/a' },
};

// ── Main enrichment function ──────────────────────────────────────────────────
// Exported and called from WorldParser.ts (renderer) via IPC
export async function enrichSceneGraph(
  graph: SceneGraph,
  claudeCall: (system: string, user: string) => Promise<string>, // transport-agnostic
): Promise<EnrichedSceneGraph> {

  let visual: VisualDetail;

  try {
    const raw     = await claudeCall(ENRICHER_SYSTEM, buildEnricherUser(graph));
    const cleaned = raw
      .replace(/^```(?:json)?\s*/m, '')
      .replace(/```\s*$/m, '')
      .trim();

    const parsed  = JSON.parse(cleaned) as unknown;
    const result  = VisualDetailSchema.safeParse(parsed);

    if (result.success) {
      visual = result.data;
    } else {
      console.warn('[WorldEnricher] Validation failed, using biome defaults:', result.error.issues);
      visual = BIOME_DEFAULTS[graph.world.biome];
    }
  } catch (err) {
    console.warn('[WorldEnricher] Enrichment call failed, using biome defaults:', err);
    visual = BIOME_DEFAULTS[graph.world.biome];
  }

  // Merge enrichment into a new EnrichedSceneGraph
  const baseFogColor = typeof graph.atmosphere.fogColor === 'string'
    ? parseInt(graph.atmosphere.fogColor.replace('#', ''), 16)
    : graph.atmosphere.fogColor;

  const enriched: EnrichedSceneGraph = {
    ...graph,
    visualDetail: visual,
    // Apply fog adjustment from enricher if provided
    atmosphere: {
      fogDensity: graph.atmosphere.fogDensity,
      ambientIntensity: graph.atmosphere.ambientIntensity,
      ...(baseFogColor !== undefined && !isNaN(baseFogColor as number) && { fogColor: baseFogColor as number }),
      ...(visual.fogAdjustment?.color   !== undefined && { fogColor: visual.fogAdjustment.color }),
      ...(visual.fogAdjustment?.density !== undefined && { fogDensity: visual.fogAdjustment.density }),
    },
  };

  return enriched;
}

// ── IPC handler for enrichment (called from ClaudeService.ts) ─────────────────
// In ClaudeService, add this method:
//
// async enrichWorld(graph: SceneGraph): Promise<EnrichedSceneGraph> {
//   const claudeCall = async (system: string, user: string): Promise<string> => {
//     const msg = await this.getClient().messages.create({
//       model: this.model,
//       max_tokens: 1024,
//       system,
//       messages: [{ role: 'user', content: user }],
//     });
//     return msg.content
//       .filter((b): b is Anthropic.TextBlock => b.type === 'text')
//       .map(b => b.text).join('');
//   };
//   return enrichSceneGraph(graph, claudeCall);
// }

// ── Updated pipeline in WorldBuilder.ts ──────────────────────────────────────
// Old pipeline (v1):
//   const graph = await WorldParser.parseWorld(input);       // ~8s
//   const code  = await SceneCodegen.generate(graph);        // ~12s
//   await DynamicLoader.executeBuildScene(code, scene, assets);
//
// New pipeline (v2):
//   const graph     = await WorldParser.parseWorld(input);   // ~8s
//   const enriched  = await WorldEnricher.enrich(graph);     // ~3s  ← new step
//   const code      = await SceneCodegen.generate(enriched); // ~12s (much richer)
//   const helpers   = injectBaseScene(scene, graph);         // instant ← new
//   await DynamicLoader.executeBuildScene(code, scene, { textures, helpers }); // ← assets.helpers available
//
// Total added: ~3s for a dramatically better result.
// The enrichment call is cheap (small output, focused prompt) — worth the time.
