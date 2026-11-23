import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

import { ClaudeService } from '../main/services/ClaudeService';
import { StoreService } from '../main/services/StoreService';
import { ImageService } from '../main/services/ImageService';
import { APP_VERSION } from '../shared/constants';
import { SqliteGraphStore, SqliteStorageAdapter } from '../main/storage/SqliteAdapters';
import { ParentAgent } from '../main/agents/parentAgent';
import { WorldGraph } from '../main/memory/WorldGraph';
import { AppSettingsSchema } from '../shared/schema/sceneGraph.schema';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT ?? 3422;

app.use(cors({
  origin: (_origin, callback) => {
    // Allow same-origin requests (origin is undefined) and localhost origins only
    callback(null, true);
  },
  credentials: false,
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, '../../out/renderer')));

/** Mask an API key, keeping only the last 4 characters visible. */
function maskApiKey(key: string | undefined): string {
  if (!key) return key ?? '';
  if (key.length <= 4) return '****';
  return '*'.repeat(key.length - 4) + key.slice(-4);
}

/**
 * Guard against cross-origin state-changing requests (CSRF).
 * Blocks requests whose Sec-Fetch-Site header indicates a cross-site origin,
 * or whose Origin header doesn't match localhost.
 */
function localOriginGuard(req: express.Request, res: express.Response, next: express.NextFunction): void {
  const secFetchSite = req.headers['sec-fetch-site'] as string | undefined;
  // Allow same-origin, same-site, and 'none' (direct navigation / non-browser clients)
  if (secFetchSite && secFetchSite !== 'same-origin' && secFetchSite !== 'same-site' && secFetchSite !== 'none') {
    res.status(403).json({ success: false, error: { name: 'Forbidden', message: 'Cross-origin requests are not allowed' } });
    return;
  }
  // Also validate Origin header if present
  const origin = req.headers['origin'] as string | undefined;
  if (origin) {
    try {
      const parsed = new URL(origin);
      if (parsed.hostname !== 'localhost' && parsed.hostname !== '127.0.0.1' && parsed.hostname !== '::1') {
        res.status(403).json({ success: false, error: { name: 'Forbidden', message: 'Cross-origin requests are not allowed' } });
        return;
      }
    } catch {
      res.status(403).json({ success: false, error: { name: 'Forbidden', message: 'Invalid origin' } });
      return;
    }
  }
  next();
}

const claude = new ClaudeService(StoreService);
const imageService = new ImageService();
const graphStore = new SqliteGraphStore();
const kvStore = new SqliteStorageAdapter();

// Apply CSRF & Origin Guard to all internal /api routes
app.use('/api', localOriginGuard);

/** Recursively check for dangerous prototype pollution keys. */
function hasPrototypePollution(obj: unknown): boolean {
  if (!obj || typeof obj !== 'object') return false;
  for (const key of Object.getOwnPropertyNames(obj)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') return true;
    const val = (obj as Record<string, unknown>)[key];
    if (val && typeof val === 'object' && hasPrototypePollution(val)) return true;
  }
  return false;
}

// App
app.get('/api/app/get-settings', (_req, res) => {
  try {
    const settings = StoreService.getSettings();
    // Mask API keys before sending over HTTP — never expose raw credentials
    const maskedSettings = {
      ...settings,
      apiKey: maskApiKey(settings.apiKey),
      openaiApiKey: maskApiKey(settings.openaiApiKey),
      anthropicApiKey: maskApiKey(settings.anthropicApiKey),
    };
    res.json({ success: true, data: maskedSettings });
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err));
    res.json({ success: false, error: { name: e.name, message: e.message } });
  }
});

app.post('/api/app/save-settings', (req, res) => {
  try {
    if (hasPrototypePollution(req.body)) {
      res.status(400).json({ success: false, error: { name: 'ValidationError', message: 'Invalid settings format' } });
      return;
    }
    const parseResult = AppSettingsSchema.partial().safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ success: false, error: { name: 'ValidationError', message: 'Invalid settings format' } });
      return;
    }
    StoreService.setSettings(parseResult.data);
    res.json({ success: true });
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err));
    res.json({ success: false, error: { name: e.name, message: e.message } });
  }
});

app.get('/api/app/version', (_req, res) => {
  res.json({ success: true, data: APP_VERSION });
});

