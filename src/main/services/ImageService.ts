// src/main/services/ImageService.ts
// Phase 3 placeholder — sharp + img2threejs pipeline
export class ImageService {
  async processImage(_base64: string): Promise<{ geometryData?: unknown; colors: string[] }> {
    return {
      colors: ['#228B22', '#8B4513'],
    };
  }
}
