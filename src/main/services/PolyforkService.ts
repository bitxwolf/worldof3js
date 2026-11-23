import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import * as os from 'os';
import { app } from 'electron';
import type {
  PolyforkAsset,
  PolyforkKit,
  PolyforkSearchOptions,
  PolyforkRawClip,
} from '../../shared/ipc.types';

const API_BASE = 'https://polyfork.dev/api';
const CLIPS_URL = 'https://polyfork.dev/anim/clips.json';
const CLIPS_FILENAME = 'clips.json';
const MANIFEST_FILENAME = 'manifest.json';
const META_VERSION = 1;

const DEFAULT_KITS: PolyforkKit[] = [
  { id: 'medieval', title: 'Medieval', status: 'published', parts: 120 },
  { id: 'dungeon', title: 'Dungeon', status: 'published', parts: 85 },
  { id: 'scifi', title: 'Sci-Fi', status: 'published', parts: 94 },
  { id: 'nature', title: 'Nature', status: 'published', parts: 64 },
  { id: 'pirate', title: 'Pirate', status: 'published', parts: 45 },
  { id: 'apocalyptic', title: 'Apocalyptic', status: 'published', parts: 50 },
  { id: 'cyberpunk', title: 'Cyberpunk', status: 'published', parts: 70 },
];

interface RemoteAsset {
  id: string;
  title: string;
  class?: string;
  kit?: string;
  triangles?: number;
  size_m?: { x: number; y: number; z: number };
  has_rig?: boolean;
  page?: string;
  thumbnail?: string;
  download?: {
    glb?: string;
  };
}

export class PolyforkService {
  private dir: string | null = null;
  private kitTitles: Map<string, string> = new Map();
  private manifestCache: Record<string, PolyforkAsset> | null = null;
  private inFlightDownloads = new Map<string, Promise<PolyforkAsset>>();

  constructor(customDir?: string) {
    if (customDir) {
      this.dir = customDir;
    }
  }

  /**
   * Lazily resolve and initialize models storage folder in userData/polyfork_models.
   */
  public getModelsDir(): string {
    if (!this.dir) {
      if (process.env.POLYFORK_MODELS_DIR) {
        this.dir = path.resolve(process.env.POLYFORK_MODELS_DIR);
      } else {
        try {
          if (app && typeof app.getPath === 'function') {
            this.dir = path.join(app.getPath('userData'), 'polyfork_models');
          } else {
            this.dir = path.join(os.tmpdir(), 'orbis_polyfork_models');
          }
        } catch {
          this.dir = path.join(os.tmpdir(), 'orbis_polyfork_models');
        }
      }
    }

    if (!fsSync.existsSync(this.dir)) {
      fsSync.mkdirSync(this.dir, { recursive: true });
    }

    return this.dir;
  }

  /**
   * Safely resolve a filename inside the models directory, guarding against traversal.
   */
  public resolveAssetPath(filenameOrId: string): string {
    const dir = this.getModelsDir();
    let sanitized = filenameOrId.replace(/^polyfork:\/\/?/, '').replace(/^polyfork:/, '');
    sanitized = path.basename(sanitized);
    let resolved = path.resolve(dir, sanitized);

    if (!fsSync.existsSync(resolved) && fsSync.existsSync(`${resolved}.glb`)) {
      resolved = `${resolved}.glb`;
    }

    if (!resolved.startsWith(path.resolve(dir))) {
      throw new Error(`Path traversal attempt detected: ${filenameOrId}`);
    }

    return resolved;
  }

  /**
   * Return the polyfork:// URI for an asset id.
   */
  public getAssetUrl(idOrFilename: string): string {
    let clean = idOrFilename
      .replace(/^polyfork:\/\/?\/?/, '')
      .replace(/^polyfork:/, '')
      .replace(/^\/+/, '');
    if (!clean.endsWith('.glb') && !clean.endsWith('.png') && !clean.endsWith('.json')) {
      clean = `${clean}.glb`;
    }
    return `polyfork://${clean}`;
  }

