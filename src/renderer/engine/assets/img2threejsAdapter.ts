import * as THREE from 'three';

/**
 * Attempts to convert an image to 3D geometry via img2threejs.
 * Falls back to a capsule humanoid shape if the library is unavailable or fails.
 */
export async function imageToGeometry(_imagePath: string): Promise<THREE.BufferGeometry> {
  try {
    // img2threejs integration point — when the library is installed and working,
    // import and call it here. For now, return fallback.
    console.warn('[img2threejsAdapter] Library not yet integrated, using fallback geometry');
    return new THREE.CapsuleGeometry(0.35, 1.0, 8, 16);
  } catch (err) {
    console.warn('[img2threejsAdapter] Conversion failed, using fallback:', err);
    return new THREE.CapsuleGeometry(0.35, 1.0, 8, 16);
  }
}
