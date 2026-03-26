import * as THREE from 'three';
import { CONFIG } from './constants';
import { Upgrades } from './PersistenceService';
import { TerrainManager } from './TerrainManager';
import { ShipController } from './ShipController';

export interface GameStats {
  health: number;
  fuel: number;
  points: number;
  speed: number;
  alt: number;
  dist: number;
  warning: string;
}

export class GameEngine {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private terrain: TerrainManager;
  private ship: ShipController;
  private stars: THREE.Points;

  // Particles
  private particles: THREE.Points;
  private particlePositions: Float32Array;
  private particleActive: boolean[] = [];

  // Gameplay State
  private upgrades: Upgrades;
  private maxHealth: number;
  private fuelDrainRate: number;
  private health: number;
  private fuel = CONFIG.maxFuel;
  public points = 0;
  private isGameOver = false;
  private shakeTimer = 0;
  private lastDist = 0;

  // Altitude Guardrails
  private altWarning = "";
  private altGameOverTimer = 0;

  public onBiomeChange?: (name: string) => void;
  public onUpdateStats?: (stats: GameStats) => void;
  public onGameOver?: (reason: string) => void;

  constructor(container: HTMLElement, upgrades: Upgrades) {
    this.upgrades = upgrades;
    this.maxHealth = CONFIG.maxHealth + (this.upgrades.maxHealth * 20); 
    this.fuelDrainRate = CONFIG.fuelDrainRate * (1 - (this.upgrades.fuelEfficiency * 0.1)); 
    this.health = this.maxHealth;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 2000);
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(this.renderer.domElement);

    const fog = new THREE.FogExp2(0x000011, 0.002);
    this.scene.fog = fog;
    this.renderer.setClearColor(0x000005);

    this.terrain = new TerrainManager(this.scene, this.renderer, fog);
    this.terrain.onBiomeChange = (name) => this.onBiomeChange?.(name);

    this.ship = new ShipController(this.upgrades);
    this.scene.add(this.ship.group);

    this.stars = this.createStars();
    this.scene.add(this.stars);

    // Initialize Particles
    const pCount = 200;
    const pGeo = new THREE.BufferGeometry();
    this.particlePositions = new Float32Array(pCount * 3);
    for(let i=0; i<pCount; i++) {
        this.particlePositions[i*3] = 0;
        this.particlePositions[i*3+1] = -1000; 
        this.particlePositions[i*3+2] = 0;
        this.particleActive.push(false);
    }
    pGeo.setAttribute('position', new THREE.BufferAttribute(this.particlePositions, 3));
    this.particles = new THREE.Points(pGeo, new THREE.PointsMaterial({ color: 0x00ffff, size: 0.4, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending }));
    this.scene.add(this.particles);

