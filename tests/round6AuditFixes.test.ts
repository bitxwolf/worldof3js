import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import zlib from 'zlib';
import { ImageService } from '../src/main/services/ImageService';
import { imageToGeometry } from '../src/renderer/engine/assets/img2threejsAdapter';
import {
  validateExportCode,
  generateStandaloneHtml,
} from '../src/shared/exportHtml';
import { sanitizePlayerPosition } from '../src/renderer/components/WorldLibrary/WorldLibraryModal';
import { SavedWorldSchema, SceneGraphSchema, type SceneGraph } from '../src/shared/schema/sceneGraph.schema';

describe('Round 6 Bug Audit & Resiliency Fixes', () => {
  describe('BUG-039: Custom Image Portrait Extrusion & Texture Handling', () => {
    it('decodes 8-bit indexed PNG with PLTE palette and tRNS transparency chunks', async () => {
      // Build a minimal 2x2 indexed PNG in memory
      const service = new ImageService();

      // PNG signature: 89 50 4E 47 0D 0A 1A 0A
      const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

      // IHDR: width=2, height=2, bitDepth=8, colorType=3 (Indexed)
      const ihdrData = Buffer.alloc(13);
      ihdrData.writeUInt32BE(2, 0); // width
      ihdrData.writeUInt32BE(2, 4); // height
      ihdrData.writeUInt8(8, 8);    // bitDepth
      ihdrData.writeUInt8(3, 9);    // colorType = 3 (indexed)
      ihdrData.writeUInt8(0, 10);   // compression
      ihdrData.writeUInt8(0, 11);   // filter
      ihdrData.writeUInt8(0, 12);   // interlace

      const makeChunk = (type: string, data: Buffer) => {
        const len = Buffer.alloc(4);
        len.writeUInt32BE(data.length, 0);
        const typeBuf = Buffer.from(type, 'ascii');
        const crc = Buffer.alloc(4); // mock crc
        return Buffer.concat([len, typeBuf, data, crc]);
      };

      const ihdrChunk = makeChunk('IHDR', ihdrData);

      // PLTE: 2 palette entries (Red, Blue)
      const plteData = Buffer.from([
        255, 0, 0,    // index 0: Red
        0, 0, 255,    // index 1: Blue
      ]);
      const plteChunk = makeChunk('PLTE', plteData);

      // tRNS: index 0 is transparent (0), index 1 is opaque (255)
      const trnsData = Buffer.from([0, 255]);
      const trnsChunk = makeChunk('tRNS', trnsData);

      // IDAT: 2 scanlines (filter byte 0 + 2 pixels per line)
      // Line 0: filter 0, pixels [0, 1]
      // Line 1: filter 0, pixels [1, 0]
      const rawScanlines = Buffer.from([
        0, 0, 1,
        0, 1, 0,
      ]);
      const compressedIdat = zlib.deflateSync(rawScanlines);
      const idatChunk = makeChunk('IDAT', compressedIdat);

      const iendChunk = makeChunk('IEND', Buffer.alloc(0));

      const fullPng = Buffer.concat([sig, ihdrChunk, plteChunk, trnsChunk, idatChunk, iendChunk]);
      const base64Png = fullPng.toString('base64');

      const result = await service.processImage(base64Png, 'image/png');
      expect(result).toBeDefined();
      expect(result.dimensions.width).toBe(2);
      expect(result.dimensions.height).toBe(2);
      // Colors extracted from palette
      expect(result.colors?.length).toBeGreaterThan(0);
      expect(result.contour?.length).toBeGreaterThanOrEqual(3);
    });

    it('falls back to corner color distance when PNG alpha channel is completely opaque (malformed)', async () => {
      const service = new ImageService();

      // Create a 4x4 RGBA image with solid white background and black character center,
      // but where alpha is 255 everywhere (non-transparent AI portrait)
      const width = 4;
      const height = 4;
      const rawRgba = new Uint8Array(width * height * 4);

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const idx = (y * width + x) * 4;
          const isCenter = x >= 1 && x <= 2 && y >= 1 && y <= 2;
          if (isCenter) {
            rawRgba[idx] = 0; rawRgba[idx + 1] = 0; rawRgba[idx + 2] = 0; rawRgba[idx + 3] = 255;
          } else {
            rawRgba[idx] = 255; rawRgba[idx + 1] = 255; rawRgba[idx + 2] = 255; rawRgba[idx + 3] = 255;
          }
        }
      }

      // Access private extractSilhouetteContour via reflection
      const contourResult = (service as any).extractSilhouetteContour(rawRgba, width, height, true);
      expect(contourResult).toBeDefined();
      expect(contourResult.contour.length).toBeGreaterThanOrEqual(3);
    });

    it('gracefully handles empty, truncated, or invalid base64 image strings without throwing', async () => {
      const fallback1 = await imageToGeometry('   ');
      expect(fallback1).toBeInstanceOf(THREE.Group);
      expect(fallback1.userData.type).toBe('npc');

      const fallback2 = await imageToGeometry('data:image/png;base64,');
      expect(fallback2).toBeInstanceOf(THREE.Group);

      const fallback3 = await imageToGeometry('null');
      expect(fallback3).toBeInstanceOf(THREE.Group);

      const fallback4 = await imageToGeometry('corrupted-data-not-an-image');
      expect(fallback4).toBeInstanceOf(THREE.Group);
    });
  });

  describe('BUG-040: World Import/Export & Schema Ingestion Resilience', () => {
    it('accepts and normalizes raw SceneGraph exports into SavedWorld format', () => {
      const rawSceneGraph: SceneGraph = {
        version: '1.0',
        world: {
          name: 'Direct Scene Export',
          description: 'Exported from JSON Inspector without wrapper',
          biome: 'forest',
          timeOfDay: 'morning',
          weather: 'clear',
          scale: 'medium',
        },
        player: {
          spawn: [10, 2.5, -15],
          startPosition: [10, 2.5, -15],
          movementSpeed: 4.0,
          jumpHeight: 1.5,
        },
        zones: [],
        characters: [],
        objects: [],
        lights: [],
        events: [],
        skybox: { type: 'gradient', topColor: '#0a0a1a', bottomColor: '#2a2a4a' },
        atmosphere: { fogDensity: 0.015, fogColor: '#1a1a2e', ambientIntensity: 0.5, sunColor: '#fff4e0' },
        flags: { quest_unlocked: true },
      };

      // Raw SceneGraph parse succeeds
      const sgParsed = SceneGraphSchema.safeParse(rawSceneGraph);
      expect(sgParsed.success).toBe(true);

      // Wrapped SavedWorld can be created from raw SceneGraph
      const wrapped = {
        name: rawSceneGraph.world.name,
        timestamp: Date.now(),
        sceneGraph: rawSceneGraph,
        flags: rawSceneGraph.flags || {},
        playerPosition: rawSceneGraph.player?.spawn || [0, 1.7, 0],
      };
      const savedParsed = SavedWorldSchema.safeParse(wrapped);
      expect(savedParsed.success).toBe(true);
      expect(savedParsed.data?.sceneGraph.world.name).toBe('Direct Scene Export');
    });

    it('sanitizes playerPosition coordinates to valid finite numbers, discarding NaN or non-numeric values', () => {
      // Normal valid position
      expect(sanitizePlayerPosition([10, 5, -20])).toEqual([10, 5, -20]);

      // Corrupted / NaN positions
      expect(sanitizePlayerPosition([NaN, 5, -20])).toEqual([0, 5, -20]);
      expect(sanitizePlayerPosition([10, null, 'invalid'])).toEqual([10, 1.7, 0]);
      expect(sanitizePlayerPosition(undefined)).toEqual([0, 1.7, 0]);
      expect(sanitizePlayerPosition([])).toEqual([0, 1.7, 0]);
      expect(sanitizePlayerPosition([Infinity, -Infinity, 0])).toEqual([0, 1.7, 0]);
    });

    it('cleanly fails validation on truncated or schema-incompatible JSON with readable issues', () => {
      const invalidJson = {
        world: {
          // missing name, biome, scale etc.
        },
      };

      const result = SavedWorldSchema.safeParse(invalidJson);
      expect(result.success).toBe(false);
      if (!result.success) {
        const issues = result.error.issues.map((i) => `${i.path.join('.') || 'root'}: ${i.message}`).join(', ');
        expect(issues).toContain('sceneGraph');
      }
    });
  });

  describe('BUG-041: Security & API Hardening', () => {
    it('blocks window proxies, navigation, and dialog APIs in standalone export code', () => {
      const dangerousSnippets = [
        `top.location.href = 'https://malicious.example.com'`,
        `self.location = 'https://malicious.example.com'`,
        `parent.postMessage('token', '*')`,
        `alert('XSS execution')`,
        `confirm('Transfer funds?')`,
        `prompt('Enter password')`,
        `window.open('https://phishing.example.com')`,
        `indexedDB.open('secrets')`,
        `const p = window['location']`,
      ];

      for (const snippet of dangerousSnippets) {
        expect(validateExportCode(snippet)).toBe('');
      }
    });

    it('escapes <script, </script>, and <!-- in serialized standalone HTML graph to prevent breakout', () => {
      const exploitGraph: any = {
        version: '1.0',
        world: {
          name: 'Exploit <script>alert("pwned")</script> <!-- comment injection -->',
          description: 'A test world',
          biome: 'forest',
          timeOfDay: 'morning',
          weather: 'clear',
          scale: 'small',
        },
        player: { spawn: [0, 1.7, 0], movementSpeed: 4.0, jumpHeight: 1.5 },
        zones: [],
        characters: [],
        objects: [],
        lights: [],
        events: [],
      };

      const html = generateStandaloneHtml(exploitGraph);
      // Must not contain unescaped closing script tag followed by active script
      expect(html).not.toMatch(/<\/script>.*<script>alert\(/);
      // Must escape opening script tags and comments in embedded JSON
      expect(html).toContain('<\\/script');
      expect(html).toContain('<\\!--');
    });

    it('safely handles missing or short object/character position arrays in standalone HTML', () => {
      const shortPosGraph: any = {
        version: '1.0',
        world: {
          name: 'Short Pos World',
          description: 'World with truncated positions',
          biome: 'tundra',
          timeOfDay: 'afternoon',
          weather: 'snow',
          scale: 'small',
        },
        player: { spawn: [0, 1.7, 0], movementSpeed: 4.0, jumpHeight: 1.5 },
        zones: [],
        characters: [
          { id: 'npc_1', name: 'Guard', position: [1] }, // only 1 element
        ],
        objects: [
          { id: 'obj_1', name: 'Tower', type: 'structure', position: [] }, // empty position
        ],
        lights: [],
        events: [],
      };

      // Must generate HTML without throwing TypeError
      expect(() => generateStandaloneHtml(shortPosGraph)).not.toThrow();
      const html = generateStandaloneHtml(shortPosGraph);
      expect(html).toContain('Short Pos World');
    });
  });
});