  /**
   * Reads manifest.json from models folder.
   */
  public async readManifest(): Promise<Record<string, PolyforkAsset>> {
    if (this.manifestCache) {
      return this.manifestCache;
    }
    const manifestPath = path.join(this.getModelsDir(), MANIFEST_FILENAME);
    try {
      if (!fsSync.existsSync(manifestPath)) {
        this.manifestCache = {};
        return {};
      }
      const data = await fs.readFile(manifestPath, 'utf8');
      const parsed = JSON.parse(data);
      this.manifestCache = parsed;
      return parsed;
    } catch (err) {
      console.warn('[PolyforkService] Failed to read manifest, starting fresh:', err);
      this.manifestCache = {};
      return {};
    }
  }

  /**
   * Atomically writes manifest.json.
   */
  public async writeManifest(manifest: Record<string, PolyforkAsset>): Promise<void> {
    const dir = this.getModelsDir();
    const manifestPath = path.join(dir, MANIFEST_FILENAME);
    const tmpPath = path.join(dir, `${MANIFEST_FILENAME}.${Date.now()}.tmp`);

    const json = JSON.stringify(manifest, null, 2);
    await fs.writeFile(tmpPath, json, 'utf8');
    await fs.rename(tmpPath, manifestPath);
    this.manifestCache = manifest;
  }

  /**
   * List all locally cached assets.
   */
  public async listCachedAssets(): Promise<PolyforkAsset[]> {
    const manifest = await this.readManifest();
    const dir = this.getModelsDir();
    const result: PolyforkAsset[] = [];

    for (const key of Object.keys(manifest)) {
      const asset = manifest[key];
      const glbPath = path.join(dir, asset.glb || `${asset.id}.glb`);
      try {
        if (fsSync.existsSync(glbPath)) {
          const stats = fsSync.statSync(glbPath);
          asset.updated_at = stats.mtimeMs;
          asset.bytes = stats.size;
          result.push(asset);
        }
      } catch {
        // Skip inaccessible file
      }
    }

    return result.sort((a, b) => a.title.localeCompare(b.title));
  }

