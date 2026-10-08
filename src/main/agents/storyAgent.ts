import * as path from 'path';
import { runChildAgent } from './runChildAgent';
import { StoryOutputSchema, type StoryOutput } from '../../shared/agents/agentSchemas';
import type { IStoreService } from '../services/StoreService';
import type { IGraphStore } from '../../shared/storage/IGraphStore';
import type { GraphNodeRecord, GraphEdgeRecord, AgentRunRecord } from '../../shared/graph/graphTypes';
import type { AgentId } from '../../shared/agents/agentTypes';

const PROMPT_PATH = path.join(__dirname, 'prompts/story.system.md');

export function makeNode(id: string, type: GraphNodeRecord['type'], attrs: unknown, agentId: AgentId, version = 1): GraphNodeRecord {
  return { id, type, attrs: attrs as GraphNodeRecord['attrs'], x: 0, y: 0, z: 0, createdBy: agentId, version, updatedAt: Date.now() };
}

export function toNodes(output: StoryOutput, sessionId: string): GraphNodeRecord[] {
  const nodes: GraphNodeRecord[] = [
    makeNode(
      `story_${sessionId}`,
      'story',
      {
        genre: output.genre,
        tone: output.tone,
        themes: output.themes,
        history: output.history,
        centralConflict: output.centralConflict,
      },
      'story',
    ),
  ];

  for (const faction of output.factions) {
    nodes.push(
      makeNode(
        faction.id,
        'faction',
        {
          name: faction.name,
          ideology: faction.ideology,
          territory: faction.territory,
        },
        'story',
      ),
    );
  }

  return nodes;
}

export function toEdges(_output: StoryOutput, _sessionId: string): GraphEdgeRecord[] {
  return [];
}

export async function runStoryAgent(params: {
  sessionId: string;
  slice: Record<string, unknown>;
  storeService: IStoreService;
  graphStore: IGraphStore;
  signal?: AbortSignal;
}): Promise<{ nodes: GraphNodeRecord[]; edges: GraphEdgeRecord[]; summary: string; runRecord: AgentRunRecord }> {
  const result = await runChildAgent({
    agentId: 'story',
    sessionId: params.sessionId,
    systemPromptPath: PROMPT_PATH,
    slice: params.slice,
    instructions: 'Generate the story and factions for this world. Return JSON matching the schema.',
    schema: StoryOutputSchema,
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
