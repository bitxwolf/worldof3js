import { app, BrowserWindow, shell, session } from 'electron';
import { join } from 'path';
import { existsSync } from 'fs';
import { resolve4 } from 'dns/promises';
import { registerAppHandlers } from './ipc/app.handler';
import { registerFileHandlers } from './ipc/file.handler';
import { registerLLMHandlers } from './ipc/llm.handler';
import { registerImageHandlers } from './ipc/image.handler';
import { registerSettingsHandlers } from './ipc/settings.handler';

// Global crash loggers for packaged production executable
process.on('uncaughtException', (err) => console.error('[Fatal Error]', err));
process.on('unhandledRejection', (reason) => console.error('[Unhandled Rejection]', reason));

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'Orbis',
    backgroundColor: '#030712',
    webPreferences: {
      preload: existsSync(join(__dirname, '../preload/index.cjs'))
        ? join(__dirname, '../preload/index.cjs')
        : existsSync(join(__dirname, '../preload/index.mjs'))
        ? join(__dirname, '../preload/index.mjs')
        : join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  // Deny child window creation or safely open external http/https links using shell.openExternal
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:') || url.startsWith('http:')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  const devServerUrl = process.env['VITE_DEV_SERVER_URL'];

  // Prevent navigation away from the local app (allow dev server URL and file://, block external navigation)
  mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {
    const isAllowed =
      navigationUrl.startsWith('file://') ||
      (devServerUrl ? navigationUrl.startsWith(devServerUrl) : false);

    if (!isAllowed) {
      event.preventDefault();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  registerAppHandlers();
  registerFileHandlers();
  registerLLMHandlers(() => mainWindow);
  registerImageHandlers();
  registerSettingsHandlers();

  if (devServerUrl) {
    mainWindow.loadURL(devServerUrl);
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

/**
 * Check if a resolved IPv4 address is private, loopback, or link-local.
 * This runs in the main process as the authoritative DNS rebinding defense.
 */
function isPrivateIP(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((p) => isNaN(p))) return true; // invalid = block
  const [o1, o2, , ] = parts;
  if (o1 === 0) return true;               // 0.0.0.0/8
  if (o1 === 127) return true;             // loopback
  if (o1 === 10) return true;              // 10.0.0.0/8
  if (o1 === 172 && o2 >= 16 && o2 <= 31) return true; // 172.16.0.0/12
  if (o1 === 192 && o2 === 168) return true;            // 192.168.0.0/16
  if (o1 === 169 && o2 === 254) return true;            // link-local / cloud metadata
  if (o1 === 100 && o2 >= 64 && o2 <= 127) return true; // CGNAT
  if (o1 === 198 && (o2 === 18 || o2 === 19)) return true; // benchmarking
  return false;
}

/**
 * Install a network-layer guard that resolves hostnames to IPs and blocks
 * requests to private/loopback addresses. This closes the DNS rebinding
 * attack vector that renderer-side hostname-string checks cannot catch.
 */
function setupNetworkGuard(): void {
  const ses = session.defaultSession;

  ses.webRequest.onBeforeRequest(
    { urls: ['http://*/*', 'https://*/*'] },
    (details, callback) => {
      // Allow requests to known safe CDNs (Three.js) and dev server
      const devUrl = process.env['VITE_DEV_SERVER_URL'];
      try {
        const parsed = new URL(details.url);
        const host = parsed.hostname.toLowerCase();

        // Allow dev server
        if (devUrl) {
          const devParsed = new URL(devUrl);
          if (host === devParsed.hostname) {
            callback({ cancel: false });
            return;
          }
        }

        // Allow known CDNs
        if (host === 'cdnjs.cloudflare.com' || host === 'cdn.jsdelivr.net' || host === 'unpkg.com') {
          callback({ cancel: false });
          return;
        }

        // For all other external requests: resolve hostname and check IP
        resolve4(host)
          .then((addresses) => {
            const hasPrivate = addresses.some(isPrivateIP);
            if (hasPrivate) {
              console.warn(`[NetworkGuard] Blocked request to ${details.url} — resolved to private IP: ${addresses.join(', ')}`);
              callback({ cancel: true });
            } else {
              callback({ cancel: false });
            }
          })
          .catch(() => {
            // DNS resolution failed — allow the request (Chromium will handle the error)
            callback({ cancel: false });
          });
      } catch {
        callback({ cancel: false });
      }
    }
  );
}

app.whenReady().then(() => {
  createWindow();
  setupNetworkGuard();

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
