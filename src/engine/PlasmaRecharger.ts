import * as THREE from 'three';
import { CONFIG } from './constants';

// ─── Config ──────────────────────────────────────────────────────────────────

/** Beam color — matches thruster glow (sky blue plasma) */
const BEAM_COLOR = 0x66ccff;

/** Cylinder base dimensions */
const BASE_RADIUS = 3.5;
const BASE_HEIGHT = 1.2;

/** Beam cone — point at base, spreads upward */
const BEAM_CONE_SPREAD = 8.0; // radius at the top of the cone

/** How high the beam reaches above the recharger (tweak this) */
export const PLASMA_BEAM_RANGE = 80;

/** Max fuel replenish at point-blank flyover */
const MAX_FUEL_REPLENISH = 90;

/** Horizontal collection radius — how close (xz) you need to fly over */
const COLLECTION_RADIUS = 15;

/** Ship glow duration in seconds after collecting plasma */
const SHIP_GLOW_DURATION = 1.2;

/** Seconds before an uncollected recharger auto-expires */
const RECHARGER_LIFETIME = 30;

/** How many rechargers have been collected — drives difficulty ramp */
let globalCollectCount = 0;

/** Max angle offset (radians) for placement difficulty ramp */
const MAX_ANGLE_OFFSET = Math.PI / 3; // 60 degrees at hardest

/** Number of collections before difficulty plateaus */
const DIFFICULTY_RAMP_COUNT = 20;

// ─── PlasmaRecharger (single unit) ──────────────────────────────────────────

export class PlasmaRecharger {
  public group: THREE.Group;
  public used = false;
  public expired = false;
  public worldPos = new THREE.Vector3();
  public age = 0;

  private beamMesh: THREE.Mesh;
  private beamMaterial: THREE.ShaderMaterial;
  private baseMesh: THREE.Mesh;
  private beamLight: THREE.PointLight;
  private beamRange: number;

  constructor(x: number, groundY: number, z: number, beamRange = PLASMA_BEAM_RANGE) {
    this.beamRange = beamRange;
    this.group = new THREE.Group();

    // Flat metallic cylinder — base pad
    const baseGeo = new THREE.CylinderGeometry(BASE_RADIUS, BASE_RADIUS, BASE_HEIGHT, 24);
    const baseMat = new THREE.MeshStandardMaterial({
      color: 0x888899,
      metalness: 0.9,
      roughness: 0.2,
      emissive: BEAM_COLOR,
      emissiveIntensity: 0.3,
    });
    this.baseMesh = new THREE.Mesh(baseGeo, baseMat);
    this.baseMesh.position.y = BASE_HEIGHT / 2;
    this.group.add(this.baseMesh);

    // Inner glow ring on top of the pad
    const ringGeo = new THREE.TorusGeometry(BASE_RADIUS * 0.6, 0.15, 8, 24);
    const ringMat = new THREE.MeshBasicMaterial({
      color: BEAM_COLOR,
      transparent: true,
      opacity: 0.6,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = BASE_HEIGHT + 0.05;
    this.group.add(ring);

    // Cone beam — point at base, spreads wide at the top (like a searchlight)
    // CylinderGeometry(radiusTop, radiusBottom, height) — top is the sky end
    const beamGeo = new THREE.CylinderGeometry(
      BEAM_CONE_SPREAD, 0.15, this.beamRange, 24, 16, true
    );

    // Shader material with animated shimmer
    const beamColor = new THREE.Color(BEAM_COLOR);
    this.beamMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: beamColor },
      },
      vertexShader: `
        varying vec2 vUv;
        varying float vHeight;
        void main() {
          vUv = uv;
          // height = 0 at bottom (point), 1 at top (wide)
          vHeight = position.y / ${this.beamRange.toFixed(1)} + 0.5;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform vec3 uColor;
        varying vec2 vUv;
        varying float vHeight;

        // Simple hash-based noise
        float hash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
        }
        float noise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(
            mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
            mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
            f.y
          );
        }

        void main() {
          // Fade: strong at base, fading toward top
          float baseFade = 1.0 - vHeight * 0.85;

          // Scrolling shimmer — noise moves upward over time
          float n1 = noise(vec2(vUv.x * 6.0, vUv.y * 4.0 - uTime * 1.5));
          float n2 = noise(vec2(vUv.x * 12.0, vUv.y * 8.0 - uTime * 2.5));
          float shimmer = 0.5 + 0.3 * n1 + 0.2 * n2;

          // Pulsing glow
          float pulse = 0.9 + 0.1 * sin(uTime * 3.0);

          float alpha = baseFade * shimmer * pulse * 0.35;
          gl_FragColor = vec4(uColor, alpha);
        }
      `,
      transparent: true,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.beamMesh = new THREE.Mesh(beamGeo, this.beamMaterial);
    this.beamMesh.position.y = BASE_HEIGHT + this.beamRange / 2;
    this.group.add(this.beamMesh);

    // Point light at the top of the beam for atmospheric glow
    this.beamLight = new THREE.PointLight(BEAM_COLOR, 4, this.beamRange * 2);
    this.beamLight.position.y = BASE_HEIGHT + this.beamRange * 0.7;
    this.group.add(this.beamLight);

    // Position the whole group on the ground
    this.group.position.set(x, groundY, z);
    this.worldPos.set(x, groundY, z);
  }