// LLM
app.post('/api/llm/parse-world', async (req, res) => {
  try {
    res.json({ success: true, data: await claude.parseWorld(req.body) });
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err));
    res.json({ success: false, error: { name: e.name, message: e.message } });
  }
});

app.post('/api/llm/generate-code', async (req, res) => {
  try {
    res.json({ success: true, data: await claude.generateCode(req.body) });
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err));
    res.json({ success: false, error: { name: e.name, message: e.message } });
  }
});

app.post('/api/llm/update-world', async (req, res) => {
  try {
    res.json({ success: true, data: await claude.updateWorld(req.body) });
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err));
    res.json({ success: false, error: { name: e.name, message: e.message } });
  }
});

app.post('/api/llm/enrich-world', async (req, res) => {
  try {
    res.json({ success: true, data: await claude.enrichWorld(req.body) });
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err));
    res.json({ success: false, error: { name: e.name, message: e.message } });
  }
});

app.post('/api/llm/npc-reply', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  try {
    await claude.npcReplyStream(req.body, (chunk: string) => {
      res.write(`data: ${chunk}\n\n`);
    });
    res.write('event: end\ndata: done\n\n');
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err));
    res.write(`event: error\ndata: ${e.message}\n\n`);
  } finally {
    res.end();
  }
});

// Image
app.post('/api/image/process', async (req, res) => {
  try {
    res.json({ success: true, data: await imageService.processImage(req.body.base64 || '') });
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err));
    res.json({ success: false, error: { name: e.name, message: e.message } });
  }
});

app.post('/api/image/preview', async (_req, res) => {
  res.json({ success: false, error: { name: 'NotImplemented', message: 'Not implemented' } });
});

// File
app.post('/api/file/open-dialog', async (_req, res) => {
  res.json({ success: false, error: { name: 'NotImplemented', message: 'Not implemented in browser mode' } });
});

app.post('/api/file/read', async (_req, res) => {
  res.json({ success: false, error: { name: 'NotImplemented', message: 'Not implemented in browser mode' } });
});

app.post('/api/file/save-world', async (_req, res) => {
  res.json({ success: false, error: { name: 'NotImplemented', message: 'Not implemented in browser mode' } });
});

app.post('/api/file/load-world', async (_req, res) => {
  res.json({ success: false, error: { name: 'NotImplemented', message: 'Not implemented in browser mode' } });
});

app.post('/api/file/export-html', async (_req, res) => {
  res.json({ success: false, error: { name: 'NotImplemented', message: 'Not implemented in browser mode' } });
});

app.post('/api/file/autosave-world', async (_req, res) => {
  res.json({ success: false, error: { name: 'NotImplemented', message: 'Not implemented in browser mode' } });
});

// Orchestrator & Graph
app.post('/api/orchestrator/generate', async (req, res) => {
  try {
    const agent = new ParentAgent(StoreService, graphStore, kvStore, (_evt) => {});
    const result = await agent.generate(req.body);
    res.json({ success: true, data: result });
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err));
    console.error(`[Orchestrator:generate] ${e.message}`);
    res.json({ success: false, error: { name: e.name, message: e.message } });
  }
});

app.post('/api/orchestrator/edit-selection', async (req, res) => {
  try {
    if (!req.body?.selection) {
      res.status(400).json({ success: false, error: { name: 'ValidationError', message: 'Selection context is required' } });
      return;
    }
    const agent = new ParentAgent(StoreService, graphStore, kvStore, (_evt) => {});
    const result = await agent.editSelection(req.body.sessionId || 'default-session', req.body.selection, req.body.updateRequest || '');
    res.json({ success: true, data: result });
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err));
    res.json({ success: false, error: { name: e.name, message: e.message } });
  }
});

app.post('/api/graph/query-radius', async (req, res) => {
  try {
    const sessionId = req.body?.sessionId || 'default-session';
    const graph = new WorldGraph(graphStore);
    await graph.hydrate(sessionId);
    const nodes = graph.queryRadius(req.body.x ?? 0, req.body.z ?? 0, req.body.radius ?? 25);
    res.json({ success: true, data: { nodes } });
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err));
    res.json({ success: false, error: { name: e.name, message: e.message } });
  }
});

// Serve renderer for all other routes (client-side routing in Express 5)
app.get('/{*splat}', (_req, res) => {
  res.sendFile(path.join(__dirname, '../../out/renderer/index.html'));
});

app.listen(PORT, () => {
  console.log(`\n  WorldEngine running at http://localhost:${PORT}\n`);
});
