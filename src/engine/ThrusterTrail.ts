import * as THREE from 'three';

const POOL_SIZE    = 120;   // total particle slots
const LIFETIME_MS  = 180;   // each particle lives ~180 ms
const SPAWN_THRUST = 3;     // particles per nozzle per frame when thrusting
const SPAWN_IDLE   = 0.3;   // probability of 1 particle per nozzle per frame at idle

// Nozzle local positions inside the ship group (matches ShipModel exhaust placement)
const NOZZLE_L = new THREE.Vector3(-1.0, 0, -1.2);
const NOZZLE_R = new THREE.Vector3( 1.0, 0, -1.2);

// Base hue: orange-white core fades to dark orange
const COLOR_HOT  = new THREE.Color(1.0, 0.8, 0.4);  // near-white hot
const COLOR_COOL = new THREE.Color(1.0, 0.25, 0.0); // dim orange

export class ThrusterTrail {
  private points: THREE.Points;
  private positions: Float32Array;
  private colors: Float32Array;
  private velocities: Float32Array;
  private life: Float32Array;     // remaining ms per particle
  private maxLife: Float32Array;  // max ms per particle (for ratio)
  private nextSlot = 0;
  private lastTime = performance.now();

  constructor(scene: THREE.Scene) {
    this.positions = new Float32Array(POOL_SIZE * 3);
    this.colors    = new Float32Array(POOL_SIZE * 3);
    this.velocities = new Float32Array(POOL_SIZE * 3);
    this.life    = new Float32Array(POOL_SIZE);
    this.maxLife = new Float32Array(POOL_SIZE);

    // Park all particles off-screen
    for (let i = 0; i < POOL_SIZE; i++) {
      this.positions[i * 3 + 1] = -99999;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geo.setAttribute('color',    new THREE.BufferAttribute(this.colors,    3));

    const mat = new THREE.PointsMaterial({
      vertexColors: true,
      size: 0.45,
      transparent: true,
      opacity: 1,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    });

    this.points = new THREE.Points(geo, mat);
    scene.add(this.points);
  }

  update(shipGroup: THREE.Group, isThrusting: boolean) {
    const now   = performance.now();
    const delta = Math.min(now - this.lastTime, 50); // cap delta to avoid jumps
    this.lastTime = now;

    // Spawn
    if (isThrusting) {
      this.spawn(shipGroup, NOZZLE_L, SPAWN_THRUST);
      this.spawn(shipGroup, NOZZLE_R, SPAWN_THRUST);
    } else {
      if (Math.random() < SPAWN_IDLE) this.spawn(shipGroup, NOZZLE_L, 1);
      if (Math.random() < SPAWN_IDLE) this.spawn(shipGroup, NOZZLE_R, 1);
    }

    // Tick all particles
    for (let i = 0; i < POOL_SIZE; i++) {
      if (this.life[i] <= 0) continue;

      this.life[i] -= delta;

      if (this.life[i] <= 0) {
        this.life[i] = 0;
        this.positions[i * 3 + 1] = -99999; // park
        this.colors[i * 3] = this.colors[i * 3 + 1] = this.colors[i * 3 + 2] = 0;
        continue;
      }

      // Move
      const dt = delta * 0.001;
      this.positions[i * 3]     += this.velocities[i * 3]     * dt;
      this.positions[i * 3 + 1] += this.velocities[i * 3 + 1] * dt;
      this.positions[i * 3 + 2] += this.velocities[i * 3 + 2] * dt;

      // Fade: t=1 at birth, t=0 at death — lerp from hot to cool, dim at end
      const t = this.life[i] / this.maxLife[i];
      const c = COLOR_COOL.clone().lerp(COLOR_HOT, t).multiplyScalar(t); // dims as it dies
      this.colors[i * 3]     = c.r;
      this.colors[i * 3 + 1] = c.g;
      this.colors[i * 3 + 2] = c.b;
    }

    const posAttr = this.points.geometry.attributes.position as THREE.BufferAttribute;
    const colAttr = this.points.geometry.attributes.color    as THREE.BufferAttribute;
    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
  }

  private spawn(shipGroup: THREE.Group, localNozzle: THREE.Vector3, count: number) {
    const worldNozzle = localNozzle.clone().applyMatrix4(shipGroup.matrixWorld);
    const backward    = new THREE.Vector3(0, 0, -1).applyQuaternion(shipGroup.quaternion);

    for (let n = 0; n < count; n++) {
      const i = this.nextSlot;
      this.nextSlot = (this.nextSlot + 1) % POOL_SIZE;

      // Lifetime with slight variation
      this.maxLife[i] = this.life[i] = LIFETIME_MS * (0.6 + Math.random() * 0.4);

      // Spawn at nozzle with tiny spread
      this.positions[i * 3]     = worldNozzle.x + (Math.random() - 0.5) * 0.3;
      this.positions[i * 3 + 1] = worldNozzle.y + (Math.random() - 0.5) * 0.3;
      this.positions[i * 3 + 2] = worldNozzle.z + (Math.random() - 0.5) * 0.3;

      // Velocity: backward + small random scatter so it fans out slightly
      const spd = 10 + Math.random() * 6;
      this.velocities[i * 3]     = backward.x * spd + (Math.random() - 0.5) * 1.5;
      this.velocities[i * 3 + 1] = backward.y * spd + (Math.random() - 0.5) * 1.5;
      this.velocities[i * 3 + 2] = backward.z * spd + (Math.random() - 0.5) * 1.5;

      // Start at full hot color
      this.colors[i * 3]     = COLOR_HOT.r;
      this.colors[i * 3 + 1] = COLOR_HOT.g;
      this.colors[i * 3 + 2] = COLOR_HOT.b;
    }
  }
}
