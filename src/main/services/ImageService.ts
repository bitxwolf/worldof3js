// src/main/services/ImageService.ts
import zlib from 'zlib';
import type { ProcessedImage } from '../../shared/ipc.types';

export interface ProcessImageOptions {
  mimeType?: string;
  maxContourPoints?: number;
  alphaThreshold?: number;
}

export class ImageService {
  /**
   * Sanitizes base64, extracts image metadata, computes alpha boundary contour,
   * and extracts a dominant color palette.
   */
  async processImage(
    rawBase64: string,
    mimeTypeHint?: string,
    _options?: ProcessImageOptions
  ): Promise<ProcessedImage> {
    try {
      if (!rawBase64 || typeof rawBase64 !== 'string') {
        return this.getFallbackResult('Empty or non-string base64 image data');
      }

      // 1. Sanitize base64 and extract mimeType
      const { cleanBase64, detectedMimeType } = this.sanitizeBase64(rawBase64, mimeTypeHint);
      if (!cleanBase64) {
        return this.getFallbackResult('Failed to sanitize base64 image data');
      }

      const buffer = Buffer.from(cleanBase64, 'base64');
      if (buffer.length < 8) {
        return this.getFallbackResult('Buffer too short for valid image');
      }

      // 2. Extract dimensions
      const dimensions = this.extractDimensions(buffer, detectedMimeType);
      const aspectRatio = dimensions.width > 0 && dimensions.height > 0
        ? dimensions.width / dimensions.height
        : 1.0;

      // 3. Extract pixels (PNG via pure zlib, or Electron nativeImage fallback)
      const pixelData = await this.extractPixels(buffer, detectedMimeType, dimensions);

      let colors: string[] = ['#3b82f6', '#1e293b'];
      let contour: Array<[number, number]> = [];
      let alphaBounds = { minX: 0, maxX: dimensions.width, minY: 0, maxY: dimensions.height };

      if (pixelData) {
        // Extract dominant colors
        colors = this.extractDominantColors(pixelData.rgba, pixelData.width, pixelData.height);

        // Extract alpha boundaries and contour
        const contourResult = this.extractSilhouetteContour(
          pixelData.rgba,
          pixelData.width,
          pixelData.height,
          pixelData.hasAlpha
        );
        contour = contourResult.contour;
        alphaBounds = contourResult.bounds;
      } else {
        // Fallback humanoid contour if pixel decoding wasn't possible
        contour = this.getDefaultHumanoidContour();
      }

      return {
        dimensions,
        colors: colors.length > 0 ? colors : ['#3b82f6', '#1e293b'],
        contour: contour.length >= 3 ? contour : this.getDefaultHumanoidContour(),
        alphaBounds,
        cleanBase64,
        aspectRatio,
      };
    } catch (err) {
      console.warn('[ImageService] Error processing image, using safe fallback:', err);
      return this.getFallbackResult(String(err));
    }
  }

  /**
   * Sanitizes base64 string, strips data URL prefix, removes whitespace, and validates.
   */
  sanitizeBase64(raw: string, mimeHint?: string): { cleanBase64: string; detectedMimeType: string } {
    let mime = mimeHint || 'image/png';
    let base64 = raw.trim();

    // Check for data: URI prefix
    const dataUrlMatch = base64.match(/^data:([^;]+);base64,(.+)$/s);
    if (dataUrlMatch) {
      mime = dataUrlMatch[1].trim();
      base64 = dataUrlMatch[2].trim();
    }

    // Strip internal whitespace and linebreaks
    base64 = base64.replace(/\s+/g, '');

    // Check if it's base64-encoded
    const isValidBase64 = /^[A-Za-z0-9+/=]+$/.test(base64);
    if (!isValidBase64) {
      console.warn('[ImageService] Invalid base64 characters detected, attempting cleanup');
      base64 = base64.replace(/[^A-Za-z0-9+/=]/g, '');
    }

    return { cleanBase64: base64, detectedMimeType: mime };
  }

