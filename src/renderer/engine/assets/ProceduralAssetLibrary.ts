// src/renderer/engine/assets/ProceduralAssetLibrary.ts
//
// Injected into the code-generation context as `assets.helpers`.
// Claude calls these instead of writing raw Three.js geometry.
// Every method produces shadow-casting, randomly-varied, visually rich objects.
// Seeded random is used so worlds re-generate consistently for the same prompt.

import * as THREE from 'three';

// ── Tiny seeded PRNG (mulberry32) ─────────────────────────────────────────────
// Lets us get the same "random" variation for the same world seed,
// so re-generating the same prompt gives the same tree layout.
function makePRNG(seed: number): () => number {
  let s = seed;
  return () => {
    s += 0x6d2b79f5;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

// ── Types ─────────────────────────────────────────────────────────────────────
export interface TreeOptions {
  type?:        'deciduous' | 'pine' | 'dead' | 'palm' | 'willow';
  scale?:       number;
  colorShift?:  number; // 0..1, shifts green toward yellow/red (autumn)
}

export interface RockOptions {
  scale?:  number;
  color?:  number; // hex
}

export interface BuildingOptions {
  width?:  number;
  height?: number;
  depth?:  number;
  style?:  'medieval' | 'ruin' | 'modern' | 'cabin' | 'tower';
  color?:  number;
}

export interface GroundOptions {
  size?:       number; // diameter in units
  cover?:      'grass' | 'dirt' | 'stone' | 'sand' | 'snow' | 'mud';
  color?:      number;
  receiveShadow?: boolean;
}

export interface LightingOptions {
  timeOfDay?: 'dawn' | 'morning' | 'afternoon' | 'dusk' | 'night';
  weather?:   'clear' | 'fog' | 'rain' | 'snow' | 'storm';
  fogDensity?: number;
}

// ── Color palettes per ground cover ──────────────────────────────────────────
const GROUND_COLORS: Record<NonNullable<GroundOptions['cover']>, number[]> = {
  grass:  [0x3a5a2a, 0x4a7a35, 0x2d4e20, 0x5a8040],
  dirt:   [0x6b4c35, 0x7a5a40, 0x5a3e28, 0x8a6a50],
  stone:  [0x6b7280, 0x5a6470, 0x7a8090, 0x8a9098],
  sand:   [0xc4a55a, 0xd4b46a, 0xb49448, 0xc8aa60],
  snow:   [0xe8eef4, 0xd8e4ee, 0xf0f4f8, 0xdce8f2],
  mud:    [0x4a3828, 0x3a2818, 0x5a4838, 0x604030],
};

const SKY_COLORS: Record<NonNullable<LightingOptions['timeOfDay']>, { sky: number; ground: number; sun: number; sunIntensity: number; sunAngle: number }> = {
  dawn:      { sky: 0xff9060, ground: 0x2d3a1a, sun: 0xff7040, sunIntensity: 0.8,  sunAngle: 0.05 },
  morning:   { sky: 0x87ceeb, ground: 0x2d5a1b, sun: 0xfff4d0, sunIntensity: 1.1,  sunAngle: 0.35 },
  afternoon: { sky: 0x6ab4e8, ground: 0x2d5a1b, sun: 0xfff8e8, sunIntensity: 1.3,  sunAngle: 0.70 },
  dusk:      { sky: 0xff6030, ground: 0x1a2410, sun: 0xff8040, sunIntensity: 0.7,  sunAngle: -0.05 },
  night:     { sky: 0x0a0e1a, ground: 0x080c12, sun: 0x8090c0, sunIntensity: 0.15, sunAngle: -0.5  },
};

// ── Main Library Class ────────────────────────────────────────────────────────
export class ProceduralAssetLibrary {
  private rng: () => number;

  constructor(
    private readonly scene: THREE.Scene,
    seed: number = 42,
  ) {
    this.rng = makePRNG(seed);
  }

  // ── Ground ─────────────────────────────────────────────────────────────────
  createGround(options: GroundOptions = {}): THREE.Mesh {
    const {
      size          = 300,
      cover         = 'grass',
      receiveShadow = true,
    } = options;

    const palette = GROUND_COLORS[cover];
    const baseColor = palette[0];

    // Use vertex colors for natural variation across the terrain
    const geo      = new THREE.PlaneGeometry(size, size, 40, 40);
    const colors   = new Float32Array(geo.attributes.position.count * 3);
    const baseC    = new THREE.Color(baseColor);
    const altC     = new THREE.Color(palette[1]);

    for (let i = 0; i < geo.attributes.position.count; i++) {
      const t   = this.rng();
      const mix = new THREE.Color().lerpColors(baseC, altC, t * 0.4);
      colors[i * 3]     = mix.r;
      colors[i * 3 + 1] = mix.g;
      colors[i * 3 + 2] = mix.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness:    0.95,
      metalness:    0.0,
    });

    const ground       = new THREE.Mesh(geo, mat);
    ground.rotation.x  = -Math.PI / 2;
    ground.receiveShadow = receiveShadow;
    ground.userData    = { id: '_ground', type: 'terrain', collidable: true };
    this.scene.add(ground);
    return ground;
  }

  // ── Lighting ───────────────────────────────────────────────────────────────
  setupLighting(options: LightingOptions = {}): void {
    const {
      timeOfDay  = 'afternoon',
      weather    = 'clear',
      fogDensity,
    } = options;

    const cfg = SKY_COLORS[timeOfDay];

    // Hemisphere light: sky colour above, ground bounce below
    const hemi = new THREE.HemisphereLight(cfg.sky, cfg.ground, 0.5);
    this.scene.add(hemi);

    // Directional sun/moon
    const sun = new THREE.DirectionalLight(cfg.sun, cfg.sunIntensity);
    const elevation = cfg.sunAngle;
    sun.position.set(
      Math.cos(elevation) * 80,
      Math.abs(Math.sin(elevation)) * 80 + 5,
      Math.sin(elevation) * 50
    );
    sun.castShadow                = true;
    sun.shadow.mapSize.width      = 2048;
    sun.shadow.mapSize.height     = 2048;
    sun.shadow.camera.near        = 1;
    sun.shadow.camera.far         = 400;
    sun.shadow.camera.left        = -120;
    sun.shadow.camera.right       = 120;
    sun.shadow.camera.top         = 120;
    sun.shadow.camera.bottom      = -120;
    sun.shadow.bias               = -0.001;
    this.scene.add(sun);

    // Sky background colour
    this.scene.background = new THREE.Color(cfg.sky);

    // Fog
    const fogDens = fogDensity ?? (
      weather === 'fog'   ? 0.022 :
      weather === 'rain'  ? 0.018 :
      weather === 'storm' ? 0.030 :
      weather === 'snow'  ? 0.016 :
      timeOfDay === 'night' ? 0.012 :
      0.006
    );

    const fogColor =
      weather === 'fog'   ? 0x9ba8b0 :
      weather === 'storm' ? 0x2d3748 :
      weather === 'snow'  ? 0xe2e8f0 :
      cfg.sky;

    this.scene.fog = new THREE.FogExp2(fogColor, fogDens);
  }

  // ── Trees ──────────────────────────────────────────────────────────────────
  createTree(x: number, z: number, options: TreeOptions = {}): THREE.Group {
    const { type = 'deciduous', scale = 1.0, colorShift = 0 } = options;
    const group = new THREE.Group();
    const r     = this.rng;

    // Random scale & rotation variation for natural look
    const s    = scale * (0.70 + r() * 0.60);
    group.scale.setScalar(s);
    group.rotation.y = r() * Math.PI * 2;
    group.position.set(x, 0, z);

    switch (type) {
      case 'pine':     this._buildPine(group, r, colorShift);     break;
      case 'dead':     this._buildDead(group, r);                 break;
      case 'palm':     this._buildPalm(group, r);                 break;
      case 'willow':   this._buildWillow(group, r, colorShift);   break;
      default:         this._buildDeciduous(group, r, colorShift); break;
    }

    group.userData = { id: `tree_${Math.round(x)}_${Math.round(z)}`, type: 'prop', collidable: true };
    this.scene.add(group);
    return group;
  }

  private _buildDeciduous(g: THREE.Group, r: () => number, shift: number): void {
    // Trunk — varied brown
    const trunkHue  = new THREE.Color(0x3d2b1f).lerp(new THREE.Color(0x5a3e2b), r() * 0.5);
    const trunkMat  = new THREE.MeshStandardMaterial({ color: trunkHue, roughness: 0.95 });
    const trunk     = new THREE.Mesh(new THREE.CylinderGeometry(0.18 + r() * 0.08, 0.28 + r() * 0.1, 3.5 + r(), 7), trunkMat);
    trunk.position.y = 1.75;
    trunk.castShadow = true;
    g.add(trunk);

    // Crown — 3–5 overlapping spheres for a natural canopy
    const greenBase  = new THREE.Color(0x2a6622).lerp(new THREE.Color(0x4a8a3a), r() * 0.5 + shift * 0.3);
    const greenAlt   = greenBase.clone().lerp(new THREE.Color(0x8b4513), shift);
    const crownMat   = new THREE.MeshStandardMaterial({ color: greenAlt, roughness: 0.85 });
    const sphereCount = 3 + Math.floor(r() * 3);
    const crownBase   = 4.2;

    for (let i = 0; i < sphereCount; i++) {
      const radius = 1.4 + r() * 0.9;
      const sphere = new THREE.Mesh(new THREE.SphereGeometry(radius, 8, 6), crownMat);
      sphere.position.set(
        (r() - 0.5) * 2.2,
        crownBase + (r() - 0.3) * 2.0,
        (r() - 0.5) * 2.2
      );
      sphere.castShadow = true;
      g.add(sphere);
    }
  }

  private _buildPine(g: THREE.Group, r: () => number, _shift: number): void {
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x3d2010, roughness: 0.95 });
    const trunk    = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.28, 3.5), trunkMat);
    trunk.position.y = 1.75;
    trunk.castShadow = true;
    g.add(trunk);

    // Layered cones — each slightly different
    const pine   = new THREE.Color(0x1a4a2a).lerp(new THREE.Color(0x2a6a3a), r() * 0.4);
    const pineMat = new THREE.MeshStandardMaterial({ color: pine, roughness: 0.88 });

    const layers = [
      { y: 2.2,  r: 2.2 + r() * 0.4, h: 3.0 + r() * 0.5 },
      { y: 3.8,  r: 1.7 + r() * 0.3, h: 2.5 + r() * 0.4 },
      { y: 5.2,  r: 1.2 + r() * 0.2, h: 2.0 + r() * 0.3 },
      { y: 6.4,  r: 0.7 + r() * 0.1, h: 1.5 + r() * 0.2 },
    ];

    layers.forEach(l => {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(l.r, l.h, 8), pineMat);
      cone.position.y  = l.y;
      cone.rotation.y  = r() * 0.5;
      cone.castShadow  = true;
      g.add(cone);
    });
  }

  private _buildDead(g: THREE.Group, r: () => number): void {
    const mat  = new THREE.MeshStandardMaterial({ color: 0x3a2818, roughness: 0.98 });
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.35, 5 + r() * 2), mat);
    trunk.position.y  = 2.5 + r();
    trunk.rotation.z  = (r() - 0.5) * 0.15;
    trunk.castShadow  = true;
    g.add(trunk);

    // Bare branches
    const branchCount = 3 + Math.floor(r() * 4);
    for (let i = 0; i < branchCount; i++) {
      const len    = 1.5 + r() * 2;
      const branch = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.12, len), mat);
      branch.position.set((r() - 0.5) * 1.5, 3.5 + r() * 2, (r() - 0.5) * 1.5);
      branch.rotation.set((r() - 0.5) * 1.2, r() * Math.PI * 2, (r() - 0.5) * 1.2);
      branch.castShadow = true;
      g.add(branch);
    }
  }

  private _buildPalm(g: THREE.Group, r: () => number): void {
    const mat  = new THREE.MeshStandardMaterial({ color: 0x8b6914, roughness: 0.92 });
    const h    = 6 + r() * 3;
    // Slightly curved trunk using multiple segments
    for (let i = 0; i < 6; i++) {
      const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, h / 6), mat);
      seg.position.set(i * 0.08 * (r() - 0.5), (i + 0.5) * (h / 6), i * 0.06 * (r() - 0.5));
      seg.castShadow = true;
      g.add(seg);
    }

    // Fronds
    const frondMat = new THREE.MeshStandardMaterial({ color: 0x2a7a1a, roughness: 0.85, side: THREE.DoubleSide });
    for (let i = 0; i < 7; i++) {
      const frondAngle = (i / 7) * Math.PI * 2;
      const frond = new THREE.Mesh(new THREE.PlaneGeometry(0.4 + r() * 0.2, 2.5 + r()), frondMat);
      frond.position.set(Math.cos(frondAngle) * 0.8, h, Math.sin(frondAngle) * 0.8);
      frond.rotation.set(-0.5 - r() * 0.3, frondAngle, 0.3 + r() * 0.2);
      frond.castShadow = true;
      g.add(frond);
    }
  }

  private _buildWillow(g: THREE.Group, r: () => number, shift: number): void {
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a3828, roughness: 0.95 });
    const trunk    = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.4, 5), trunkMat);
    trunk.position.y = 2.5;
    trunk.castShadow = true;
    g.add(trunk);

    const green   = new THREE.Color(0x3a7a2a).lerp(new THREE.Color(0x6a9a40), r() * 0.5 + shift * 0.3);
    const drape   = new THREE.MeshStandardMaterial({ color: green, roughness: 0.85, side: THREE.DoubleSide });

    // Drooping curtain branches
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2;
      const len   = 2.5 + r() * 1.5;
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(0.5 + r() * 0.3, len), drape);
      plane.position.set(Math.cos(angle) * (1.5 + r() * 0.5), 4.5 - len * 0.3, Math.sin(angle) * (1.5 + r() * 0.5));
      plane.rotation.set(-0.5 - r() * 0.3, angle, 0);
      plane.castShadow = true;
      g.add(plane);
    }
  }

  // ── Rocks ──────────────────────────────────────────────────────────────────
  createRock(x: number, z: number, options: RockOptions = {}): THREE.Mesh {
    const { scale = 1.0, color = 0x6b7280 } = options;
    const r   = this.rng;

    const baseC  = new THREE.Color(color);
    const varC   = baseC.clone().lerp(new THREE.Color(0x9ca3af), r() * 0.3);
    const mat    = new THREE.MeshStandardMaterial({ color: varC, roughness: 0.92, metalness: 0.04 });

    // Start with a dodecahedron and distort vertices for organic look
    const geo  = new THREE.DodecahedronGeometry(scale);
    const pos  = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const nx = pos.getX(i) * (0.75 + r() * 0.5);
      const ny = pos.getY(i) * (0.50 + r() * 0.4); // flatten vertically
      const nz = pos.getZ(i) * (0.75 + r() * 0.5);
      pos.setXYZ(i, nx, ny, nz);
    }
    geo.computeVertexNormals();

    const rock       = new THREE.Mesh(geo, mat);
    rock.position.set(x, scale * (0.35 + r() * 0.15), z);
    rock.rotation.set(r() * 0.4, r() * Math.PI * 2, r() * 0.3);
    rock.castShadow  = true;
    rock.receiveShadow = true;
    rock.userData    = { id: `rock_${Math.round(x)}_${Math.round(z)}`, type: 'prop', collidable: true };
    this.scene.add(rock);
    return rock;
  }

  // Cluster of rocks (more natural than single rocks)
  createRockCluster(x: number, z: number, count = 3, radius = 1.5): void {
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + this.rng() * 0.8;
      const dist  = this.rng() * radius;
      this.createRock(
        x + Math.cos(angle) * dist,
        z + Math.sin(angle) * dist,
        { scale: 0.3 + this.rng() * 0.8 }
      );
    }
  }

  // ── Buildings ──────────────────────────────────────────────────────────────
  createBuilding(x: number, z: number, options: BuildingOptions = {}): THREE.Group {
    const {
      width  = 5,
      height = 4,
      depth  = 5,
      style  = 'medieval',
      color  = 0x8b7355,
    } = options;
    const r     = this.rng;
    const group = new THREE.Group();
    group.position.set(x, 0, z);

    const wallMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(color).lerp(new THREE.Color(0xffffff), r() * 0.1 - 0.05),
      roughness: 0.9,
    });

    // Main body
    const body = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), wallMat);
    body.position.y    = height / 2;
    body.castShadow    = true;
    body.receiveShadow = true;
    body.userData      = { collidable: true };
    group.add(body);

    // Roof
    if (style === 'medieval' || style === 'cabin') {
      const roofMat  = new THREE.MeshStandardMaterial({ color: 0x5a2010, roughness: 0.92 });
      const roof     = new THREE.Mesh(new THREE.ConeGeometry(Math.max(width, depth) * 0.8, height * 0.6, 4), roofMat);
      roof.position.y   = height + (height * 0.3);
      roof.rotation.y   = Math.PI / 4;
      roof.castShadow   = true;
      group.add(roof);
    } else if (style === 'ruin') {
      // Broken top — remove top portion with visible jagged edges
      const crumbleMat = new THREE.MeshStandardMaterial({ color: 0x6b6560, roughness: 0.98 });
      for (let i = 0; i < 5; i++) {
        const piece = new THREE.Mesh(new THREE.BoxGeometry(0.4 + r() * 0.4, 0.5 + r() * 1.0, 0.4 + r() * 0.4), crumbleMat);
        const side  = Math.floor(r() * 4);
        piece.position.set(
          side === 0 ? -width / 2 + r() * width : (r() - 0.5) * width,
          height + r() * 0.4,
          side === 2 ? -depth / 2 + r() * depth : (r() - 0.5) * depth
        );
        piece.rotation.set(r() * 0.3, r() * Math.PI, r() * 0.3);
        piece.castShadow = true;
        group.add(piece);
      }
    } else if (style === 'tower') {
      // Circular tower
      const towerMat  = new THREE.MeshStandardMaterial({ color, roughness: 0.88 });
      const crenellationMat = new THREE.MeshStandardMaterial({ color: 0x9a9080, roughness: 0.92 });
      const tower     = new THREE.Mesh(new THREE.CylinderGeometry(width * 0.4, width * 0.45, height * 1.5, 12), towerMat);
      tower.position.y  = height * 0.75;
      tower.castShadow  = true;
      tower.userData    = { collidable: true };
      group.add(tower);

      // Battlements
      for (let i = 0; i < 8; i++) {
        const angle   = (i / 8) * Math.PI * 2;
        const crenn   = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 0.5), crenellationMat);
        crenn.position.set(Math.cos(angle) * width * 0.38, height * 1.5 + 0.3, Math.sin(angle) * width * 0.38);
        crenn.castShadow = true;
        group.add(crenn);
      }
    }

    group.userData = { id: `building_${Math.round(x)}_${Math.round(z)}`, type: 'building', collidable: true };
    group.rotation.y = r() * 0.3;
    this.scene.add(group);
    return group;
  }

  // ── Water ─────────────────────────────────────────────────────────────────
  createWater(x: number, z: number, width = 20, depth = 20): THREE.Mesh {
    const geo  = new THREE.PlaneGeometry(width, depth, 1, 1);
    const mat  = new THREE.MeshStandardMaterial({
      color:      0x1a6090,
      roughness:  0.05,
      metalness:  0.3,
      transparent: true,
      opacity:    0.85,
    });
    const water       = new THREE.Mesh(geo, mat);
    water.rotation.x  = -Math.PI / 2;
    water.position.set(x, 0.05, z); // slightly above ground to avoid z-fighting
    water.receiveShadow = true;
    water.userData    = { id: `water_${Math.round(x)}_${Math.round(z)}`, type: 'water', collidable: false };
    this.scene.add(water);
    return water;
  }

  // ── Grass tufts ────────────────────────────────────────────────────────────
  createGrassField(cx: number, cz: number, count = 200, radius = 15): void {
    const mat = new THREE.MeshStandardMaterial({
      color:       0x3a6a20,
      roughness:   0.95,
      side:        THREE.DoubleSide,
    });

    for (let i = 0; i < count; i++) {
      const angle = this.rng() * Math.PI * 2;
      const dist  = this.rng() * radius;
      const x     = cx + Math.cos(angle) * dist;
      const z     = cz + Math.sin(angle) * dist;
      const h     = 0.2 + this.rng() * 0.35;

      const plane   = new THREE.Mesh(new THREE.PlaneGeometry(0.12, h), mat);
      plane.position.set(x, h / 2, z);
      plane.rotation.y = this.rng() * Math.PI;
      this.scene.add(plane);

      const plane2  = plane.clone();
      plane2.rotation.y += Math.PI / 2;
      this.scene.add(plane2);
    }
  }

  // ── Scatter helper ────────────────────────────────────────────────────────
  // Distributes count objects in a ring/disc between radiusMin and radiusMax
  scatter(
    count: number,
    radiusMin: number,
    radiusMax: number,
    fn: (x: number, z: number, index: number) => void,
    centerX = 0,
    centerZ = 0,
  ): void {
    for (let i = 0; i < count; i++) {
      const angle  = this.rng() * Math.PI * 2;
      const radius = radiusMin + this.rng() * (radiusMax - radiusMin);
      fn(
        centerX + Math.cos(angle) * radius,
        centerZ + Math.sin(angle) * radius,
        i,
      );
    }
  }

  // ── Path / road ───────────────────────────────────────────────────────────
  createPath(points: [number, number][], width = 2.0): void {
    const mat  = new THREE.MeshStandardMaterial({ color: 0x6b5a45, roughness: 0.98 });
    for (let i = 0; i < points.length - 1; i++) {
      const [x1, z1] = points[i];
      const [x2, z2] = points[i + 1];
      const dx  = x2 - x1, dz = z2 - z1;
      const len = Math.sqrt(dx * dx + dz * dz);
      const seg = new THREE.Mesh(new THREE.PlaneGeometry(width, len), mat);
      seg.rotation.x = -Math.PI / 2;
      seg.rotation.z  = Math.atan2(dx, dz);
      seg.position.set((x1 + x2) / 2, 0.01, (z1 + z2) / 2);
      seg.receiveShadow = true;
      seg.userData      = { id: `path_${i}`, type: 'path', collidable: false };
      this.scene.add(seg);
    }
  }

  // ── Torch / fire light ────────────────────────────────────────────────────
  createTorch(x: number, y: number, z: number): THREE.Group {
    const group  = new THREE.Group();
    group.position.set(x, y, z);

    // Pole
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x3a2010 });
    const pole    = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.06, 1.4), poleMat);
    pole.position.y = 0.7;
    group.add(pole);

    // Flame glow (point light)
    const light = new THREE.PointLight(0xff6020, 1.5, 8, 2);
    light.position.y = 1.5;
    group.add(light);

    // Flame mesh (small sphere)
    const flameMat = new THREE.MeshStandardMaterial({
      color: 0xff8040, emissive: 0xff4000, emissiveIntensity: 1.0,
    });
    const flame    = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 6), flameMat);
    flame.position.y = 1.5;
    group.add(flame);

    group.userData = { id: `torch_${Math.round(x)}_${Math.round(z)}`, type: 'prop' };
    this.scene.add(group);
    return group;
  }

  // ── Well ──────────────────────────────────────────────────────────────────
  createWell(x: number, z: number): THREE.Group {
    const group   = new THREE.Group();
    group.position.set(x, 0, z);
    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x7a7065, roughness: 0.95 });
    const woodMat  = new THREE.MeshStandardMaterial({ color: 0x5a3a20, roughness: 0.9 });

    // Stone cylinder
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.0, 0.9, 12, 1, true), stoneMat);
    base.position.y  = 0.45;
    base.castShadow  = true;
    base.userData    = { collidable: true };
    group.add(base);

    // Roof posts
    [[-0.8, 0], [0.8, 0]].forEach(([px]) => {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.5), woodMat);
      post.position.set(px, 1.6, 0);
      post.castShadow = true;
      group.add(post);
    });

    // Crossbeam
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.8), woodMat);
    beam.rotation.z  = Math.PI / 2;
    beam.position.y  = 2.35;
    beam.castShadow  = true;
    group.add(beam);

    group.userData = { id: `well_${Math.round(x)}_${Math.round(z)}`, type: 'prop', collidable: true, interactable: true };
    this.scene.add(group);
    return group;
  }
}

// ── AssetMap type used by DynamicLoader ──────────────────────────────────────
export interface AssetMap {
  textures: Map<string, THREE.Texture>;
  helpers:  ProceduralAssetLibrary;
}
