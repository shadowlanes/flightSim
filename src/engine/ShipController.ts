import * as THREE from 'three';
import { CONFIG } from './constants';
import { Upgrades } from './PersistenceService';
import { ShipModel } from './ShipModel';

export class ShipController {
  public group: THREE.Group;
  public currentSpeed: number = CONFIG.cruiseSpeed;
  private shipModel: ShipModel;
  private keys: Record<string, boolean> = {};

  // Motion tracking for effects
  private lastSpeed: number = CONFIG.cruiseSpeed;
  private lastPitch: number = 0;
  public speedDelta: number = 0;
  public pitchDelta: number = 0;
  public motionIntensity: number = 0;
  public isThrusting = false;

  constructor(upgrades: Upgrades) {
    this.shipModel = new ShipModel(upgrades.skin);
    this.group = this.shipModel.group;
    this.setupInputs();
  }

  private setupInputs() {
    window.addEventListener('keydown', (e) => this.keys[e.key] = true);
    window.addEventListener('keyup', (e) => this.keys[e.key] = false);
  }

  public update() {
    // Pitch: W (pull up) = -1, S (push down) = 1
    const pIn = (this.keys.w || this.keys.ArrowUp) ? -1 : (this.keys.s || this.keys.ArrowDown) ? 1 : 0;

    // Roll: A (roll left) = -1, D (roll right) = 1
    const rIn = (this.keys.a || this.keys.ArrowLeft) ? -1 : (this.keys.d || this.keys.ArrowRight) ? 1 : 0;
    // Rudder (Yaw): Q (yaw left) = 1, E (yaw right) = -1
    const yIn = (this.keys.q) ? 1 : (this.keys.e) ? -1 : 0;

    // Thruster Glow — idle pulse keeps engine visibly "running", W boosts to full
    const isThrusting = !!(this.keys.w || this.keys.ArrowUp);
    this.isThrusting = isThrusting;
    const idleGlow = 1.6 + Math.sin(Date.now() * 0.0015) * 0.3; // slow 1.3–1.9 pulse
    const targetGlow = isThrusting ? 8.0 : idleGlow;
    this.shipModel.glowMaterial.emissiveIntensity = THREE.MathUtils.lerp(
      this.shipModel.glowMaterial.emissiveIntensity,
      targetGlow,
      isThrusting ? 0.1 : 0.04  // slower fade-out so the transition feels natural
    );

    // Speed Logic
    // Base speed + dive/climb impacts
    // Get forward vector component in world Y axis to see if we are diving or climbing
    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(this.group.quaternion);
    const isClimbing = forward.y > 0.1;
    const isDiving = forward.y < -0.1;

    // "W" also adds thrust as requested
    const throttle = (this.keys.w || this.keys.ArrowUp) ? CONFIG.accelRate * 1.5 : 0;
    
    if (isDiving) {
        this.currentSpeed += CONFIG.accelRate + (Math.abs(forward.y) * CONFIG.gravitySpeedImpact);
    } else if (isClimbing) {
        this.currentSpeed -= (CONFIG.decelRate + (forward.y * CONFIG.gravitySpeedImpact)) - throttle;
    } else {
        // Friction / drag towards cruise speed
        this.currentSpeed += (CONFIG.cruiseSpeed - this.currentSpeed) * 0.01;
        this.currentSpeed += throttle;
    }

    // Biome-based speed boost
    this.currentSpeed = THREE.MathUtils.clamp(this.currentSpeed, CONFIG.minSpeed, CONFIG.maxSpeed);

    // Agility Logic: Harder to turn at extreme high speeds
    const speedFactor = 1.0 - THREE.MathUtils.smoothstep(this.currentSpeed, CONFIG.cruiseSpeed, CONFIG.maxSpeed) * 0.5;

    const pitchSpeed = 0.025 * speedFactor;
    const rollSpeed = 0.065 * speedFactor;
    const rudderSpeed = 0.02 * speedFactor;
    const bankingTurnFactor = 0.025 * speedFactor;

    // Natural "Dip" / Gravity effect on nose
    // This forces the player to constantly "pull up" slightly to maintain level flight
    const naturalDip = 0.008 * speedFactor;

    // Apply incremental rotations
    // pIn is -1 for pull up, 1 for push down. 
    // We add naturalDip to the final pitch change.
    this.group.rotateX(pIn * pitchSpeed + naturalDip);
    this.group.rotateZ(rIn * rollSpeed);
    
    // Rudder + Natural Banking Turn
    const inducedYaw = rIn * bankingTurnFactor;
    this.group.rotateY(yIn * rudderSpeed + inducedYaw);

    // Constant forward movement in local forward direction
    this.group.position.add(forward.multiplyScalar(this.currentSpeed * 0.01)); // Scale down for engine

    // Reduced gravity for better flight feel
    this.group.position.y -= CONFIG.gravity * 0.4;

    // Track motion changes for visual effects
    this.speedDelta = this.currentSpeed - this.lastSpeed;
    this.pitchDelta = Math.abs(pIn - this.lastPitch);
    this.lastSpeed = this.currentSpeed;
    this.lastPitch = pIn;

    // Calculate motion intensity (0-1) based on speed changes and pitch maneuvers
    const speedChangeIntensity = Math.abs(this.speedDelta) / 5.0; // Normalize by typical delta
    const pitchIntensity = this.pitchDelta * 2.0; // Amplify pitch changes
    const highSpeedFactor = THREE.MathUtils.clamp((this.currentSpeed - CONFIG.cruiseSpeed) / (CONFIG.maxSpeed - CONFIG.cruiseSpeed), 0, 1);

    // Combine factors - rapid maneuvers at high speed = max intensity
    this.motionIntensity = THREE.MathUtils.clamp(
      speedChangeIntensity + pitchIntensity + (highSpeedFactor * 0.3),
      0,
      1
    );
  }
}