  /**
   * Check if the ship is within range and return fuel amount (0 if out of range or used).
   * Fuel scales inversely with vertical distance — closer = more fuel.
   */
  /** Advance lifetime and animate beam. Returns true if just expired this frame. */
  tick(dt: number): boolean {
    if (this.used || this.expired) return false;
    this.age += dt;

    // Animate shimmer
    this.beamMaterial.uniforms.uTime.value = this.age;

    if (this.age >= RECHARGER_LIFETIME) {
      this.expire();
      return true;
    }
    return false;
  }

  private expire() {
    this.expired = true;
    this.deactivate();
  }

  tryCollect(shipPos: THREE.Vector3): number {
    if (this.used || this.expired) return 0;

    const dx = shipPos.x - this.worldPos.x;
    const dz = shipPos.z - this.worldPos.z;
    const horizDist = Math.sqrt(dx * dx + dz * dz);

    if (horizDist > COLLECTION_RADIUS) return 0;

    const shipAlt = shipPos.y - this.worldPos.y;
    if (shipAlt < 0 || shipAlt > this.beamRange) return 0;

    // Proximity factor: 1.0 at ground level, 0.2 at beam top
    const verticalFactor = 1.0 - (shipAlt / this.beamRange) * 0.8;
    // Horizontal factor: 1.0 at center, 0.5 at edge
    const horizFactor = 1.0 - (horizDist / COLLECTION_RADIUS) * 0.5;

    const fuel = MAX_FUEL_REPLENISH * verticalFactor * horizFactor;

    this.deactivate();
    globalCollectCount++;
    return fuel;
  }

  private deactivate() {
    this.used = true;
    this.beamMesh.visible = false;
    this.beamLight.visible = false;
    // Dim the base
    (this.baseMesh.material as THREE.MeshStandardMaterial).emissiveIntensity = 0;
  }

  dispose(scene: THREE.Scene) {
    scene.remove(this.group);
    this.group.traverse(child => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
        else child.material.dispose();
      }
    });
  }
}

// ─── PlasmaRechargerManager ────────────────────────────────────────────────

export class PlasmaRechargerManager {
  private scene: THREE.Scene;
  private rechargers: PlasmaRecharger[] = [];
  private getTerrainHeight: (x: number, z: number) => number;
  private firstSpawn = true;

  /** Ship glow state — exposed so GameEngine can read it */
  public shipGlowTimer = 0;

  /** Points awarded per collection */
  private static readonly COLLECT_POINTS = 500;

