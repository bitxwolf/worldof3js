import * as THREE from './libs/three.module.js';

// ── State & Config ────────────────────────────────────────────────────────────
const CONFIG = {
  particleCount: 20000,
  flowSpeed: 1.0,
  turbulence: 0.8,
  coreEnergy: 1.2,
  audioEnabled: true,
  theme: 'cyber', // 'cyber', 'solar', 'bio', 'void'
  cinematicDuration: 10.0,
};

const THEMES = {
  cyber: {
    name: 'Cyber Neon',
    primary: new THREE.Color(0x00f0ff),
    secondary: new THREE.Color(0xff0077),
    accent: new THREE.Color(0x7000ff),
    fog: 0x050814,
    skyTop: 0x02030a,
    skyBottom: 0x0b1528,
    grid: 0x00f0ff,
    terrain: 0x0a0f1d,
  },
  solar: {
    name: 'Solar Flare',
    primary: new THREE.Color(0xffaa00),
    secondary: new THREE.Color(0xff3300),
    accent: new THREE.Color(0xffe600),
    fog: 0x160702,
    skyTop: 0x0c0301,
    skyBottom: 0x2e0c05,
    grid: 0xff8800,
    terrain: 0x1c0d08,
  },
  bio: {
    name: 'Bioluminescent',
    primary: new THREE.Color(0x00ffaa),
    secondary: new THREE.Color(0x0088ff),
    accent: new THREE.Color(0x88ff00),
    fog: 0x01140e,
    skyTop: 0x010a08,
    skyBottom: 0x04241c,
    grid: 0x00ffaa,
    terrain: 0x051a14,
  },
  void: {
    name: 'Quantum Void',
    primary: new THREE.Color(0xb300ff),
    secondary: new THREE.Color(0x00ffff),
    accent: new THREE.Color(0xffffff),
    fog: 0x0d0317,
    skyTop: 0x07010e,
    skyBottom: 0x1a062d,
    grid: 0xa855f7,
    terrain: 0x130722,
  },
};

// ── Web Audio Synthesizer ─────────────────────────────────────────────────────
class SoundEngine {
  constructor() {
    this.ctx = null;
    this.droneOsc1 = null;
    this.droneOsc2 = null;
    this.droneFilter = null;
    this.masterGain = null;
    this.isStarted = false;
  }

  init() {
    if (this.isStarted) return;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioContext();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(0.3, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);

      // Deep ambient drone
      this.droneFilter = this.ctx.createBiquadFilter();
      this.droneFilter.type = 'lowpass';
      this.droneFilter.frequency.setValueAtTime(160, this.ctx.currentTime);
      this.droneFilter.connect(this.masterGain);

      this.droneOsc1 = this.ctx.createOscillator();
      this.droneOsc1.type = 'sawtooth';
      this.droneOsc1.frequency.setValueAtTime(55, this.ctx.currentTime); // A1

      this.droneOsc2 = this.ctx.createOscillator();
      this.droneOsc2.type = 'sine';
      this.droneOsc2.frequency.setValueAtTime(82.4, this.ctx.currentTime); // E2

      this.droneOsc1.connect(this.droneFilter);
      this.droneOsc2.connect(this.droneFilter);

      this.droneOsc1.start();
      this.droneOsc2.start();
      this.isStarted = true;
    } catch (e) {
      console.warn('Web Audio not supported or blocked:', e);
    }
  }

  playChime(freq = 440, type = 'sine', duration = 0.6) {
    if (!this.ctx || !CONFIG.audioEnabled) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, this.ctx.currentTime);

    gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start();
    osc.stop(this.ctx.currentTime + duration);
  }

  playVortexPulse() {
    this.playChime(587.33, 'triangle', 0.8); // D5
    setTimeout(() => this.playChime(880, 'sine', 0.9), 100);
  }

  playShockwave() {
    if (!this.ctx || !CONFIG.audioEnabled) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(180, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(40, this.ctx.currentTime + 0.6);

    gain.gain.setValueAtTime(0.4, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.6);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.6);
  }

  setFilterFreq(val) {
    if (this.droneFilter && this.ctx) {
      this.droneFilter.frequency.setTargetAtTime(val, this.ctx.currentTime, 0.1);
    }
  }
}

const audio = new SoundEngine();

// ── Three.js Scene Setup ──────────────────────────────────────────────────────
const container = document.getElementById('canvas-container');
const canvas = document.getElementById('webgl-canvas');

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: 'high-performance',
});

renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.25;

// Atmosphere
scene.fog = new THREE.FogExp2(THEMES.cyber.fog, 0.015);
scene.background = new THREE.Color(THEMES.cyber.skyTop);

