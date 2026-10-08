import * as path from 'path';
import { runChildAgent } from './runChildAgent';
import { QuestOutputSchema, type QuestOutput } from '../../shared/agents/agentSchemas';
import type { IStoreService } from '../services/StoreService';
import type { IGraphStore } from '../../shared/storage/IGraphStore';
import type { GraphNodeRecord, GraphEdgeRecord, AgentRunRecord } from '../../shared/graph/graphTypes';
import type { AgentId } from '../../shared/agents/agentTypes';

const PROMPT_PATH = path.join(__dirname, 'prompts/quest.system.md');

export function makeNode(id: string, type: GraphNodeRecord['type'], attrs: unknown, agentId: AgentId, version = 1): GraphNodeRecord {
  return { id, type, attrs: attrs as GraphNodeRecord['attrs'], x: 0, y: 0, z: 0, createdBy: agentId, version, updatedAt: Date.now() };
}

export function makeEdge(source: string, target: string, type: GraphEdgeRecord['type'], agentId: AgentId): GraphEdgeRecord {
  return { id: `${source}_${type}_${target}`, source, target, type, createdBy: agentId };
}

export function toNodes(output: QuestOutput, _sessionId: string): GraphNodeRecord[] {
  return output.quests.map((quest) =>
    makeNode(
      quest.id,
      'quest',
      {
        title: quest.title,
        giverNpcId: quest.giverNpcId,
        objectiveType: quest.objectiveType,
        targetRegionId: quest.targetRegionId,
        reward: quest.reward,
        branchConditions: quest.branchConditions,
      },
      'quest',
    ),
  );
}

export function toEdges(output: QuestOutput, _sessionId: string): GraphEdgeRecord[] {
  const edges: GraphEdgeRecord[] = [];

  for (const quest of output.quests) {
    if (quest.giverNpcId) {
      edges.push(makeEdge(quest.giverNpcId, quest.id, 'GIVES_QUEST', 'quest'));
    }
    if (quest.targetRegionId) {
      edges.push(makeEdge(quest.id, quest.targetRegionId, 'TARGETS', 'quest'));
    }
    if (quest.unlocksQuestId) {
      edges.push(makeEdge(quest.id, quest.unlocksQuestId, 'UNLOCKS', 'quest'));
    }
  }

  return edges;
}

export async function runQuestAgent(params: {
  sessionId: string;
  slice: Record<string, unknown>;
  storeService: IStoreService;
  graphStore: IGraphStore;
  signal?: AbortSignal;
}): Promise<{ nodes: GraphNodeRecord[]; edges: GraphEdgeRecord[]; summary: string; runRecord: AgentRunRecord }> {
  const result = await runChildAgent({
    agentId: 'quest',
    sessionId: params.sessionId,
    systemPromptPath: PROMPT_PATH,
    slice: params.slice,
    instructions: 'Generate the quests for this world. Return JSON matching the schema.',
    schema: QuestOutputSchema,
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
