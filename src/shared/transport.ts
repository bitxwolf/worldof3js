import type {
  IPCResult,
  AppSettings,
  SavedWorld,
  ParseWorldPayload,
  UpdateWorldPayload,
  NPCReplyPayload,
  ProcessedImage,
} from './ipc.types';
import type { SceneGraph } from './schema/sceneGraph.schema';
import { IPC_CHANNELS } from './constants';
import { WORLD_PARSER_SYSTEM, buildWorldParserUser } from './prompts/world-parser.prompt';
import { buildCodegenUser, buildCodegenSystemWithExample } from './prompts/codegen.prompt';
import type { EnrichedSceneGraph } from './prompts/codegen.prompt';
import { enrichSceneGraph } from './WorldEnricher';

const isElectron = (): boolean => typeof window !== 'undefined' && 'electronAPI' in window;

function getBrowserSettings(): AppSettings {
  try {
    const stored = localStorage.getItem('story-engine-settings');
    return stored ? JSON.parse(stored) : { apiKey: '', model: 'anthropic/claude-3.5-sonnet', quality: 'fast' };
  } catch {
    return { apiKey: '', model: 'anthropic/claude-3.5-sonnet', quality: 'fast' };
  }
}

function saveBrowserSettings(s: Partial<AppSettings>): void {
  const current = getBrowserSettings();
  localStorage.setItem('story-engine-settings', JSON.stringify({ ...current, ...s }));
}