// ── Lighting ──────────────────────────────────────────────────────────────────
const ambientLight = new THREE.AmbientLight(0x223355, 0.8);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
dirLight.position.set(50, 80, 40);
dirLight.castShadow = true;
dirLight.shadow.mapSize.width = 2048;
dirLight.shadow.mapSize.height = 2048;
dirLight.shadow.camera.near = 10;
dirLight.shadow.camera.far = 250;
const d = 60;
dirLight.shadow.camera.left = -d;
dirLight.shadow.camera.right = d;
dirLight.shadow.camera.top = d;
dirLight.shadow.camera.bottom = -d;
scene.add(dirLight);

const coreLight = new THREE.PointLight(0x00f0ff, 4, 60);
coreLight.position.set(0, 8, 0);
scene.add(coreLight);

const coreLightSecondary = new THREE.PointLight(0xff0077, 3, 50);
coreLightSecondary.position.set(0, 14, 0);
scene.add(coreLightSecondary);

// ── Terrain Generation ────────────────────────────────────────────────────────
const terrainSize = 240;
const terrainSegments = 120;
const terrainGeo = new THREE.PlaneGeometry(terrainSize, terrainSize, terrainSegments, terrainSegments);
terrainGeo.rotateX(-Math.PI / 2);

function getTerrainHeight(x, z) {
  // Gentle rolling cyber-canyon with smooth central clearing
  const r = Math.sqrt(x * x + z * z);
  const clearingFade = Math.min(1.0, Math.max(0.0, (r - 18) / 35));
  const wave1 = Math.sin(x * 0.04) * Math.cos(z * 0.04) * 5.0;
  const wave2 = Math.sin(x * 0.08 + 1.2) * Math.cos(z * 0.07 + 0.8) * 2.5;
  const canyonRidge = Math.sin(x * 0.02 + z * 0.03) * 6.0;
  return (wave1 + wave2 + canyonRidge) * clearingFade;
}

const posAttr = terrainGeo.attributes.position;
for (let i = 0; i < posAttr.count; i++) {
  const x = posAttr.getX(i);
  const z = posAttr.getZ(i);
  posAttr.setY(i, getTerrainHeight(x, z));
}
terrainGeo.computeVertexNormals();

const terrainMat = new THREE.MeshStandardMaterial({
  color: THEMES.cyber.terrain,
  roughness: 0.85,
  metalness: 0.25,
  flatShading: false,
});
const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
terrainMesh.receiveShadow = true;
scene.add(terrainMesh);

// Glowing wireframe contour overlay
const wireMat = new THREE.MeshBasicMaterial({
  color: THEMES.cyber.grid,
  wireframe: true,
  transparent: true,
  opacity: 0.12,
});
const wireMesh = new THREE.Mesh(terrainGeo, wireMat);
wireMesh.position.y = 0.05;
scene.add(wireMesh);

// ── Central SmartFlow Energy Core ─────────────────────────────────────────────
const coreGroup = new THREE.Group();
coreGroup.position.set(0, 7, 0);
scene.add(coreGroup);

// Central glowing plasma sphere
const coreSphereGeo = new THREE.IcosahedronGeometry(2.8, 4);
const coreSphereMat = new THREE.MeshStandardMaterial({
  color: 0x00f0ff,
  emissive: 0x00f0ff,
  emissiveIntensity: 1.8,
  roughness: 0.1,
  metalness: 0.8,
  wireframe: false,
});
const coreSphere = new THREE.Mesh(coreSphereGeo, coreSphereMat);
coreGroup.add(coreSphere);

// Outer energy cage
const cageGeo = new THREE.IcosahedronGeometry(3.6, 1);
const cageMat = new THREE.MeshBasicMaterial({
  color: 0xff0077,
  wireframe: true,
  transparent: true,
  opacity: 0.8,
});
const coreCage = new THREE.Mesh(cageGeo, cageMat);
coreGroup.add(coreCage);

// 3 Gyroscopic Orbiting Rings
const rings = [];
const ringData = [
  { r: 5.2, tube: 0.08, color: 0x00f0ff, rx: 0.4, ry: 0.8, rz: 0.2, speed: 0.8 },
  { r: 7.0, tube: 0.06, color: 0xff0077, rx: 1.2, ry: 0.3, rz: 0.9, speed: -0.6 },
  { r: 8.8, tube: 0.05, color: 0x7000ff, rx: 0.6, ry: 1.4, rz: 0.5, speed: 0.4 },
];

