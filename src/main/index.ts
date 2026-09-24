import { app, BrowserWindow } from 'electron';
import { join } from 'path';
import { existsSync } from 'fs';
import { registerAppHandlers } from './ipc/app.handler';
import { registerFileHandlers } from './ipc/file.handler';
import { registerLLMHandlers } from './ipc/llm.handler';
import { registerImageHandlers } from './ipc/image.handler';

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'Story Engine',
    backgroundColor: '#030712',
    webPreferences: {
      preload: existsSync(join(__dirname, '../preload/index.cjs'))
        ? join(__dirname, '../preload/index.cjs')
        : existsSync(join(__dirname, '../preload/index.mjs'))
        ? join(__dirname, '../preload/index.mjs')
        : join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  registerAppHandlers();
  registerFileHandlers();
  registerLLMHandlers(() => mainWindow);
  registerImageHandlers();

  const devServerUrl = process.env['VITE_DEV_SERVER_URL'];
  if (devServerUrl) {
    mainWindow.loadURL(devServerUrl);
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
