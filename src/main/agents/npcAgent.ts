import * as path from 'path';
import { runChildAgent } from './runChildAgent';
import { NPCOutputSchema, type NPCOutput } from '../../shared/agents/agentSchemas';
import type { IStoreService } from '../services/StoreService';
import type { IGraphStore } from '../../shared/storage/IGraphStore';
import type { GraphNodeRecord, GraphEdgeRecord, AgentRunRecord } from '../../shared/graph/graphTypes';
import type { AgentId } from '../../shared/agents/agentTypes';

const PROMPT_PATH = path.join(__dirname, 'prompts/npc.system.md');

export function makeNode(id: string, type: GraphNodeRecord['type'], attrs: unknown, agentId: AgentId, version = 1): GraphNodeRecord {
  return { id, type, attrs: attrs as GraphNodeRecord['attrs'], x: 0, y: 0, z: 0, createdBy: agentId, version, updatedAt: Date.now() };
}

export function makeEdge(source: string, target: string, type: GraphEdgeRecord['type'], agentId: AgentId): GraphEdgeRecord {
  return { id: `${source}_${type}_${target}`, source, target, type, createdBy: agentId };
}

type NPCAgentOutput = {
  npcs: Array<Omit<NPCOutput['npcs'][number], 'behaviorFlags'> & { behaviorFlags?: Record<string, boolean> }>;
};

export function toNodes(output: NPCAgentOutput, _sessionId: string): GraphNodeRecord[] {
  return output.npcs.map((npc) =>
    makeNode(
      npc.id,
      'npc',
      {
        name: npc.name,
        type: npc.type,
        regionId: npc.regionId,
        factionId: npc.factionId,
        wanderRadius: npc.wanderRadius,
        dialogueSeed: npc.dialogueSeed,
        behaviorFlags: npc.behaviorFlags ?? {},
      },
      'npc',
    ),
  );
}

export function toEdges(output: NPCAgentOutput, _sessionId: string): GraphEdgeRecord[] {
  const edges: GraphEdgeRecord[] = [];

  for (const npc of output.npcs) {
    if (npc.regionId) {
      edges.push(makeEdge(npc.id, npc.regionId, 'LOCATED_IN', 'npc'));
    }
    if (npc.factionId) {
      edges.push(makeEdge(npc.id, npc.factionId, 'MEMBER_OF', 'npc'));
    }
  }

  return edges;
}

export async function runNpcAgent(params: {
  sessionId: string;
  slice: Record<string, unknown>;
  storeService: IStoreService;
  graphStore: IGraphStore;
  signal?: AbortSignal;
}): Promise<{ nodes: GraphNodeRecord[]; edges: GraphEdgeRecord[]; summary: string; runRecord: AgentRunRecord }> {
  const result = await runChildAgent({
    agentId: 'npc',
    sessionId: params.sessionId,
    systemPromptPath: PROMPT_PATH,
    slice: params.slice,
    instructions: 'Generate the NPCs for this world. Return JSON matching the schema.',
    schema: NPCOutputSchema,
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