ringData.forEach((d) => {
  const geo = new THREE.TorusGeometry(d.r, d.tube, 16, 100);
  const mat = new THREE.MeshBasicMaterial({ color: d.color, transparent: true, opacity: 0.85 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.set(d.rx, d.ry, d.rz);
  coreGroup.add(mesh);
  rings.push({ mesh, speed: d.speed });
});

// Vertical skyward energy column
const columnGeo = new THREE.CylinderGeometry(0.6, 1.2, 120, 32, 1, true);
const columnMat = new THREE.MeshBasicMaterial({
  color: 0x00f0ff,
  transparent: true,
  opacity: 0.25,
  side: THREE.DoubleSide,
  blending: THREE.AdditiveBlending,
});
const energyColumn = new THREE.Mesh(columnGeo, columnMat);
energyColumn.position.set(0, 55, 0);
scene.add(energyColumn);

// ── Monoliths & Cyber Obelisks ─────────────────────────────────────────────────
const monoliths = [];
const monolithCount = 6;
const monolithRadius = 24;

for (let i = 0; i < monolithCount; i++) {
  const angle = (i / monolithCount) * Math.PI * 2;
  const x = Math.cos(angle) * monolithRadius;
  const z = Math.sin(angle) * monolithRadius;
  const yBase = getTerrainHeight(x, z);

  const h = 14 + (i % 3) * 4;
  const monoGeo = new THREE.BoxGeometry(2.0, h, 2.0);
  const monoMat = new THREE.MeshStandardMaterial({
    color: 0x0f172a,
    metalness: 0.85,
    roughness: 0.2,
  });
  const mono = new THREE.Mesh(monoGeo, monoMat);
  mono.position.set(x, yBase + h / 2, z);
  mono.castShadow = true;
  mono.receiveShadow = true;
  scene.add(mono);

  // Vertical neon stripe on monolith
  const stripeGeo = new THREE.PlaneGeometry(0.3, h * 0.9);
  const stripeMat = new THREE.MeshBasicMaterial({
    color: i % 2 === 0 ? 0x00f0ff : 0xff0077,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
  const stripe = new THREE.Mesh(stripeGeo, stripeMat);
  stripe.position.set(0, 0, 1.02);
  mono.add(stripe);

  // Floating crystal shard above monolith
  const crystalGeo = new THREE.OctahedronGeometry(1.2, 0);
  const crystalMat = new THREE.MeshStandardMaterial({
    color: i % 2 === 0 ? 0x00f0ff : 0xff0077,
    emissive: i % 2 === 0 ? 0x00f0ff : 0xff0077,
    emissiveIntensity: 0.9,
    metalness: 0.9,
    roughness: 0.1,
  });
  const crystal = new THREE.Mesh(crystalGeo, crystalMat);
  crystal.position.set(x, yBase + h + 3, z);
  scene.add(crystal);

  monoliths.push({ mono, crystal, baseY: yBase + h + 3, offset: i * 1.0 });
}

// ── SmartFlow Vector Field Particle Simulation ────────────────────────────────
let particleCount = CONFIG.particleCount;
let particleGeo = new THREE.BufferGeometry();
let particlePositions = new Float32Array(particleCount * 3);
let particleVelocities = new Float32Array(particleCount * 3);
let particleColors = new Float32Array(particleCount * 3);
let particlePhases = new Float32Array(particleCount);

// Generate initial particle cloud along flow channels
function initParticles() {
  const curTheme = THEMES[CONFIG.theme];
  for (let i = 0; i < particleCount; i++) {
    const i3 = i * 3;
    // Distribute particles in a spiral swirl out to radius 70
    const angle = Math.random() * Math.PI * 2;
    const rad = 4 + Math.pow(Math.random(), 1.5) * 65;
    const y = Math.random() * 18 + 0.5;

    particlePositions[i3] = Math.cos(angle) * rad;
    particlePositions[i3 + 1] = y;
    particlePositions[i3 + 2] = Math.sin(angle) * rad;

    particleVelocities[i3] = 0;
    particleVelocities[i3 + 1] = 0;
    particleVelocities[i3 + 2] = 0;

    particlePhases[i] = Math.random() * Math.PI * 2;

    // Color gradient between primary and secondary
    const ratio = Math.random();
    const c = new THREE.Color().lerpColors(curTheme.primary, curTheme.secondary, ratio);
    if (Math.random() < 0.15) c.lerp(curTheme.accent, 0.7);

    particleColors[i3] = c.r;
    particleColors[i3 + 1] = c.g;
    particleColors[i3 + 2] = c.b;
  }

  particleGeo.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
  particleGeo.setAttribute('color', new THREE.BufferAttribute(particleColors, 3));
}
initParticles();

// Particle Material with circular soft sprite
function createParticleTexture() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext('2d');
  const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 30);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.3, 'rgba(0,240,255,0.8)');
  grad.addColorStop(0.7, 'rgba(0,240,255,0.2)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(32, 32, 30, 0, Math.PI * 2);
  ctx.fill();
  return new THREE.CanvasTexture(c);
}

const particleMat = new THREE.PointsMaterial({
  size: 0.9,
  vertexColors: true,
  map: createParticleTexture(),
  transparent: true,
  opacity: 0.85,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
});

const particleSystem = new THREE.Points(particleGeo, particleMat);
scene.add(particleSystem);

// ── Interactive Force Fields (Vortex & Shockwaves) ────────────────────────────
let activeVortex = null; // { pos: THREE.Vector3, strength: number }
const shockwaves = [];   // Array of { pos: THREE.Vector3, radius: number, speed: number, maxRadius: number }

// Visual ring indicator for active vortex
const vortexRingGeo = new THREE.RingGeometry(0.2, 0.4, 32);
vortexRingGeo.rotateX(-Math.PI / 2);
const vortexRingMat = new THREE.MeshBasicMaterial({
  color: 0x00f0ff,
  side: THREE.DoubleSide,
  transparent: true,
  opacity: 0,
  blending: THREE.AdditiveBlending,
});
const vortexIndicator = new THREE.Mesh(vortexRingGeo, vortexRingMat);
scene.add(vortexIndicator);

// Vector Field Calculation Function
function getVectorFieldVelocity(x, y, z, time, outVec) {
  const speed = CONFIG.flowSpeed;
  const turb = CONFIG.turbulence;

  // 1. Central Swirl (Vortex around core at (0, 7, 0))
  const dx = x;
  const dz = z;
  const dist2D = Math.sqrt(dx * dx + dz * dz) + 0.001;
  const swirlStrength = (16.0 / (dist2D + 4.0)) * speed;

  // Tangent vector: (-dz, dx) normalized
  const tx = (-dz / dist2D) * swirlStrength;
  const tz = (dx / dist2D) * swirlStrength;

  // Inward/outward spiral pulse
  const radialPull = Math.sin(time * 0.8 + dist2D * 0.2) * 0.8;
  const rx = (dx / dist2D) * radialPull;
  const rz = (dz / dist2D) * radialPull;

  // 2. Vertical undulating wave
  const vy = Math.sin(x * 0.08 + time * 1.5) * Math.cos(z * 0.08 + time) * 2.0 * turb;

  // 3. 3D Curl Noise approximation (harmonic trig waves)
  const cx = Math.sin(y * 0.3 + z * 0.15 + time) * turb * 2.5;
  const cz = Math.cos(y * 0.3 + x * 0.15 + time) * turb * 2.5;

  outVec.set(tx + rx + cx, vy, tz + rz + cz);
}

// ── 10-Second Choreographed Cinematic Camera Path ─────────────────────────────
// Beautiful Catmull-Rom curve over the world
const splinePoints = [
  new THREE.Vector3(0, 55, 95),     // t = 0s: High altitude overview
  new THREE.Vector3(38, 32, 52),    // t = 2.5s: Banking into canyon
  new THREE.Vector3(26, 14, 20),    // t = 5.0s: Weaving past monoliths
  new THREE.Vector3(-14, 9, 12),    // t = 7.0s: Spiraling around core rings
  new THREE.Vector3(-4, 4.5, -16),  // t = 8.5s: Skimming low over terrain
  new THREE.Vector3(0, 1.8, 14),    // t = 10.0s: Eye-level interactive start
];

const cameraSpline = new THREE.CatmullRomCurve3(splinePoints, false, 'centripetal', 0.5);

const lookAtPoints = [
  new THREE.Vector3(0, 8, 0),      // Looking at Core
  new THREE.Vector3(10, 6, 12),    // Looking ahead down canyon
  new THREE.Vector3(0, 7, 0),      // Looking back into Core
  new THREE.Vector3(0, 7, 0),      // Locking on Core center
  new THREE.Vector3(8, 2, -6),     // Scanning horizon
  new THREE.Vector3(0, 2, 0),      // Aligned with player forward
];
const lookAtSpline = new THREE.CatmullRomCurve3(lookAtPoints, false, 'centripetal', 0.5);

let cinematicActive = true;
let cinematicTime = 0.0;
const DURATION = CONFIG.cinematicDuration;

// HUD Elements
const hudCinematic = document.getElementById('cinematic-hud');
const hudInteractive = document.getElementById('interactive-hud');
const timerNumber = document.getElementById('timer-number');
const timerProgress = document.getElementById('timer-progress');
const timelineFill = document.getElementById('timeline-fill');
const cinematicPhase = document.getElementById('cinematic-phase');
const btnSkip = document.getElementById('btn-skip-cinematic');
const toast = document.getElementById('toast');
const toastText = document.getElementById('toast-text');

function showToast(text, duration = 3000) {
  toastText.textContent = text;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), duration);
}

