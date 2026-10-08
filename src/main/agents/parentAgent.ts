import type { IStoreService } from '../services/StoreService';
import type { IGraphStore } from '../../shared/storage/IGraphStore';
import type { IWorldStorageAdapter } from '../../shared/storage/IWorldStorageAdapter';
import type { WorldRequest, SelectionContext, OrchestratorProgressEvent, ConflictEntry, AgentId } from '../../shared/agents/agentTypes';
import type { CompiledWorldResult } from '../../shared/ipc.types';
import type { GraphNodeRecord, GraphEdgeRecord, RegionAttrs, NPCAttrs, LandmarkAttrs } from '../../shared/graph/graphTypes';
import { WorldGraph } from '../memory/WorldGraph';
import { SessionManager } from '../memory/sessionManager';
import {
  buildStorySlice, buildCharacterSlice, buildWorldSlice,
  buildNpcSlice, buildQuestSlice, buildDialogueSlice
} from '../memory/sliceBuilders';
import { layoutRegions, scatterInRegion } from '../memory/layout';
import { runAllChecks } from './conflictChecks';

type AgentRunner = (p: {
  sessionId: string;
  slice: Record<string, unknown>;
  storeService: IStoreService;
  graphStore: IGraphStore;
  signal?: AbortSignal;
}) => Promise<{ nodes: GraphNodeRecord[]; edges: GraphEdgeRecord[]; summary: string }>;

const AGENT_RUNNERS: Record<string, () => Promise<AgentRunner>> = {
  story:     async () => (await import('./storyAgent')).runStoryAgent,
  character: async () => (await import('./characterAgent')).runCharacterAgent,
  world:     async () => (await import('./worldAgent')).runWorldAgent,
  npc:       async () => (await import('./npcAgent')).runNpcAgent,
  quest:     async () => (await import('./questAgent')).runQuestAgent,
  dialogue:  async () => (await import('./dialogueAgent')).runDialogueAgent,
};

const PIPELINE: Array<{ id: AgentId; percent: number; sliceBuilder: (g: WorldGraph) => Record<string, unknown> }> = [
  { id: 'story',     percent: 10,  sliceBuilder: buildStorySlice },
  { id: 'character', percent: 20,  sliceBuilder: buildCharacterSlice },
  { id: 'world',     percent: 35,  sliceBuilder: buildWorldSlice },
  { id: 'npc',       percent: 50,  sliceBuilder: buildNpcSlice },
  { id: 'quest',     percent: 65,  sliceBuilder: buildQuestSlice },
  { id: 'dialogue',  percent: 80,  sliceBuilder: buildDialogueSlice },
];

export class ParentAgent {
  constructor(
    private storeService: IStoreService,
    private graphStore: IGraphStore,
    private kvStore: IWorldStorageAdapter,
    private onProgress: (event: OrchestratorProgressEvent) => void
  ) {}

  async generate(request: WorldRequest): Promise<CompiledWorldResult> {
    const sessionManager = new SessionManager(this.kvStore, this.graphStore);
    const session = await sessionManager.createSession(request.rawPrompt);
    const graph = new WorldGraph(this.graphStore);
    graph.reset(session.id);

    for (const step of PIPELINE) {
      this.emit(session.id, step.id, 'started', `Running ${step.id} agent…`, step.percent);

      const runner = await AGENT_RUNNERS[step.id]();
      const slice = step.sliceBuilder(graph);

      let result: { nodes: GraphNodeRecord[]; edges: GraphEdgeRecord[] } | null = null;
      let lastConflicts: ConflictEntry[] = [];

      for (let attempt = 0; attempt < 3; attempt++) {
        result = await runner({
          sessionId: session.id,
          slice,
          storeService: this.storeService,
          graphStore: this.graphStore,
        });

        await graph.upsertNodes(result.nodes);
        await graph.upsertEdges(result.edges);

        lastConflicts = runAllChecks(graph, step.id);
        if (lastConflicts.length === 0) break;

        if (attempt < 2) {
          this.emit(session.id, step.id, 'retrying', `Retrying ${step.id} (${lastConflicts.length} conflicts)…`, step.percent, lastConflicts);
          // Remove the bad nodes so the retry starts clean for this agent
          await graph.deleteNodes(result.nodes.map((n) => n.id));
        }
      }

      if (lastConflicts.length > 0) {
        this.emit(session.id, step.id, 'failed', `Unresolved conflicts in ${step.id}`, step.percent, lastConflicts);
        throw new Error(`[${step.id}] Unresolved conflicts after retries`);
      }

      // Layout pass after world agent commits regions
      if (step.id === 'world') {
        await this.assignRegionCoords(graph);
      }
      // Scatter NPCs & landmarks after NPC agent
      if (step.id === 'npc') {
        await this.scatterEntities(graph);
      }

      this.emit(session.id, step.id, 'completed', `${step.id} done`, step.percent);
    }

    // Review pass
    this.emit(session.id, 'review', 'started', 'Final consistency review…', 90);
    const finalConflicts = runAllChecks(graph, 'parent');
    if (finalConflicts.length > 0) {
      this.emit(session.id, 'review', 'failed', `${finalConflicts.length} conflicts remain`, 90, finalConflicts);
    }
    this.emit(session.id, 'review', 'completed', 'Review passed', 90);

    // Compile
    this.emit(session.id, 'compile', 'started', 'Compiling scene graph…', 95);
    const { compileSceneGraph } = await import('./compileSceneGraph');
    const compiled = compileSceneGraph(graph, session.id);
    this.emit(session.id, 'compile', 'completed', 'Done', 100);

    return compiled;
  }