  /**
   * Search polyfork.dev catalog with fallback to cached models if offline.
   */
  public async searchAssets(opts: PolyforkSearchOptions = {}): Promise<PolyforkAsset[]> {
    const limit = Math.min(opts.limit ?? 50, 100);
    const params = new URLSearchParams({
      free: '1',
      per_page: String(limit),
      page: '1',
    });

    if (opts.kit) params.set('kit', opts.kit);
    if (opts.query) params.set('q', opts.query);
    if (opts.class) params.set('class', opts.class);

    const url = `${API_BASE}/assets?${params.toString()}`;

    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'polyfork-orbis-viewer/1.0' },
        signal: AbortSignal.timeout(10000),
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }

      const data = (await res.json()) as { assets?: RemoteAsset[]; total?: number };
      const remoteAssets = data.assets || [];

      // Ensure kit titles are loaded for friendly display
      await this.ensureKitTitles();

      const mapped: PolyforkAsset[] = remoteAssets.map((r) => ({
        id: r.id,
        title: r.title,
        class: r.class,
        kit: r.kit,
        kit_title: r.kit ? this.kitTitles.get(r.kit) || r.kit : undefined,
        triangles: r.triangles,
        size_m: r.size_m,
        rigged: Boolean(r.has_rig),
        page: r.page,
        glb: `${r.id}.glb`,
        thumb: `${r.id}.png`,
        bytes: 0,
        meta: META_VERSION,
      }));

      return mapped;
    } catch (err) {
      console.warn('[PolyforkService] Remote search failed, falling back to local cache:', err);
      // Offline fallback: filter local manifest
      return this.filterCachedAssets(opts);
    }
  }

  /**
   * Filter local cached assets for offline query.
   */
  private async filterCachedAssets(opts: PolyforkSearchOptions): Promise<PolyforkAsset[]> {
    const cached = await this.listCachedAssets();
    const query = (opts.query || '').toLowerCase().trim();
    const kit = (opts.kit || '').toLowerCase().trim();
    const assetClass = (opts.class || '').toLowerCase().trim();

    return cached.filter((asset) => {
      if (kit && (asset.kit || '').toLowerCase() !== kit) return false;
      if (assetClass && (asset.class || '').toLowerCase() !== assetClass) return false;
      if (query) {
        const matchesTitle = asset.title.toLowerCase().includes(query);
        const matchesId = asset.id.toLowerCase().includes(query);
        const matchesKit = (asset.kit_title || '').toLowerCase().includes(query);
        return matchesTitle || matchesId || matchesKit;
      }
      return true;
    });
  }

  /**
   * Download and cache an asset (and its hero preview image) by ID.
   */
  public async fetchAsset(id: string, force = false): Promise<PolyforkAsset> {
    const cleanId = id.replace(/^polyfork:\/\/?/, '').replace(/^polyfork:/, '').replace(/\.glb$/, '');
    const dir = this.getModelsDir();
    const glbFilename = `${cleanId}.glb`;
    const glbPath = path.join(dir, glbFilename);

    // If not forcing, check manifest and disk first
    if (!force) {
      const manifest = await this.readManifest();
      if (manifest[cleanId] && fsSync.existsSync(glbPath)) {
        return manifest[cleanId];
      }
    }

    // Coalesce concurrent downloads for the same asset
    const inFlight = this.inFlightDownloads.get(cleanId);
    if (inFlight) {
      return inFlight;
    }

    const downloadPromise = this.doFetchAsset(cleanId, force);
    this.inFlightDownloads.set(cleanId, downloadPromise);

    try {
      return await downloadPromise;
    } finally {
      this.inFlightDownloads.delete(cleanId);
    }
  }

  private async doFetchAsset(cleanId: string, force: boolean): Promise<PolyforkAsset> {
    const dir = this.getModelsDir();
    const glbFilename = `${cleanId}.glb`;
    const thumbFilename = `${cleanId}.png`;
    const glbPath = path.join(dir, glbFilename);
    const thumbPath = path.join(dir, thumbFilename);

    // 1. Fetch remote asset metadata
    let remote: RemoteAsset | null = null;
    try {
      const metaRes = await fetch(`${API_BASE}/assets/${encodeURIComponent(cleanId)}`, {
        headers: { 'User-Agent': 'polyfork-orbis-viewer/1.0' },
        signal: AbortSignal.timeout(10000),
      });
      if (metaRes.ok) {
        remote = (await metaRes.json()) as RemoteAsset;
      }
    } catch (metaErr) {
      console.warn(`[PolyforkService] Metadata fetch failed for ${cleanId}:`, metaErr);
    }

    const glbUrl =
      remote?.download?.glb || `https://polyfork.dev/cdn/${encodeURIComponent(cleanId)}.glb`;
    const thumbUrl =
      remote?.thumbnail || `https://polyfork.dev/files/${encodeURIComponent(cleanId)}/renders/hero.png`;

    // 2. Download GLB
    await this.downloadFile(glbUrl, glbPath, force);

    // 3. Download Thumbnail (non-fatal)
    try {
      await this.downloadFile(thumbUrl, thumbPath, force);
    } catch {
      // Thumbnail download is optional
    }

    // 4. Update manifest
    const manifest = await this.readManifest();
    let stats: fsSync.Stats | undefined;
    try {
      stats = fsSync.statSync(glbPath);
    } catch {
      // ignore
    }

    const asset: PolyforkAsset = {
      id: cleanId,
      title: remote?.title || cleanId.replace(/_/g, ' '),
      class: remote?.class,
      kit: remote?.kit,
      kit_title: remote?.kit ? this.kitTitles.get(remote.kit) || remote.kit : undefined,
      triangles: remote?.triangles,
      size_m: remote?.size_m,
      rigged: Boolean(remote?.has_rig),
      page: remote?.page,
      glb: glbFilename,
      thumb: fsSync.existsSync(thumbPath) ? thumbFilename : undefined,
      bytes: stats ? stats.size : 0,
      updated_at: stats ? stats.mtimeMs : Date.now(),
      meta: META_VERSION,
    };

    manifest[cleanId] = asset;
    await this.writeManifest(manifest);

    return asset;
  }

  /**
   * Helper to download a remote file safely to disk via temp file.
   */
  private async downloadFile(srcUrl: string, destPath: string, force: boolean): Promise<boolean> {
    if (!force && fsSync.existsSync(destPath) && fsSync.statSync(destPath).size > 0) {
      return true; // Already cached
    }

    const res = await fetch(srcUrl, {
      headers: { 'User-Agent': 'polyfork-orbis-viewer/1.0' },
      signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) {
      throw new Error(`Failed to download ${srcUrl}: HTTP ${res.status} ${res.statusText}`);
    }

    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Validate GLB binary magic bytes ('glTF' = 0x67, 0x6c, 0x54, 0x46) to protect against
    // captive portals or proxies returning 200 OK with HTML error pages
    if (destPath.endsWith('.glb')) {
      if (buffer.length < 4 || buffer.toString('utf8', 0, 4) !== 'glTF') {
        throw new Error(`Downloaded file from ${srcUrl} is not a valid GLTF binary (missing glTF magic header)`);
      }
    }

    const tmpPath = `${destPath}.${Date.now()}.part`;
    try {
      await fs.writeFile(tmpPath, buffer);
      await fs.rename(tmpPath, destPath);
    } catch (writeErr) {
      try {
        if (fsSync.existsSync(tmpPath)) {
          await fs.unlink(tmpPath);
        }
      } catch {
        // ignore unlink error on temp cleanup
      }
      throw writeErr;
    }

    return false;
  }

  /**
   * Fetch all available kits from polyfork.dev, with offline fallback.
   */
  public async getKits(): Promise<PolyforkKit[]> {
    try {
      const res = await fetch(`${API_BASE}/kits`, {
        headers: { 'User-Agent': 'polyfork-orbis-viewer/1.0' },
        signal: AbortSignal.timeout(10000),
      });

      if (res.ok) {
        const data = (await res.json()) as {
          kits?: Array<{ id: string; title: string; status: string; parts_published: number }>;
        };
        if (data.kits && Array.isArray(data.kits)) {
          const kits: PolyforkKit[] = data.kits.map((k) => ({
            id: k.id,
            title: k.title,
            status: k.status,
            parts: k.parts_published,
          }));
          for (const k of kits) {
            this.kitTitles.set(k.id, k.title);
          }
          return kits.sort((a, b) => a.title.localeCompare(b.title));
        }
      }
    } catch (err) {
      console.warn('[PolyforkService] Kits fetch failed, using default list:', err);
    }

    for (const k of DEFAULT_KITS) {
      this.kitTitles.set(k.id, k.title);
    }
    return DEFAULT_KITS;
  }

  private async ensureKitTitles(): Promise<void> {
    if (this.kitTitles.size === 0) {
      await this.getKits();
    }
  }

  /**
   * Download shared Mixamo clips.json to models folder if not present.
   */
  public async ensureClips(): Promise<string> {
    const dir = this.getModelsDir();
    const clipsPath = path.join(dir, CLIPS_FILENAME);

    if (fsSync.existsSync(clipsPath) && fsSync.statSync(clipsPath).size > 0) {
      return CLIPS_FILENAME;
    }

    try {
      await this.downloadFile(CLIPS_URL, clipsPath, false);
      return CLIPS_FILENAME;
    } catch (err) {
      console.warn('[PolyforkService] Failed to download shared clips.json:', err);
      return CLIPS_FILENAME;
    }
  }

  /**
   * Return parsed clips dictionary for animation retargeting.
   */
  public async getClips(): Promise<Record<string, PolyforkRawClip>> {
    await this.ensureClips();
    const dir = this.getModelsDir();
    const clipsPath = path.join(dir, CLIPS_FILENAME);

    try {
      if (fsSync.existsSync(clipsPath)) {
        const content = await fs.readFile(clipsPath, 'utf8');
        return JSON.parse(content);
      }
    } catch (err) {
      console.warn('[PolyforkService] Failed to read clips.json:', err);
    }

    return {};
  }

  /**
   * Delete a cached asset from disk and manifest.
   */
  public async deleteAsset(id: string): Promise<boolean> {
    const cleanId = id.replace(/^polyfork:\/\/?/, '').replace(/^polyfork:/, '').replace(/\.glb$/, '');
    const dir = this.getModelsDir();
    const glbPath = path.join(dir, `${cleanId}.glb`);
    const thumbPath = path.join(dir, `${cleanId}.png`);

    try {
      if (fsSync.existsSync(glbPath)) await fs.unlink(glbPath);
      if (fsSync.existsSync(thumbPath)) await fs.unlink(thumbPath);
    } catch (err) {
      console.warn(`[PolyforkService] File unlink error for ${cleanId}:`, err);
    }

    const manifest = await this.readManifest();
    if (manifest[cleanId]) {
      delete manifest[cleanId];
      await this.writeManifest(manifest);
      return true;
    }

    return false;
  }
}

export const polyforkService = new PolyforkService();
