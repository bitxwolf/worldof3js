import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import * as os from 'os';
import { PolyforkService } from '../src/main/services/PolyforkService';

describe('PolyforkService', () => {
  let tempDir: string;
  let service: PolyforkService;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'polyfork-test-'));
    service = new PolyforkService(tempDir);
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
    vi.restoreAllMocks();
  });

  it('initializes models directory and resolves asset paths securely', () => {
    const dir = service.getModelsDir();
    expect(fsSync.existsSync(dir)).toBe(true);

    const assetPath = service.resolveAssetPath('cottage_01.glb');
    expect(assetPath).toBe(path.join(dir, 'cottage_01.glb'));

    // Rejects path traversal attempts
    const traversalPath = service.resolveAssetPath('../../../etc/passwd');
    expect(traversalPath).toBe(path.join(dir, 'passwd')); // basename strips traversal
  });

  it('generates standard polyfork:// URLs', () => {
    expect(service.getAssetUrl('cottage_01')).toBe('polyfork://cottage_01.glb');
    expect(service.getAssetUrl('polyfork:knight')).toBe('polyfork://knight.glb');
    expect(service.getAssetUrl('hero.png')).toBe('polyfork://hero.png');
  });

  it('reads and writes manifest atomically', async () => {
    const emptyManifest = await service.readManifest();
    expect(emptyManifest).toEqual({});

    const sampleAsset = {
      id: 'building_cottage_01',
      title: 'Medieval Cottage',
      kit: 'medieval',
      class: 'building',
      glb: 'building_cottage_01.glb',
      triangles: 450,
      size_m: { x: 4.5, y: 5.2, z: 6.0 },
      rigged: false,
      bytes: 120400,
      meta: 1,
    };

    await service.writeManifest({ [sampleAsset.id]: sampleAsset });

    // New service instance reading the same directory
    const secondService = new PolyforkService(tempDir);
    const readBack = await secondService.readManifest();
    expect(readBack[sampleAsset.id]).toBeDefined();
    expect(readBack[sampleAsset.id].title).toBe('Medieval Cottage');
    expect(readBack[sampleAsset.id].size_m?.x).toBe(4.5);
  });

  it('lists cached assets with accurate disk size and mtime', async () => {
    const glbFilename = 'prop_barrel.glb';
    const glbPath = path.join(tempDir, glbFilename);
    await fs.writeFile(glbPath, Buffer.from('GLTF DUMMY CONTENT 123456'));

    await service.writeManifest({
      prop_barrel: {
        id: 'prop_barrel',
        title: 'Wooden Barrel',
        kit: 'medieval',
        class: 'prop',
        glb: glbFilename,
        bytes: 0,
        meta: 1,
      },
    });

    const cachedList = await service.listCachedAssets();
    expect(cachedList.length).toBe(1);
    expect(cachedList[0].id).toBe('prop_barrel');
    expect(cachedList[0].bytes).toBeGreaterThan(0);
  });

  it('falls back gracefully to cached manifest if remote search fails', async () => {
    // Write local asset to manifest
    await service.writeManifest({
      medieval_forge: {
        id: 'medieval_forge',
        title: 'Blacksmith Forge',
        kit: 'medieval',
        class: 'building',
        glb: 'medieval_forge.glb',
        bytes: 100,
        meta: 1,
      },
    });

    // Create the actual glb file so it counts as cached
    await fs.writeFile(path.join(tempDir, 'medieval_forge.glb'), Buffer.from('GLTF'));

    // Mock fetch to simulate offline / network error
    global.fetch = vi.fn().mockRejectedValue(new Error('Network offline'));

    const results = await service.searchAssets({ query: 'forge' });
    expect(results.length).toBe(1);
    expect(results[0].title).toBe('Blacksmith Forge');
  });

  it('returns default kits when remote API is unreachable', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network offline'));

    const kits = await service.getKits();
    expect(kits.length).toBeGreaterThan(0);
    const kitIds = kits.map((k) => k.id);
    expect(kitIds).toContain('medieval');
    expect(kitIds).toContain('scifi');
  });

  it('deletes cached asset and cleans manifest', async () => {
    const glbPath = path.join(tempDir, 'to_delete.glb');
    await fs.writeFile(glbPath, Buffer.from('TEMP'));

    await service.writeManifest({
      to_delete: {
        id: 'to_delete',
        title: 'To Delete',
        glb: 'to_delete.glb',
        bytes: 4,
        meta: 1,
      },
    });

    const deleted = await service.deleteAsset('to_delete');
    expect(deleted).toBe(true);
    expect(fsSync.existsSync(glbPath)).toBe(false);

    const manifest = await service.readManifest();
    expect(manifest['to_delete']).toBeUndefined();
  });

  it('rejects corrupted GLB downloads lacking glTF magic header and cleans up temp files', async () => {
    // Mock fetch returning HTML error page with 200 OK
    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('/api/assets/')) {
        return {
          ok: true,
          json: async () => ({ id: 'bad_asset', title: 'Corrupted' }),
        };
      }
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        arrayBuffer: async () => Buffer.from('<html><body>404 Not Found</body></html>'),
      };
    });

    await expect(service.fetchAsset('bad_asset')).rejects.toThrow('missing glTF magic header');

    // Confirm no .part or .glb files were left in models dir
    const files = await fs.readdir(tempDir);
    expect(files.filter((f) => f.includes('bad_asset'))).toEqual([]);
  });

  it('successfully downloads and caches valid GLB with glTF magic header', async () => {
    // Mock fetch returning valid binary starting with 'glTF'
    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('/api/assets/')) {
        return {
          ok: true,
          json: async () => ({ id: 'good_model', title: 'Valid Model', class: 'prop' }),
        };
      }
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        arrayBuffer: async () => Buffer.from('glTF\x02\x00\x00\x00\x50\x00\x00\x00'),
      };
    });

    const asset = await service.fetchAsset('good_model');
    expect(asset.id).toBe('good_model');
    expect(asset.title).toBe('Valid Model');

    const glbPath = path.join(tempDir, 'good_model.glb');
    expect(fsSync.existsSync(glbPath)).toBe(true);

    const manifest = await service.readManifest();
    expect(manifest['good_model']).toBeDefined();
  });
});
