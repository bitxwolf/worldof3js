import type { RegionAttrs } from '../../shared/graph/graphTypes';
import type { RegionElevation } from '../../shared/agents/agentTypes';

// Simple seeded LCG RNG
function makeRng(seed: number) {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 0xffffffff; };
}

const COMPASS_OFFSETS: Record<string, [number, number]> = {
  center: [0, 0], N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0],
  NE: [0.7, -0.7], NW: [-0.7, -0.7], SE: [0.7, 0.7], SW: [-0.7, 0.7],
};

const SIZE_RADIUS: Record<string, number> = { small: 60, medium: 100, large: 160 };

export interface RegionLayout { id: string; centerX: number; centerZ: number; radius: number; }

export function layoutRegions(
  regions: Array<{ id: string; attrs: RegionAttrs }>,
  _worldSeed: number
): RegionLayout[] {
  const GRID_UNIT = 220;
  return regions.map((r) => {
    const offset = COMPASS_OFFSETS[r.attrs.compassCell] ?? [0, 0];
    return {
      id: r.id,
      centerX: offset[0] * GRID_UNIT,
      centerZ: offset[1] * GRID_UNIT,
      radius: SIZE_RADIUS[r.attrs.size] ?? 100,
    };
  });
}

export function scatterInRegion(
  regionLayout: RegionLayout,
  count: number,
  seed: number
): Array<{ x: number; z: number }> {
  const rng = makeRng(seed);
  return Array.from({ length: count }, () => {
    const angle = rng() * Math.PI * 2;
    const dist = rng() * regionLayout.radius * 0.85;
    return {
      x: regionLayout.centerX + Math.cos(angle) * dist,
      z: regionLayout.centerZ + Math.sin(angle) * dist,
    };
  });
}

export function buildRegionElevations(
  regions: Array<{ id: string; attrs: RegionAttrs }>,
  layouts: RegionLayout[]
): RegionElevation[] {
  const layoutMap = new Map(layouts.map((l) => [l.id, l]));
  return regions.map((r) => {
    const layout = layoutMap.get(r.id)!;
    return {
      regionId: r.id,
      centerX: layout.centerX,
      centerZ: layout.centerZ,
      radius: layout.radius,
      amplitude: r.attrs.elevationAmplitude,
    };
  });
}
