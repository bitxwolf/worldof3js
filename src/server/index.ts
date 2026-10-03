import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

import { ClaudeService } from '../main/services/ClaudeService';
import { StoreService } from '../main/services/StoreService';
import { ImageService } from '../main/services/ImageService';
import { APP_VERSION } from '../shared/constants';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT ?? 3422;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, '../../out/renderer')));

const claude = new ClaudeService(StoreService);
const imageService = new ImageService();

// App
app.get('/api/app/get-settings', (_req, res) => {
  try {
    res.json({ success: true, data: StoreService.getSettings() });
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err));
    res.json({ success: false, error: { name: e.name, message: e.message } });
  }
});

app.post('/api/app/save-settings', (req, res) => {
  try {
    StoreService.setSettings(req.body);
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

// Serve renderer for all other routes (client-side routing)
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, '../../out/renderer/index.html'));
});

app.listen(PORT, () => {
  console.log(`\n  WorldEngine running at http://localhost:${PORT}\n`);
});