  /**
   * Parses binary headers to find width and height without external dependencies.
   */
  extractDimensions(buffer: Buffer, _mimeType?: string): { width: number; height: number } {
    try {
      // PNG check
      if (
        buffer.length >= 24 &&
        buffer[0] === 0x89 &&
        buffer[1] === 0x50 &&
        buffer[2] === 0x4e &&
        buffer[3] === 0x47
      ) {
        const width = buffer.readUInt32BE(16);
        const height = buffer.readUInt32BE(20);
        if (width > 0 && height > 0) return { width, height };
      }

      // JPEG check (SOI marker 0xFF 0xD8)
      if (buffer.length >= 4 && buffer[0] === 0xff && buffer[1] === 0xd8) {
        let offset = 2;
        while (offset < buffer.length - 8) {
          if (buffer[offset] !== 0xff) {
            offset++;
            continue;
          }
          const marker = buffer[offset + 1];
          // SOF0 (0xC0), SOF1 (0xC1), SOF2 (0xC2) contain image dimensions
          if ((marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc9 && marker <= 0xcb)) {
            const height = buffer.readUInt16BE(offset + 5);
            const width = buffer.readUInt16BE(offset + 7);
            if (width > 0 && height > 0) return { width, height };
          }
          // Move past marker length
          const len = buffer.readUInt16BE(offset + 2);
          offset += 2 + len;
        }
      }

      // GIF check
      if (
        buffer.length >= 10 &&
        buffer.toString('ascii', 0, 3) === 'GIF'
      ) {
        const width = buffer.readUInt16LE(6);
        const height = buffer.readUInt16LE(8);
        if (width > 0 && height > 0) return { width, height };
      }

      // WebP check
      if (
        buffer.length >= 30 &&
        buffer.toString('ascii', 0, 4) === 'RIFF' &&
        buffer.toString('ascii', 8, 12) === 'WEBP'
      ) {
        const type = buffer.toString('ascii', 12, 16);
        if (type === 'VP8 ') {
          const width = buffer.readUInt16LE(26) & 0x3fff;
          const height = buffer.readUInt16LE(28) & 0x3fff;
          if (width > 0 && height > 0) return { width, height };
        } else if (type === 'VP8L') {
          const b0 = buffer[21];
          const b1 = buffer[22];
          const b2 = buffer[23];
          const b3 = buffer[24];
          const width = 1 + (((b1 & 0x3f) << 8) | b0);
          const height = 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6));
          if (width > 0 && height > 0) return { width, height };
        }
      }
    } catch (err) {
      console.warn('[ImageService] Error parsing image dimensions from header:', err);
    }

    return { width: 512, height: 512 };
  }

  /**
   * Decodes pixels to raw RGBA. Uses pure Node.js zlib for PNG,
   * or Electron nativeImage when running in Electron.
   */
  private async extractPixels(
    buffer: Buffer,
    mime: string,
    _dimensions?: { width: number; height: number }
  ): Promise<{ rgba: Uint8Array; width: number; height: number; hasAlpha: boolean } | null> {
    // 1. Check if it's a PNG
    if (
      buffer.length >= 24 &&
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47
    ) {
      try {
        const pngResult = this.decodePng(buffer);
        if (pngResult) return pngResult;
      } catch (err) {
        console.warn('[ImageService] Pure PNG decode failed:', err);
      }
    }

    // 2. Fallback to Electron nativeImage if available in current process
    try {
      // Dynamic import to avoid breaking non-Electron environments
      const electron = await import('electron');
      if (electron?.nativeImage) {
        const nImg = electron.nativeImage.createFromBuffer(buffer);
        if (!nImg.isEmpty()) {
          const size = nImg.getSize();
          const bitmap = nImg.toBitmap(); // 32-bit BGRA buffer
          const rgba = new Uint8Array(size.width * size.height * 4);
          for (let i = 0; i < bitmap.length; i += 4) {
            rgba[i] = bitmap[i + 2];     // R
            rgba[i + 1] = bitmap[i + 1]; // G
            rgba[i + 2] = bitmap[i];     // B
            rgba[i + 3] = bitmap[i + 3]; // A
          }
          const isJpeg = mime.toLowerCase().includes('jpeg') || mime.toLowerCase().includes('jpg');
          let hasAlpha = !isJpeg;
          if (hasAlpha) {
            let hasTrans = false;
            for (let i = 3; i < bitmap.length; i += 4) {
              if (bitmap[i] < 240) {
                hasTrans = true;
                break;
              }
            }
            hasAlpha = hasTrans;
          }

          return {
            rgba,
            width: size.width,
            height: size.height,
            hasAlpha,
          };
        }
      }
    } catch {
      // Electron not available or running in pure Node/test
    }

    return null;
  }

  /**
   * Pure TypeScript PNG decoder for 8-bit RGBA and RGB PNGs using standard Node zlib.
   */
  private decodePng(
    buffer: Buffer
  ): { rgba: Uint8Array; width: number; height: number; hasAlpha: boolean } | null {
    let pos = 8;
    const idatBuffers: Buffer[] = [];
    let width = 0;
    let height = 0;
    let bitDepth = 8;
    let colorType = 6; // 6 = RGBA, 2 = RGB

    while (pos < buffer.length - 8) {
      const len = buffer.readUInt32BE(pos);
      const type = buffer.toString('ascii', pos + 4, pos + 8);
      if (type === 'IHDR') {
        width = buffer.readUInt32BE(pos + 8);
        height = buffer.readUInt32BE(pos + 12);
        bitDepth = buffer.readUInt8(pos + 16);
        colorType = buffer.readUInt8(pos + 17);
      } else if (type === 'IDAT') {
        idatBuffers.push(buffer.subarray(pos + 8, pos + 8 + len));
      } else if (type === 'IEND') {
        break;
      }
      pos += 12 + len;
    }

    if (idatBuffers.length === 0 || width === 0 || height === 0) return null;
    if (bitDepth !== 8) return null; // Support 8-bit channels

    const bytesPerPixel = colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 0 ? 1 : 4;
    const decompressed = zlib.inflateSync(Buffer.concat(idatBuffers));

    const scanlineWidth = width * bytesPerPixel;
    const rawRgba = new Uint8Array(width * height * 4);

    let offset = 0;
    const prevRow = new Uint8Array(scanlineWidth);
    const currRow = new Uint8Array(scanlineWidth);

    for (let y = 0; y < height; y++) {
      const filterType = decompressed[offset++];
      for (let i = 0; i < scanlineWidth; i++) {
        const x = decompressed[offset++];
        const a = i >= bytesPerPixel ? currRow[i - bytesPerPixel] : 0;
        const b = prevRow[i];
        const c = i >= bytesPerPixel ? prevRow[i - bytesPerPixel] : 0;

        let val = x;
        if (filterType === 1) {
          val = (x + a) & 0xff;
        } else if (filterType === 2) {
          val = (x + b) & 0xff;
        } else if (filterType === 3) {
          val = (x + Math.floor((a + b) / 2)) & 0xff;
        } else if (filterType === 4) {
          const p = a + b - c;
          const pa = Math.abs(p - a);
          const pb = Math.abs(p - b);
          const pc = Math.abs(p - c);
          const pr = (pa <= pb && pa <= pc) ? a : (pb <= pc) ? b : c;
          val = (x + pr) & 0xff;
        }
        currRow[i] = val;
      }

      // Transfer decoded scanline into standard RGBA output
      const rowOut = y * width * 4;
      if (bytesPerPixel === 4) {
        rawRgba.set(currRow, rowOut);
      } else if (bytesPerPixel === 3) {
        for (let x = 0; x < width; x++) {
          const outIdx = rowOut + x * 4;
          const inIdx = x * 3;
          rawRgba[outIdx] = currRow[inIdx];
          rawRgba[outIdx + 1] = currRow[inIdx + 1];
          rawRgba[outIdx + 2] = currRow[inIdx + 2];
          rawRgba[outIdx + 3] = 255;
        }
      } else {
        for (let x = 0; x < width; x++) {
          const outIdx = rowOut + x * 4;
          const val = currRow[x];
          rawRgba[outIdx] = val;
          rawRgba[outIdx + 1] = val;
          rawRgba[outIdx + 2] = val;
          rawRgba[outIdx + 3] = 255;
        }
      }

      prevRow.set(currRow);
    }

    return {
      rgba: rawRgba,
      width,
      height,
      hasAlpha: colorType === 6,
    };
  }

  /**
   * Extracts dominant color palette by 4-bit channel quantization.
   */
  private extractDominantColors(rgba: Uint8Array, width: number, height: number): string[] {
    const buckets = new Map<string, { count: number; r: number; g: number; b: number }>();
    const totalPixels = width * height;
    const step = Math.max(1, Math.floor(totalPixels / 10000)); // Sample ~10,000 pixels

    for (let i = 0; i < totalPixels * 4; i += step * 4) {
      const a = rgba[i + 3];
      if (a < 30) continue; // Skip transparent background

      const r = rgba[i];
      const g = rgba[i + 1];
      const b = rgba[i + 2];

      // Quantize to 16 buckets per channel (4 bits)
      const qr = Math.floor(r / 16) * 16;
      const qg = Math.floor(g / 16) * 16;
      const qb = Math.floor(b / 16) * 16;
      const key = `${qr},${qg},${qb}`;

      const existing = buckets.get(key);
      if (existing) {
        existing.count++;
      } else {
        buckets.set(key, { count: 1, r: qr, g: qg, b: qb });
      }
    }

    if (buckets.size === 0) {
      return ['#3b82f6', '#1e293b'];
    }

    // Sort by frequency
    const sorted = Array.from(buckets.values()).sort((a, b) => b.count - a.count);

    const palette: string[] = [];
    for (const item of sorted) {
      const hex = `#${item.r.toString(16).padStart(2, '0')}${item.g.toString(16).padStart(2, '0')}${item.b.toString(16).padStart(2, '0')}`;
      // Ensure color diversity
      const isTooSimilar = palette.some((existing) => {
        const er = parseInt(existing.slice(1, 3), 16);
        const eg = parseInt(existing.slice(3, 5), 16);
        const eb = parseInt(existing.slice(5, 7), 16);
        const dist = Math.sqrt((item.r - er) ** 2 + (item.g - eg) ** 2 + (item.b - eb) ** 2);
        return dist < 45;
      });
      if (!isTooSimilar) {
        palette.push(hex);
        if (palette.length >= 5) break;
      }
    }

    return palette.length > 0 ? palette : ['#3b82f6', '#1e293b'];
  }

  /**
   * Computes silhouette contour coordinates and alpha bounds from pixel data.
   */
  private extractSilhouetteContour(
    rgba: Uint8Array,
    width: number,
    height: number,
    hasAlpha: boolean
  ): { contour: Array<[number, number]>; bounds: { minX: number; maxX: number; minY: number; maxY: number } } {
    // Detect corner background color for opaque portraits
    let bgR = 255, bgG = 255, bgB = 255;
    if (!hasAlpha) {
      // Average 4 corners
      const corners = [0, (width - 1) * 4, (height - 1) * width * 4, (height * width - 1) * 4];
      let cr = 0, cg = 0, cb = 0;
      for (const c of corners) {
        cr += rgba[c];
        cg += rgba[c + 1];
        cb += rgba[c + 2];
      }
      bgR = cr / 4;
      bgG = cg / 4;
      bgB = cb / 4;
    }

    // Downsample to grid of size max 128x128 for efficient and robust contouring
    const gridW = Math.min(width, 128);
    const gridH = Math.min(height, 128);
    const scaleX = width / gridW;
    const scaleY = height / gridH;

    const mask = new Uint8Array(gridW * gridH);
    let minX = gridW, maxX = 0, minY = gridH, maxY = 0;
    let foregroundCount = 0;

    for (let gy = 0; gy < gridH; gy++) {
      const srcY = Math.min(height - 1, Math.floor((gy + 0.5) * scaleY));
      for (let gx = 0; gx < gridW; gx++) {
        const srcX = Math.min(width - 1, Math.floor((gx + 0.5) * scaleX));
        const idx = (srcY * width + srcX) * 4;
        const a = rgba[idx + 3];
        let isForeground = false;

        if (hasAlpha) {
          isForeground = a > 25;
        } else {
          // Color distance from background
          const r = rgba[idx];
          const g = rgba[idx + 1];
          const b = rgba[idx + 2];
          const dist = Math.sqrt((r - bgR) ** 2 + (g - bgG) ** 2 + (b - bgB) ** 2);
          isForeground = dist > 35;
        }

        if (isForeground) {
          mask[gy * gridW + gx] = 1;
          foregroundCount++;
          if (gx < minX) minX = gx;
          if (gx > maxX) maxX = gx;
          if (gy < minY) minY = gy;
          if (gy > maxY) maxY = gy;
        }
      }
    }

    if (foregroundCount < 10) {
      return {
        contour: this.getDefaultHumanoidContour(),
        bounds: { minX: 0, maxX: width, minY: 0, maxY: height },
      };
    }

    // Scan per-row min/max boundary to build a clean closed silhouette polygon
    const leftSide: Array<[number, number]> = [];
    const rightSide: Array<[number, number]> = [];

    for (let gy = minY; gy <= maxY; gy++) {
      let firstX = -1;
      let lastX = -1;
      for (let gx = 0; gx < gridW; gx++) {
        if (mask[gy * gridW + gx] === 1) {
          if (firstX === -1) firstX = gx;
          lastX = gx;
        }
      }
      if (firstX !== -1 && lastX !== -1) {
        // Normalize coordinates to [0, 1] range:
        // x in [0, 1] and y in [0, 1] (y = 0 at top, 1 at bottom)
        leftSide.push([firstX / gridW, gy / gridH]);
        rightSide.push([lastX / gridW, gy / gridH]);
      }
    }

    // Clockwise loop: left side from top to bottom, right side from bottom to top
    const rawContour: Array<[number, number]> = [];
    for (let i = 0; i < leftSide.length; i++) {
      const pt = leftSide[i];
      const prev = rawContour[rawContour.length - 1];
      if (!prev || Math.hypot(pt[0] - prev[0], pt[1] - prev[1]) > 0.001) {
        rawContour.push(pt);
      }
    }
    for (let i = rightSide.length - 1; i >= 0; i--) {
      const pt = rightSide[i];
      const prev = rawContour[rawContour.length - 1];
      if (!prev || Math.hypot(pt[0] - prev[0], pt[1] - prev[1]) > 0.001) {
        rawContour.push(pt);
      }
    }

    // Simplify contour using Ramer-Douglas-Peucker
    const simplified = this.simplifyPolygon(rawContour, 0.015);

    return {
      contour: simplified.length >= 3 ? simplified : this.getDefaultHumanoidContour(),
      bounds: {
        minX: Math.floor(minX * scaleX),
        maxX: Math.ceil(maxX * scaleX),
        minY: Math.floor(minY * scaleY),
        maxY: Math.ceil(maxY * scaleY),
      },
    };
  }

  /**
   * Ramer-Douglas-Peucker polygon simplification for normalized [x, y] points.
   */
  private simplifyPolygon(points: Array<[number, number]>, epsilon: number): Array<[number, number]> {
    if (points.length <= 4) return points;

    let maxDist = 0;
    let maxIdx = 0;
    const start = points[0];
    const end = points[points.length - 1];

    for (let i = 1; i < points.length - 1; i++) {
      const p = points[i];
      const dist = this.perpendicularDistance(p, start, end);
      if (dist > maxDist) {
        maxDist = dist;
        maxIdx = i;
      }
    }

    if (maxDist > epsilon) {
      const left = this.simplifyPolygon(points.slice(0, maxIdx + 1), epsilon);
      const right = this.simplifyPolygon(points.slice(maxIdx), epsilon);
      return [...left.slice(0, -1), ...right];
    } else {
      return [start, end];
    }
  }

  private perpendicularDistance(
    p: [number, number],
    lineA: [number, number],
    lineB: [number, number]
  ): number {
    const dx = lineB[0] - lineA[0];
    const dy = lineB[1] - lineA[1];
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return Math.hypot(p[0] - lineA[0], p[1] - lineA[1]);

    const t = Math.max(0, Math.min(1, ((p[0] - lineA[0]) * dx + (p[1] - lineA[1]) * dy) / lenSq));
    const projX = lineA[0] + t * dx;
    const projY = lineA[1] + t * dy;
    return Math.hypot(p[0] - projX, p[1] - projY);
  }

  /**
   * Stylized normalized humanoid silhouette contour: [x, y] in [0, 1].
   * Y=0 is head top, Y=1 is feet bottom.
   */
  getDefaultHumanoidContour(): Array<[number, number]> {
    return [
      [0.50, 0.00], // Head top
      [0.60, 0.04], // Head right
      [0.62, 0.14], // Jaw right
      [0.58, 0.18], // Neck right
      [0.72, 0.24], // Shoulder right
      [0.78, 0.40], // Arm right
      [0.70, 0.52], // Waist right
      [0.64, 0.65], // Hip right
      [0.62, 0.98], // Foot right
      [0.54, 0.98], // Inner foot right
      [0.52, 0.62], // Crotch
      [0.46, 0.98], // Inner foot left
      [0.38, 0.98], // Foot left
      [0.36, 0.65], // Hip left
      [0.30, 0.52], // Waist left
      [0.22, 0.40], // Arm left
      [0.28, 0.24], // Shoulder left
      [0.42, 0.18], // Neck left
      [0.38, 0.14], // Jaw left
      [0.40, 0.04], // Head left
    ];
  }

  private getFallbackResult(reason: string): ProcessedImage {
    console.warn(`[ImageService] Using fallback result: ${reason}`);
    return {
      dimensions: { width: 512, height: 512 },
      colors: ['#3b82f6', '#1e293b'],
      contour: this.getDefaultHumanoidContour(),
      cleanBase64: '',
      alphaBounds: { minX: 0, maxX: 512, minY: 0, maxY: 512 },
      aspectRatio: 1.0,
    };
  }
}
