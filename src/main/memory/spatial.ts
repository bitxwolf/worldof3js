import type { GraphNodeRecord, GraphNodeType } from '../../shared/graph/graphTypes';

export interface SpatialNode {
  id: string;
  type: GraphNodeType;
  x: number;
  z: number;
  attrs: Record<string, unknown>;
}

/** Linear scan radius query — fast enough for <5000 nodes */
export function queryRadius(
  nodes: GraphNodeRecord[],
  cx: number,
  cz: number,
  radius: number,
  types?: GraphNodeType[]
): SpatialNode[] {
  const r2 = radius * radius;
  const typeSet = types ? new Set(types) : null;
  return nodes
    .filter((n) => {
      if (typeSet && !typeSet.has(n.type)) return false;
      const dx = n.x - cx, dz = n.z - cz;
      return dx * dx + dz * dz <= r2;
    })
    .map((n) => ({ id: n.id, type: n.type, x: n.x, z: n.z, attrs: n.attrs as unknown as Record<string, unknown> }));
}
