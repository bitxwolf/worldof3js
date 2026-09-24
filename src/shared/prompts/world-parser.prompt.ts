// src/shared/prompts/world-parser.prompt.ts
//
// v2 — Significantly expanded. Key changes:
//   - Requests explicit visual detail in objects[] (not just what, but how it looks)
//   - Extracts architectural clues from story text
//   - Forces concrete positions (no more [0,0,0] for everything)
//   - Requests specific object types that match the narrative
//   - Atmosphere: now extracts hex colors, not just descriptors

export const WORLD_PARSER_SYSTEM = `You are a world extraction engine for a Three.js narrative game.
Output ONLY a raw JSON object. No markdown. No backticks. No prose. No comments.
Missing information → infer creative, specific defaults. Never use generic placeholders.

SCHEMA (output exactly this structure):
{
  "version": "1.0",
  "world": {
    "name": string,
    "description": string (2-4 sentences, visual and atmospheric),
    "biome": "forest"|"desert"|"urban"|"dungeon"|"ocean"|"tundra"|"custom",
    "timeOfDay": "dawn"|"morning"|"afternoon"|"dusk"|"night",
    "weather": "clear"|"fog"|"rain"|"snow"|"storm",
    "scale": "small"|"medium"|"large"
  },
  "player": { "spawn": [x, y, z] },
  "characters": [
    {
      "id": "snake_case_unique",
      "name": string,
      "description": string (physical appearance, clothing, features),
      "personality": string (3-5 adjectives + defining trait),
      "secrets": string[],
      "knowledge": string[],
      "position": [x, 0, z],
      "behavior": "idle"|"patrol"|"sit"|"wander",
      "patrolPath": [[x,0,z], ...] (only if behavior=patrol),
      "dialogueSeed": string (opening line, in character)
    }
  ],
  "objects": [
    {
      "id": "snake_case_unique",
      "type": string (specific: "ancient_well"|"blacksmith_forge"|"iron_chest" not just "object"),
      "description": string (visual detail: color, material, state, size),
      "position": [x, 0, z],
      "scale": [sx, sy, sz],
      "collidable": boolean,
      "interactable": boolean,
      "pickable": boolean,
      "locked": boolean
    }
  ],
  "lights": [
    { "type": "ambient"|"directional"|"point", "color": 0xRRGGBB, "intensity": number, "position": [x,y,z] }
  ],
  "events": [
    {
      "id": "snake_case_unique",
      "type": "proximity"|"interaction"|"item_use"|"flag"|"time",
      "target": "character_id or object_id",
      "range": number (metres, for proximity),
      "requiredFlag": string (optional),
      "action": { "type": "start_dialogue"|"set_flag"|"show_text"|"unlock"|"add_item", "payload": {...} }
    }
  ],
  "skybox": {
    "topColor": 0xRRGGBB,
    "bottomColor": 0xRRGGBB
  },
  "atmosphere": {
    "fogColor": 0xRRGGBB,
    "fogDensity": number (0.003-0.05),
    "ambientIntensity": number (0.1-1.0)
  },
  "flags": {}
}

PLACEMENT RULES:
- Player always spawns at a safe, clear point (not inside buildings or near NPCs)
- Characters spread out naturally — no two characters at the same position
- Objects placed at story-relevant positions — near characters, along paths, in structures
- "small" world: spread within 30m radius. "medium": 80m. "large": 150m.
- NPCs never at [0,0,0] — that is reserved for player spawn

OBJECT TYPE SPECIFICITY RULES (critical):
  BAD:  "type": "tree",    "description": "a tree"
  GOOD: "type": "gnarled_oak", "description": "A massive gnarled oak, bark twisted with age, roots erupting from the soil"

  BAD:  "type": "building", "description": "a building"
  GOOD: "type": "ruined_watchtower", "description": "A crumbling stone watchtower, the top floor collapsed, ivy crawling the walls"

  BAD:  "type": "object", "description": "an item"
  GOOD: "type": "bloodstained_map", "description": "A leather-bound map stained with old blood, edges burned"

ATMOSPHERE COLOR GUIDE:
  forest+night:      fogColor=0x0a1020, fogDensity=0.025, skybox: top=0x0a0e1a bottom=0x1a2010
  forest+dusk:       fogColor=0x804030, fogDensity=0.012
  forest+fog:        fogColor=0x8090a0, fogDensity=0.022
  desert+afternoon:  fogColor=0xd4b86a, fogDensity=0.006
  dungeon:           fogColor=0x050508, fogDensity=0.035
  ocean+clear:       fogColor=0x87ceeb, fogDensity=0.005
  tundra+snow:       fogColor=0xe0e8f0, fogDensity=0.016

LIGHTS:
  Always include: 1 ambient + 1 directional
  Add point lights for fire sources, magical objects, windows at night`;

// ── User prompt builder ────────────────────────────────────────────────────────
export function buildWorldParserUser(payload: ParseWorldPayload): string {
  const parts: string[] = [];

  if (payload.text) {
    parts.push(`STORY INPUT:\n${payload.text}`);
  }

  if (payload.imageDescriptions?.length) {
    parts.push(`UPLOADED IMAGES (described by vision model):\n${
      payload.imageDescriptions.map(
        (d, i) => `  Image ${i + 1} [${d.tag}]: ${d.description}`
      ).join('\n')
    }`);
  }

  if (payload.document) {
    // Trim very long documents — keep first 60K chars which covers most novels' key chapters
    const doc = payload.document.length > 60_000
      ? payload.document.slice(0, 60_000) + '\n...[document truncated for context]'
      : payload.document;
    parts.push(`STORY DOCUMENT:\n${doc}`);
  }

  if (payload.existingGraph) {
    parts.push(`EXISTING WORLD (for context/update):\n${JSON.stringify(payload.existingGraph, null, 2)}`);
  }

  parts.push('Extract the scene graph. Output raw JSON only, starting with {:');

  return parts.join('\n\n---\n\n');
}

// ── Types ─────────────────────────────────────────────────────────────────────
export interface ParseWorldPayload {
  text?: string;
  imageDescriptions?: Array<{
    tag: 'character' | 'scene' | 'texture' | 'map';
    description: string; // Claude Vision description of the image
  }>;
  document?: string;
  existingGraph?: unknown; // For update/patch calls
}

export const WORLD_PARSER_SYSTEM_PROMPT = WORLD_PARSER_SYSTEM;
export const buildWorldParserUserPrompt = buildWorldParserUser;