function updateCinematicHUD(timeRemaining, elapsed) {
  // Timer ring: stroke-dashoffset goes from 0 (full) to 226 (empty)
  const progress = Math.min(1.0, Math.max(0.0, elapsed / DURATION));
  const dashoffset = progress * 226;
  timerProgress.style.strokeDashoffset = dashoffset;
  timerNumber.textContent = Math.max(0.0, timeRemaining).toFixed(1) + 's';

  // Timeline bar
  timelineFill.style.width = (progress * 100).toFixed(1) + '%';

  // Phase labels & milestones
  const ms1 = document.getElementById('ms-1');
  const ms2 = document.getElementById('ms-2');
  const ms3 = document.getElementById('ms-3');
  const ms4 = document.getElementById('ms-4');

  if (elapsed < 3.0) {
    cinematicPhase.textContent = 'Phase 1: Orbital Descent';
    ms1.classList.add('active');
    ms2.classList.remove('active');
    ms3.classList.remove('active');
    ms4.classList.remove('active');
  } else if (elapsed < 6.5) {
    cinematicPhase.textContent = 'Phase 2: Canyon Slalom';
    ms1.classList.remove('active');
    ms2.classList.add('active');
    ms3.classList.remove('active');
    ms4.classList.remove('active');
  } else if (elapsed < 9.2) {
    cinematicPhase.textContent = 'Phase 3: Core Convergence';
    ms1.classList.remove('active');
    ms2.classList.remove('active');
    ms3.classList.add('active');
    ms4.classList.remove('active');
  } else {
    cinematicPhase.textContent = 'Phase 4: Control Handover';
    ms1.classList.remove('active');
    ms2.classList.remove('active');
    ms3.classList.remove('active');
    ms4.classList.add('active');
  }
}

