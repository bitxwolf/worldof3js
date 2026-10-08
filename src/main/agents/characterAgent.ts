import * as path from 'path';
import { runChildAgent } from './runChildAgent';
import { CharacterOutputSchema, type CharacterOutput } from '../../shared/agents/agentSchemas';
import type { IStoreService } from '../services/StoreService';
import type { IGraphStore } from '../../shared/storage/IGraphStore';
import type { GraphNodeRecord, GraphEdgeRecord, AgentRunRecord } from '../../shared/graph/graphTypes';
import type { AgentId } from '../../shared/agents/agentTypes';

const PROMPT_PATH = path.join(__dirname, 'prompts/character.system.md');

export function makeNode(id: string, type: GraphNodeRecord['type'], attrs: unknown, agentId: AgentId, version = 1): GraphNodeRecord {
  return { id, type, attrs: attrs as GraphNodeRecord['attrs'], x: 0, y: 0, z: 0, createdBy: agentId, version, updatedAt: Date.now() };
}

export function makeEdge(source: string, target: string, type: GraphEdgeRecord['type'], agentId: AgentId): GraphEdgeRecord {
  return { id: `${source}_${type}_${target}`, source, target, type, createdBy: agentId };
}

export function toNodes(output: CharacterOutput, _sessionId: string): GraphNodeRecord[] {
  return output.characters.map((c) =>
    makeNode(
      c.id,
      'character',
      {
        name: c.name,
        role: c.role,
        factionId: c.factionId,
        personality: c.personality,
        motivation: c.motivation,
        physicalDescription: c.physicalDescription,
        arcSummary: c.arcSummary,
      },
      'character',
    ),
  );
}

export function toEdges(output: CharacterOutput, _sessionId: string): GraphEdgeRecord[] {
  const edges: GraphEdgeRecord[] = [];
  for (const rel of output.relationships) {
    edges.push(makeEdge(rel.fromId, rel.toId, rel.type, 'character'));
    if (rel.fromId !== rel.toId) {
      edges.push(makeEdge(rel.toId, rel.fromId, rel.type, 'character'));
    }
  }
  return edges;
}

export async function runCharacterAgent(params: {
  sessionId: string;
  slice: Record<string, unknown>;
  storeService: IStoreService;
  graphStore: IGraphStore;
  signal?: AbortSignal;
}): Promise<{ nodes: GraphNodeRecord[]; edges: GraphEdgeRecord[]; summary: string; runRecord: AgentRunRecord }> {
  const result = await runChildAgent({
    agentId: 'character',
    sessionId: params.sessionId,
    systemPromptPath: PROMPT_PATH,
    slice: params.slice,
    instructions: 'Generate the characters and relationships for this world. Return JSON matching the schema.',
    schema: CharacterOutputSchema,
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