    this.setupLighting();
    window.addEventListener('resize', this.onResize.bind(this));
  }

  private createStars(): THREE.Points {
    const geo = new THREE.BufferGeometry();
    const vertices = [];
    for (let i = 0; i < 5000; i++) {
      vertices.push((Math.random() - 0.5) * 2000, (Math.random() - 0.5) * 2000, (Math.random() - 0.5) * 2000);
    }
    geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    return new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.7 }));
  }

  private setupLighting() {
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.8));
    const sun = new THREE.DirectionalLight(0xffffff, 1.2);
    sun.position.set(100, 200, 100);
    this.scene.add(sun);
  }

  private triggerFuelEffect(pos: THREE.Vector3) {
    let activated = 0;
    for(let i=0; i<this.particleActive.length && activated < 50; i++) {
        if(!this.particleActive[i]) {
            this.particleActive[i] = true;
            const angle = Math.random() * Math.PI * 2;
            const dist = 5 + Math.random() * 5;
            this.particlePositions[i*3] = pos.x + Math.cos(angle) * dist;
            this.particlePositions[i*3+1] = pos.y + (Math.random() - 0.5) * 5;
            this.particlePositions[i*3+2] = pos.z + Math.sin(angle) * dist;
            activated++;
        }
    }
  }

  private updateParticles() {
    const attr = this.particles.geometry.attributes.position as THREE.BufferAttribute;
    const target = this.ship.group.position;
    for(let i=0; i<this.particleActive.length; i++) {
        if(this.particleActive[i]) {
            const px = attr.getX(i);
            const py = attr.getY(i);
            const pz = attr.getZ(i);
            attr.setX(i, px + (target.x - px) * 0.15);
            attr.setY(i, py + (target.y - py) * 0.15);
            attr.setZ(i, pz + (target.z - pz) * 0.15);
            if(Math.abs(target.x - px) < 0.5 && Math.abs(target.y - py) < 0.5 && Math.abs(target.z - pz) < 0.5) {
                this.particleActive[i] = false;
                attr.setY(i, -1000);
            }
        }
    }
    attr.needsUpdate = true;
  }

  private checkCollisions() {
    const shipBox = new THREE.Box3().setFromObject(this.ship.group);
    const terrainHeight = this.terrain.getHeight(this.ship.group.position.x, this.ship.group.position.z) - 50;
    if (this.ship.group.position.y < terrainHeight + 1) this.triggerDeath("CRASHED INTO TERRAIN");

    for (const ast of this.terrain.obstacles) {
      if (shipBox.intersectsBox(new THREE.Box3().setFromObject(ast))) {
        this.health -= 20;
        this.shakeTimer = 0.5;
        ast.position.add(new THREE.Vector3(0, 0, 50));
        if (this.health <= 0) this.triggerDeath("HULL INTEGRITY CRITICAL");
      }
    }

    const worldPos = new THREE.Vector3();
    for (const cell of this.terrain.fuelCells) {
      cell.getWorldPosition(worldPos);
      if (this.ship.group.position.distanceTo(worldPos) < 6) {
        this.fuel = Math.min(CONFIG.maxFuel, this.fuel + CONFIG.fuelReplenish);
        this.points += 500; 
        this.triggerFuelEffect(worldPos);
        cell.visible = false;
      }
    }
  }

  private triggerDeath(reason: string) {
    if (this.isGameOver) return;
    this.isGameOver = true;
    this.ship.group.scale.set(5, 5, 5);
    this.ship.group.traverse((obj) => {
      if (obj instanceof THREE.Mesh) obj.material = new THREE.MeshBasicMaterial({ color: 0xffaa00, wireframe: true });
    });
    setTimeout(() => this.onGameOver?.(reason), 1000);
  }

  private onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  public animate() {
    if (this.isGameOver) {
      this.renderer.render(this.scene, this.camera);
      return;
    }

    const distTotal = this.ship.group.position.length();
    const deltaDist = distTotal - this.lastDist;
    this.lastDist = distTotal;

    const biomeMultiplier = 0.1 + (Math.floor(distTotal / CONFIG.biomeDist) * 0.1);
    this.points += deltaDist * biomeMultiplier;

    const alt = this.ship.group.position.y + 50;
    let currentFuelDrain = this.fuelDrainRate;
    this.altWarning = "";

    if (alt >= 150) {
        currentFuelDrain *= 10;
        this.altGameOverTimer += 0.016;
        this.altWarning = `PULL BACK IMMEDIATELY! ${Math.max(0, 3 - this.altGameOverTimer).toFixed(1)}s`;
        if (this.altGameOverTimer >= 3) this.triggerDeath("LOST IN UPPER ATMOSPHERE");
    } else if (alt >= 100) {
        currentFuelDrain *= 4;
        this.altWarning = "WARNING: HIGH ALTITUDE - FUEL LEAKING";
        this.altGameOverTimer = 0;
    } else {
        this.altGameOverTimer = 0;
    }

    this.fuel -= currentFuelDrain;
    if (this.fuel <= 0) this.triggerDeath("FUEL EXHAUSTED");

    const currentSpeed = CONFIG.baseForwardSpeed * this.terrain.getSpeedMultiplier();
    this.ship.update(currentSpeed);

    const idealPos = CONFIG.cameraOffset.clone().applyQuaternion(this.ship.group.quaternion).add(this.ship.group.position);
    if (this.shakeTimer > 0) {
      idealPos.x += (Math.random() - 0.5) * 2;
      idealPos.y += (Math.random() - 0.5) * 2;
      this.shakeTimer -= 0.016;
    }
    this.camera.position.lerp(idealPos, CONFIG.cameraLerp);
    this.camera.lookAt(CONFIG.cameraLookAtOffset.clone().applyQuaternion(this.ship.group.quaternion).add(this.ship.group.position));

    this.terrain.fuelCells.forEach(f => {
        f.rotation.y += 0.03;
        f.position.y += Math.sin(Date.now() * 0.003) * 0.05;
    });
    
    this.terrain.update(this.ship.group.position, this.scene, distTotal);
    this.checkCollisions();
    this.updateParticles();
    this.stars.position.copy(this.camera.position);

    this.onUpdateStats?.({
      health: Math.round((this.health / this.maxHealth) * 100), fuel: this.fuel, points: Math.floor(this.points),
      speed: Math.round(currentSpeed * 100),
      alt: Math.round(alt),
      dist: Math.round(distTotal),
      warning: this.altWarning
    });

    this.renderer.render(this.scene, this.camera);
  }
}
