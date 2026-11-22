import * as THREE from 'three';
import { ResourceRegistry } from './ResourceRegistry';
import { useUIStore } from '../store/uiStore';

export type WeatherType = 'clear' | 'fog' | 'rain' | 'snow' | 'storm';

export interface WeatherOptions {
  type: WeatherType;
  intensity?: number; // 0.0 to 1.0
  windSpeed?: number;  // -10 to +10
}

/**
 * Dynamic 3D Weather System for Orbis Studio
 * Features:
 * - Camera-relative wrapping particle buffers for rain and snow
 * - Dynamic wind drift slant and snow wobble
 * - Storm mode with procedural randomized lightning flashes
 * - Complete GPU resource disposal without memory leaks
 */
export class WeatherSystem {
  private scene: THREE.Scene;
  private registry?: ResourceRegistry;

  private weatherType: WeatherType = 'clear';
  private intensity: number = 0.75;
  private windSpeed: number = 2.0;

  // Particle systems
  private rainPoints: THREE.Points | null = null;
  private rainGeo: THREE.BufferGeometry | null = null;
  private rainMat: THREE.PointsMaterial | null = null;
  private rainPositions: Float32Array | null = null;
  private rainVelocities: Float32Array | null = null;
  private readonly rainCount = 2500;

  private snowPoints: THREE.Points | null = null;
  private snowGeo: THREE.BufferGeometry | null = null;
  private snowMat: THREE.PointsMaterial | null = null;
  private snowPositions: Float32Array | null = null;
  private snowVelocities: Float32Array | null = null;
  private snowSeeds: Float32Array | null = null;
  private readonly snowCount = 1800;

  // Storm lightning system
  private lightningLight: THREE.DirectionalLight | null = null;
  private lightningAmbientLight: THREE.AmbientLight | null = null;
  private lightningTimer = 5.0;
  private flashDuration = 0;
  private isFlashing = false;

  private totalTime = 0;
  private isDisposed = false;

  // Camera wrapping volume dimensions
  private readonly BOX_WIDTH = 80;
  private readonly BOX_HEIGHT = 45;
  private readonly BOX_DEPTH = 80;
  private readonly Y_BOTTOM_OFFSET = 15;
  private readonly Y_TOP_OFFSET = 30;

  constructor(scene: THREE.Scene, registry?: ResourceRegistry) {
    this.scene = scene;
    this.registry = registry;

    this.initRainParticles();
    this.initSnowParticles();
    this.initLightningLight();
    this.applyWeatherVisibility();
  }