  async editSelection(
    sessionId: string,
    selection: SelectionContext,
    _updateRequest: string
  ): Promise<CompiledWorldResult> {
    const graph = new WorldGraph(this.graphStore);
    await graph.hydrate(sessionId);

    const affected = new Set<AgentId>();
    if (selection.regions.length > 0 || selection.landmarks.length > 0) affected.add('world');
    if (selection.npcs.length > 0) { affected.add('npc'); affected.add('quest'); affected.add('dialogue'); }
    if (selection.activeQuests.length > 0) { affected.add('quest'); affected.add('dialogue'); }

    for (const step of PIPELINE) {
      if (!affected.has(step.id)) continue;
      this.emit(sessionId, step.id, 'started', `Re-running ${step.id}…`, step.percent);

      const runner = await AGENT_RUNNERS[step.id]();
      const slice = step.sliceBuilder(graph);
      const result = await runner({
        sessionId,
        slice,
        storeService: this.storeService,
        graphStore: this.graphStore,
      });

      await graph.upsertNodes(result.nodes);
      await graph.upsertEdges(result.edges);
      this.emit(sessionId, step.id, 'completed', `${step.id} updated`, step.percent);
    }

    if (affected.has('world')) await this.assignRegionCoords(graph);
    if (affected.has('npc')) await this.scatterEntities(graph);

    const { compileSceneGraph } = await import('./compileSceneGraph');
    return compileSceneGraph(graph, sessionId);
  }

  // ── helpers ──

  private emit(
    sessionId: string, agentId: OrchestratorProgressEvent['agentId'],
    status: OrchestratorProgressEvent['status'], message: string,
    percentComplete: number, conflicts?: ConflictEntry[]
  ): void {
    this.onProgress({ sessionId, agentId, status, message, percentComplete, conflicts });
  }

  private async assignRegionCoords(graph: WorldGraph): Promise<void> {
    const regions = graph.getNodesByType('region').map((r) => ({ id: r.id, attrs: r.attrs as RegionAttrs }));
    const layouts = layoutRegions(regions, 42);
    for (const l of layouts) {
      const n = graph.getNode(l.id);
      if (n) { n.x = l.centerX; n.z = l.centerZ; await graph.upsertNode(n); }
    }
  }

  private async scatterEntities(graph: WorldGraph): Promise<void> {
    const regions = graph.getNodesByType('region').map((r) => ({ id: r.id, attrs: r.attrs as RegionAttrs }));
    const layouts = layoutRegions(regions, 42);
    const layoutMap = new Map(layouts.map((l) => [l.id, l]));

    let seed = 1;
    for (const npc of graph.getNodesByType('npc')) {
      const layout = layoutMap.get((npc.attrs as NPCAttrs).regionId);
      if (layout) { const [p] = scatterInRegion(layout, 1, seed++); npc.x = p.x; npc.z = p.z; await graph.upsertNode(npc); }
    }
    for (const lm of graph.getNodesByType('landmark')) {
      const layout = layoutMap.get((lm.attrs as LandmarkAttrs).regionId);
      if (layout) { const [p] = scatterInRegion(layout, 1, seed++); lm.x = p.x; lm.z = p.z; await graph.upsertNode(lm); }
    }
  }
}
