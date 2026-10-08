import { MultiDirectedGraph } from 'graphology';
import type { IGraphStore } from '../../shared/storage/IGraphStore';
import type { GraphNodeRecord, GraphEdgeRecord, GraphNodeType } from '../../shared/graph/graphTypes';
import { queryRadius } from './spatial';
import type { SpatialNode } from './spatial';

export class WorldGraph {
  private readonly g = new MultiDirectedGraph();
  private sessionId: string = '';

  constructor(private readonly store: IGraphStore) {}

  /** Load an existing session from the store into memory */
  async hydrate(sessionId: string): Promise<void> {
    this.sessionId = sessionId;
    const { nodes, edges } = await this.store.loadSession(sessionId);
    for (const n of nodes) {
      if (!this.g.hasNode(n.id)) {
        this.g.addNode(n.id, { ...n });
      }
    }
    for (const e of edges) {
      if (!this.g.hasEdge(e.id)) {
        this.g.addEdgeWithKey(e.id, e.source, e.target, { ...e });
      }
    }
  }

  /** Add or update a node and persist */
  async upsertNode(node: GraphNodeRecord): Promise<void> {
    if (this.g.hasNode(node.id)) {
      this.g.mergeNodeAttributes(node.id, { ...node });
    } else {
      this.g.addNode(node.id, { ...node });
    }
    await this.store.upsertNodes(this.sessionId, [node]);
  }

  /** Add or update multiple nodes in one batch */
  async upsertNodes(nodes: GraphNodeRecord[]): Promise<void> {
    for (const node of nodes) {
      if (this.g.hasNode(node.id)) {
        this.g.mergeNodeAttributes(node.id, { ...node });
      } else {
        this.g.addNode(node.id, { ...node });
      }
    }
    await this.store.upsertNodes(this.sessionId, nodes);
  }

  /** Add or update edges */
  async upsertEdges(edges: GraphEdgeRecord[]): Promise<void> {
    for (const edge of edges) {
      if (!this.g.hasEdge(edge.id)) {
        this.g.addEdgeWithKey(edge.id, edge.source, edge.target, { ...edge });
      }
    }
    await this.store.upsertEdges(this.sessionId, edges);
  }

  /** Remove nodes (and cascade edges) */
  async deleteNodes(ids: string[]): Promise<void> {
    for (const id of ids) {
      if (this.g.hasNode(id)) this.g.dropNode(id); // graphology auto-drops incident edges
    }
    await this.store.deleteNodes(this.sessionId, ids);
  }

  /** Get all nodes of a given type as records */
  getNodesByType(type: GraphNodeType): GraphNodeRecord[] {
    const results: GraphNodeRecord[] = [];
    this.g.forEachNode((_id, attrs) => {
      if (attrs['type'] === type) results.push(attrs as GraphNodeRecord);
    });
    return results;
  }

  /** Get a single node by id */
  getNode(id: string): GraphNodeRecord | null {
    if (!this.g.hasNode(id)) return null;
    return this.g.getNodeAttributes(id) as GraphNodeRecord;
  }

  /** Get all edges between two nodes */
  getEdges(sourceId: string, targetId?: string): GraphEdgeRecord[] {
    const results: GraphEdgeRecord[] = [];
    this.g.forEachEdge((_key, attrs, source, target) => {
      if (source === sourceId && (!targetId || target === targetId)) {
        results.push(attrs as GraphEdgeRecord);
      }
    });
    return results;
  }

  /** Spatial radius query */
  queryRadius(cx: number, cz: number, radius: number, types?: GraphNodeType[]): SpatialNode[] {
    const allNodes: GraphNodeRecord[] = [];
    this.g.forEachNode((_, attrs) => allNodes.push(attrs as GraphNodeRecord));
    return queryRadius(allNodes, cx, cz, radius, types);
  }

  /** Total counts */
  get nodeCount(): number { return this.g.order; }
  get edgeCount(): number { return this.g.size; }
  get currentSessionId(): string { return this.sessionId; }

  /** Reset in-memory graph (does NOT clear the store) */
  reset(sessionId: string): void {
    this.g.clear();
    this.sessionId = sessionId;
  }
}
