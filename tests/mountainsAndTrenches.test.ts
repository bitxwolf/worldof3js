import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import * as fs from 'fs';
import * as path from 'path';
import { SavedWorldSchema, SceneGraphSchema } from '../src/shared/schema/sceneGraph.schema';
import { ProceduralAssetLibrary } from '../src/renderer/engine/assets/ProceduralAssetLibrary';

describe('Mountains and Trenches World JSON', () => {
  const filePath = path.resolve(__dirname, '../samples/mountains_and_trenches.json');

  it('file exists in samples directory', () => {
    expect(fs.existsSync(filePath)).toBe(true);
  });

  it('validates strictly against SavedWorldSchema and SceneGraphSchema', () => {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw);

    const savedWorldResult = SavedWorldSchema.safeParse(parsed);
    if (!savedWorldResult.success) {
      console.error(JSON.stringify(savedWorldResult.error.issues, null, 2));
    }
    expect(savedWorldResult.success).toBe(true);

    const sceneGraphResult = SceneGraphSchema.safeParse(parsed.sceneGraph);
    expect(sceneGraphResult.success).toBe(true);
  });

  it('contains expected mountain and trench entities', () => {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw);

    const objects = parsed.sceneGraph.objects;
    const ids = objects.map((o: any) => o.id);

    expect(ids).toContain('mountain_peak_north');
    expect(ids).toContain('trench_suspension_bridge');
    expect(ids).toContain('trench_south_cliff');
    expect(ids).toContain('trench_north_cliff');
    expect(ids).toContain('luminous_chasm_crystal');

    const zones = parsed.sceneGraph.zones.map((z: any) => z.id);
    expect(zones).toContain('abyssal_trench');
    expect(zones).toContain('northern_peaks');
  });

  it('executes generatedCode into a Three.js scene without errors', () => {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw);

    expect(parsed.generatedCode).toBeDefined();
    expect(typeof parsed.generatedCode).toBe('string');

    const scene = new THREE.Scene();
    const group = new THREE.Group();
    scene.add(group);

    const helpers = new ProceduralAssetLibrary(scene, 12345);
    const assets = { helpers, textures: new Map() };

    const buildFn = new Function('scene', 'THREE', 'assets', `"use strict";\n${parsed.generatedCode}`);
    expect(() => buildFn(group, THREE, assets)).not.toThrow();

    expect(group.children.length).toBeGreaterThan(5);
  });
});