function endCinematic(isSkip = false) {
  if (!cinematicActive) return;
  cinematicActive = false;

  hudCinematic.classList.add('fade-out');
  hudInteractive.classList.add('active');

  // Align player controller to final camera transform
  playerPos.copy(camera.position);
  playerPos.y = Math.max(playerPos.y, getTerrainHeight(playerPos.x, playerPos.z) + playerHeight);

  // Sound chime
  audio.init();
  audio.playVortexPulse();

  showToast(isSkip ? 'Cinematic Skipped — Full Interaction Active!' : '10s Sequence Complete — Interactive Mode Engaged!');
}

btnSkip.addEventListener('click', () => endCinematic(true));

// ── Interactive Player Controller ─────────────────────────────────────────────
let cameraMode = 'walk'; // 'walk' or 'orbit'
const playerPos = new THREE.Vector3(0, 1.8, 14);
const playerVel = new THREE.Vector3();
const playerHeight = 1.8;
let pitch = 0;
let yaw = 0;
let isPointerLocked = false;

// Orbit controls state
let orbitRadius = 35;
let orbitPhi = Math.PI / 4;
let orbitTheta = 0;
let isDraggingOrbit = false;
let prevMousePos = { x: 0, y: 0 };

const keys = { w: false, a: false, s: false, d: false, space: false, shift: false };

window.addEventListener('keydown', (e) => {
  audio.init();
  const code = e.code.toLowerCase();
  if (code === 'keyw') keys.w = true;
  if (code === 'keys') keys.s = true;
  if (code === 'keya') keys.a = true;
  if (code === 'keyd') keys.d = true;
  if (code === 'space') {
    if (cinematicActive) {
      endCinematic(true);
    } else {
      keys.space = true;
    }
  }
  if (code === 'shiftleft' || code === 'shiftright') keys.shift = true;
  if (code === 'keyv') {
    toggleCameraMode();
  }
});

window.addEventListener('keyup', (e) => {
  const code = e.code.toLowerCase();
  if (code === 'keyw') keys.w = false;
  if (code === 'keys') keys.s = false;
  if (code === 'keya') keys.a = false;
  if (code === 'keyd') keys.d = false;
  if (code === 'space') keys.space = false;
  if (code === 'shiftleft' || code === 'shiftright') keys.shift = false;
});

// Pointer Lock & Mouse Look
canvas.addEventListener('click', () => {
  audio.init();
  if (!cinematicActive && cameraMode === 'walk' && !isPointerLocked) {
    canvas.requestPointerLock();
  }
});

document.addEventListener('pointerlockchange', () => {
  isPointerLocked = document.pointerLockElement === canvas;
});

window.addEventListener('mousemove', (e) => {
  if (isPointerLocked && cameraMode === 'walk') {
    const sens = 0.0022;
    yaw -= e.movementX * sens;
    pitch -= e.movementY * sens;
    pitch = Math.max(-Math.PI / 2.2, Math.min(Math.PI / 2.2, pitch));
  } else if (isDraggingOrbit && cameraMode === 'orbit') {
    const dx = e.clientX - prevMousePos.x;
    const dy = e.clientY - prevMousePos.y;
    orbitTheta -= dx * 0.006;
    orbitPhi = Math.max(0.1, Math.min(Math.PI / 2 - 0.05, orbitPhi + dy * 0.006));
    prevMousePos = { x: e.clientX, y: e.clientY };
  }
});

// Mouse interactive flow mechanics (Vortex & Shockwave)
const raycaster = new THREE.Raycaster();
const mouseVec = new THREE.Vector2();

