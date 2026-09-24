import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

const PLAYER_HEIGHT = 1.7; // metres
const WALK_SPEED = 4.0; // m/s
const SPRINT_SPEED = 8.0; // m/s
const GRAVITY = 9.8; // m/s²
const STEP_HEIGHT = 0.4; // max step the player can climb
const COLLIDE_RADIUS = 0.4; // collision probe distance

interface MovementKeys {
  forward: boolean;
  backward: boolean;
  left: boolean;
  right: boolean;
  sprint: boolean;
}

/**
 * First-person player controller using PointerLockControls.
 * Frame-rate independent movement, downward raycast gravity,
 * and 6-directional collision probing.
 */
export class PlayerController {
  private controls: PointerLockControls;
  private keys: MovementKeys = {
    forward: false,
    backward: false,
    left: false,
    right: false,
    sprint: false,
  };
  private verticalSpeed = 0;
  private isGrounded = false;
  private raycasterDown = new THREE.Raycaster();
  private raycasterSide = new THREE.Raycaster();
  private collidables: THREE.Object3D[] = [];
  private enabled = true;

  // 6 horizontal probe directions for collision
  private readonly probeDirections = [
    new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(-1, 0, 0),
    new THREE.Vector3(0, 0, 1),
    new THREE.Vector3(0, 0, -1),
    new THREE.Vector3(0.707, 0, 0.707),
    new THREE.Vector3(-0.707, 0, 0.707),
  ];

  private readonly _scratchProbe = new THREE.Vector3();
  private readonly _scratchMoveDir = new THREE.Vector3();
  private readonly _scratchRayDownPos = new THREE.Vector3();
  private readonly _scratchRayDownDir = new THREE.Vector3(0, -1, 0);
  private readonly _scratchEventPos = new THREE.Vector3();
  private readonly _playerMovedEvent = new CustomEvent('engine:player-moved', {
    detail: { position: this._scratchEventPos },
  });

  private keyDownHandler: (e: KeyboardEvent) => void;
  private keyUpHandler: (e: KeyboardEvent) => void;

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    domElement: HTMLElement
  ) {
    this.controls = new PointerLockControls(camera, domElement);

    this.keyDownHandler = (e: KeyboardEvent) => this.onKey(e, true);
    this.keyUpHandler = (e: KeyboardEvent) => this.onKey(e, false);
    window.addEventListener('keydown', this.keyDownHandler);
    window.addEventListener('keyup', this.keyUpHandler);
  }

  /** Call with all objects tagged `userData.collidable === true` after building a world. */
  setCollidables(objects: THREE.Object3D[]): void {
    this.collidables = objects;
  }

  /** Toggle movement (e.g. disable when dialogue is open). */
  setEnabled(value: boolean): void {
    this.enabled = value;
    if (!value && this.controls.isLocked) {
      this.controls.unlock();
    }
  }

  requestLock(): void {
    if (this.enabled) {
      this.controls.lock();
    }
  }

  get isLocked(): boolean {
    return this.controls.isLocked;
  }

  /** Called every frame from SceneManager.onFrame(). */
  update(delta: number): void {
    if (!this.controls.isLocked || !this.enabled) return;

    const speed = this.keys.sprint ? SPRINT_SPEED : WALK_SPEED;
    const pos = this.camera.position;

    // ── Horizontal movement ───────────────────────────────────────────────
    const moveDir = this._scratchMoveDir.set(0, 0, 0);
    if (this.keys.forward) moveDir.z -= 1;
    if (this.keys.backward) moveDir.z += 1;
    if (this.keys.left) moveDir.x -= 1;
    if (this.keys.right) moveDir.x += 1;

    if (moveDir.lengthSq() > 0) {
      moveDir.normalize().multiplyScalar(speed * delta);
      // Transform to camera-relative direction (ignore Y)
      const worldDir = moveDir.applyQuaternion(this.camera.quaternion);
      worldDir.y = 0;

      // ── Collision probes ──────────────────────────────────────────────
      for (const probe of this.probeDirections) {
        this._scratchProbe.copy(probe).applyQuaternion(this.camera.quaternion);
        this._scratchProbe.y = 0;
        this._scratchProbe.normalize();
        this.raycasterSide.set(pos, this._scratchProbe);
        this.raycasterSide.far = COLLIDE_RADIUS;
        const hits = this.raycasterSide.intersectObjects(this.collidables, true);
        
        let validHit = null;
        for (const hit of hits) {
          let obj: THREE.Object3D | null = hit.object;
          let collidable = true;
          while (obj) {
            if (obj.userData?.collidable === false) {
              collidable = false;
              break;
            }
            obj = obj.parent;
          }
          if (collidable) {
            validHit = hit;
            break;
          }
        }

        if (validHit && validHit.distance < COLLIDE_RADIUS) {
          const hitNormal = validHit.face
            ? validHit.face.normal.clone().transformDirection(validHit.object.matrixWorld)
            : this._scratchProbe.clone().negate();
          hitNormal.y = 0;
          hitNormal.normalize();
          if (worldDir.dot(hitNormal) < 0) {
            worldDir.projectOnPlane(hitNormal);
          }
        }
      }

      pos.add(worldDir);
    }

    // ── Vertical / gravity ────────────────────────────────────────────────
    this.raycasterDown.set(
      this._scratchRayDownPos.copy(pos),
      this._scratchRayDownDir
    );
    this.raycasterDown.far = PLAYER_HEIGHT + STEP_HEIGHT + 1;
    const groundHits = this.raycasterDown.intersectObjects(this.collidables, true);
    
    let validGroundHit = null;
    for (const hit of groundHits) {
      let obj: THREE.Object3D | null = hit.object;
      let collidable = true;
      while (obj) {
        if (obj.userData?.collidable === false) {
          collidable = false;
          break;
        }
        obj = obj.parent;
      }
      if (collidable) {
        validGroundHit = hit;
        break;
      }
    }

    if (validGroundHit) {
      const groundY = validGroundHit.point.y;
      const targetY = groundY + PLAYER_HEIGHT;
      if (pos.y <= targetY + 0.05) {
        pos.y = targetY;
        this.verticalSpeed = 0;
        this.isGrounded = true;
      } else {
        this.isGrounded = false;
      }
    } else {
      this.isGrounded = false;
    }

    if (!this.isGrounded) {
      this.verticalSpeed -= GRAVITY * delta;
      pos.y += this.verticalSpeed * delta;
    }

    // ── Emit player-moved event for EventSystem ───────────────────────────
    this._scratchEventPos.copy(pos);
    window.dispatchEvent(this._playerMovedEvent);
  }

  private onKey(e: KeyboardEvent, pressed: boolean): void {
    switch (e.code) {
      case 'KeyW':
      case 'ArrowUp':
        this.keys.forward = pressed;
        break;
      case 'KeyS':
      case 'ArrowDown':
        this.keys.backward = pressed;
        break;
      case 'KeyA':
      case 'ArrowLeft':
        this.keys.left = pressed;
        break;
      case 'KeyD':
      case 'ArrowRight':
        this.keys.right = pressed;
        break;
      case 'ShiftLeft':
        this.keys.sprint = pressed;
        break;
    }
  }

  dispose(): void {
    this.controls.dispose();
    window.removeEventListener('keydown', this.keyDownHandler);
    window.removeEventListener('keyup', this.keyUpHandler);
  }
}