async function browserLLMCall(systemPrompt: string, userPrompt: string, maxTokens: number = 4096): Promise<string> {
  const settings = getBrowserSettings();
  if (!settings.apiKey) throw new Error('API key not configured. Open Settings to add your OpenRouter API key.');
  
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${settings.apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://story-engine.app',
      'X-Title': 'Story Engine',
    },
    body: JSON.stringify({
      model: settings.model || 'anthropic/claude-3.5-sonnet',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: maxTokens,
      temperature: 0.7,
    }),
  });
  
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenRouter API error (${response.status}): ${errText}`);
  }
  
  const json = await response.json();
  const content = json.choices?.[0]?.message?.content;
  if (!content) throw new Error('OpenRouter returned an empty response');
  return content;
}

function extractJson(text: string): string {
  let cleaned = text.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '').trim();
  }
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.slice(firstBrace, lastBrace + 1);
  }
  return cleaned;
}

export const transport = {
  call: async <T = unknown>(channel: string, payload?: unknown): Promise<IPCResult<T>> => {
    if (isElectron()) {
      switch (channel) {
        case IPC_CHANNELS.APP_GET_SETTINGS:
          return window.electronAPI.getSettings() as Promise<IPCResult<T>>;
        case IPC_CHANNELS.APP_SAVE_SETTINGS:
          return window.electronAPI.saveSettings(payload as Partial<AppSettings>) as Promise<IPCResult<T>>;
        case IPC_CHANNELS.LLM_PARSE_WORLD:
          return window.electronAPI.parseWorld(payload as ParseWorldPayload) as Promise<IPCResult<T>>;
        case IPC_CHANNELS.LLM_GENERATE_CODE:
          return window.electronAPI.generateCode(payload as SceneGraph) as Promise<IPCResult<T>>;
        case IPC_CHANNELS.LLM_UPDATE_WORLD:
          return window.electronAPI.updateWorld(payload as UpdateWorldPayload) as Promise<IPCResult<T>>;
        case IPC_CHANNELS.LLM_NPC_REPLY:
          return window.electronAPI.npcReply(payload as NPCReplyPayload) as Promise<IPCResult<T>>;
        case IPC_CHANNELS.LLM_ENRICH_WORLD:
          return (window.electronAPI.enrichWorld
            ? window.electronAPI.enrichWorld(payload as SceneGraph)
            : Promise.resolve({ success: false, error: 'Enrichment not supported' })) as Promise<IPCResult<T>>;
        case IPC_CHANNELS.FILE_LOAD_WORLD:
          return window.electronAPI.loadWorld() as Promise<IPCResult<T>>;
        case IPC_CHANNELS.FILE_SAVE_WORLD:
          return window.electronAPI.saveWorld(payload as SavedWorld) as Promise<IPCResult<T>>;
        case IPC_CHANNELS.FILE_EXPORT_HTML:
          return window.electronAPI.exportHtml(payload as SceneGraph) as Promise<IPCResult<T>>;
        case IPC_CHANNELS.IMAGE_PROCESS: {
          const { base64, mimeType } = (payload || {}) as { base64: string; mimeType: string };
          return window.electronAPI.processImage(base64, mimeType) as Promise<IPCResult<T>>;
        }
        default:
          return {
            success: false,
            error: { name: 'UnknownChannel', message: `Unknown IPC channel: ${channel}` },
          };
      }
    }
    
    // Browser fallback
    try {
      switch (channel) {
        case IPC_CHANNELS.APP_GET_SETTINGS:
          return { success: true, data: getBrowserSettings() as unknown as T };
        case IPC_CHANNELS.APP_SAVE_SETTINGS:
          saveBrowserSettings(payload as Partial<AppSettings>);
          return { success: true } as IPCResult<T>;
        case IPC_CHANNELS.LLM_PARSE_WORLD: {
          const p = payload as ParseWorldPayload;
          const userPrompt = buildWorldParserUser(p);
          const raw = await browserLLMCall(WORLD_PARSER_SYSTEM, userPrompt, 4096);
          const cleaned = extractJson(raw);
          const parsed = JSON.parse(cleaned);
          return { success: true, data: parsed as unknown as T };
        }
        case IPC_CHANNELS.LLM_GENERATE_CODE: {
          const g = payload as EnrichedSceneGraph;
          const biome = g.world?.biome ?? 'forest';
          const systemPrompt = buildCodegenSystemWithExample(biome);
          const userPrompt = buildCodegenUser(g);
          let raw = await browserLLMCall(systemPrompt, userPrompt, 8192);
          if (raw.startsWith('```')) {
            raw = raw.replace(/^```(?:javascript|js)?\s*\n?/, '').replace(/\n?```\s*$/, '').trim();
          }
          return { success: true, data: raw as unknown as T };
        }
        case IPC_CHANNELS.LLM_UPDATE_WORLD: {
          const u = payload as UpdateWorldPayload;
          const userPrompt = `CURRENT SCENE GRAPH:\n${JSON.stringify(u.currentGraph, null, 2)}\n\nUPDATE REQUEST:\n${u.updatePrompt}\n\nTASK: Return ONLY the JSON fragment containing modified or newly added entities (e.g. objects, characters, lights, events, atmosphere). Preserve existing IDs when modifying. Output raw JSON only.`;
          const raw = await browserLLMCall(WORLD_PARSER_SYSTEM, userPrompt, 4096);
          const cleaned = extractJson(raw);
          return { success: true, data: JSON.parse(cleaned) as unknown as T };
        }
        case IPC_CHANNELS.LLM_ENRICH_WORLD: {
          const g = payload as SceneGraph;
          const claudeCall = async (system: string, user: string): Promise<string> => {
            return browserLLMCall(system, user, 1024);
          };
          const enriched = await enrichSceneGraph(g, claudeCall);
          return { success: true, data: enriched as unknown as T };
        }
        case IPC_CHANNELS.LLM_NPC_REPLY: {
          const n = payload as NPCReplyPayload;
          let sys = `You are an NPC in an interactive Three.js world. Stay in character, speak in first person, and keep answers to 2-3 sentences.`;
          if (n.character) sys += `\nYour name is ${n.character.name}.\nPersonality: ${n.character.personality}`;
          const raw = await browserLLMCall(sys, n.playerMessage, 512);
          return { success: true, data: raw as unknown as T };
        }
        case IPC_CHANNELS.FILE_SAVE_WORLD:
        case IPC_CHANNELS.FILE_LOAD_WORLD:
        case IPC_CHANNELS.FILE_EXPORT_HTML:
          return { success: false, error: { name: 'BrowserMode', message: 'Use the World Library browser fallback' } };
        default:
          return { success: false, error: { name: 'UnknownChannel', message: `Unknown IPC channel: ${channel}` } };
      }
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      return { success: false, error: { name: error.name, message: error.message } };
    }
  },

  getSettings: (): Promise<IPCResult<AppSettings>> =>
    transport.call<AppSettings>(IPC_CHANNELS.APP_GET_SETTINGS),

  saveSettings: (s: Partial<AppSettings>): Promise<IPCResult<void>> =>
    transport.call<void>(IPC_CHANNELS.APP_SAVE_SETTINGS, s),

  parseWorld: (p: ParseWorldPayload): Promise<IPCResult<SceneGraph>> =>
    transport.call(IPC_CHANNELS.LLM_PARSE_WORLD, p),

  generateCode: (g: SceneGraph | EnrichedSceneGraph): Promise<IPCResult<string>> =>
    transport.call(IPC_CHANNELS.LLM_GENERATE_CODE, g),

  enrichWorld: (g: SceneGraph): Promise<IPCResult<EnrichedSceneGraph>> =>
    transport.call(IPC_CHANNELS.LLM_ENRICH_WORLD, g),

  updateWorld: (p: UpdateWorldPayload): Promise<IPCResult<Partial<SceneGraph>>> =>
    transport.call(IPC_CHANNELS.LLM_UPDATE_WORLD, p),

  npcReply: (p: NPCReplyPayload): Promise<IPCResult<void>> =>
    transport.call(IPC_CHANNELS.LLM_NPC_REPLY, p),

  onStreamChunk: (cb: (chunk: string) => void): (() => void) => {
    if (isElectron()) return window.electronAPI.onStreamChunk(cb);
    return () => {};
  },

  onStreamEnd: (cb: () => void): (() => void) => {
    if (isElectron()) return window.electronAPI.onStreamEnd(cb);
    return () => {};
  },

  onStreamError: (cb: (msg: string) => void): (() => void) => {
    if (isElectron()) return window.electronAPI.onStreamError(cb);
    return () => {};
  },

  processImage: (b64: string, mime: string): Promise<IPCResult<ProcessedImage>> =>
    transport.call(IPC_CHANNELS.IMAGE_PROCESS, { base64: b64, mimeType: mime }),
};
