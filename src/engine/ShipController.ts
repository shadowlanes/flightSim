import * as THREE from 'three';
import { CONFIG } from './constants';
import { Upgrades } from './PersistenceService';

export class ShipController {
  public group: THREE.Group;
  private curPitch = 0;
  private curRoll = 0;
  private curYaw = 0;
  private keys: Record<string, boolean> = {};

  constructor(upgrades: Upgrades) {
    this.group = this.createShip(upgrades.skin);
    this.setupInputs();
  }

  private setupInputs() {
    window.addEventListener('keydown', (e) => this.keys[e.key] = true);
    window.addEventListener('keyup', (e) => this.keys[e.key] = false);
  }

  private createShip(skinColor: string): THREE.Group {
    const group = new THREE.Group();
    const mat = new THREE.MeshPhongMaterial({ color: new THREE.Color(skinColor), flatShading: true });
    const accentMat = new THREE.MeshPhongMaterial({ color: 0x333333, flatShading: true });

    // Main Body
    const bodyGeo = new THREE.CylinderGeometry(0.8, 1.2, 5, 8);
    bodyGeo.rotateX(Math.PI / 2);
    group.add(new THREE.Mesh(bodyGeo, mat));

    // Nose Cone
    const noseGeo = new THREE.ConeGeometry(0.8, 1.5, 8);
    noseGeo.rotateX(Math.PI / 2);
    const nose = new THREE.Mesh(noseGeo, accentMat);
    nose.position.z = 3.25;
    group.add(nose);

    // Wings
    const wingShape = new THREE.Shape();
    wingShape.moveTo(0, 0);
    wingShape.lineTo(4, -1);
    wingShape.lineTo(4, 1);
    wingShape.lineTo(0, 2);
    wingShape.closePath();
    const wingGeo = new THREE.ExtrudeGeometry(wingShape, { depth: 0.1, bevelEnabled: false });
    wingGeo.rotateX(Math.PI / 2);
    
    const leftWing = new THREE.Mesh(wingGeo, mat);
    leftWing.position.set(-0.8, 0, -1);
    group.add(leftWing);

    const rightWing = new THREE.Mesh(wingGeo, mat);
    rightWing.scale.x = -1;
    rightWing.position.set(0.8, 0, -1);
    group.add(rightWing);

    // Vertical Stabilizer
    const tailGeo = new THREE.BoxGeometry(0.1, 1.5, 1.5);
    const tail = new THREE.Mesh(tailGeo, mat);
    tail.position.set(0, 1.2, -1.5);
    group.add(tail);

    // Engines
    const engineGeo = new THREE.CylinderGeometry(0.5, 0.5, 1, 8);
    engineGeo.rotateX(Math.PI/2);
    const engineL = new THREE.Mesh(engineGeo, accentMat);
    engineL.position.set(-0.6, -0.2, -2.8);
    group.add(engineL);
    
    const engineR = new THREE.Mesh(engineGeo, accentMat);
    engineR.position.set(0.6, -0.2, -2.8);
    group.add(engineR);

    // Cockpit
    const cockpit = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 8), new THREE.MeshPhongMaterial({ color: 0x00ffff, transparent: true, opacity: 0.7 }));
    cockpit.position.set(0, 0.6, 1.5); cockpit.scale.set(1, 0.6, 2);
    group.add(cockpit);

    return group;
  }

  public update(currentSpeed: number) {
    const pIn = (this.keys.s || this.keys.ArrowDown) ? 1 : (this.keys.w || this.keys.ArrowUp) ? -1 : 0;
    const rIn = (this.keys.d || this.keys.ArrowRight) ? 1 : (this.keys.a || this.keys.ArrowLeft) ? -1 : 0;

    const targetPitch = pIn * CONFIG.maxPitch;
    const targetRoll = rIn * CONFIG.maxRoll;
    const targetYaw = -rIn * CONFIG.maxYaw;

    this.curPitch = THREE.MathUtils.lerp(this.curPitch, targetPitch, CONFIG.lerpFactor);
    this.curRoll = THREE.MathUtils.lerp(this.curRoll, targetRoll, CONFIG.lerpFactor);
    this.curYaw = THREE.MathUtils.lerp(this.curYaw, targetYaw, CONFIG.lerpFactor);

    this.group.rotation.set(0, 0, 0);
    this.group.rotateY(this.curYaw);
    this.group.rotateX(this.curPitch);
    this.group.rotateZ(this.curRoll);

    const velocity = new THREE.Vector3(0, 0, 1).applyQuaternion(this.group.quaternion);
    this.group.position.add(velocity.multiplyScalar(currentSpeed));

    // Gravity
    this.group.position.y -= CONFIG.gravity;
  }
}
