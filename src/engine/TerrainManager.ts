import * as THREE from 'three';
import { createNoise2D } from 'simplex-noise';
import { CONFIG, BIOMES } from './constants';

const TERRAIN_PARAMS = {
  'FLAT': { freq: 0.002, amp: 15, power: 1, octaves: 2, ridged: false },
  'HILLS': { freq: 0.004, amp: 45, power: 1.5, octaves: 3, ridged: false },
  'MOUNTAINS': { freq: 0.006, amp: 110, power: 2.2, octaves: 4, ridged: true },
  'GORGES': { freq: 0.005, amp: 130, power: 0.6, octaves: 3, ridged: false }
};

// Biome flat colors
const BIOME_COLORS: Record<string, number> = {
  'Desert Dunes':   0xe8d4a0,
  'Emerald Valley': 0x4a7c2b,
  'Frozen Peaks':   0xd4e4f0,
  'Volcanic Wastes':0x3a2222,
  'Purple Haze':    0x7a5c9e,
  'Coral Reef':     0x5c9e9e,
};

export class TerrainManager {
  private noise2D = createNoise2D();
  private terrainChunks: Map<string, THREE.Group> = new Map();
  private terrainMaterial: THREE.MeshStandardMaterial;
  
  public obstacles: THREE.Mesh[] = [];
  public fuelCells: THREE.Group[] = [];
  
  private currentBiomeIndex = 0;
  private nextBiomeIndex = 0;
  private biomeOffset = Math.floor(Math.random() * BIOMES.length);
  private biomeTransition = 1;
  private fog: THREE.FogExp2;
  private sun: THREE.DirectionalLight;
  private currentPaletteName: string;

  public onBiomeChange?: (name: string) => void;

  constructor(scene: THREE.Scene, fog: THREE.FogExp2, sun: THREE.DirectionalLight) {
    this.fog = fog;
    this.sun = sun;

    // Initial biome setup based on offset
    this.currentBiomeIndex = 0;
    this.nextBiomeIndex = 0;
    const initialBiome = BIOMES[this.biomeOffset % BIOMES.length];

    // Initialize fog and sun to match starting biome
    this.fog.color.set(initialBiome.fog);
    this.sun.color.set(initialBiome.sunColor);
    this.sun.intensity = initialBiome.sunIntensity;

    // Set initial palette
    this.currentPaletteName = initialBiome.name;

    this.terrainMaterial = new THREE.MeshStandardMaterial({
      color: 0x4a7c2b,
      flatShading: true,
      roughness: 0.95,
      metalness: 0.0
    });
  }

  private getNoise(x: number, z: number, freq: number, octaves: number, ridged: boolean): number {
    let value = 0;
    let amplitude = 1;
    let f = freq;
    let weight = 0;

    for (let i = 0; i < octaves; i++) {
      let n = this.noise2D(x * f, z * f);
      
      if (ridged) {
        n = 1.0 - Math.abs(n);
        n = n * n; // Sharpen peaks
      } else {
        n = (n + 1) / 2;
      }

      value += n * amplitude;
      weight += amplitude;
      amplitude *= 0.5;
      f *= 2.1;
    }

    return value / weight;
  }

  public getHeight(x: number, z: number) {
    const dist = Math.sqrt(x * x + z * z);
    const biomeIdx = Math.floor(dist / CONFIG.biomeDist) + this.biomeOffset;
    const nextBiomeIdx = biomeIdx + 1;
    const transition = (dist % CONFIG.biomeDist) / CONFIG.biomeDist;

    const b1 = BIOMES[biomeIdx % BIOMES.length];
    const b2 = BIOMES[nextBiomeIdx % BIOMES.length];

    const p1 = TERRAIN_PARAMS[b1.terrainType];
    const p2 = TERRAIN_PARAMS[b2.terrainType];

    // Sample noise for both biomes and lerp
    const n1 = this.getNoise(x, z, p1.freq, p1.octaves, p1.ridged);
    const n2 = this.getNoise(x, z, p2.freq, p2.octaves, p2.ridged);
    
    // Special handling for GORGES in the noise itself if needed
    let val1 = n1;
    let val2 = n2;
    
    if (b1.terrainType === 'GORGES') val1 = Math.pow(val1, p1.power);
    else val1 = Math.pow(val1, p1.power);
    
    if (b2.terrainType === 'GORGES') val2 = Math.pow(val2, p2.power);
    else val2 = Math.pow(val2, p2.power);

    const n = THREE.MathUtils.lerp(val1, val2, transition);
    const amp = THREE.MathUtils.lerp(p1.amp, p2.amp, transition);
    
    const baseHeight = amp;
    const offset = -45;

    return (n * baseHeight) + offset;
  }

