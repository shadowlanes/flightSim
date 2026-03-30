import * as THREE from 'three';
import { CONFIG } from './constants';
import { Upgrades } from './PersistenceService';

export class ShipController {
  public group: THREE.Group;
  public currentSpeed: number = CONFIG.cruiseSpeed;
  private glowMat: THREE.MeshPhongMaterial;
  private keys: Record<string, boolean> = {};

  constructor(upgrades: Upgrades) {
    this.glowMat = new THREE.MeshPhongMaterial({ 
        color: 0x00ffff, 
        emissive: 0x00ffff, 
        emissiveIntensity: 2, 
        flatShading: true 
    });
    this.group = this.createShip(upgrades.skin);
    this.setupInputs();
  }

  private setupInputs() {
    window.addEventListener('keydown', (e) => this.keys[e.key] = true);
    window.addEventListener('keyup', (e) => this.keys[e.key] = false);
  }

  private createShip(skinColor: string): THREE.Group {
    const group = new THREE.Group();
    const mainColor = new THREE.Color(skinColor);
    const mat = new THREE.MeshPhongMaterial({ color: mainColor, flatShading: true });
    const darkMat = new THREE.MeshPhongMaterial({ color: 0x222222, flatShading: true });

    // Fuselage - Sleek and tapered multi-stage body
    const bodyPart1 = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.8, 2, 6), mat); // Nose section
    bodyPart1.rotateX(Math.PI / 2);
    bodyPart1.position.z = 1.5;
    group.add(bodyPart1);

    const bodyPart2 = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1, 3, 6), mat); // Mid section
    bodyPart2.rotateX(Math.PI / 2);
    bodyPart2.position.z = -1;
    group.add(bodyPart2);

    const bodyPart3 = new THREE.Mesh(new THREE.CylinderGeometry(1, 0.6, 1.5, 6), mat); // Tail section
    bodyPart3.rotateX(Math.PI / 2);
    bodyPart3.position.z = -3;
    group.add(bodyPart3);

    // Nose needle / pitot tube
    const needle = new THREE.Mesh(new THREE.ConeGeometry(0.08, 1.2, 6), darkMat);
    needle.rotateX(Math.PI / 2);
    needle.position.z = 3;
    group.add(needle);

    // Aggressive Wings - Forward swept design
    const wingShape = new THREE.Shape();
    wingShape.moveTo(0, 0);
    wingShape.lineTo(4.5, -1);
    wingShape.lineTo(4.5, 0.5);
    wingShape.lineTo(0.5, 2.5);
    wingShape.closePath();
    const wingGeo = new THREE.ExtrudeGeometry(wingShape, { depth: 0.15, bevelEnabled: false });
    wingGeo.rotateX(Math.PI / 2);
    
    const leftWing = new THREE.Mesh(wingGeo, mat);
    leftWing.position.set(-0.7, -0.1, -1);
    group.add(leftWing);

    const rightWing = new THREE.Mesh(wingGeo, mat);
    rightWing.scale.x = -1;
    rightWing.position.set(0.7, -0.1, -1);
    group.add(rightWing);
    
    // Winglets
    const wingletGeo = new THREE.BoxGeometry(0.1, 1, 1.5);
    const lWinglet = new THREE.Mesh(wingletGeo, mat);
    lWinglet.position.set(-5.2, 0.4, -1.8);
    lWinglet.rotation.z = -0.3;
    group.add(lWinglet);

    const rWinglet = new THREE.Mesh(wingletGeo, mat);
    rWinglet.position.set(5.2, 0.4, -1.8);
    rWinglet.rotation.z = 0.3;
    group.add(rWinglet);

    // Twin Vertical Stabilizers (V-Tail)
    const tailGeo = new THREE.BoxGeometry(0.1, 1.5, 1.8);
    const lTail = new THREE.Mesh(tailGeo, mat);
    lTail.position.set(-0.6, 1.0, -3.2);
    lTail.rotation.z = -Math.PI / 4;
    group.add(lTail);

    const rTail = new THREE.Mesh(tailGeo, mat);
    rTail.position.set(0.6, 1.0, -3.2);
    rTail.rotation.z = Math.PI / 4;
    group.add(rTail);

    // Heavy Engines
    const engineMainGeo = new THREE.CylinderGeometry(0.5, 0.6, 2.2, 8);
    engineMainGeo.rotateX(Math.PI/2);
    
    const engineL = new THREE.Mesh(engineMainGeo, darkMat);
    engineL.position.set(-1.1, -0.4, -2);
    group.add(engineL);
    
    const engineR = new THREE.Mesh(engineMainGeo, darkMat);
    engineR.position.set(1.1, -0.4, -2);
    group.add(engineR);
    
    // Engine Glow - Cyan thrusters
    const nozzleGeo = new THREE.CylinderGeometry(0.35, 0.45, 0.3, 8);
    nozzleGeo.rotateX(Math.PI/2);
    const glowL = new THREE.Mesh(nozzleGeo, this.glowMat);
    glowL.position.set(-1.1, -0.4, -3.2);
    group.add(glowL);
    
    const glowR = new THREE.Mesh(nozzleGeo, this.glowMat);
    glowR.position.set(1.1, -0.4, -3.2);
    group.add(glowR);

    // Cockpit with aerodynamic canopy
    const cockpit = new THREE.Mesh(new THREE.SphereGeometry(0.55, 8, 8), new THREE.MeshPhongMaterial({ color: 0x00ffff, transparent: true, opacity: 0.5 }));
    cockpit.position.set(0, 0.6, 0.8); 
    cockpit.scale.set(0.8, 0.6, 2.2);
    group.add(cockpit);
    
    // Canopy Frame
    const frameGeo = new THREE.BoxGeometry(0.05, 0.7, 2.4);
    const frame = new THREE.Mesh(frameGeo, darkMat);
    frame.position.set(0, 0.65, 0.8);
    frame.rotation.x = -0.1;
    group.add(frame);

    return group;
  }

  public update(biomeMultiplier: number) {
    // Pitch: W (pull up) = -1, S (push down) = 1
    const pIn = (this.keys.w || this.keys.ArrowUp) ? -1 : (this.keys.s || this.keys.ArrowDown) ? 1 : 0;
    // Roll: A (roll left) = 1, D (roll right) = -1
    const rIn = (this.keys.a || this.keys.ArrowLeft) ? 1 : (this.keys.d || this.keys.ArrowRight) ? -1 : 0;
    // Rudder (Yaw): Q (yaw left) = 1, E (yaw right) = -1
    const yIn = (this.keys.q) ? 1 : (this.keys.e) ? -1 : 0;

    // Thruster Glow Micro-interaction
    const targetGlow = (this.keys.w || this.keys.ArrowUp) ? 8.0 : 2.0;
    this.glowMat.emissiveIntensity = THREE.MathUtils.lerp(this.glowMat.emissiveIntensity, targetGlow, 0.1);

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
    
    const pitchSpeed = 0.04 * speedFactor;
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
  }
}
