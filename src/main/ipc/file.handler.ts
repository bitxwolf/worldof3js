import { ipcMain, dialog, app, type FileFilter } from 'electron';
import * as fs from 'fs/promises';
import * as path from 'path';
import pdf from 'pdf-parse';
import { IPC_CHANNELS } from '../../shared/constants';
import type { IPCResult, SavedWorld } from '../../shared/ipc.types';
import { SavedWorldSchema, type SceneGraph } from '../../shared/schema/sceneGraph.schema';

const allowedPaths = new Set<string>();
const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB

function sanitizeFilename(name: string | undefined | null, fallback = 'world'): string {
  if (!name || typeof name !== 'string') {
    return fallback;
  }
  let sanitized = name;
  while (sanitized.includes('..')) {
    sanitized = sanitized.replace(/\.\./g, '');
  }
  sanitized = sanitized.replace(/[/\\]/g, '');
  sanitized = sanitized.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_');
  sanitized = path.basename(sanitized).trim();
  sanitized = sanitized.replace(/^\.+/, '').trim();
  return sanitized || fallback;
}

import {
  generateStandaloneHtml,
  validateExportCode,
  EXPORT_BLOCKED_PATTERNS,
  escapeHtml,
} from '../../shared/exportHtml';

export { validateExportCode, EXPORT_BLOCKED_PATTERNS, escapeHtml };

