import { GraphNodeRecord, GraphEdgeRecord, AgentRunRecord } from '../graph/graphTypes';

export interface IGraphStore {
  loadSession(sessionId: string): Promise<{ nodes: GraphNodeRecord[]; edges: GraphEdgeRecord[]; runs: AgentRunRecord[] }>;
  upsertNodes(nodes: GraphNodeRecord[]): Promise<void>;
  upsertEdges(edges: GraphEdgeRecord[]): Promise<void>;
  deleteNodes(nodeIds: string[]): Promise<void>;
  appendAgentRun(run: AgentRunRecord): Promise<void>;
}
