import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  findBone,
  clipRank,
  CLIP_ORDER,
  sharedClipsFor,
  type RawClip,
} from '../src/renderer/engine/NPCSystem';

describe('Animation Retargeting (Polyfork Mixamo Pipeline)', () => {
  it('correctly ranks animation clips according to CLIP_ORDER', () => {
    expect(CLIP_ORDER).toEqual(['Idle', 'Walk', 'Run', 'Agree', 'Head shake']);
    expect(clipRank('Idle')).toBe(0);
    expect(clipRank('Walk')).toBe(1);
    expect(clipRank('Run')).toBe(2);
    expect(clipRank('Agree')).toBe(3);
    expect(clipRank('Head shake')).toBe(4);
    expect(clipRank('Dance')).toBe(5); // Non-standard clip ranks after standard
  });

  it('finds bones matching exact names and GLTFLoader duplicate suffixes, prioritizing exact matches', () => {
    const root = new THREE.Group();
    const hip = new THREE.Bone();
    hip.name = 'Hips';

    // Suffix match for LeftArm
    const leftArm = new THREE.Bone();
    leftArm.name = 'LeftArm_1'; // duplicate suffix
    hip.add(leftArm);

    // Both exact and non-numeric prefix for LeftHand
    const handIndex = new THREE.Bone();
    handIndex.name = 'LeftHand_Index';
    const handExact = new THREE.Bone();
    handExact.name = 'LeftHand';
    hip.add(handIndex, handExact);

    root.add(hip);

    expect(findBone(root, 'Hips')).toBe(hip);
    expect(findBone(root, 'LeftArm')).toBe(leftArm);
    expect(findBone(root, 'LeftHand')).toBe(handExact); // exact match preferred over LeftHand_Index
    expect(findBone(root, 'RightArm')).toBeNull();
  });

  it('returns empty array when model lacks Mixamo bone hierarchy', async () => {
    const unriggedGroup = new THREE.Group();
    unriggedGroup.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()));

    const clips = await sharedClipsFor(unriggedGroup);
    expect(clips).toEqual([]);
  });

  it('retargets raw clips onto Mixamo skeleton with hip travel scaling', async () => {
    // Build test Mixamo hierarchy
    const root = new THREE.Group();
    const hips = new THREE.Bone();
    hips.name = 'Hips';
    hips.position.set(0, 0.95, 0); // standard 0.95m hip height

    const leftLeg = new THREE.Bone();
    leftLeg.name = 'LeftUpLeg';

    const rightLeg = new THREE.Bone();
    rightLeg.name = 'RightUpLeg';

    const leftArm = new THREE.Bone();
    leftArm.name = 'LeftArm';

    const rightArm = new THREE.Bone();
    rightArm.name = 'RightArm';

    hips.add(leftLeg, rightLeg, leftArm, rightArm);
    root.add(hips);

    const mockRawClips: Record<string, RawClip> = {
      Walk: {
        times: [0, 0.5, 1.0],
        tracks: {
          Hips: [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1],
          LeftUpLeg: [0.1, 0, 0, 0.99, 0.2, 0, 0, 0.98, 0.1, 0, 0, 0.99],
        },
        hips: [0, 0, 0, 0, 0.05, 0.2, 0, 0, 0.4],
      },
      Idle: {
        times: [0, 1.0],
        tracks: {
          Hips: [0, 0, 0, 1, 0, 0, 0, 1],
        },
        hips: [0, 0, 0, 0, 0, 0],
      },
    };

    const clips = await sharedClipsFor(root, async () => mockRawClips);

    expect(clips.length).toBe(2);
    // Ordered with Idle first, then Walk
    expect(clips[0].name).toBe('Idle');
    expect(clips[1].name).toBe('Walk');

    // Walk clip tracks inspection
    const walkClip = clips[1];
    expect(walkClip.tracks.length).toBeGreaterThan(0);

    // Hips position track exists and is VectorKeyframeTrack
    const hipPosTrack = walkClip.tracks.find((t) => t.name.endsWith('.position'));
    expect(hipPosTrack).toBeDefined();
    expect(hipPosTrack).toBeInstanceOf(THREE.VectorKeyframeTrack);

    // Bone rotation tracks are QuaternionKeyframeTrack
    const quatTracks = walkClip.tracks.filter((t) => t.name.endsWith('.quaternion'));
    expect(quatTracks.length).toBe(2); // Hips + LeftUpLeg
    expect(quatTracks[0]).toBeInstanceOf(THREE.QuaternionKeyframeTrack);
  });
});