export function registerFileHandlers(): void {
  ipcMain.handle(
    IPC_CHANNELS.FILE_OPEN_DIALOG,
    async (_event, filters?: FileFilter[]): Promise<IPCResult<string | null>> => {
      try {
        const result = await dialog.showOpenDialog({
          properties: ['openFile'],
          filters: filters ?? [
            { name: 'Story Documents', extensions: ['txt', 'md', 'pdf'] },
            { name: 'All Files', extensions: ['*'] },
          ],
        });
        if (result.canceled || result.filePaths.length === 0) {
          return { success: true, data: null };
        }
        const selectedPath = result.filePaths[0];
        allowedPaths.add(path.resolve(selectedPath));
        try {
          allowedPaths.add(await fs.realpath(selectedPath));
        } catch {
          // ignore
        }
        return { success: true, data: selectedPath };
      } catch (err: unknown) {
        const error = err instanceof Error ? err : new Error(String(err));
        return { success: false, error: { name: error.name, message: error.message } };
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.FILE_READ,
    async (_event, filePath: string): Promise<IPCResult<string>> => {
      try {
        if (!filePath || typeof filePath !== 'string') {
          throw new Error('Invalid file path');
        }

        if (filePath.includes('..')) {
          throw new Error('Path traversal not allowed');
        }

        const normalizedPath = path.resolve(filePath);
        if (normalizedPath.includes('..')) {
          throw new Error('Path traversal not allowed');
        }

        const realPath = await fs.realpath(filePath);
        if (realPath.includes('..')) {
          throw new Error('Path traversal not allowed');
        }

        let realUserDataDir: string;
        try {
          realUserDataDir = await fs.realpath(app.getPath('userData'));
        } catch {
          realUserDataDir = path.resolve(app.getPath('userData'));
        }

        const safeExtensions = new Set(['.txt', '.md', '.pdf']);
        const ext = path.extname(realPath).toLowerCase();
        const inputExt = path.extname(normalizedPath).toLowerCase();
        const isSafeExtension = safeExtensions.has(ext) && safeExtensions.has(inputExt);

        const userDataPrefix = realUserDataDir.endsWith(path.sep)
          ? realUserDataDir
          : realUserDataDir + path.sep;
        const inUserData = realPath.startsWith(userDataPrefix) || realPath === realUserDataDir;
        const isAllowed = allowedPaths.has(realPath) || allowedPaths.has(normalizedPath);

        if (!isSafeExtension || (!inUserData && !isAllowed)) {
          throw new Error('Access to this file path is denied');
        }

        const stat = await fs.stat(realPath);
        if (stat.size > MAX_FILE_SIZE) {
          throw new Error('File exceeds maximum allowed size (25MB)');
        }

        if (realPath.toLowerCase().endsWith('.pdf')) {
          const buffer = await fs.readFile(realPath);
          try {
            const pdfData = await pdf(buffer);
            return { success: true, data: pdfData.text || '' };
          } catch (pdfErr) {
            const pError = pdfErr instanceof Error ? pdfErr : new Error(String(pdfErr));
            return {
              success: false,
              error: {
                name: 'PDFParseError',
                message: `Failed to extract text from PDF: ${pError.message}`,
              },
            };
          }
        }

        const content = await fs.readFile(realPath, 'utf-8');
        return { success: true, data: content };
      } catch (err: unknown) {
        const error = err instanceof Error ? err : new Error(String(err));
        return { success: false, error: { name: error.name, message: error.message } };
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.FILE_SAVE_WORLD,
    async (_event, worldData: SavedWorld): Promise<IPCResult<string | null>> => {
      try {
        const safeName = sanitizeFilename(worldData?.name, 'world');
        const result = await dialog.showSaveDialog({
          title: 'Save World',
          defaultPath: `${safeName}.json`,
          filters: [{ name: 'World Files', extensions: ['json'] }],
        });

        if (result.canceled || !result.filePath) {
          return { success: true, data: null };
        }

        const savePath = result.filePath;
        allowedPaths.add(path.resolve(savePath));
        try {
          allowedPaths.add(await fs.realpath(savePath));
        } catch {
          // ignore
        }
        await fs.writeFile(savePath, JSON.stringify(worldData, null, 2), 'utf-8');
        return { success: true, data: savePath };
      } catch (err: unknown) {
        const error = err instanceof Error ? err : new Error(String(err));
        return { success: false, error: { name: error.name, message: error.message } };
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.FILE_LOAD_WORLD,
    async (): Promise<IPCResult<SavedWorld | null>> => {
      try {
        const result = await dialog.showOpenDialog({
          title: 'Load World',
          properties: ['openFile'],
          filters: [{ name: 'World Files', extensions: ['json'] }],
        });

        if (result.canceled || result.filePaths.length === 0) {
          return { success: true, data: null };
        }

        const selectedPath = result.filePaths[0];
        allowedPaths.add(path.resolve(selectedPath));
        try {
          allowedPaths.add(await fs.realpath(selectedPath));
        } catch {
          // ignore
        }
        const content = await fs.readFile(selectedPath, 'utf-8');
        const parsed: unknown = JSON.parse(content);
        const parsedResult = SavedWorldSchema.safeParse(parsed);
        if (!parsedResult.success) {
          return {
            success: false,
            error: {
              name: 'ValidationError',
              message: `Invalid world schema: ${parsedResult.error.message}`,
            },
          };
        }
        return { success: true, data: parsedResult.data };
      } catch (err: unknown) {
        const error = err instanceof Error ? err : new Error(String(err));
        return { success: false, error: { name: error.name, message: error.message } };
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.FILE_EXPORT_HTML,
    async (_event, graph: SceneGraph & { code?: string }): Promise<IPCResult<string | null>> => {
      try {
        const safeName = sanitizeFilename(graph?.world?.name, 'world');
        const result = await dialog.showSaveDialog({
          title: 'Export Standalone HTML World',
          defaultPath: `${safeName}.html`,
          filters: [{ name: 'HTML Files', extensions: ['html'] }],
        });

        if (result.canceled || !result.filePath) {
          return { success: true, data: null };
        }

        const exportPath = result.filePath;
        allowedPaths.add(path.resolve(exportPath));
        try {
          allowedPaths.add(await fs.realpath(exportPath));
        } catch {
          // ignore
        }

        const html = generateStandaloneHtml(graph);
        await fs.writeFile(exportPath, html, 'utf-8');
        return { success: true, data: exportPath };
      } catch (err: unknown) {
        const error = err instanceof Error ? err : new Error(String(err));
        return { success: false, error: { name: error.name, message: error.message } };
      }
    }
  );
  

  ipcMain.handle(IPC_CHANNELS.FILE_AUTOSAVE_WORLD, async (_, payload: unknown) => {
    try {
      const dir = app.getPath('userData');
      const filePath = path.join(dir, 'autosave.json');
      await fs.writeFile(filePath, JSON.stringify(payload), 'utf-8');
      return { success: true, data: filePath };
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      return { success: false, error: { name: 'AutoSaveError', message: error.message } };
    }
  });
}