window.addEventListener('mousedown', (e) => {
  audio.init();
  if (e.button === 0) {
    // Left Click: Spawn Gravitational Vortex
    if (cameraMode === 'orbit') {
      isDraggingOrbit = true;
      prevMousePos = { x: e.clientX, y: e.clientY };
    }
    triggerVortex(e);
  } else if (e.button === 2) {
    // Right Click: Shockwave blast
    e.preventDefault();
    triggerShockwave(e);
  }
});

window.addEventListener('mouseup', (e) => {
  if (e.button === 0) {
    isDraggingOrbit = false;
    activeVortex = null;
    vortexRingMat.opacity = 0;
  }
});

window.addEventListener('contextmenu', (e) => e.preventDefault());

window.addEventListener('wheel', (e) => {
  if (cameraMode === 'orbit') {
    orbitRadius = Math.max(10, Math.min(100, orbitRadius + e.deltaY * 0.05));
  }
});

function getIntersectionPoint(e) {
  if (isPointerLocked) {
    // In pointer lock, center of screen
    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
  } else {
    mouseVec.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouseVec.y = -(e.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouseVec, camera);
  }
  const hits = raycaster.intersectObject(terrainMesh);
  if (hits.length > 0) return hits[0].point;
  // Fallback forward project
  return raycaster.ray.origin.clone().add(raycaster.ray.direction.clone().multiplyScalar(20));
}

function triggerVortex(e) {
  const hit = getIntersectionPoint(e);
  activeVortex = { pos: hit.clone(), strength: 25.0 };
  vortexIndicator.position.copy(hit).add(new THREE.Vector3(0, 0.2, 0));
  vortexRingMat.opacity = 0.9;
  audio.playVortexPulse();
  showToast('Gravitational Vortex Activated at Cursor', 1200);
}

function triggerShockwave(e) {
  const hit = getIntersectionPoint(e);
  shockwaves.push({
    pos: hit.clone(),
    radius: 1.0,
    speed: 38.0,
    maxRadius: 35.0,
  });
  audio.playShockwave();
  showToast('Kinetic Shockwave Dispersed Particles!', 1200);
}

function toggleCameraMode() {
  cameraMode = cameraMode === 'walk' ? 'orbit' : 'walk';
  const label = document.getElementById('cam-label');
  if (label) label.textContent = `Mode: ${cameraMode === 'walk' ? 'Walk' : 'Orbit'}`;
  if (cameraMode === 'walk') {
    playerPos.copy(camera.position);
    playerPos.y = Math.max(playerPos.y, getTerrainHeight(playerPos.x, playerPos.z) + playerHeight);
    yaw = Math.atan2(camera.position.x, camera.position.z);
    pitch = 0;
    document.body.classList.add('crosshair-visible');
    showToast('Walk Mode: Click canvas to lock mouse, WASD to move');
  } else {
    if (document.exitPointerLock) document.exitPointerLock();
    document.body.classList.remove('crosshair-visible');
    orbitRadius = 35;
    showToast('Orbit Mode: Click & drag to rotate, scroll to zoom');
  }
}

// ── UI Controls & Tuning Panel ────────────────────────────────────────────────
const sliderSpeed = document.getElementById('slider-speed');
const valSpeed = document.getElementById('val-speed');
sliderSpeed.addEventListener('input', (e) => {
  CONFIG.flowSpeed = parseFloat(e.target.value);
  valSpeed.textContent = CONFIG.flowSpeed.toFixed(1) + 'x';
});

const sliderTurb = document.getElementById('slider-turb');
const valTurb = document.getElementById('val-turb');
sliderTurb.addEventListener('input', (e) => {
  CONFIG.turbulence = parseFloat(e.target.value);
  valTurb.textContent = CONFIG.turbulence.toFixed(1);
});

const sliderEnergy = document.getElementById('slider-energy');
const valEnergy = document.getElementById('val-energy');
sliderEnergy.addEventListener('input', (e) => {
  CONFIG.coreEnergy = parseFloat(e.target.value);
  valEnergy.textContent = CONFIG.coreEnergy.toFixed(1);
});

// Color Themes
const paletteBtns = document.querySelectorAll('.palette-btn');
paletteBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    paletteBtns.forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    setTheme(btn.dataset.theme);
  });
});

