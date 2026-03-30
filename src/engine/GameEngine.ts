import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { CONFIG, BIOMES } from './constants';
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
  isCrashing: boolean;
}

export class GameEngine {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private composer: EffectComposer;
  private terrain: TerrainManager;
  private ship: ShipController;
  private stars: THREE.Group;
  private spaceObjects: THREE.Group = new THREE.Group();
  private ambientLight: THREE.AmbientLight;
  private sun: THREE.DirectionalLight;
  private dayNightTime = Math.random(); // Start at random time of day

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
  private isCrashing = false;
  private crashReason = "";
  private crashTimer = 0;
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
    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 3000);
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(this.renderer.domElement);

    // Reduced fog density for better clarity with bloom
    const fog = new THREE.FogExp2(0x000008, 0.0015);
    this.scene.fog = fog;
    this.renderer.setClearColor(0x000002);

    this.sun = new THREE.DirectionalLight(0xffffff, 1.5);
    this.sun.position.set(200, 50, 100); 
    this.sun.castShadow = true;
    this.scene.add(this.sun);

    this.terrain = new TerrainManager(this.scene, fog, this.sun);
    this.terrain.onBiomeChange = (name) => this.onBiomeChange?.(name);

    this.ship = new ShipController(this.upgrades);
    this.scene.add(this.ship.group);

    this.stars = this.createStars();
    this.scene.add(this.stars);

    this.createSpaceObjects();
    this.scene.add(this.spaceObjects);

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

    // Post-processing
    this.composer = new EffectComposer(this.renderer);
    const renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(renderPass);

    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      0.8, // strength
      0.3, // radius
      0.8 // threshold
    );
    this.composer.addPass(bloomPass);

    window.addEventListener('resize', this.onResize.bind(this));
  }

  private createStars(): THREE.Group {
    const group = new THREE.Group();
    // Randomized density: 3000 to 8000 stars
    const starCount = 3000 + Math.floor(Math.random() * 5000);
    
    // Create organic focal points (clumps)
    const clumps = Array.from({ length: 6 }, () => ({
        theta: Math.random() * Math.PI * 2,
        phi: Math.acos(2 * Math.random() - 1),
        spread: 0.3 + Math.random() * 0.5
    }));

    const layers = [
      { size: 1.2, color: 0xffffff, ratio: 0.6 }, // Tiny (was 0.7)
      { size: 2.2, color: 0xeeeeee, ratio: 0.3 }, // Small (was 1.3)
      { size: 3.8, color: 0xfafafa, ratio: 0.1 }  // Large/Bright (was 2.2)
    ];

    layers.forEach(layer => {
      const geo = new THREE.BufferGeometry();
      const vertices = [];
      const count = Math.floor(starCount * layer.ratio);

      for (let i = 0; i < count; i++) {
        let theta, phi;

        // 45% chance to cluster around a focal point for organic feel
        if (Math.random() < 0.45) {
          const clump = clumps[Math.floor(Math.random() * clumps.length)];
          theta = clump.theta + (Math.random() - 0.5) * clump.spread;
          phi = clump.phi + (Math.random() - 0.5) * clump.spread;
        } else {
          theta = Math.random() * Math.PI * 2;
          phi = Math.acos(2 * Math.random() - 1);
        }

        const r = 850 + Math.random() * 350; // Closer for fog visibility
        const x = r * Math.sin(phi) * Math.cos(theta);
        const y = r * Math.sin(phi) * Math.sin(theta);
        const z = r * Math.cos(phi);

        // Keep stars above the terrain horizon
        if (y > -40) {
          vertices.push(x, y, z);
        }
      }

      geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
      const mat = new THREE.PointsMaterial({ 
        color: layer.color, 
        size: layer.size, 
        transparent: true, 
        opacity: 0.9,
        sizeAttenuation: true
      });
      group.add(new THREE.Points(geo, mat));
    });

    return group;
  }

  private createSpaceObjects() {
    const count = 2 + Math.floor(Math.random() * 3); // 2 to 4 planets/moons
    for (let i = 0; i < count; i++) {
        const dist = 1200 + Math.random() * 500;
        const angle = Math.random() * Math.PI * 2;
        const height = 200 + Math.random() * 600;
        
        const size = 40 + Math.random() * 100;
        const geo = new THREE.IcosahedronGeometry(size, 1);
        
        // Brighter, more vibrant alien colors (higher saturation and lightness)
        const color = new THREE.Color().setHSL(Math.random(), 0.7, 0.7);
        const mat = new THREE.MeshStandardMaterial({ 
            color: color, 
            flatShading: true,
            emissive: color,
            emissiveIntensity: 0.4 // Increased glow
        });
        
        const planet = new THREE.Mesh(geo, mat);
        planet.position.set(
            Math.cos(angle) * dist,
            height,
            Math.sin(angle) * dist
        );
        
        // Random initial rotation
        planet.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
        
        // Add custom rotation speed property
        (planet as any).userData.rotSpeed = {
            x: (Math.random() - 0.5) * 0.002,
            y: (Math.random() - 0.5) * 0.002,
            z: (Math.random() - 0.5) * 0.002
        };
        
        this.spaceObjects.add(planet);
    }
  }

  private setupLighting() {
    this.ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    this.scene.add(this.ambientLight);
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
    if (this.isGameOver || this.isCrashing) return;
    this.isCrashing = true;
    this.crashReason = reason;
    this.crashTimer = 0.5; // Faster crash sequence
    this.shakeTimer = 1.0;

    // Make ship black immediately
    this.ship.group.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.material = new THREE.MeshBasicMaterial({ color: 0x000000 });
      }
    });
  }

  private onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.composer.setSize(window.innerWidth, window.innerHeight);
  }

  public animate() {
    if (this.isGameOver) {
      this.composer.render();
      return;
    }

    // Day/Night Cycle Logic
    if (CONFIG.day_night_cycle) {
      this.dayNightTime = (this.dayNightTime + CONFIG.dayNightSpeed) % 1.0;
      const angle = this.dayNightTime * Math.PI * 2;
      
      // Sun position arc
      const sunDist = 1000;
      this.sun.position.set(
        Math.cos(angle) * sunDist,
        Math.sin(angle) * sunDist,
        200 // Slight offset
      );

      // Sun height factor (0 at horizon, 1 at peak, -1 at midnight)
      const sunHeight = Math.sin(angle);
      const dayFactor = THREE.MathUtils.clamp(sunHeight * 2, 0, 1); // Sharper transition at horizon
      
      // Adjust Ambient Light
      this.ambientLight.intensity = 0.1 + (dayFactor * 0.4);
      
      // Adjust Sun Intensity (fades as it sets)
      this.sun.intensity = Math.max(0.1, dayFactor * 1.5);

      // Adjust Sky Color (Clear Color)
      // Transition from deep space black/blue to a warmer sunset/dawn to a brighter day sky
      const nightSky = new THREE.Color(0x000002);
      const horizonSky = new THREE.Color(0x1a0800); // Warm orange/brown tint
      const daySky = new THREE.Color(0x0a1a33); // Darker blue-ish for alien feel
      
      let currentSky;
      if (sunHeight > 0.1) {
        currentSky = new THREE.Color().copy(horizonSky).lerp(daySky, (sunHeight - 0.1) * 2);
      } else if (sunHeight > -0.1) {
        currentSky = new THREE.Color().copy(nightSky).lerp(horizonSky, (sunHeight + 0.1) * 5);
      } else {
        currentSky = new THREE.Color().copy(nightSky);
      }
      this.renderer.setClearColor(currentSky);

      // Tint Fog based on day/night
      const baseFogColor = this.scene.fog instanceof THREE.FogExp2 ? this.scene.fog.color : new THREE.Color(0x000008);
      const nightFog = new THREE.Color(0x000005); // Very dark blue/black
      const tintedFog = new THREE.Color().copy(nightFog).lerp(baseFogColor, 0.2 + (dayFactor * 0.8));
      if (this.scene.fog instanceof THREE.FogExp2) {
        this.scene.fog.color.copy(tintedFog);
      }

      // Stars Opacity (faint during day)
      const starOpacity = 1.0 - (dayFactor * 0.9); 
      this.stars.children.forEach(layer => {
        const mat = (layer as THREE.Points).material as THREE.PointsMaterial;
        mat.opacity = starOpacity;
      });
    }

    if (this.isCrashing) {
        this.crashTimer -= 0.016;
        this.shakeTimer = Math.max(this.shakeTimer, 0.8);
        
        // Fast camera roll
        this.camera.rotation.z += 0.2;
        
        // Ship falls slightly
        this.ship.group.position.y -= 0.8;
  
        if (this.crashTimer <= 0) {
          this.isGameOver = true;
          this.onGameOver?.(this.crashReason);
        }
    }

    const distTotal = this.ship.group.position.length();
    const dist2D = Math.sqrt(this.ship.group.position.x ** 2 + this.ship.group.position.z ** 2);
    const deltaDist = distTotal - this.lastDist;
    this.lastDist = distTotal;

    const pointsMultiplier = 0.1 + (Math.floor(dist2D / CONFIG.biomeDist) * 0.1);
    this.points += deltaDist * pointsMultiplier;

    const alt = this.ship.group.position.y + 50;
    
    // Proximity/Crash Detection
    const forward = new THREE.Vector3(0, 0, 10).applyQuaternion(this.ship.group.quaternion);
    const lookAheadPos = this.ship.group.position.clone().add(forward);
    const terrainHeightAtShip = this.terrain.getHeight(this.ship.group.position.x, this.ship.group.position.z) - 50;
    const terrainHeightAhead = this.terrain.getHeight(lookAheadPos.x, lookAheadPos.z) - 50;

    let currentFuelDrain = this.fuelDrainRate;
    this.altWarning = "";

    const isCloseToGround = this.ship.group.position.y < terrainHeightAtShip + 15;
    const isApproachingObstacle = this.ship.group.position.y < terrainHeightAhead + 15;

    if (isCloseToGround || isApproachingObstacle) {
        this.altWarning = "PULL UP!";
        // Increased persistent shake during warning
        this.shakeTimer = Math.max(this.shakeTimer, 0.4);
    } else if (alt >= 150) {
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

    if (!this.isCrashing) {
        this.fuel -= currentFuelDrain;
        if (this.fuel <= 0) this.triggerDeath("FUEL EXHAUSTED");

        const speedBiomeMultiplier = this.terrain.getSpeedMultiplier();
        this.ship.update(speedBiomeMultiplier);
    }

    const idealPos = CONFIG.cameraOffset.clone().applyQuaternion(this.ship.group.quaternion).add(this.ship.group.position);
    if (this.shakeTimer > 0) {
      // Increased shake intensity from 2 to 5 for more impact
      idealPos.x += (Math.random() - 0.5) * 5;
      idealPos.y += (Math.random() - 0.5) * 5;
      idealPos.z += (Math.random() - 0.5) * 5;
      this.shakeTimer -= 0.016;
    }
    this.camera.position.lerp(idealPos, CONFIG.cameraLerp);

    // Prevent camera from going through the floor terrain
    const terrainHeightAtCamera = this.terrain.getHeight(this.camera.position.x, this.camera.position.z) - 50;
    if (this.camera.position.y < terrainHeightAtCamera + 2) {
      this.camera.position.y = terrainHeightAtCamera + 2;
    }
    
    // Maintain camera 'up' relative to ship for free-roam
    const shipUp = new THREE.Vector3(0, 1, 0).applyQuaternion(this.ship.group.quaternion);
    this.camera.up.lerp(shipUp, CONFIG.cameraLerp);
    
    this.camera.lookAt(CONFIG.cameraLookAtOffset.clone().applyQuaternion(this.ship.group.quaternion).add(this.ship.group.position));

    this.terrain.fuelCells.forEach(f => {
        f.rotation.y += 0.03;
        f.position.y += Math.sin(Date.now() * 0.003) * 0.05;
    });
    
    this.terrain.update(this.ship.group.position, this.scene, dist2D);
    this.checkCollisions();
    this.updateParticles();
    
    // Space objects and stars follow camera to stay "infinite"
    this.stars.position.copy(this.camera.position);
    this.spaceObjects.position.copy(this.camera.position);

    // Rotate space objects (planets/moons)
    this.spaceObjects.children.forEach(obj => {
        if (obj instanceof THREE.Mesh && obj.userData.rotSpeed) {
            obj.rotation.x += obj.userData.rotSpeed.x;
            obj.rotation.y += obj.userData.rotSpeed.y;
            obj.rotation.z += obj.userData.rotSpeed.z;
        }
    });

    this.onUpdateStats?.({
      health: Math.round((this.health / this.maxHealth) * 100), fuel: this.fuel, points: Math.floor(this.points),
      speed: Math.round(this.ship.currentSpeed * 3.6), // Convert to km/h
      alt: Math.round(alt),
      dist: Math.round(distTotal),
      warning: this.altWarning,
      isCrashing: this.isCrashing
    });

    this.composer.render();
  }
}