  constructor(scene: THREE.Scene, getTerrainHeight: (x: number, z: number) => number) {
    this.scene = scene;
    this.getTerrainHeight = getTerrainHeight;
  }

  /**
   * Spawn the next recharger based on ship position, heading, and fuel level.
   * Called by GameEngine when there are no active (unused) rechargers.
   */
  spawnNext(shipPos: THREE.Vector3, shipQuaternion: THREE.Quaternion, fuelPercent: number) {
    // ── Distance: closer when fuel is low ──
    // Ship moves ~60 units/sec at cruise. These distances = 0.5s to 3s ahead.
    let spawnDist: number;
    if (this.firstSpawn) {
      // First recharger spawns very close so the player sees it immediately
      spawnDist = 500;
      this.firstSpawn = false;
    } else {
      const minDist = 150;
      const maxDist = 400;
      const fuelT = Math.max(0, Math.min(1, fuelPercent / 100));
      spawnDist = minDist + (maxDist - minDist) * fuelT;
    }

    // ── Angle offset: increases with difficulty ──
    const difficultyT = Math.min(globalCollectCount / DIFFICULTY_RAMP_COUNT, 1);
    const maxOffset = MAX_ANGLE_OFFSET * difficultyT;
    const angleOffset = (Math.random() - 0.5) * 2 * maxOffset;

    // Ship forward direction projected onto XZ plane
    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(shipQuaternion);
    forward.y = 0;
    forward.normalize();

    // Rotate forward by angleOffset around Y axis
    const rotAxis = new THREE.Vector3(0, 1, 0);
    forward.applyAxisAngle(rotAxis, angleOffset);

    const spawnX = shipPos.x + forward.x * spawnDist;
    const spawnZ = shipPos.z + forward.z * spawnDist;
    const groundY = this.getTerrainHeight(spawnX, spawnZ) - 50; // terrain offset

    const recharger = new PlasmaRecharger(spawnX, groundY, spawnZ);
    this.rechargers.push(recharger);
    this.scene.add(recharger.group);
  }

  /**
   * Returns true if there's an active (unused) recharger in the world.
   */
  hasActiveRecharger(): boolean {
    return this.rechargers.some(r => !r.used && !r.expired);
  }

  /**
   * Check all rechargers against ship position.
   * Returns fuel collected and points earned.
   */
  update(shipPos: THREE.Vector3, shipQuaternion: THREE.Quaternion, fuelPercent: number, dt: number): { fuel: number; points: number } {
    let totalFuel = 0;
    let totalPoints = 0;

    for (const recharger of this.rechargers) {
      recharger.tick(dt);
      const fuel = recharger.tryCollect(shipPos);
      if (fuel > 0) {
        totalFuel += fuel;
        totalPoints += PlasmaRechargerManager.COLLECT_POINTS;
        this.shipGlowTimer = SHIP_GLOW_DURATION;
      }
    }

    // Decay ship glow
    if (this.shipGlowTimer > 0) {
      this.shipGlowTimer -= dt;
    }

    // Spawn next if none active
    if (!this.hasActiveRecharger()) {
      this.spawnNext(shipPos, shipQuaternion, fuelPercent);
    }

    // Cleanup old used rechargers that are far away
    this.cleanup(shipPos);

    return { fuel: totalFuel, points: totalPoints };
  }

  private cleanup(shipPos: THREE.Vector3) {
    const maxDist = CONFIG.chunkSize * CONFIG.renderDist * 2;
    this.rechargers = this.rechargers.filter(r => {
      const dist = shipPos.distanceTo(r.worldPos);
      if ((r.used || r.expired) && dist > maxDist) {
        r.dispose(this.scene);
        return false;
      }
      return true;
    });
  }

  /** Reset state for new game */
  reset() {
    for (const r of this.rechargers) {
      r.dispose(this.scene);
    }
    this.rechargers = [];
    this.shipGlowTimer = 0;
    this.firstSpawn = true;
    globalCollectCount = 0;
  }
}