function setTheme(themeKey) {
  if (!THEMES[themeKey]) return;
  CONFIG.theme = themeKey;
  const t = THEMES[themeKey];

  scene.fog.color.set(t.fog);
  scene.background.set(t.skyTop);
  terrainMat.color.set(t.terrain);
  wireMat.color.set(t.grid);
  coreLight.color.set(t.primary);
  coreLightSecondary.color.set(t.secondary);
  coreSphereMat.color.set(t.primary);
  coreSphereMat.emissive.set(t.primary);
  coreCage.material.color.set(t.secondary);
  energyColumn.material.color.set(t.primary);

  // Update particles color
  const cols = particleGeo.attributes.color.array;
  for (let i = 0; i < particleCount; i++) {
    const i3 = i * 3;
    const ratio = Math.random();
    const c = new THREE.Color().lerpColors(t.primary, t.secondary, ratio);
    if (Math.random() < 0.15) c.lerp(t.accent, 0.7);
    cols[i3] = c.r;
    cols[i3 + 1] = c.g;
    cols[i3 + 2] = c.b;
  }
  particleGeo.attributes.color.needsUpdate = true;

  showToast(`Palette Changed: ${t.name}`);
}

// Replay 10s Tour
document.getElementById('btn-replay').addEventListener('click', () => {
  cinematicActive = true;
  cinematicTime = 0.0;
  hudCinematic.classList.remove('fade-out');
  hudInteractive.classList.remove('active');
  if (document.exitPointerLock) document.exitPointerLock();
  showToast('Replaying 10-Second SmartFlow Cinematic Flight');
});

// Camera Mode toggle button
document.getElementById('btn-toggle-cam').addEventListener('click', toggleCameraMode);

// Audio toggle button
const btnAudio = document.getElementById('btn-audio');
const audioLabel = document.getElementById('audio-label');
btnAudio.addEventListener('click', () => {
  audio.init();
  CONFIG.audioEnabled = !CONFIG.audioEnabled;
  audioLabel.textContent = `🔊 Audio: ${CONFIG.audioEnabled ? 'On' : 'Muted'}`;
  if (audio.masterGain && audio.ctx) {
    audio.masterGain.gain.setValueAtTime(CONFIG.audioEnabled ? 0.3 : 0, audio.ctx.currentTime);
  }
});

// Particle Density toggle button
const btnDensity = document.getElementById('btn-density');
const densityLabel = document.getElementById('density-label');
const densities = [10000, 20000, 32000];
let densityIdx = 1;
btnDensity.addEventListener('click', () => {
  densityIdx = (densityIdx + 1) % densities.length;
  const newCount = densities[densityIdx];
  reinitParticles(newCount);
  densityLabel.textContent = `${newCount / 1000}K Particles`;
  showToast(`Particle Density set to ${newCount / 1000},000`);
});

function reinitParticles(newCount) {
  particleCount = newCount;
  particlePositions = new Float32Array(particleCount * 3);
  particleVelocities = new Float32Array(particleCount * 3);
  particleColors = new Float32Array(particleCount * 3);
  particlePhases = new Float32Array(particleCount);

  initParticles();
}

// ── Main Animation & Simulation Loop ──────────────────────────────────────────
const clock = new THREE.Clock();
const tempVec = new THREE.Vector3();
let frameCount = 0;
let lastFpsTime = performance.now();
const fpsCounter = document.getElementById('fps-counter');

