import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { useUIStore } from '../src/renderer/store/uiStore';
import { useWorldStore } from '../src/renderer/store/worldStore';
import { WeatherSystem } from '../src/renderer/engine/WeatherSystem';
import { ResourceRegistry } from '../src/renderer/engine/ResourceRegistry';
import type { SceneGraph } from '../src/shared/schema/sceneGraph.schema';

describe('Weather and Celestial Controls (Store & Engine)', () => {
  beforeEach(() => {
    useUIStore.setState({
      isNight: false,
      weather: {
        type: 'clear',
        intensity: 0.75,
        windSpeed: 2.0,
      },
      sunlight: {
        elevation: 45,
        azimuth: 135,
        intensity: 1.35,
        color: '#fff8e8',
      },
      moonlight: {
        elevation: 55,
        azimuth: 315,
        intensity: 0.25,
        color: '#8ba2cc',
        starDensity: 0.85,
      },
      tuningParams: {
        elevation: 12.0,
        density: 65,
        fogDensity: 0.015,
        sunAngle: 45,
        roughness: 0.68,
        metalness: 0.10,
        castShadow: true,
      },
      notifications: [],
      ipcLogs: [],
    });

    useWorldStore.setState({
      sceneGraph: null,
    });
  });

  describe('UIStore Celestial & Weather Actions', () => {
    it('has correct initial default state for weather, sunlight, and moonlight', () => {
      const state = useUIStore.getState();

      expect(state.weather.type).toBe('clear');
      expect(state.weather.intensity).toBe(0.75);
      expect(state.weather.windSpeed).toBe(2.0);

      expect(state.sunlight.elevation).toBe(45);
      expect(state.sunlight.azimuth).toBe(135);
      expect(state.sunlight.intensity).toBe(1.35);
      expect(state.sunlight.color).toBe('#fff8e8');

      expect(state.moonlight.elevation).toBe(55);
      expect(state.moonlight.azimuth).toBe(315);
      expect(state.moonlight.intensity).toBe(0.25);
      expect(state.moonlight.color).toBe('#8ba2cc');
      expect(state.moonlight.starDensity).toBe(0.85);
    });

    it('setWeather updates weather type, adds notification and ipcLog', () => {
      const store = useUIStore.getState();
      store.setWeather('rain');

      const updated = useUIStore.getState();
      expect(updated.weather.type).toBe('rain');
      expect(updated.notifications.some((n) => n.message.includes('Rain'))).toBe(true);
      expect(updated.ipcLogs.some((l) => l.text.includes('[WEATHER:CHANGE]') && l.text.includes('rain'))).toBe(true);
    });

    it('setWeather synchronizes with active sceneGraph in worldStore', () => {
      const mockGraph: SceneGraph = {
        version: '1.0',
        world: {
          name: 'Highland Storm Test',
          description: 'Testing weather sync',
          biome: 'forest',
          timeOfDay: 'afternoon',
          weather: 'clear',
          scale: 'medium',
        },
        player: { spawn: [0, 2, 0], movementSpeed: 4, jumpHeight: 1.5 },
        zones: [],
        characters: [],
        objects: [],
        lights: [],
        events: [],
        skybox: { type: 'gradient' },
        atmosphere: { fogDensity: 0.015, fogColor: '#1a1a2e', ambientIntensity: 0.5, sunColor: '#fff4e0' },
        flags: {},
      };

      useWorldStore.getState().setSceneGraph(mockGraph);
      expect(useWorldStore.getState().sceneGraph?.world.weather).toBe('clear');

      useUIStore.getState().setWeather('storm');
      expect(useWorldStore.getState().sceneGraph?.world.weather).toBe('storm');
    });

    it('setWeatherIntensity clamps within [0, 1]', () => {
      const store = useUIStore.getState();

      store.setWeatherIntensity(0.5);
      expect(useUIStore.getState().weather.intensity).toBe(0.5);

      store.setWeatherIntensity(1.5);
      expect(useUIStore.getState().weather.intensity).toBe(1.0);

      store.setWeatherIntensity(-0.3);
      expect(useUIStore.getState().weather.intensity).toBe(0.0);
    });

    it('setWindSpeed clamps within [-10, 10]', () => {
      const store = useUIStore.getState();

      store.setWindSpeed(4.5);
      expect(useUIStore.getState().weather.windSpeed).toBe(4.5);

      store.setWindSpeed(15);
      expect(useUIStore.getState().weather.windSpeed).toBe(10);

      store.setWindSpeed(-20);
      expect(useUIStore.getState().weather.windSpeed).toBe(-10);
    });

    it('setSunlight updates partial parameters and synchronizes legacy sunAngle', () => {
      const store = useUIStore.getState();

      store.setSunlight({ elevation: 62, azimuth: 210, intensity: 2.1 });
      const updated = useUIStore.getState();

      expect(updated.sunlight.elevation).toBe(62);
      expect(updated.sunlight.azimuth).toBe(210);
      expect(updated.sunlight.intensity).toBe(2.1);
      expect(updated.sunlight.color).toBe('#fff8e8'); // unchanged
      expect(updated.tuningParams.sunAngle).toBe(62); // legacy 1D slider synchronized
    });

    it('setSunlight clamps elevation, azimuth, and intensity to safe ranges', () => {
      const store = useUIStore.getState();

      // Lower clamp
      store.setSunlight({ elevation: -20, intensity: -5, azimuth: -30 });
      let state = useUIStore.getState();
      expect(state.sunlight.elevation).toBe(5);
      expect(state.sunlight.intensity).toBe(0.1);
      expect(state.sunlight.azimuth).toBe(330);

      // Upper clamp
      store.setSunlight({ elevation: 150, intensity: 10, azimuth: 400 });
      state = useUIStore.getState();
      expect(state.sunlight.elevation).toBe(90);
      expect(state.sunlight.intensity).toBe(3.0);
      expect(state.sunlight.azimuth).toBe(40);
    });

    it('setMoonlight updates partial parameters', () => {
      const store = useUIStore.getState();

      store.setMoonlight({ elevation: 70, color: '#ef4444', starDensity: 0.9 });
      const updated = useUIStore.getState();

      expect(updated.moonlight.elevation).toBe(70);
      expect(updated.moonlight.color).toBe('#ef4444');
      expect(updated.moonlight.starDensity).toBe(0.9);
      expect(updated.moonlight.intensity).toBe(0.25); // unchanged
      expect(updated.moonlight.azimuth).toBe(315); // unchanged
    });

    it('setMoonlight clamps elevation, azimuth, intensity, and starDensity to safe ranges', () => {
      const store = useUIStore.getState();

      // Lower clamp
      store.setMoonlight({ elevation: 1, intensity: -1, starDensity: -0.5, azimuth: -90 });
      let state = useUIStore.getState();
      expect(state.moonlight.elevation).toBe(5);
      expect(state.moonlight.intensity).toBe(0.05);
      expect(state.moonlight.starDensity).toBe(0);
      expect(state.moonlight.azimuth).toBe(270);

      // Upper clamp
      store.setMoonlight({ elevation: 120, intensity: 5.0, starDensity: 2.5, azimuth: 450 });
      state = useUIStore.getState();
      expect(state.moonlight.elevation).toBe(90);
      expect(state.moonlight.intensity).toBe(1.5);
      expect(state.moonlight.starDensity).toBe(1.0);
      expect(state.moonlight.azimuth).toBe(90);
    });

    it('setSceneGraph in worldStore synchronizes weather, timeOfDay, sunColor, and fogDensity back to uiStore', () => {
      const customWorldGraph: SceneGraph = {
        version: '1.0',
        world: {
          name: 'Alpine Blizzard World',
          description: 'Loaded from library or prompt',
          biome: 'tundra',
          timeOfDay: 'night',
          weather: 'snow',
          scale: 'large',
        },
        player: { spawn: [10, 5, 20], movementSpeed: 4, jumpHeight: 1.5 },
        zones: [],
        characters: [],
        objects: [],
        lights: [],
        events: [],
        skybox: { type: 'gradient' },
        atmosphere: {
          fogDensity: 0.038,
          fogColor: '#0a0d18',
          ambientIntensity: 0.4,
          sunColor: '#ff7040',
        },
        flags: {},
      };

      // Set worldStore sceneGraph
      useWorldStore.getState().setSceneGraph(customWorldGraph);

      const uiState = useUIStore.getState();
      expect(uiState.weather.type).toBe('snow');
      expect(uiState.isNight).toBe(true);
      expect(uiState.sunlight.color).toBe('#ff7040');
      expect(uiState.tuningParams.fogDensity).toBe(0.038);
    });

    it('applyAtmosphericPreset sets bundled environmental configurations', () => {
      const mockGraph: SceneGraph = {
        version: '1.0',
        world: {
          name: 'Atmospheric Preset Test',
          description: 'Testing presets',
          biome: 'forest',
          timeOfDay: 'afternoon',
          weather: 'clear',
          scale: 'medium',
        },
        player: { spawn: [0, 2, 0], movementSpeed: 4, jumpHeight: 1.5 },
        zones: [],
        characters: [],
        objects: [],
        lights: [],
        events: [],
        skybox: { type: 'gradient' },
        atmosphere: { fogDensity: 0.015, fogColor: '#1a1a2e', ambientIntensity: 0.5, sunColor: '#fff4e0' },
        flags: {},
      };
      useWorldStore.getState().setSceneGraph(mockGraph);

      const store = useUIStore.getState();

      // 1. Golden Sunset
      store.applyAtmosphericPreset('Golden Sunset');
      let state = useUIStore.getState();
      expect(state.isNight).toBe(false);
      expect(state.sunlight.color).toBe('#f59e0b');
      expect(state.sunlight.elevation).toBe(15);
      expect(state.weather.type).toBe('clear');
      expect(useWorldStore.getState().sceneGraph?.world.timeOfDay).toBe('afternoon');
      expect(useWorldStore.getState().sceneGraph?.atmosphere.sunColor).toBe('#f59e0b');

      // 2. Stormy Night
      store.applyAtmosphericPreset('Stormy Night');
      state = useUIStore.getState();
      expect(state.isNight).toBe(true);
      expect(state.weather.type).toBe('storm');
      expect(state.weather.windSpeed).toBe(7.5);
      expect(useWorldStore.getState().sceneGraph?.world.weather).toBe('storm');
      expect(useWorldStore.getState().sceneGraph?.world.timeOfDay).toBe('night');

      // 3. Winter Blizzard
      store.applyAtmosphericPreset('Winter Blizzard');
      state = useUIStore.getState();
      expect(state.weather.type).toBe('snow');
      expect(state.weather.windSpeed).toBe(6.0);
      expect(useWorldStore.getState().sceneGraph?.world.weather).toBe('snow');

      // 4. Misty Morning
      store.applyAtmosphericPreset('Misty Morning');
      state = useUIStore.getState();
      expect(state.isNight).toBe(false);
      expect(state.weather.type).toBe('fog');
      expect(state.tuningParams.fogDensity).toBe(0.035);

      // 5. Midnight Stars
      store.applyAtmosphericPreset('midnight_stars');
      state = useUIStore.getState();
      expect(state.isNight).toBe(true);
      expect(state.moonlight.starDensity).toBe(1.0);
    });
  });

  describe('WeatherSystem 3D Particle & Lightning Engine', () => {
    let scene: THREE.Scene;
    let registry: ResourceRegistry;
    let weatherSystem: WeatherSystem;

    beforeEach(() => {
      scene = new THREE.Scene();
      registry = new ResourceRegistry();
      weatherSystem = new WeatherSystem(scene, registry);
    });

    afterEach(() => {
      weatherSystem.dispose();
      registry.disposeAll();
    });

    it('initializes rain, snow, and lightning systems with correct particle counts and resources', () => {
      const counts = weatherSystem.getParticleCounts();
      expect(counts.rain).toBe(2500);
      expect(counts.snow).toBe(1800);

      const rain = weatherSystem.getRainPoints();
      const snow = weatherSystem.getSnowPoints();
      const lightning = weatherSystem.getLightningLight();

      expect(rain).toBeDefined();
      expect(snow).toBeDefined();
      expect(lightning).toBeDefined();

      expect(scene.children).toContain(rain);
      expect(scene.children).toContain(snow);
      expect(scene.children).toContain(lightning);

      // Registry tracks geometries and materials
      expect(registry.stats.geometries).toBeGreaterThanOrEqual(2);
      expect(registry.stats.materials).toBeGreaterThanOrEqual(2);
    });

    it('toggles particle visibility according to weather mode', () => {
      const rain = weatherSystem.getRainPoints()!;
      const snow = weatherSystem.getSnowPoints()!;

      // Default 'clear'
      expect(weatherSystem.getWeather()).toBe('clear');
      expect(rain.visible).toBe(false);
      expect(snow.visible).toBe(false);

      // 'rain'
      weatherSystem.setWeather('rain');
      expect(rain.visible).toBe(true);
      expect(snow.visible).toBe(false);

      // 'snow'
      weatherSystem.setWeather('snow');
      expect(rain.visible).toBe(false);
      expect(snow.visible).toBe(true);

      // 'fog'
      weatherSystem.setWeather('fog');
      expect(rain.visible).toBe(false);
      expect(snow.visible).toBe(false);

      // 'storm'
      weatherSystem.setWeather('storm');
      expect(rain.visible).toBe(true);
      expect(snow.visible).toBe(false);
    });

    it('update loop advances particles and wraps relative to camera position', () => {
      weatherSystem.setWeather('rain', { intensity: 1.0, windSpeed: 2.0 });
      const rain = weatherSystem.getRainPoints()!;
      const posAttr = rain.geometry.getAttribute('position') as THREE.BufferAttribute;
      const initialY = posAttr.getY(0);

      const cameraPos = new THREE.Vector3(10, 20, 10);
      // Advance by 0.05 seconds
      weatherSystem.update(0.05, cameraPos);

      const updatedY = posAttr.getY(0);
      // Particle should have moved down (or wrapped)
      expect(updatedY).not.toBe(initialY);

      // Test wrapping: force particle below camera bottom bound
      posAttr.setY(0, cameraPos.y - 20); // bottom threshold is cameraPos.y - 15
      weatherSystem.update(0.016, cameraPos);

      const wrappedY = posAttr.getY(0);
      // Should wrap back up to cameraPos.y + 30 range
      expect(wrappedY).toBeGreaterThanOrEqual(cameraPos.y);

      // Test downward wrapping: force particle above camera top bound
      posAttr.setY(0, cameraPos.y + 40); // top threshold is cameraPos.y + 30
      weatherSystem.update(0.016, cameraPos);
      const wrappedDownY = posAttr.getY(0);
      expect(wrappedDownY).toBeLessThanOrEqual(cameraPos.y + 5);
    });

    it('wraps particles immediately when camera teleports across long distances (>80m)', () => {
      weatherSystem.setWeather('rain', { intensity: 1.0, windSpeed: 0 });
      const rain = weatherSystem.getRainPoints()!;
      const posAttr = rain.geometry.getAttribute('position') as THREE.BufferAttribute;

      // Teleport camera 350 meters in X and 450 meters in Z
      const teleportPos = new THREE.Vector3(350, 15, 450);
      weatherSystem.update(0.016, teleportPos);

      // Check first 100 particles are all inside the 80x80 camera box in a single frame
      for (let i = 0; i < 100; i++) {
        const x = posAttr.getX(i);
        const z = posAttr.getZ(i);
        expect(x).toBeGreaterThanOrEqual(teleportPos.x - 40.5);
        expect(x).toBeLessThanOrEqual(teleportPos.x + 40.5);
        expect(z).toBeGreaterThanOrEqual(teleportPos.z - 40.5);
        expect(z).toBeLessThanOrEqual(teleportPos.z + 40.5);
      }
    });

    it('supports snow update with horizontal sinusoidal wobble', () => {
      weatherSystem.setWeather('snow', { intensity: 0.8, windSpeed: 1.5 });
      const snow = weatherSystem.getSnowPoints()!;
      const posAttr = snow.geometry.getAttribute('position') as THREE.BufferAttribute;
      const initialX = posAttr.getX(0);

      const cameraPos = new THREE.Vector3(0, 10, 0);
      weatherSystem.update(0.05, cameraPos);

      const updatedX = posAttr.getX(0);
      expect(updatedX).not.toBe(initialX);
    });

    it('triggers and decays procedural lightning flash in storm weather', () => {
      weatherSystem.setWeather('storm');
      const lightning = weatherSystem.getLightningLight()!;
      const ambientLightning = weatherSystem.getLightningAmbientLight()!;

      expect(weatherSystem.isFlashingLightning()).toBe(false);
      expect(lightning.intensity).toBe(0);
      expect(ambientLightning.intensity).toBe(0);

      // Explicitly trigger flash
      weatherSystem.triggerLightningFlash();
      expect(weatherSystem.isFlashingLightning()).toBe(true);
      expect(lightning.intensity).toBeGreaterThan(1.0);
      expect(ambientLightning.intensity).toBeGreaterThan(0.5);

      // Update to advance flash decay (flash duration is 0.12s)
      weatherSystem.update(0.06, new THREE.Vector3());
      expect(lightning.intensity).toBeGreaterThan(0);
      expect(ambientLightning.intensity).toBeGreaterThan(0);
      expect(lightning.intensity).toBeLessThan(3.5);

      // Advance past 0.12s
      weatherSystem.update(0.08, new THREE.Vector3());
      expect(weatherSystem.isFlashingLightning()).toBe(false);
      expect(lightning.intensity).toBe(0);
      expect(ambientLightning.intensity).toBe(0);
    });

    it('scales storm rain opacity dynamically with weather intensity', () => {
      weatherSystem.setWeather('storm', { intensity: 0.2 });
      const rainMatLow = weatherSystem.getRainPoints()!.material as THREE.PointsMaterial;
      const opacityLow = rainMatLow.opacity;

      weatherSystem.setWeather('storm', { intensity: 1.0 });
      const rainMatHigh = weatherSystem.getRainPoints()!.material as THREE.PointsMaterial;
      const opacityHigh = rainMatHigh.opacity;

      expect(opacityHigh).toBeGreaterThan(opacityLow);
    });

    it('cleans up and disposes all GPU resources on dispose without throwing', () => {
      const rain = weatherSystem.getRainPoints()!;
      const snow = weatherSystem.getSnowPoints()!;
      const lightning = weatherSystem.getLightningLight()!;
      const ambientLightning = weatherSystem.getLightningAmbientLight()!;

      expect(scene.children).toContain(rain);
      expect(scene.children).toContain(snow);
      expect(scene.children).toContain(lightning);
      expect(scene.children).toContain(ambientLightning);

      weatherSystem.dispose();

      expect(scene.children).not.toContain(rain);
      expect(scene.children).not.toContain(snow);
      expect(scene.children).not.toContain(lightning);
      expect(scene.children).not.toContain(ambientLightning);

      // Multiple calls to dispose are idempotent
      expect(() => weatherSystem.dispose()).not.toThrow();
    });
  });
});