  private initRainParticles(): void {
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(this.rainCount * 3);
    const velocities = new Float32Array(this.rainCount);

    for (let i = 0; i < this.rainCount; i++) {
      positions[i * 3] = (Math.random() - 0.5) * this.BOX_WIDTH;
      positions[i * 3 + 1] = Math.random() * this.BOX_HEIGHT - this.Y_BOTTOM_OFFSET;
      positions[i * 3 + 2] = (Math.random() - 0.5) * this.BOX_DEPTH;
      velocities[i] = 32 + Math.random() * 18; // 32 - 50 m/s
    }

    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color: 0x9bc5ff,
      size: 0.45,
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
    });

    const points = new THREE.Points(geo, mat);
    points.name = 'Weather_RainParticles';
    points.visible = false;

    this.scene.add(points);
    this.rainPoints = points;
    this.rainGeo = geo;
    this.rainMat = mat;
    this.rainPositions = positions;
    this.rainVelocities = velocities;

    if (this.registry) {
      this.registry.trackGeometry(geo);
      this.registry.trackMaterial(mat);
    }
  }

  private initSnowParticles(): void {
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(this.snowCount * 3);
    const velocities = new Float32Array(this.snowCount);
    const seeds = new Float32Array(this.snowCount);

    for (let i = 0; i < this.snowCount; i++) {
      positions[i * 3] = (Math.random() - 0.5) * this.BOX_WIDTH;
      positions[i * 3 + 1] = Math.random() * this.BOX_HEIGHT - this.Y_BOTTOM_OFFSET;
      positions[i * 3 + 2] = (Math.random() - 0.5) * this.BOX_DEPTH;
      velocities[i] = 3.5 + Math.random() * 3.0; // 3.5 - 6.5 m/s
      seeds[i] = Math.random() * 100;
    }

    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.65,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    });

    const points = new THREE.Points(geo, mat);
    points.name = 'Weather_SnowParticles';
    points.visible = false;

    this.scene.add(points);
    this.snowPoints = points;
    this.snowGeo = geo;
    this.snowMat = mat;
    this.snowPositions = positions;
    this.snowVelocities = velocities;
    this.snowSeeds = seeds;

    if (this.registry) {
      this.registry.trackGeometry(geo);
      this.registry.trackMaterial(mat);
    }
  }

  private initLightningLight(): void {
    const light = new THREE.DirectionalLight(0xd4eaff, 0);
    light.name = 'Weather_LightningLight';
    light.position.set(25, 80, 20);
    this.scene.add(light);
    this.lightningLight = light;

    const ambient = new THREE.AmbientLight(0xd4eaff, 0);
    ambient.name = 'Weather_LightningAmbientLight';
    this.scene.add(ambient);
    this.lightningAmbientLight = ambient;

    this.lightningTimer = 4.0 + Math.random() * 4.0;
  }

  public setWeather(type: WeatherType, options?: Partial<WeatherOptions>): void {
    this.weatherType = type;
    if (options?.intensity !== undefined) {
      this.intensity = Math.max(0, Math.min(1, options.intensity));
    }
    if (options?.windSpeed !== undefined) {
      this.windSpeed = Math.max(-10, Math.min(10, options.windSpeed));
    }

    this.applyWeatherVisibility();
  }

  public setIntensity(intensity: number): void {
    this.intensity = Math.max(0, Math.min(1, intensity));
    this.applyWeatherVisibility();
  }

  public setWindSpeed(windSpeed: number): void {
    this.windSpeed = Math.max(-10, Math.min(10, windSpeed));
  }

  private applyWeatherVisibility(): void {
    if (this.isDisposed) return;

    const isRain = this.weatherType === 'rain';
    const isSnow = this.weatherType === 'snow';
    const isStorm = this.weatherType === 'storm';

    if (this.rainPoints && this.rainMat) {
      this.rainPoints.visible = (isRain || isStorm) && this.intensity > 0.01;
      this.rainMat.opacity = isStorm
        ? Math.min(0.95, 0.45 + 0.4 * this.intensity)
        : 0.65 * this.intensity;
    }

    if (this.snowPoints && this.snowMat) {
      this.snowPoints.visible = isSnow && this.intensity > 0.01;
      this.snowMat.opacity = 0.85 * this.intensity;
    }

    if (!isStorm) {
      if (this.lightningLight) this.lightningLight.intensity = 0;
      if (this.lightningAmbientLight) this.lightningAmbientLight.intensity = 0;
      this.isFlashing = false;
    }
  }

  public triggerLightningFlash(): void {
    if (this.isDisposed || !this.lightningLight) return;
    this.isFlashing = true;
    this.flashDuration = 0.12; // 120ms flash
    this.lightningLight.intensity = 3.2 * this.intensity;
    if (this.lightningAmbientLight) {
      this.lightningAmbientLight.intensity = 1.6 * this.intensity;
    }

    try {
      useUIStore.getState().addIpcLog('[WEATHER:LIGHTNING] Procedural lightning strike discharged across overcast sky.', 'warn');
    } catch {
      // In tests or outside React/Zustand context
    }
  }

  public update(delta: number, cameraPosition: THREE.Vector3): void {
    if (this.isDisposed) return;

    // Guard against large frame deltas (e.g. background tab or paused debugger)
    const clampedDelta = Math.min(delta, 0.1);
    this.totalTime += clampedDelta;

    const isRainActive = (this.weatherType === 'rain' || this.weatherType === 'storm') && this.intensity > 0.01;
    const isSnowActive = this.weatherType === 'snow' && this.intensity > 0.01;

    // 1. Update Rain Particles
    if (isRainActive && this.rainPositions && this.rainVelocities && this.rainGeo) {
      const speedMultiplier = this.weatherType === 'storm' ? 1.4 : 1.0;
      const count = this.rainCount;
      const yBottom = cameraPosition.y - this.Y_BOTTOM_OFFSET;
      const yTop = cameraPosition.y + this.Y_TOP_OFFSET;
      const xMin = cameraPosition.x - this.BOX_WIDTH / 2;
      const xMax = cameraPosition.x + this.BOX_WIDTH / 2;
      const zMin = cameraPosition.z - this.BOX_DEPTH / 2;
      const zMax = cameraPosition.z + this.BOX_DEPTH / 2;

      for (let i = 0; i < count; i++) {
        const idx = i * 3;
        // Fall down along -Y
        this.rainPositions[idx + 1] -= this.rainVelocities[i] * speedMultiplier * this.intensity * clampedDelta;
        // Drift along X with windSpeed
        this.rainPositions[idx] += this.windSpeed * 2.8 * clampedDelta;

        // Wrap vertically relative to camera
        if (this.rainPositions[idx + 1] < yBottom) {
          this.rainPositions[idx + 1] = yTop - Math.random() * 3;
          this.rainPositions[idx] = cameraPosition.x + (Math.random() - 0.5) * this.BOX_WIDTH;
          this.rainPositions[idx + 2] = cameraPosition.z + (Math.random() - 0.5) * this.BOX_DEPTH;
        } else if (this.rainPositions[idx + 1] > yTop) {
          this.rainPositions[idx + 1] = yBottom + Math.random() * 3;
          this.rainPositions[idx] = cameraPosition.x + (Math.random() - 0.5) * this.BOX_WIDTH;
          this.rainPositions[idx + 2] = cameraPosition.z + (Math.random() - 0.5) * this.BOX_DEPTH;
        }

        // Wrap horizontally around camera box (supports arbitrary camera jumps/teleports in a single frame)
        while (this.rainPositions[idx] < xMin) this.rainPositions[idx] += this.BOX_WIDTH;
        while (this.rainPositions[idx] > xMax) this.rainPositions[idx] -= this.BOX_WIDTH;

        while (this.rainPositions[idx + 2] < zMin) this.rainPositions[idx + 2] += this.BOX_DEPTH;
        while (this.rainPositions[idx + 2] > zMax) this.rainPositions[idx + 2] -= this.BOX_DEPTH;
      }

      this.rainGeo.attributes.position.needsUpdate = true;
    }

    // 2. Update Snow Particles
    if (isSnowActive && this.snowPositions && this.snowVelocities && this.snowSeeds && this.snowGeo) {
      const count = this.snowCount;
      const yBottom = cameraPosition.y - this.Y_BOTTOM_OFFSET;
      const yTop = cameraPosition.y + this.Y_TOP_OFFSET;
      const xMin = cameraPosition.x - this.BOX_WIDTH / 2;
      const xMax = cameraPosition.x + this.BOX_WIDTH / 2;
      const zMin = cameraPosition.z - this.BOX_DEPTH / 2;
      const zMax = cameraPosition.z + this.BOX_DEPTH / 2;

      for (let i = 0; i < count; i++) {
        const idx = i * 3;
        const seed = this.snowSeeds[i];
        const wobbleX = Math.sin(this.totalTime * 2.2 + seed) * 1.4;
        const wobbleZ = Math.cos(this.totalTime * 1.7 + seed) * 0.9;

        this.snowPositions[idx + 1] -= this.snowVelocities[i] * this.intensity * clampedDelta;
        this.snowPositions[idx] += (this.windSpeed * 0.75 + wobbleX) * clampedDelta;
        this.snowPositions[idx + 2] += wobbleZ * clampedDelta;

        if (this.snowPositions[idx + 1] < yBottom) {
          this.snowPositions[idx + 1] = yTop - Math.random() * 3;
          this.snowPositions[idx] = cameraPosition.x + (Math.random() - 0.5) * this.BOX_WIDTH;
          this.snowPositions[idx + 2] = cameraPosition.z + (Math.random() - 0.5) * this.BOX_DEPTH;
        } else if (this.snowPositions[idx + 1] > yTop) {
          this.snowPositions[idx + 1] = yBottom + Math.random() * 3;
          this.snowPositions[idx] = cameraPosition.x + (Math.random() - 0.5) * this.BOX_WIDTH;
          this.snowPositions[idx + 2] = cameraPosition.z + (Math.random() - 0.5) * this.BOX_DEPTH;
        }

        while (this.snowPositions[idx] < xMin) this.snowPositions[idx] += this.BOX_WIDTH;
        while (this.snowPositions[idx] > xMax) this.snowPositions[idx] -= this.BOX_WIDTH;

        while (this.snowPositions[idx + 2] < zMin) this.snowPositions[idx + 2] += this.BOX_DEPTH;
        while (this.snowPositions[idx + 2] > zMax) this.snowPositions[idx + 2] -= this.BOX_DEPTH;
      }

      this.snowGeo.attributes.position.needsUpdate = true;
    }

    // 3. Storm Lightning Simulation
    if (this.weatherType === 'storm') {
      this.lightningTimer -= clampedDelta;
      if (this.lightningTimer <= 0) {
        this.triggerLightningFlash();
        this.lightningTimer = 4.0 + Math.random() * 5.5; // Next flash in 4 - 9.5s
      }

      if (this.isFlashing && this.lightningLight) {
        this.flashDuration -= clampedDelta;
        if (this.flashDuration <= 0) {
          this.isFlashing = false;
          this.lightningLight.intensity = 0;
          if (this.lightningAmbientLight) this.lightningAmbientLight.intensity = 0;
        } else {
          const decay = Math.max(0, this.flashDuration / 0.12);
          this.lightningLight.intensity = decay * 3.2 * this.intensity;
          if (this.lightningAmbientLight) {
            this.lightningAmbientLight.intensity = decay * 1.6 * this.intensity;
          }
        }
      }
    }
  }

  public getWeather(): WeatherType {
    return this.weatherType;
  }

  public getIntensity(): number {
    return this.intensity;
  }

  public getWindSpeed(): number {
    return this.windSpeed;
  }

  public isFlashingLightning(): boolean {
    return this.isFlashing;
  }

  public getParticleCounts(): { rain: number; snow: number } {
    return {
      rain: this.rainCount,
      snow: this.snowCount,
    };
  }

  public getRainPoints(): THREE.Points | null {
    return this.rainPoints;
  }

  public getSnowPoints(): THREE.Points | null {
    return this.snowPoints;
  }

  public getLightningLight(): THREE.DirectionalLight | null {
    return this.lightningLight;
  }

  public getLightningAmbientLight(): THREE.AmbientLight | null {
    return this.lightningAmbientLight;
  }

  public dispose(): void {
    if (this.isDisposed) return;
    this.isDisposed = true;

    if (this.rainPoints) {
      this.scene.remove(this.rainPoints);
      this.rainPoints = null;
    }
    if (this.rainGeo) {
      this.rainGeo.dispose();
      this.rainGeo = null;
    }
    if (this.rainMat) {
      this.rainMat.dispose();
      this.rainMat = null;
    }
    this.rainPositions = null;
    this.rainVelocities = null;

    if (this.snowPoints) {
      this.scene.remove(this.snowPoints);
      this.snowPoints = null;
    }
    if (this.snowGeo) {
      this.snowGeo.dispose();
      this.snowGeo = null;
    }
    if (this.snowMat) {
      this.snowMat.dispose();
      this.snowMat = null;
    }
    this.snowPositions = null;
    this.snowVelocities = null;
    this.snowSeeds = null;

    if (this.lightningLight) {
      this.scene.remove(this.lightningLight);
      this.lightningLight.dispose();
      this.lightningLight = null;
    }

    if (this.lightningAmbientLight) {
      this.scene.remove(this.lightningAmbientLight);
      this.lightningAmbientLight.dispose();
      this.lightningAmbientLight = null;
    }
  }
}