function animate() {
  requestAnimationFrame(animate);

  const delta = Math.min(clock.getDelta(), 0.1);
  const time = clock.getElapsedTime();

  // FPS Counter
  frameCount++;
  const now = performance.now();
  if (now - lastFpsTime >= 500) {
    const fps = Math.round((frameCount * 1000) / (now - lastFpsTime));
    fpsCounter.textContent = `${fps} FPS`;
    frameCount = 0;
    lastFpsTime = now;
  }

  // 1. Update Core & Gyroscope Rings
  coreGroup.rotation.y = time * 0.3 * CONFIG.coreEnergy;
  coreCage.rotation.x = time * 0.4;
  coreCage.rotation.z = time * 0.3;
  const corePulse = 1.0 + Math.sin(time * 3.0) * 0.1 * CONFIG.coreEnergy;
  coreSphere.scale.set(corePulse, corePulse, corePulse);

  rings.forEach((r) => {
    r.mesh.rotation.z += r.speed * delta * CONFIG.coreEnergy;
  });

  // 2. Monolith Crystals Float & Glow
  monoliths.forEach((m) => {
    m.crystal.rotation.y += delta * 1.2;
    m.crystal.position.y = m.baseY + Math.sin(time * 2.0 + m.offset) * 0.8;
  });

  // 3. Shockwaves Expansion
  for (let s = shockwaves.length - 1; s >= 0; s--) {
    const sw = shockwaves[s];
    sw.radius += sw.speed * delta;
    if (sw.radius >= sw.maxRadius) {
      shockwaves.splice(s, 1);
    }
  }

  // 4. Update SmartFlow Particles with Vector Field
  const posArr = particleGeo.attributes.position.array;
  const speed = CONFIG.flowSpeed;

  for (let i = 0; i < particleCount; i++) {
    const i3 = i * 3;
    let px = posArr[i3];
    let py = posArr[i3 + 1];
    let pz = posArr[i3 + 2];

    // Evaluate vector field
    getVectorFieldVelocity(px, py, pz, time, tempVec);

    // Apply active gravitational vortex
    if (activeVortex) {
      const vx = activeVortex.pos.x - px;
      const vy = activeVortex.pos.y - py;
      const vz = activeVortex.pos.z - pz;
      const dist = Math.sqrt(vx * vx + vy * vy + vz * vz) + 0.5;
      if (dist < 40.0) {
        const pull = (activeVortex.strength / (dist * dist)) * 8.0;
        tempVec.x += (vx / dist) * pull;
        tempVec.y += (vy / dist) * pull;
        tempVec.z += (vz / dist) * pull;
      }
    }

    // Apply shockwaves
    for (let s = 0; s < shockwaves.length; s++) {
      const sw = shockwaves[s];
      const sx = px - sw.pos.x;
      const sy = py - sw.pos.y;
      const sz = pz - sw.pos.z;
      const dist = Math.sqrt(sx * sx + sy * sy + sz * sz);
      const ringDist = Math.abs(dist - sw.radius);
      if (ringDist < 4.0) {
        const blast = ((4.0 - ringDist) / 4.0) * 35.0;
        tempVec.x += (sx / (dist + 0.01)) * blast;
        tempVec.y += (sy / (dist + 0.01)) * blast + 5.0;
        tempVec.z += (sz / (dist + 0.01)) * blast;
      }
    }

    // Integrate position
    px += tempVec.x * delta;
    py += tempVec.y * delta;
    pz += tempVec.z * delta;

    // Reset boundary if particles drift too far or hit terrain
    const r2 = px * px + pz * pz;
    const terrainH = getTerrainHeight(px, pz);
    if (r2 > 75 * 75 || py > 45 || py < terrainH - 1.0) {
      const resetAngle = Math.random() * Math.PI * 2;
      const resetR = 5 + Math.random() * 20;
      px = Math.cos(resetAngle) * resetR;
      py = Math.random() * 10 + 2.0;
      pz = Math.sin(resetAngle) * resetR;
    }

    posArr[i3] = px;
    posArr[i3 + 1] = py;
    posArr[i3 + 2] = pz;
  }
  particleGeo.attributes.position.needsUpdate = true;

  // 5. Camera Control: 10s Cinematic vs Interactive
  if (cinematicActive) {
    cinematicTime += delta;
    const remaining = Math.max(0.0, DURATION - cinematicTime);
    updateCinematicHUD(remaining, cinematicTime);

    // Spline progress
    const t = Math.min(1.0, cinematicTime / DURATION);
    // Smooth easeInOutCubic
    const easeT = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

    const camPos = cameraSpline.getPoint(easeT);
    const lookPos = lookAtSpline.getPoint(easeT);

    camera.position.copy(camPos);
    camera.lookAt(lookPos);

    // Audio filter tracks camera speed/height
    audio.setFilterFreq(160 + easeT * 300);

    if (cinematicTime >= DURATION) {
      endCinematic(false);
    }
  } else {
    // Interactive Mode
    if (cameraMode === 'walk') {
      // Move in view direction
      const moveSpeed = (keys.shift ? 14.0 : 7.0) * delta;
      const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
      const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));

      const moveDir = new THREE.Vector3();
      if (keys.w) moveDir.add(forward);
      if (keys.s) moveDir.sub(forward);
      if (keys.d) moveDir.add(right);
      if (keys.a) moveDir.sub(right);

      if (moveDir.lengthSq() > 0) {
        moveDir.normalize().multiplyScalar(moveSpeed);
        playerPos.add(moveDir);
      }

      // Jump / Gravity
      if (keys.space && playerVel.y === 0) {
        playerVel.y = 9.0;
      }
      playerVel.y -= 22.0 * delta; // Gravity
      playerPos.y += playerVel.y * delta;

      // Ground collision
      const groundY = getTerrainHeight(playerPos.x, playerPos.z) + playerHeight;
      if (playerPos.y <= groundY) {
        playerPos.y = groundY;
        playerVel.y = 0;
      }

      // Set Camera Position & Rotation
      camera.position.copy(playerPos);
      const euler = new THREE.Euler(pitch, yaw, 0, 'YXZ');
      camera.quaternion.setFromEuler(euler);
    } else {
      // Orbit Mode
      const x = Math.sin(orbitTheta) * Math.cos(orbitPhi) * orbitRadius;
      const y = Math.sin(orbitPhi) * orbitRadius + 5;
      const z = Math.cos(orbitTheta) * Math.cos(orbitPhi) * orbitRadius;
      camera.position.set(x, y, z);
      camera.lookAt(0, 6, 0);
    }
  }

  renderer.render(scene, camera);
}

// ── Window Resize ─────────────────────────────────────────────────────────────
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Start loop
animate();