  private createChunk(cx: number, cz: number, scene: THREE.Scene) {
    const group = new THREE.Group();
    const res = CONFIG.chunkRes;
    const size = CONFIG.chunkSize;
    const geo = new THREE.PlaneGeometry(size, size, res, res);
    geo.rotateX(-Math.PI / 2);

    const pos = geo.attributes.position;

    // Set vertex heights
    for (let i = 0; i <= res; i++) {
      for (let j = 0; j <= res; j++) {
        const px = (j / res - 0.5) * size + cx * size;
        const pz = (i / res - 0.5) * size + cz * size;
        const idx = i * (res + 1) + j;
        pos.setY(idx, this.getHeight(px, pz));
      }
    }

    geo.computeVertexNormals();

    // Set flat biome color on material
    const flatColor = BIOME_COLORS[this.currentPaletteName] ?? 0x4a7c2b;
    this.terrainMaterial.color.set(flatColor);

    const mesh = new THREE.Mesh(geo, this.terrainMaterial);
    mesh.receiveShadow = true;
    group.add(mesh);

    // Asteroids
    for(let i = 0; i < CONFIG.asteroidCount; i++) {
      const rx = (Math.random() - 0.5) * CONFIG.chunkSize;
      const rz = (Math.random() - 0.5) * CONFIG.chunkSize;
      const ry = 10 + Math.random() * 40;
      const astGeo = new THREE.DodecahedronGeometry(2 + Math.random() * 5, 0);
      const ast = new THREE.Mesh(astGeo, new THREE.MeshStandardMaterial({
        color: 0x444444,
        flatShading: true,
        roughness: 0.9,
        metalness: 0.1
      }));
      ast.position.set(rx, ry, rz);
      ast.castShadow = true;
      ast.receiveShadow = true;
      group.add(ast);
      this.obstacles.push(ast);
    }

    // Fuel Cells
    const fuelCount = CONFIG.fuelCanCount;

    for(let i = 0; i < fuelCount; i++) {
      const rx = (Math.random() - 0.5) * CONFIG.chunkSize;
      const rz = (Math.random() - 0.5) * CONFIG.chunkSize;
      const ry = 5 + Math.random() * 25;
      const fuelGroup = new THREE.Group();
      const core = new THREE.Mesh(
        new THREE.SphereGeometry(1.2, 16, 16),
        new THREE.MeshStandardMaterial({
          color: 0x00ffff,
          emissive: 0x00aaaa,
          emissiveIntensity: 1.5,
          transparent: true,
          opacity: 0.9,
          roughness: 0.3,
          metalness: 0.1
        })
      );
      const glow = new THREE.Mesh(
        new THREE.SphereGeometry(2.5, 16, 16),
        new THREE.MeshBasicMaterial({
          color: 0x00ffff,
          transparent: true,
          opacity: 0.2
        })
      );
      fuelGroup.add(core);
      fuelGroup.add(glow);
      fuelGroup.position.set(rx, ry, rz);
      group.add(fuelGroup);
      this.fuelCells.push(fuelGroup);
    }

    group.position.set(cx * CONFIG.chunkSize, -50, cz * CONFIG.chunkSize);
    scene.add(group);
    return group;
  }

  public update(playerPos: THREE.Vector3, scene: THREE.Scene, distance: number) {
    const px = Math.floor((playerPos.x + CONFIG.chunkSize / 2) / CONFIG.chunkSize);
    const pz = Math.floor((playerPos.z + CONFIG.chunkSize / 2) / CONFIG.chunkSize);

    for (let x = px - CONFIG.renderDist; x <= px + CONFIG.renderDist; x++) {
      for (let z = pz - CONFIG.renderDist; z <= pz + CONFIG.renderDist; z++) {
        const key = `${x},${z}`;
        if (!this.terrainChunks.has(key)) {
          this.terrainChunks.set(key, this.createChunk(x, z, scene));
        }
      }
    }

    for (const [key, group] of this.terrainChunks) {
      const [cx, cz] = key.split(',').map(Number);
      if (Math.abs(cx - px) > CONFIG.renderDist || Math.abs(cz - pz) > CONFIG.renderDist) {
        group.traverse((child) => {
          if (child instanceof THREE.Mesh || child instanceof THREE.Group) {
            this.obstacles = this.obstacles.filter(o => o !== child);
            this.fuelCells = this.fuelCells.filter(f => f !== child);
          }
        });
        scene.remove(group);
        this.terrainChunks.delete(key);
      }
    }

    this.updateBiomes(distance);
  }

  private updateBiomes(distance: number) {
    const targetIdx = Math.floor(distance / CONFIG.biomeDist);
    if (targetIdx !== this.nextBiomeIndex) {
      this.nextBiomeIndex = targetIdx;
      this.biomeTransition = 0;

      // Get new biome and update palette
      const newBiome = BIOMES[(this.nextBiomeIndex + this.biomeOffset) % BIOMES.length];
      this.currentPaletteName = newBiome.name;
      this.onBiomeChange?.(newBiome.name);
    }

    if (this.biomeTransition < 1) {
      this.biomeTransition += 0.005;
      const b1 = BIOMES[(this.currentBiomeIndex + this.biomeOffset) % BIOMES.length];
      const b2 = BIOMES[(this.nextBiomeIndex + this.biomeOffset) % BIOMES.length];

      this.fog.color.lerpColors(new THREE.Color(b1.fog), new THREE.Color(b2.fog), this.biomeTransition);

      // Lerp Sun color and intensity
      this.sun.color.lerpColors(new THREE.Color(b1.sunColor), new THREE.Color(b2.sunColor), this.biomeTransition);
      this.sun.intensity = THREE.MathUtils.lerp(b1.sunIntensity, b2.sunIntensity, this.biomeTransition);

      if (this.biomeTransition >= 1) {
          this.currentBiomeIndex = this.nextBiomeIndex;
      }
    }
  }

}
