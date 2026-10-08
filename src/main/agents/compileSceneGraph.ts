import { SceneGraphSchema } from '../../shared/schema/sceneGraph.schema';
import type { SceneGraph } from '../../shared/schema/sceneGraph.schema';
import { BIOME_TO_SCHEMA } from '../../shared/agents/agentTypes';
import type { ViewportBiomeType, RegionElevation } from '../../shared/agents/agentTypes';
import type { CompiledWorldResult } from '../../shared/ipc.types';
import type { WorldGraph } from '../memory/WorldGraph';
import type {
  StoryAttrs, RegionAttrs, CharacterAttrs, NPCAttrs,
  LandmarkAttrs, QuestAttrs, DialogueTreeAttrs
} from '../../shared/graph/graphTypes';

function sizeToRadius(size: string): number {
  if (size === 'large') return 160;
  if (size === 'medium') return 100;
  return 60;
}

function sizeToScore(size: string): number {
  if (size === 'large') return 3;
  if (size === 'medium') return 2;
  return 1;
}

export function compileSceneGraph(graph: WorldGraph, sessionId: string): CompiledWorldResult {
  const storyNodes = graph.getNodesByType('story');
  const regionNodes = graph.getNodesByType('region');
  const characterNodes = graph.getNodesByType('character');
  const npcNodes = graph.getNodesByType('npc');
  const landmarkNodes = graph.getNodesByType('landmark');
  const questNodes = graph.getNodesByType('quest');
  const dialogueTreeNodes = graph.getNodesByType('dialogue_tree');

  const storyAttrs = (storyNodes[0]?.attrs as StoryAttrs) || {
    genre: 'Fantasy',
    history: 'A strange world.',
    tone: 'neutral'
  };
  const firstRegion = regionNodes[0];
  const firstRegionName = firstRegion ? (firstRegion.attrs as RegionAttrs).name : 'Unknown';

  const name = `${storyAttrs.genre}: ${firstRegionName}`;
  const description = storyAttrs.history.slice(0, 500);

  let activeBiome: ViewportBiomeType = 'pine';
  let maxScore = -1;

  for (const r of regionNodes) {
    const attrs = r.attrs as RegionAttrs;
    const score = sizeToScore(attrs.size);
    if (score > maxScore) {
      maxScore = score;
      activeBiome = attrs.biome;
    }
  }

  const timeOfDay = (() => {
    if (storyAttrs.tone.includes('dark') || storyAttrs.tone.includes('grim')) return 'dusk';
    if (storyAttrs.tone.includes('bright') || storyAttrs.tone.includes('hopeful')) return 'morning';
    return 'afternoon';
  })();

  const weather = (() => {
    if (storyAttrs.tone.includes('storm') || storyAttrs.tone.includes('apocalyptic')) return 'storm';
    if (storyAttrs.tone.includes('misty') || storyAttrs.tone.includes('fog')) return 'fog';
    return 'clear';
  })();

  const scale = (() => {
    const count = regionNodes.length;
    if (count >= 5) return 'large';
    if (count >= 3) return 'medium';
    return 'small';
  })();

  const skyboxTopColors: Record<ViewportBiomeType, string> = {
    pine: '#0a1a0a',
    cyber: '#050510',
    canyon: '#1a0a00',
    alien: '#0a000a',
    ruins: '#0a0a0a'
  };

  const fogDensities: Record<ViewportBiomeType, number> = {
    pine: 0.012,
    cyber: 0.02,
    canyon: 0.008,
    alien: 0.015,
    ruins: 0.018
  };

  const zones = regionNodes.map(r => {
    const attrs = r.attrs as RegionAttrs;
    return {
      id: r.id,
      name: attrs.name,
      bounds: {
        center: [r.x, 0, r.z] as [number, number, number],
        radius: sizeToRadius(attrs.size)
      },
      description: attrs.description
    };
  });

  const characters: SceneGraph['characters'] = [];

  for (const c of characterNodes) {
    const attrs = c.attrs as CharacterAttrs;
    characters.push({
      id: c.id,
      name: attrs.name,
      description: attrs.physicalDescription,
      personality: attrs.personality,
      position: [c.x, 1.7, c.z] as [number, number, number],
      behavior: 'idle',
      dialogueSeed: attrs.motivation.slice(0, 100),
      secrets: [],
      knowledge: [attrs.arcSummary]
    });
  }

  for (const npc of npcNodes) {
    const attrs = npc.attrs as NPCAttrs;
    let dialogueSeed = attrs.dialogueSeed;
    
    const tree = dialogueTreeNodes.find(d => (d.attrs as DialogueTreeAttrs).npcId === npc.id);
    if (tree) {
      const treeAttrs = tree.attrs as DialogueTreeAttrs;
      if (treeAttrs.greeting && treeAttrs.greeting.length > 0) {
        dialogueSeed = treeAttrs.greeting[0];
      }
    }

    characters.push({
      id: npc.id,
      name: attrs.name,
      description: attrs.dialogueSeed,
      personality: attrs.dialogueSeed,
      position: [npc.x, 1.7, npc.z] as [number, number, number],
      behavior: ((attrs.type as string) === 'patrol' || attrs.type === 'guard') ? 'patrol' : 'wander',
      dialogueSeed,
      secrets: [],
      knowledge: []
    });
  }

  const objects: SceneGraph['objects'] = landmarkNodes.map(l => {
    const attrs = l.attrs as LandmarkAttrs;
    return {
      id: l.id,
      name: attrs.name,
      type: 'landmark',
      description: attrs.significance,
      position: [l.x, 0, l.z] as [number, number, number],
      collidable: true,
      interactable: true,
      interactId: l.id,
      pickable: false,
      locked: false
    };
  });

  const events: SceneGraph['events'] = [];

  for (const q of questNodes) {
    const attrs = q.attrs as QuestAttrs;
    events.push({
      id: `${q.id}_start`,
      type: 'proximity',
      target: attrs.giverNpcId,
      range: 3,
      action: {
        type: 'start_dialogue',
        payload: { questId: q.id, npcId: attrs.giverNpcId }
      }
    });

    events.push({
      id: `${q.id}_complete`,
      type: 'flag',
      target: 'player',
      requiredFlag: `${q.id}_active`,
      action: {
        type: 'set_flag',
        payload: { flag: `${q.id}_complete`, value: true }
      }
    });
  }

  const compiled = {
    version: '1.0',
    world: {
      name,
      description,
      biome: BIOME_TO_SCHEMA[activeBiome],
      timeOfDay,
      weather,
      scale
    },
    player: {
      spawn: [0, 1.7, 0] as [number, number, number],
      movementSpeed: 4.0,
      jumpHeight: 1.5
    },
    zones,
    characters,
    objects,
    lights: [
      { id: 'ambient_main', type: 'ambient', color: '#ffffff', intensity: 0.4 },
      { id: 'sun', type: 'directional', color: '#fff4e0', intensity: 0.8, position: [100, 200, 100], castShadow: true },
    ],
    events,
    skybox: {
      type: 'gradient',
      topColor: skyboxTopColors[activeBiome],
      bottomColor: '#1a1a2e' 
    },
    atmosphere: {
      fogDensity: fogDensities[activeBiome],
      fogColor: skyboxTopColors[activeBiome],
      ambientIntensity: 0.5,
      sunColor: '#fff4e0'
    },
    flags: {}
  };

  const parsedGraph = SceneGraphSchema.parse(compiled);

  const regionElevations: RegionElevation[] = regionNodes.map(r => {
    const attrs = r.attrs as RegionAttrs;
    return {
      regionId: r.id,
      centerX: r.x,
      centerZ: r.z,
      radius: sizeToRadius(attrs.size),
      amplitude: attrs.elevationAmplitude
    };
  });

  return {
    sceneGraph: parsedGraph,
    activeBiome,
    regionElevations,
    sessionId
  };
}
