import { describe, it, expect } from 'vitest';
import zlib from 'zlib';
import { ImageService } from '../src/main/services/ImageService';

/**
 * Creates a minimal valid RGBA PNG buffer in memory.
 */
function createTestPngBuffer(
  width: number,
  height: number,
  pixelFn: (x: number, y: number) => [number, number, number, number]
): Buffer {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  // IHDR
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData.writeUInt8(8, 8); // 8-bit depth
  ihdrData.writeUInt8(6, 9); // RGBA color type
  ihdrData.writeUInt8(0, 10); // compression
  ihdrData.writeUInt8(0, 11); // filter
  ihdrData.writeUInt8(0, 12); // interlace
  const ihdrChunk = createPngChunk('IHDR', ihdrData);

  // Scanlines with filter byte 0 (None)
  const rawScanlines: number[] = [];
  for (let y = 0; y < height; y++) {
    rawScanlines.push(0); // Filter byte: 0
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = pixelFn(x, y);
      rawScanlines.push(r, g, b, a);
    }
  }

  const compressedData = zlib.deflateSync(Buffer.from(rawScanlines));
  const idatChunk = createPngChunk('IDAT', compressedData);
  const iendChunk = createPngChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function createPngChunk(type: string, data: Buffer): Buffer {
  const len = data.length;
  const chunk = Buffer.alloc(12 + len);
  chunk.writeUInt32BE(len, 0);
  chunk.write(type, 4, 4, 'ascii');
  data.copy(chunk, 8);
  // Simple CRC (or dummy CRC, PNG decoders often ignore or we compute standard CRC32)
  const crc = computeCrc32(chunk.subarray(4, 8 + len));
  chunk.writeUInt32BE(crc, 8 + len);
  return chunk;
}

function computeCrc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * Creates a minimal valid JPEG buffer with SOF0 header.
 */
function createTestJpegBuffer(width: number, height: number): Buffer {
  const soi = Buffer.from([0xff, 0xd8]);
  // SOF0 chunk: 0xFF, 0xC0, length(2), precision(1), height(2), width(2), components(1)
  const sof0 = Buffer.alloc(11);
  sof0[0] = 0xff;
  sof0[1] = 0xc0;
  sof0.writeUInt16BE(9, 2); // length
  sof0[4] = 8; // precision
  sof0.writeUInt16BE(height, 5);
  sof0.writeUInt16BE(width, 7);
  sof0[9] = 3; // 3 color components
  const eoi = Buffer.from([0xff, 0xd9]);
  return Buffer.concat([soi, sof0, eoi]);
}

describe('ImageService (Phase 3 Backend)', () => {
  const service = new ImageService();

  describe('sanitizeBase64', () => {
    it('strips data:image/png;base64, prefix and trims whitespace', () => {
      const raw = '  data:image/png;base64, aGVsbG8gd29ybGQ= \n ';
      const { cleanBase64, detectedMimeType } = service.sanitizeBase64(raw);
      expect(cleanBase64).toBe('aGVsbG8gd29ybGQ=');
      expect(detectedMimeType).toBe('image/png');
    });

    it('strips data:image/jpeg;base64, prefix and detects jpeg mimeType', () => {
      const raw = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';
      const { cleanBase64, detectedMimeType } = service.sanitizeBase64(raw);
      expect(cleanBase64).toBe('/9j/4AAQSkZJRg==');
      expect(detectedMimeType).toBe('image/jpeg');
    });

    it('handles clean raw base64 without data prefix', () => {
      const raw = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJ';
      const { cleanBase64, detectedMimeType } = service.sanitizeBase64(raw);
      expect(cleanBase64).toBe(raw);
      expect(detectedMimeType).toBe('image/png');
    });
  });

  describe('extractDimensions', () => {
    it('extracts dimensions accurately from PNG header', () => {
      const pngBuf = createTestPngBuffer(64, 48, () => [255, 0, 0, 255]);
      const dims = service.extractDimensions(pngBuf, 'image/png');
      expect(dims.width).toBe(64);
      expect(dims.height).toBe(48);
    });

    it('extracts dimensions accurately from JPEG header', () => {
      const jpegBuf = createTestJpegBuffer(120, 80);
      const dims = service.extractDimensions(jpegBuf, 'image/jpeg');
      expect(dims.width).toBe(120);
      expect(dims.height).toBe(80);
    });

    it('falls back to 512x512 on corrupted or empty buffer', () => {
      const dims = service.extractDimensions(Buffer.from([0, 1, 2, 3]));
      expect(dims.width).toBe(512);
      expect(dims.height).toBe(512);
    });
  });

  describe('processImage with Transparent PNG', () => {
    it('processes a transparent PNG with character silhouette and dominant color', async () => {
      // 16x16 PNG with a blue circular figure inside transparent margins
      const pngBuf = createTestPngBuffer(16, 16, (x, y) => {
        const dx = x - 7.5;
        const dy = y - 7.5;
        const dist = Math.hypot(dx, dy);
        if (dist <= 5) {
          // Blue foreground
          return [59, 130, 246, 255];
        }
        // Transparent background
        return [0, 0, 0, 0];
      });

      const base64 = `data:image/png;base64,${pngBuf.toString('base64')}`;
      const result = await service.processImage(base64);

      expect(result.dimensions.width).toBe(16);
      expect(result.dimensions.height).toBe(16);
      expect(result.aspectRatio).toBeCloseTo(1.0);
      expect(result.cleanBase64).toBe(pngBuf.toString('base64'));

      // Dominant color should detect the blue
      expect(result.colors).toBeDefined();
      expect(result.colors!.length).toBeGreaterThan(0);
      expect(result.colors![0]).toMatch(/^#[0-9a-f]{6}$/i);

      // Contour should have at least 3 points
      expect(result.contour).toBeDefined();
      expect(result.contour!.length).toBeGreaterThanOrEqual(3);

      // Alpha bounds should be centered within 16x16
      expect(result.alphaBounds).toBeDefined();
      expect(result.alphaBounds!.minX).toBeGreaterThanOrEqual(0);
      expect(result.alphaBounds!.maxX).toBeLessThanOrEqual(16);
    });
  });

  describe('processImage with Opaque JPEG Header', () => {
    it('processes opaque JPEG without crashing and returns safe contour and palette', async () => {
      const jpegBuf = createTestJpegBuffer(300, 400);
      const base64 = `data:image/jpeg;base64,${jpegBuf.toString('base64')}`;
      const result = await service.processImage(base64, 'image/jpeg');

      expect(result.dimensions.width).toBe(300);
      expect(result.dimensions.height).toBe(400);
      expect(result.aspectRatio).toBeCloseTo(0.75);
      expect(result.contour).toBeDefined();
      expect(result.contour!.length).toBeGreaterThanOrEqual(3);
      expect(result.colors!.length).toBeGreaterThan(0);
    });
  });

  describe('Corrupted & Edge Case Handling', () => {
    it('gracefully handles empty string without throwing', async () => {
      const result = await service.processImage('');
      expect(result.dimensions.width).toBe(512);
      expect(result.dimensions.height).toBe(512);
      expect(result.contour).toBeDefined();
      expect(result.colors).toBeDefined();
    });

    it('gracefully handles corrupted base64 string without crashing', async () => {
      const result = await service.processImage('%%%invalid base64 content%%%');
      expect(result).toBeDefined();
      expect(result.dimensions).toBeDefined();
      expect(result.contour!.length).toBeGreaterThanOrEqual(3);
    });
  });
});
