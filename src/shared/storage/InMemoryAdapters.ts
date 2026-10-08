import type { IWorldStorageAdapter } from '../../shared/storage/IWorldStorageAdapter';
import type { IGraphStore } from '../../shared/storage/IGraphStore';
import type { GraphNodeRecord, GraphEdgeRecord, AgentRunRecord } from '../../shared/graph/graphTypes';

// ─── In-Memory Key/Value Store ───────────────────────────────────────────────

export class InMemoryStorageAdapter implements IWorldStorageAdapter {
  private readonly store = new Map<string, unknown>();

  async save(key: string, data: unknown): Promise<void> {
    this.store.set(key, structuredClone(data));
  }

  async load<T>(key: string): Promise<T | null> {
    if (!this.store.has(key)) return null;
    return structuredClone(this.store.get(key)) as T;
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }
}

// ─── In-Memory Graph Store ───────────────────────────────────────────────────

export class InMemoryGraphStore implements IGraphStore {
  private readonly nodes = new Map<string, GraphNodeRecord>(); // key: `${sessionId}::${id}`
  private readonly edges = new Map<string, GraphEdgeRecord>(); // key: `${sessionId}::${id}`
  private readonly agentRuns: AgentRunRecord[] = [];

  async loadSession(sessionId: string): Promise<{ nodes: GraphNodeRecord[]; edges: GraphEdgeRecord[] }> {
    const prefix = `${sessionId}::`;
    const sessionNodes = [...this.nodes.entries()]
      .filter(([k]) => k.startsWith(prefix))
      .map(([, v]) => structuredClone(v));
    const sessionEdges = [...this.edges.entries()]
      .filter(([k]) => k.startsWith(prefix))
      .map(([, v]) => structuredClone(v));
    return { nodes: sessionNodes, edges: sessionEdges };
  }

  async upsertNodes(sessionId: string, nodes: GraphNodeRecord[]): Promise<void> {
    for (const node of nodes) {
      this.nodes.set(`${sessionId}::${node.id}`, structuredClone(node));
    }
  }

  async upsertEdges(sessionId: string, edges: GraphEdgeRecord[]): Promise<void> {
    for (const edge of edges) {
      this.edges.set(`${sessionId}::${edge.id}`, structuredClone(edge));
    }
  }

  async deleteNodes(sessionId: string, ids: string[]): Promise<void> {
    const idSet = new Set(ids);
    for (const id of ids) {
      this.nodes.delete(`${sessionId}::${id}`);
    }
    // Cascade: delete edges where source or target is in the deleted set
    for (const [key, edge] of this.edges) {
      if (!key.startsWith(`${sessionId}::`)) continue;
      if (idSet.has(edge.source) || idSet.has(edge.target)) {
        this.edges.delete(key);
      }
    }
  }

  async appendAgentRun(run: AgentRunRecord): Promise<void> {
    this.agentRuns.push(structuredClone(run));
  }
}
