import * as THREE from 'three';
import type { ProceduralAssetLibrary } from './assets/ProceduralAssetLibrary';

/**
 * Cache for pre-loaded textures and other assets.
 * Passed into LLM-generated buildScene code as the `assets` parameter.
 */
export interface AssetMap {
  textures: Map<string, THREE.Texture>;
  helpers?: ProceduralAssetLibrary;
}

/**
 * Attempt to normalize an IP string (which may use hex, octal, dword, or
 * short-form notation) to a standard decimal dotted-quad [o1, o2, o3, o4].
 * Returns null if the string is not an IP address at all.
 */
function normalizeIPv4(host: string): [number, number, number, number] | null {
  // Remove trailing dots
  const h = host.replace(/\.+$/, '');

  // Pure integer / dword notation (e.g. 2130706433 → 127.0.0.1)
  if (/^(0x[0-9a-fA-F]+|0[0-7]*|[1-9]\d*)$/.test(h)) {
    const n = Number(h);
    if (Number.isFinite(n) && n >= 0 && n <= 0xFFFFFFFF) {
      return [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
    }
    return null;
  }

  // Dotted notation — 1 to 4 parts (short-form: 127.1 → 127.0.0.1)
  const parts = h.split('.');
  if (parts.length < 1 || parts.length > 4) return null;

  // Each part can be decimal, 0x-hex, or 0-octal
  const parsed: number[] = [];
  for (const p of parts) {
    if (!p) return null; // empty segment
    let val: number;
    if (/^0x[0-9a-fA-F]+$/i.test(p)) {
      val = parseInt(p, 16);
    } else if (/^0[0-7]+$/.test(p)) {
      val = parseInt(p, 8);
    } else if (/^\d+$/.test(p)) {
      val = parseInt(p, 10);
    } else {
      return null; // not an IP
    }
    if (!Number.isFinite(val) || val < 0) return null;
    parsed.push(val);
  }

  // Expand short-form: the last part fills remaining octets
  // e.g. 127.1 → [127, 0.0.1], 10.1.1 → [10, 1, 0.1]
  let o1: number, o2: number, o3: number, o4: number;
  switch (parsed.length) {
    case 1: {
      const n = parsed[0];
      if (n > 0xFFFFFFFF) return null;
      o1 = (n >>> 24) & 0xff; o2 = (n >>> 16) & 0xff;
      o3 = (n >>> 8) & 0xff; o4 = n & 0xff;
      break;
    }
    case 2: {
      if (parsed[0] > 0xff || parsed[1] > 0xFFFFFF) return null;
      o1 = parsed[0]; const n = parsed[1];
      o2 = (n >>> 16) & 0xff; o3 = (n >>> 8) & 0xff; o4 = n & 0xff;
      break;
    }
    case 3: {
      if (parsed[0] > 0xff || parsed[1] > 0xff || parsed[2] > 0xFFFF) return null;
      o1 = parsed[0]; o2 = parsed[1]; const n = parsed[2];
      o3 = (n >>> 8) & 0xff; o4 = n & 0xff;
      break;
    }
    case 4: {
      if (parsed.some(p => p > 0xff)) return null;
      [o1, o2, o3, o4] = parsed;
      break;
    }
    default: return null;
  }
  return [o1, o2, o3, o4];
}

/** Check if a decimal IPv4 quad is private, loopback, or link-local. */
function isPrivateIPv4(o1: number, o2: number, o3: number, _o4: number): boolean {
  if (o1 === 0) return true;             // 0.0.0.0/8
  if (o1 === 127) return true;           // 127.0.0.0/8 (loopback)
  if (o1 === 10) return true;            // 10.0.0.0/8 (private)
  if (o1 === 172 && o2 >= 16 && o2 <= 31) return true; // 172.16.0.0/12
  if (o1 === 192 && o2 === 168) return true;            // 192.168.0.0/16
  if (o1 === 169 && o2 === 254) return true;            // 169.254.0.0/16 (link-local / cloud metadata)
  if (o1 === 100 && o2 >= 64 && o2 <= 127) return true; // 100.64.0.0/10 (CGNAT)
  if (o1 === 198 && (o2 === 18 || o2 === 19)) return true; // 198.18.0.0/15 (benchmarking)
  if (o1 === 255 && o2 === 255 && o3 === 255 && _o4 === 255) return true; // broadcast
  return false;
}

/**
 * Known hostnames used for cloud metadata services or DNS rebinding attacks.
 * These are blocked even though they aren't IP-format strings.
 */
const BLOCKED_HOSTNAMES: ReadonlyArray<string | RegExp> = [
  'metadata.google.internal',
  'metadata.google.com',
  'metadata.goog',
  /^169\.254\.169\.254$/,
  /\.internal$/,
  /\.local$/,
  'kubernetes.default.svc',
  /\.svc\.cluster\.local$/,
];

/**
 * Helper to check if an IP / hostname is private, loopback, or internal.
 * Handles all IP encoding bypasses: decimal, hex, octal, dword, and short-form.
 */
function isPrivateOrLoopbackHost(rawHost: string): boolean {
  const host = rawHost.toLowerCase().replace(/\.+$/, '');
  const unbracketed = host.replace(/^\[|\]$/g, '');

  // Localhost variants
  if (
    unbracketed === 'localhost' ||
    unbracketed.endsWith('.localhost') ||
    unbracketed === 'localhost.localdomain' ||
    unbracketed === 'ip6-localhost' ||
    unbracketed === 'ip6-loopback'
  ) {
    return true;
  }

  // Check against known dangerous hostnames (DNS rebinding defense)
  for (const blocked of BLOCKED_HOSTNAMES) {
    if (typeof blocked === 'string') {
      if (unbracketed === blocked || unbracketed.endsWith('.' + blocked)) return true;
    } else {
      if (blocked.test(unbracketed)) return true;
    }
  }

  // Try normalizing as IPv4 (handles hex, octal, dword, short-form)
  const ipv4 = normalizeIPv4(unbracketed);
  if (ipv4) {
    return isPrivateIPv4(ipv4[0], ipv4[1], ipv4[2], ipv4[3]);
  }

  // IPv6 check
  if (unbracketed.includes(':')) {
    const cleanIp6 = unbracketed.split('%')[0];

    // Loopback (::1) or unspecified (::)
    if (
      cleanIp6 === '::1' ||
      cleanIp6 === '::' ||
      cleanIp6 === '0:0:0:0:0:0:0:1' ||
      cleanIp6 === '0:0:0:0:0:0:0:0'
    ) {
      return true;
    }

    // IPv4-mapped IPv6 (::ffff:127.0.0.1 or ::ffff:7f00:1)
    if (cleanIp6.startsWith('::ffff:')) {
      const rest = cleanIp6.slice(7);
      const mapped = normalizeIPv4(rest);
      if (mapped) return isPrivateIPv4(mapped[0], mapped[1], mapped[2], mapped[3]);
      // Hex-pair format (::ffff:7f00:0001)
      const hexParts = rest.split(':');
      if (hexParts.length === 2) {
        const p1 = parseInt(hexParts[0], 16);
        const p2 = parseInt(hexParts[1], 16);
        if (!isNaN(p1) && !isNaN(p2)) {
          const o1 = (p1 >> 8) & 0xff;
          const o2 = p1 & 0xff;
          const o3 = (p2 >> 8) & 0xff;
          const o4 = p2 & 0xff;
          return isPrivateIPv4(o1, o2, o3, o4);
        }
      }
    }

    // IPv4-compatible IPv6 (::127.0.0.1)
    if (cleanIp6.startsWith('::') && cleanIp6.length > 2) {
      const rest = cleanIp6.slice(2);
      const compat = normalizeIPv4(rest);
      if (compat) return isPrivateIPv4(compat[0], compat[1], compat[2], compat[3]);
      const hexParts = rest.split(':');
      if (hexParts.length === 2) {
        const p1 = parseInt(hexParts[0], 16);
        const p2 = parseInt(hexParts[1], 16);
        if (!isNaN(p1) && !isNaN(p2)) {
          const o1 = (p1 >> 8) & 0xff;
          const o2 = p1 & 0xff;
          const o3 = (p2 >> 8) & 0xff;
          const o4 = p2 & 0xff;
          return isPrivateIPv4(o1, o2, o3, o4);
        }
      }
    }

    // Unique local (fc00::/7) and link-local (fe80::/10)
    const firstHextetStr = cleanIp6.split(':')[0];
    if (firstHextetStr) {
      const firstHextet = parseInt(firstHextetStr, 16);
      if (!isNaN(firstHextet)) {
        if ((firstHextet & 0xfe00) === 0xfc00) return true; // fc00::/7
        if ((firstHextet & 0xffc0) === 0xfe80) return true; // fe80::/10
      }
    }
  }

  return false;
}

/**
 * Validates that an asset URL is safe to fetch:
 * 1. Allows safe local / relative paths (starting with '/', './', '../', or asset paths).
 * 2. Allows 'data:' and 'blob:' schemes.
 * 3. For 'http://' and 'https://', prevents SSRF by rejecting private IP and loopback addresses.
 * 4. Throws an Error if validation fails.
 */
export function validateTextureUrl(url: string): void {
  if (!url || typeof url !== 'string') {
    throw new Error('Texture URL must be a non-empty string');
  }

  const trimmed = url.trim();

  // 1. Allow safe local / relative paths (starting with '/', './', '../', or asset paths)
  if (
    (trimmed.startsWith('/') && !trimmed.startsWith('//')) ||
    trimmed.startsWith('./') ||
    trimmed.startsWith('.\\') ||
    trimmed.startsWith('../') ||
    trimmed.startsWith('..\\') ||
    /^assets?([/\\]|$)/i.test(trimmed) ||
    /^textures?([/\\]|$)/i.test(trimmed)
  ) {
    return;
  }

  // 2. Allow data: and blob: schemes
  if (trimmed.startsWith('data:') || trimmed.startsWith('blob:')) {
    return;
  }

  // Protocol-relative remote URL handling (e.g. //localhost/texture.png)
  if (trimmed.startsWith('//')) {
    validateHttpUrl(`http:${trimmed}`);
    return;
  }

  // 3. If the URL starts with http:// or https://:
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    validateHttpUrl(trimmed);
    return;
  }

  // 4. If validation fails, throw an Error
  throw new Error(`Invalid or disallowed asset URL scheme or path: "${url}"`);
}

function validateHttpUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('Invalid remote asset URL');
  }

  if (isPrivateOrLoopbackHost(parsed.hostname)) {
    throw new Error('Remote asset URL points to disallowed private/internal network target');
  }
}

export class AssetRegistry {
  private readonly textures = new Map<string, THREE.Texture>();
  private readonly loader = new THREE.TextureLoader();

  /** Validate a texture URL against SSRF and disallowed schemes. */
  validateTextureUrl(url: string): void {
    validateTextureUrl(url);
  }

  /** Load a texture by URL/path and cache it under a key. */
  async loadTexture(key: string, url: string): Promise<THREE.Texture> {
    this.validateTextureUrl(url);

    const existing = this.textures.get(key);
    if (existing) return existing;

    return new Promise<THREE.Texture>((resolve, reject) => {
      this.loader.load(
        url,
        (texture) => {
          this.textures.set(key, texture);
          resolve(texture);
        },
        undefined,
        (err) => {
          console.error(`[AssetRegistry] Failed to load texture "${key}":`, err);
          reject(err);
        }
      );
    });
  }

  /** Get the current asset map for injection into generated code. */
  getAssetMap(): AssetMap {
    return {
      textures: new Map(this.textures),
    };
  }

  /** Dispose all cached textures. */
  disposeAll(): void {
    this.textures.forEach((t) => t.dispose());
    this.textures.clear();
    console.debug('[AssetRegistry] All cached assets disposed');
  }
}
