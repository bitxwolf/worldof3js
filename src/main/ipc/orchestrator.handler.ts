import { ipcMain, BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '../../shared/constants';
import type {
  IPCResult,
  OrchestratorGeneratePayload,
  OrchestratorEditPayload,
  GraphQueryRadiusPayload,
  GraphQueryRadiusResult,
  CompiledWorldResult,
} from '../../shared/ipc.types';
import { StoreService } from '../services/StoreService';
import { SqliteGraphStore, SqliteStorageAdapter } from '../storage/SqliteAdapters';
import { WorldGraph } from '../memory/WorldGraph';
import { ParentAgent } from '../agents/parentAgent';

const graphStore = new SqliteGraphStore();
const kvStore = new SqliteStorageAdapter();

export function registerOrchestratorHandlers(getWindow: () => BrowserWindow | null): void {
  ipcMain.handle(
    IPC_CHANNELS.ORCHESTRATOR_GENERATE,
    async (_event, payload: OrchestratorGeneratePayload): Promise<IPCResult<CompiledWorldResult>> => {
      const win = getWindow();
      try {
        const agent = new ParentAgent(StoreService, graphStore, kvStore, (evt) => {
          if (win && !win.isDestroyed()) {
            win.webContents.send(IPC_CHANNELS.ORCHESTRATOR_PROGRESS, evt);
          }
        });
        const result = await agent.generate(payload);
        return { success: true, data: result };
      } catch (err) {
        const e = err instanceof Error ? err : new Error(String(err));
        console.error(`[Orchestrator:generate] ${e.message}`);
        return { success: false, error: { name: e.name, message: e.message } };
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.ORCHESTRATOR_EDIT_SELECTION,
    async (_event, payload: OrchestratorEditPayload): Promise<IPCResult<CompiledWorldResult>> => {
      const win = getWindow();
      try {
        const agent = new ParentAgent(StoreService, graphStore, kvStore, (evt) => {
          if (win && !win.isDestroyed()) {
            win.webContents.send(IPC_CHANNELS.ORCHESTRATOR_PROGRESS, evt);
          }
        });
        const result = await agent.editSelection(payload.sessionId, payload.selection, payload.updateRequest);
        return { success: true, data: result };
      } catch (err) {
        const e = err instanceof Error ? err : new Error(String(err));
        return { success: false, error: { name: e.name, message: e.message } };
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.GRAPH_QUERY_RADIUS,
    async (_event, payload: GraphQueryRadiusPayload): Promise<IPCResult<GraphQueryRadiusResult>> => {
      try {
        const graph = new WorldGraph(graphStore);
        await graph.hydrate(payload.sessionId);
        const nodes = graph.queryRadius(payload.x, payload.z, payload.radius);
        return { success: true, data: { nodes } };
      } catch (err) {
        const e = err instanceof Error ? err : new Error(String(err));
        return { success: false, error: { name: e.name, message: e.message } };
      }
    }
  );
}
