import { describe, it, expect, beforeEach } from 'vitest';
import { useUIStore } from '../src/renderer/store/uiStore';
import { useWorldStore } from '../src/renderer/store/worldStore';
import type { SceneGraph } from '../src/shared/schema/sceneGraph.schema';

describe('Day / Night Shift and Default Sun Controls', () => {
  beforeEach(() => {
    useUIStore.setState({
      isNight: false,
      notifications: [],
      ipcLogs: [],
    });
    useWorldStore.setState({
      sceneGraph: null,
    });
  });

  it('starts in Day mode with isNight = false', () => {
    const store = useUIStore.getState();
    expect(store.isNight).toBe(false);
  });

  it('toggles to Night mode and back with toggleDayNight', () => {
    const store = useUIStore.getState();
    store.toggleDayNight();
    expect(useUIStore.getState().isNight).toBe(true);
    expect(useUIStore.getState().notifications.some((n) => n.message.includes('Night mode'))).toBe(true);

    store.toggleDayNight();
    expect(useUIStore.getState().isNight).toBe(false);
    expect(useUIStore.getState().notifications.some((n) => n.message.includes('Day mode'))).toBe(true);
  });

  it('syncs sceneGraph.world.timeOfDay when toggling day and night', () => {
    const mockGraph: SceneGraph = {
      version: '1.0',
      world: {
        name: 'Alpine Trench Test',
        description: 'Testing day night shift',
        biome: 'desert',
        timeOfDay: 'afternoon',
        weather: 'clear',
        scale: 'large',
      },
      player: {
        spawn: [0, 8, 30],
        movementSpeed: 4,
        jumpHeight: 1.5,
      },
      zones: [],
      characters: [],
      objects: [],
      lights: [],
      events: [],
      skybox: { type: 'gradient' },
      atmosphere: {
        fogDensity: 0.015,
        fogColor: '#1a1a2e',
        ambientIntensity: 0.5,
        sunColor: '#fff4e0',
      },
      flags: {},
    };

    useWorldStore.getState().setSceneGraph(mockGraph);
    expect(useWorldStore.getState().sceneGraph?.world.timeOfDay).toBe('afternoon');

    // Shift to Night
    useUIStore.getState().toggleDayNight();
    expect(useUIStore.getState().isNight).toBe(true);
    expect(useWorldStore.getState().sceneGraph?.world.timeOfDay).toBe('night');

    // Shift back to Day
    useUIStore.getState().toggleDayNight();
    expect(useUIStore.getState().isNight).toBe(false);
    expect(useWorldStore.getState().sceneGraph?.world.timeOfDay).toBe('afternoon');
  });

  it('supports explicit setIsNight setter', () => {
    useUIStore.getState().setIsNight(true);
    expect(useUIStore.getState().isNight).toBe(true);

    useUIStore.getState().setIsNight(false);
    expect(useUIStore.getState().isNight).toBe(false);
  });
});
