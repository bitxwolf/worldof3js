import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  parseEditPlanResponse,
  validateGeneratedCode,
  stripCodeFences,
  applyEditPlan,
  captureViewport,
  type EditPlan,
} from '../src/renderer/engine/SmartEditService';

describe('SmartEditService', () => {
  describe('stripCodeFences and parseEditPlanResponse', () => {
    it('strips code fences correctly', () => {
      const fenced = '```typescript\nconst a = 1;\n```';
      expect(stripCodeFences(fenced)).toBe('const a = 1;');
    });

    it('parses valid JSON edit plan wrapped in markdown fences', () => {
      const raw = `\`\`\`json
{
  "description": "Make sky darker and fog denser",
  "confidence": 0.95,
  "regenerateRequired": false,
  "operations": [
    {
      "type": "sky",
      "description": "Darken sky",
      "color": 131586
    },
    {
      "type": "fog",
      "description": "Increase fog density",
      "density": 0.04
    }
  ]
}
\`\`\``;
      const parsed = parseEditPlanResponse(raw);
      expect(parsed).not.toBeNull();
      expect(parsed?.confidence).toBe(0.95);
      expect(parsed?.operations.length).toBe(2);
      expect(parsed?.operations[0].type).toBe('sky');
    });

    it('returns null on invalid edit plan JSON', () => {
      expect(parseEditPlanResponse('not valid json')).toBeNull();
      expect(parseEditPlanResponse('{"description": "missing ops"}')).toBeNull();
    });
  });

  describe('validateGeneratedCode', () => {
    it('validates proper code with scene.add', () => {
      const code = 'const mesh = new THREE.Mesh(); scene.add(mesh); // Long comment here to exceed minimum character length requirement';
      const result = validateGeneratedCode(code);
      expect(result.valid).toBe(true);
      expect(result.warnings.length).toBe(0);
    });

    it('flags code with import or markdown backticks', () => {
      const code = 'import * as THREE from "three"; scene.add(new THREE.Mesh()); // long enough string here';
      const result = validateGeneratedCode(code);
      expect(result.valid).toBe(false);
      expect(result.warnings.some((w) => w.includes('import'))).toBe(true);
    });
  });

  describe('applyEditPlan', () => {
    it('applies sky, fog, material_sweep, object_scale, and object_remove operations', () => {
      const scene = new THREE.Scene();
      scene.fog = new THREE.FogExp2(0x000000, 0.01);

      const boxGeo = new THREE.BoxGeometry(1, 1, 1);
      const boxMat = new THREE.MeshStandardMaterial({ roughness: 0.5, metalness: 0.5, color: 0xffffff });
      const mesh = new THREE.Mesh(boxGeo, boxMat);
      mesh.userData = { id: 'test_box', type: 'Flora' };
      scene.add(mesh);

      const plan: EditPlan = {
        description: 'Test edits',
        confidence: 1.0,
        regenerateRequired: false,
        operations: [
          { type: 'sky', description: 'Darken sky', color: 0x112233 },
          { type: 'fog', description: 'Adjust fog', density: 0.05, color: 0x112233 },
          {
            type: 'material_sweep',
            description: 'Sweep roughness',
            selector: 'userData.type === "Flora"',
            materialChanges: { roughness: 0.9, metalness: 0.2 },
          },
          {
            type: 'object_scale',
            description: 'Scale box',
            objectId: 'test_box',
            scale: [2, 2, 2],
          },
        ],
      };

      const result = applyEditPlan(plan, scene, { textures: {}, helpers: {} } as any);
      expect(result.applied).toBe(4);
      expect(result.failed).toBe(0);

      expect((scene.background as THREE.Color).getHex()).toBe(0x112233);
      expect((scene.fog as THREE.FogExp2).density).toBe(0.05);
      expect(boxMat.roughness).toBe(0.9);
      expect(mesh.scale.x).toBe(2);

      // Now test object_remove
      const removePlan: EditPlan = {
        description: 'Remove box',
        confidence: 1.0,
        regenerateRequired: false,
        operations: [{ type: 'object_remove', description: 'Remove test box', objectId: 'test_box' }],
      };
      const removeResult = applyEditPlan(removePlan, scene, { textures: {}, helpers: {} } as any);
      expect(removeResult.applied).toBe(1);
      expect(scene.children.includes(mesh)).toBe(false);
    });
  });

  describe('captureViewport', () => {
    it('returns data URL string from canvas', () => {
      const mockCanvas = {
        toDataURL: (type: string, quality: number) => `data:${type};quality=${quality}`,
      } as unknown as HTMLCanvasElement;

      const url = captureViewport(mockCanvas, 0.75);
      expect(url).toBe('data:image/jpeg;quality=0.75');
    });
  });
});
