import type { GraphNodeRecord, GraphEdgeRecord, AgentRunRecord } from '../graph/graphTypes';

export interface IGraphStore {
  /** Load all nodes and edges for a given session from persistent storage */
  loadSession(sessionId: string): Promise<{ nodes: GraphNodeRecord[]; edges: GraphEdgeRecord[] }>;
  /** Insert or update nodes (keyed on session_id + id) */
  upsertNodes(sessionId: string, nodes: GraphNodeRecord[]): Promise<void>;
  /** Insert or update edges (keyed on session_id + id) */
  upsertEdges(sessionId: string, edges: GraphEdgeRecord[]): Promise<void>;
  /** Delete nodes by id and CASCADE delete all edges where source or target matches */
  deleteNodes(sessionId: string, ids: string[]): Promise<void>;
  /** Append a sidechain transcript record for an agent run */
  appendAgentRun(run: AgentRunRecord): Promise<void>;
}
