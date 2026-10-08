import * as path from 'path';
import { runChildAgent } from './runChildAgent';
import { WorldOutputSchema, type WorldOutput } from '../../shared/agents/agentSchemas';
import type { IStoreService } from '../services/StoreService';
import type { IGraphStore } from '../../shared/storage/IGraphStore';
import type { GraphNodeRecord, GraphEdgeRecord, AgentRunRecord } from '../../shared/graph/graphTypes';
import type { AgentId } from '../../shared/agents/agentTypes';

const PROMPT_PATH = path.join(__dirname, 'prompts/world.system.md');

export function makeNode(id: string, type: GraphNodeRecord['type'], attrs: unknown, agentId: AgentId, version = 1): GraphNodeRecord {
  return { id, type, attrs: attrs as GraphNodeRecord['attrs'], x: 0, y: 0, z: 0, createdBy: agentId, version, updatedAt: Date.now() };
}

export function makeEdge(source: string, target: string, type: GraphEdgeRecord['type'], agentId: AgentId): GraphEdgeRecord {
  return { id: `${source}_${type}_${target}`, source, target, type, createdBy: agentId };
}

export function toNodes(output: WorldOutput, _sessionId: string): GraphNodeRecord[] {
  const nodes: GraphNodeRecord[] = [];

  for (const region of output.regions) {
    nodes.push(
      makeNode(
        region.id,
        'region',
        {
          name: region.name,
          biome: region.biome,
          climate: region.climate,
          dominantFactionId: region.dominantFactionId,
          description: region.description,
          elevationAmplitude: region.elevationAmplitude,
          compassCell: region.compassCell,
          size: region.size,
        },
        'world',
      ),
    );
  }

  for (const landmark of output.landmarks) {
    nodes.push(
      makeNode(
        landmark.id,
        'landmark',
        {
          name: landmark.name,
          regionId: landmark.regionId,
          significance: landmark.significance,
        },
        'world',
      ),
    );
  }

  return nodes;
}

export function toEdges(output: WorldOutput, _sessionId: string): GraphEdgeRecord[] {
  const edges: GraphEdgeRecord[] = [];

  for (const region of output.regions) {
    if (region.dominantFactionId) {
      edges.push(makeEdge(region.dominantFactionId, region.id, 'CONTROLS', 'world'));
    }
  }

  for (const landmark of output.landmarks) {
    if (landmark.regionId) {
      edges.push(makeEdge(landmark.id, landmark.regionId, 'LOCATED_IN', 'world'));
    }
  }

  return edges;
}

export async function runWorldAgent(params: {
  sessionId: string;
  slice: Record<string, unknown>;
  storeService: IStoreService;
  graphStore: IGraphStore;
  signal?: AbortSignal;
}): Promise<{ nodes: GraphNodeRecord[]; edges: GraphEdgeRecord[]; summary: string; runRecord: AgentRunRecord }> {
  const result = await runChildAgent({
    agentId: 'world',
    sessionId: params.sessionId,
    systemPromptPath: PROMPT_PATH,
    slice: params.slice,
    instructions: 'Generate the regions and landmarks for this world. Return JSON matching the schema.',
    schema: WorldOutputSchema,
    storeService: params.storeService,
    graphStore: params.graphStore,
    signal: params.signal,
  });
  return {
    nodes: toNodes(result.output, params.sessionId),
    edges: toEdges(result.output, params.sessionId),
    summary: result.summary,
    runRecord: result.runRecord,
  };
}
