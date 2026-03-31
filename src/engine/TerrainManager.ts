import * as THREE from 'three';
import { createNoise2D } from 'simplex-noise';
import { CONFIG, BIOMES } from './constants';

const TERRAIN_PARAMS = {
  'FLAT': { freq: 0.002, amp: 15, power: 1, octaves: 2, ridged: false },
  'HILLS': { freq: 0.004, amp: 45, power: 1.5, octaves: 3, ridged: false },
  'MOUNTAINS': { freq: 0.006, amp: 110, power: 2.2, octaves: 4, ridged: true },
  'GORGES': { freq: 0.005, amp: 130, power: 0.6, octaves: 3, ridged: false }
};

// Returns a random grayscale color with brightness in [0.3, 0.9] (3–9 on a 0–10 scale)
function randomGrayscale(): THREE.Color {
  const v = 0.3 + Math.random() * 0.6;
  return new THREE.Color(v, v, v);
}

// Simple seeded random number generator for deterministic crater placement
function seededRandom(seed: number): number {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

interface Crater {
  x: number;
  z: number;
  radius: number;
  depth: number;
}

export class TerrainManager {
  private noise2D = createNoise2D();
  private terrainChunks: Map<string, THREE.Group> = new Map();
  private terrainMaterial: THREE.MeshStandardMaterial;

  public fuelCells: THREE.Group[] = []; // deprecated — kept for compatibility, no longer spawned

  // Crater storage: chunk key -> array of craters
  private craters: Map<string, Crater[]> = new Map();
  
  private currentBiomeIndex = 0;
  private nextBiomeIndex = 0;
  private biomeOffset = (() => {
    // Only start at a FLAT or HILLS biome so the ship never spawns into mountains/gorges
    const safeIndices = BIOMES.map((_, i) => i).filter(i => BIOMES[i].terrainType === 'FLAT' || BIOMES[i].terrainType === 'HILLS');
    return safeIndices[Math.floor(Math.random() * safeIndices.length)];
  })();
  private biomeTransition = 1;

  // Variable-length biomes: each entry is the length of that biome in metres (1000–5000)
  // biomeCumulative[i] = distance at which biome i starts; biomeCumulative[0] = 0
  private biomeLengths: number[] = [];
  private biomeCumulative: number[] = [0];
  private fog: THREE.FogExp2;
  private sun: THREE.DirectionalLight;
  private currentBiomeColor: THREE.Color;

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

    this.currentBiomeColor = randomGrayscale();
    this.terrainMaterial = new THREE.MeshStandardMaterial({
      color: this.currentBiomeColor,
      flatShading: true,
      roughness: 0.95,
      metalness: 0.0
    });
  }

  // Grow the biome length array until it covers at least upToDist metres
  private growBiomes(upToDist: number) {
    while (this.biomeCumulative[this.biomeCumulative.length - 1] <= upToDist) {
      // First biome is always 500m, rest are 1000-5000m
      const len = this.biomeLengths.length === 0 ? 500 : 1000 + Math.random() * 4000;
      this.biomeLengths.push(len);
      this.biomeCumulative.push(this.biomeCumulative[this.biomeCumulative.length - 1] + len);
    }
  }

  // Returns the sequential biome slot index and transition (0–1) for a given distance
  private getBiomeAtDist(dist: number): { idx: number; transition: number } {
    this.growBiomes(dist);
    // Binary search for the segment containing dist
    let lo = 0, hi = this.biomeLengths.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.biomeCumulative[mid] <= dist) lo = mid;
      else hi = mid - 1;
    }
    const transition = (dist - this.biomeCumulative[lo]) / this.biomeLengths[lo];
    return { idx: lo, transition };
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
    const { idx, transition } = this.getBiomeAtDist(dist);
    const b1 = BIOMES[(idx + this.biomeOffset) % BIOMES.length];
    const b2 = BIOMES[(idx + 1 + this.biomeOffset) % BIOMES.length];

    const p1 = TERRAIN_PARAMS[b1.terrainType];
    const p2 = TERRAIN_PARAMS[b2.terrainType];

    // Sample noise for both biomes and lerp
    const n1 = this.getNoise(x, z, p1.freq, p1.octaves, p1.ridged);
    const n2 = this.getNoise(x, z, p2.freq, p2.octaves, p2.ridged);

    const val1 = Math.pow(n1, p1.power);
    const val2 = Math.pow(n2, p2.power);

    const n = THREE.MathUtils.lerp(val1, val2, transition);
    const amp = THREE.MathUtils.lerp(p1.amp, p2.amp, transition);

    const baseHeight = amp;
    const offset = -45;

    let height = (n * baseHeight) + offset;

    // Apply crater deformation
    // Check the chunk containing this point and adjacent chunks
    const cx = Math.floor(x / CONFIG.chunkSize);
    const cz = Math.floor(z / CONFIG.chunkSize);

    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const chunkKey = `${cx + dx},${cz + dz}`;
        const craterList = this.craters.get(chunkKey);

        if (craterList) {
          for (const crater of craterList) {
            const distX = x - crater.x;
            const distZ = z - crater.z;
            const distToCrater = Math.sqrt(distX * distX + distZ * distZ);

            if (distToCrater < crater.radius) {
              // Smooth falloff: depth * (1 - (distance/radius)²)²
              const normalizedDist = distToCrater / crater.radius;
              const falloff = 1 - normalizedDist * normalizedDist;
              const depression = crater.depth * falloff * falloff;
              height -= depression;
            }
          }
        }
      }
    }

    return height;
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

    this.terrainMaterial.color.copy(this.currentBiomeColor);

    const mesh = new THREE.Mesh(geo, this.terrainMaterial);
    mesh.receiveShadow = true;
    group.add(mesh);

    // Rocks (only in FLAT and HILLS biomes)
    const chunkCenterX = cx * CONFIG.chunkSize;
    const chunkCenterZ = cz * CONFIG.chunkSize;
    const chunkDist = Math.sqrt(chunkCenterX * chunkCenterX + chunkCenterZ * chunkCenterZ);
    const { idx: chunkBiomeIdx } = this.getBiomeAtDist(chunkDist);
    const chunkBiome = BIOMES[(chunkBiomeIdx + this.biomeOffset) % BIOMES.length];

    if (chunkBiome.terrainType === 'FLAT' || chunkBiome.terrainType === 'HILLS') {
      const clusterCount = 2 + Math.floor(Math.random() * 4); // 2-5 clusters

      for (let c = 0; c < clusterCount; c++) {
        // Random cluster center
        const clusterX = (Math.random() - 0.5) * CONFIG.chunkSize * 0.8;
        const clusterZ = (Math.random() - 0.5) * CONFIG.chunkSize * 0.8;

        const rockCount = 3 + Math.floor(Math.random() * 5); // 3-7 rocks per cluster

        for (let r = 0; r < rockCount; r++) {
          // Offset from cluster center
          const offsetX = (Math.random() - 0.5) * 15;
          const offsetZ = (Math.random() - 0.5) * 15;

          const rockX = clusterX + offsetX;
          const rockZ = clusterZ + offsetZ;
          const rockY = this.getHeight(chunkCenterX + rockX, chunkCenterZ + rockZ);

          // Random rock size
          const scale = 0.8 + Math.random() * 2.2; // 0.8-3.0

          // Use dodecahedron for interesting rock shape
          const geometry = new THREE.DodecahedronGeometry(scale, 0);

          // Rock color based on current biome terrain color + 5-15%
          const terrainGray = this.currentBiomeColor.r; // grayscale so r=g=b
          const offset = 0.05 + Math.random() * 0.1; // 5-15%
          const rockGray = Math.min(1.0, terrainGray + offset);

          // Vary each rock slightly within the offset range
          const variation = (Math.random() - 0.5) * 0.03; // ±1.5% variation
          const finalGray = Math.max(0, Math.min(1.0, rockGray + variation));

          const rockColor = new THREE.Color(finalGray, finalGray, finalGray);

          const material = new THREE.MeshStandardMaterial({
            color: rockColor,
            flatShading: true,
            roughness: 0.9,
            metalness: 0.1
          });

          const rock = new THREE.Mesh(geometry, material);
          rock.position.set(rockX, rockY + scale * 0.5, rockZ);

          // Random rotation for variety
          rock.rotation.set(
            Math.random() * Math.PI,
            Math.random() * Math.PI,
            Math.random() * Math.PI
          );

          rock.castShadow = true;
          rock.receiveShadow = true;

          group.add(rock);
        }
      }
    }

    // Generate craters (only in FLAT biomes, deterministically)
    const chunkKey = `${cx},${cz}`;
    if (chunkBiome.terrainType === 'FLAT' && !this.craters.has(chunkKey)) {
      const craterList: Crater[] = [];

      // Use chunk coords as seed
      const seed = cx * 73856093 ^ cz * 19349663;
      const rand1 = seededRandom(seed);
      const rand2 = seededRandom(seed + 1);
      const rand3 = seededRandom(seed + 2);

      // 30% chance of having craters
      if (rand1 < 0.3) {
        // 1-2 craters
        const craterCount = rand2 < 0.5 ? 1 : 2;

        for (let i = 0; i < craterCount; i++) {
          const rx = seededRandom(seed + 10 + i * 4);
          const rz = seededRandom(seed + 11 + i * 4);
          const rRadius = seededRandom(seed + 12 + i * 4);
          const rDepth = seededRandom(seed + 13 + i * 4);

          const craterX = cx * CONFIG.chunkSize + (rx - 0.5) * CONFIG.chunkSize * 0.6;
          const craterZ = cz * CONFIG.chunkSize + (rz - 0.5) * CONFIG.chunkSize * 0.6;
          const radius = 20 + rRadius * 40; // 20-60 units
          const depth = 8 + rDepth * 12; // 8-20 units deep

          craterList.push({ x: craterX, z: craterZ, radius, depth });
        }
      }

      this.craters.set(chunkKey, craterList);
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
          if (child instanceof THREE.Group) {
            this.fuelCells = this.fuelCells.filter(f => f !== child);
          }
        });
        scene.remove(group);
        this.terrainChunks.delete(key);
        this.craters.delete(key); // Clean up crater data
      }
    }

    this.updateBiomes(distance);
  }

  private updateBiomes(distance: number) {
    const { idx: targetIdx } = this.getBiomeAtDist(distance);
    if (targetIdx !== this.nextBiomeIndex) {
      this.nextBiomeIndex = targetIdx;
      this.biomeTransition = 0;

      const newBiome = BIOMES[(this.nextBiomeIndex + this.biomeOffset) % BIOMES.length];
      this.currentBiomeColor = randomGrayscale();
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
