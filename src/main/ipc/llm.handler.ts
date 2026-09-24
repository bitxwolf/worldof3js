import { ipcMain, BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '../../shared/constants';
import type {
  IPCResult,
  ParseWorldPayload,
  UpdateWorldPayload,
  NPCReplyPayload,
} from '../../shared/ipc.types';
import type { SceneGraph } from '../../shared/schema/sceneGraph.schema';
import { ClaudeService } from '../services/ClaudeService';
import { StoreService } from '../services/StoreService';

function safeHandle<TArgs, TReturn>(
  channel: string,
  handler: (args: TArgs) => Promise<TReturn>
): void {
  ipcMain.handle(channel, async (_event, args: TArgs): Promise<IPCResult<TReturn>> => {
    try {
      const data = await handler(args);
      return { success: true, data };
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      console.error(`[IPC ${channel}] Failure:`, error);
      return {
        success: false,
        error: { name: error.name, message: error.message },
      };
    }
  });
}

export function registerLLMHandlers(getWindow: () => BrowserWindow | null): void {
  const claude = new ClaudeService(StoreService);

  safeHandle<ParseWorldPayload, SceneGraph>(
    IPC_CHANNELS.LLM_PARSE_WORLD,
    (payload) => claude.parseWorld(payload)
  );

  safeHandle<SceneGraph, string>(
    IPC_CHANNELS.LLM_GENERATE_CODE,
    (graph) => claude.generateCode(graph)
  );

  safeHandle<UpdateWorldPayload, Partial<SceneGraph>>(
    IPC_CHANNELS.LLM_UPDATE_WORLD,
    (payload) => claude.updateWorld(payload)
  );

  ipcMain.handle(
    IPC_CHANNELS.LLM_NPC_REPLY,
    async (_event, payload: NPCReplyPayload): Promise<IPCResult<void>> => {
      const win = getWindow();
      if (!win) {
        return { success: false, error: { name: 'WindowError', message: 'No window available' } };
      }

      try {
        await claude.npcReplyStream(payload, (chunk) => {
          if (!win.isDestroyed()) {
            win.webContents.send(IPC_CHANNELS.LLM_STREAM_CHUNK, chunk);
          }
        });
        if (!win.isDestroyed()) {
          win.webContents.send(IPC_CHANNELS.LLM_STREAM_END);
        }
        return { success: true, data: undefined };
      } catch (err: unknown) {
        const error = err instanceof Error ? err : new Error(String(err));
        if (!win.isDestroyed()) {
          win.webContents.send(IPC_CHANNELS.LLM_STREAM_ERROR, error.message);
        }
        return { success: false, error: { name: error.name, message: error.message } };
      }
    }
  );
}
