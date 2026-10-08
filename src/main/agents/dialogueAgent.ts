import * as path from 'path';
import { runChildAgent } from './runChildAgent';
import { DialogueOutputSchema, type DialogueOutput } from '../../shared/agents/agentSchemas';
import type { IStoreService } from '../services/StoreService';
import type { IGraphStore } from '../../shared/storage/IGraphStore';
import type { GraphNodeRecord, GraphEdgeRecord, AgentRunRecord } from '../../shared/graph/graphTypes';
import type { AgentId } from '../../shared/agents/agentTypes';

const PROMPT_PATH = path.join(__dirname, 'prompts/dialogue.system.md');

export function makeNode(id: string, type: GraphNodeRecord['type'], attrs: unknown, agentId: AgentId, version = 1): GraphNodeRecord {
  return { id, type, attrs: attrs as GraphNodeRecord['attrs'], x: 0, y: 0, z: 0, createdBy: agentId, version, updatedAt: Date.now() };
}

export function makeEdge(source: string, target: string, type: GraphEdgeRecord['type'], agentId: AgentId): GraphEdgeRecord {
  return { id: `${source}_${type}_${target}`, source, target, type, createdBy: agentId };
}

export function toNodes(output: DialogueOutput, _sessionId: string): GraphNodeRecord[] {
  return output.dialogueTrees.map((dt) =>
    makeNode(
      `dt_${dt.npcId}`,
      'dialogue_tree',
      {
        npcId: dt.npcId,
        greeting: dt.greeting,
        questDialogue: dt.questDialogue,
        ambientLines: dt.ambientLines,
        completionLines: dt.completionLines,
      },
      'dialogue',
    ),
  );
}

export function toEdges(output: DialogueOutput, _sessionId: string): GraphEdgeRecord[] {
  return output.dialogueTrees.map((dt) =>
    makeEdge(dt.npcId, `dt_${dt.npcId}`, 'SPEAKS', 'dialogue'),
  );
}

export async function runDialogueAgent(params: {
  sessionId: string;
  slice: Record<string, unknown>;
  storeService: IStoreService;
  graphStore: IGraphStore;
  signal?: AbortSignal;
}): Promise<{ nodes: GraphNodeRecord[]; edges: GraphEdgeRecord[]; summary: string; runRecord: AgentRunRecord }> {
  const result = await runChildAgent({
    agentId: 'dialogue',
    sessionId: params.sessionId,
    systemPromptPath: PROMPT_PATH,
    slice: params.slice,
    instructions: 'Generate the dialogue trees for this world. Return JSON matching the schema.',
    schema: DialogueOutputSchema,
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
