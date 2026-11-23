import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('App Launch Fixes & Resilience Verification', () => {
  it('CSP allows polyfork: and loopback endpoints in connect-src and img-src', () => {
    const indexPath = path.resolve(__dirname, '../src/renderer/index.html');
    const html = fs.readFileSync(indexPath, 'utf-8');

    expect(html).toContain("polyfork:");
    expect(html).toContain("http://127.0.0.1:*");
    expect(html).toMatch(/img-src[^>]*polyfork:/);
    expect(html).toMatch(/connect-src[^>]*polyfork:/);
    expect(html).toContain('Orbis Studio — v1.0.0');
  });

  it('setupNetworkGuard explicitly permits loopback and dev server requests', () => {
    const indexPath = path.resolve(__dirname, '../src/main/index.ts');
    const content = fs.readFileSync(indexPath, 'utf-8');

    expect(content).toContain("isLoopback");
    expect(content).toContain("'localhost'");
    expect(content).toContain("'127.0.0.1'");
    expect(content).toContain("'::1'");
    // Verify IPC handlers are registered once in app.whenReady()
    expect(content).toMatch(/app\.whenReady\(\)\.then\(\(\) => \{[\s\S]*registerAppHandlers\(\);/);
  });

  it('storage db.ts uses createRequire and handles non-Electron environment gracefully', async () => {
    const dbPath = path.resolve(__dirname, '../src/main/storage/db.ts');
    const content = fs.readFileSync(dbPath, 'utf-8');

    expect(content).toContain("createRequire(import.meta.url)");
    const { getDb, _resetDb } = await import('../src/main/storage/db');
    const db = getDb();
    expect(db).toBeDefined();
    _resetDb();
  });

  it('package.json includes build:server and runs serve after compilation', () => {
    const pkgPath = path.resolve(__dirname, '../package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));

    expect(pkg.scripts['build:server']).toBeDefined();
    expect(pkg.scripts['build']).toContain('build:server');
    expect(pkg.scripts['serve']).toContain('out/server/index.js');
  });

  it('server route handles catch-all fallback without path-to-regexp PathError', () => {
    const serverPath = path.resolve(__dirname, '../src/server/index.ts');
    const content = fs.readFileSync(serverPath, 'utf-8');

    expect(content).not.toMatch(/app\.get\(['"]\*['"]/);
    expect(content).toContain("app.get('/{*splat}'");
  });

  it('supports ELECTRON_RENDERER_URL from electron-vite dev server', () => {
    const indexPath = path.resolve(__dirname, '../src/main/index.ts');
    const content = fs.readFileSync(indexPath, 'utf-8');

    expect(content).toContain("process.env['ELECTRON_RENDERER_URL']");
    expect(content).toContain("!app.isPackaged ? 'http://localhost:5173'");
  });
});
