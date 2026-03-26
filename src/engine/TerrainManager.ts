import * as THREE from 'three';
import { createNoise2D } from 'simplex-noise';
import { CONFIG, BIOMES, getRandomPlanetName } from './constants';

export class TerrainManager {
  private noise2D = createNoise2D();
  private biomeNoise2D = createNoise2D();
  private warpNoise2D = createNoise2D();
  private dramaNoise2D = createNoise2D();
  private terrainChunks: Map<string, THREE.Group> = new Map();
  private terrainMaterial: THREE.MeshPhongMaterial;
  
  public obstacles: THREE.Mesh[] = [];
  public fuelCells: THREE.Group[] = [];
  
  private currentBiomeIndex = 0;
  private nextBiomeIndex = 0;
  private biomeTransition = 1;
  private fog: THREE.FogExp2;
  private renderer: THREE.WebGLRenderer;

  public onBiomeChange?: (name: string) => void;

  constructor(scene: THREE.Scene, renderer: THREE.WebGLRenderer, fog: THREE.FogExp2) {
    this.renderer = renderer;
    this.fog = fog;
    this.terrainMaterial = new THREE.MeshPhongMaterial({
      color: BIOMES[0].ground,
      flatShading: true,
      shininess: 0
    });
  }

  private fbm(x: number, z: number) {
    let total = 0;
    let frequency = 0.005;
    let amplitude = 1;
    let maxValue = 0;
    for (let i = 0; i < 6; i++) {
      total += (this.noise2D(x * frequency, z * frequency)) * amplitude;
      maxValue += amplitude;
      amplitude *= 0.5;
      frequency *= 2.0;
    }
    return (total / maxValue + 1) / 2;
  }

  private ridgedFbm(x: number, z: number) {
    let total = 0;
    let frequency = 0.005;
    let amplitude = 1;
    let maxValue = 0;
    for (let i = 0; i < 6; i++) {
      let n = this.noise2D(x * frequency, z * frequency);
      n = 1.0 - Math.abs(n);
      total += n * amplitude;
      maxValue += amplitude;
      amplitude *= 0.5;
      frequency *= 2.0;
    }
    return total / maxValue;
  }

  private gorgeFbm(x: number, z: number) {
    let total = 0;
    let frequency = 0.005;
    let amplitude = 1;
    let maxValue = 0;
    for (let i = 0; i < 6; i++) {
      let n = this.noise2D(x * frequency, z * frequency);
      n = Math.abs(n);
      total += n * amplitude;
      maxValue += amplitude;
      amplitude *= 0.5;
      frequency *= 2.0;
    }
    return total / maxValue;
  }

  private warp(x: number, z: number): [number, number] {
    const warpFreq = 0.002;
    const warpAmp = 40;
    
    // Warp 1
    const qx = this.warpNoise2D(x * warpFreq, z * warpFreq) * warpAmp;
    const qz = this.warpNoise2D((x + 5.2) * warpFreq, (z + 1.3) * warpFreq) * warpAmp;
    
    // Warp 2 (Double warp for extreme terrain)
    const rx = this.warpNoise2D((x + qx + 1.7) * warpFreq, (z + qz + 9.2) * warpFreq) * warpAmp;
    const rz = this.warpNoise2D((x + qx + 8.3) * warpFreq, (z + qz + 2.8) * warpFreq) * warpAmp;
    
    return [x + rx, z + rz];
  }

  public getHeight(x: number, z: number) {
    const [wx, wz] = this.warp(x, z);
    const bFreq = 0.0012;
    const biomeValue = (this.biomeNoise2D(wx * bFreq, wz * bFreq) + 1) / 2;
    
    // Drama multiplier (very low frequency)
    const dFreq = 0.0005;
    const dramaControl = (this.dramaNoise2D(wx * dFreq, wz * dFreq) + 1) / 2;
    
    const noiseNormal = this.fbm(wx, wz);
    const noiseRidged = this.ridgedFbm(wx, wz);
    const noiseGorge = this.gorgeFbm(wx, wz);
    
    const plainsToHills = THREE.MathUtils.smoothstep(biomeValue, 0.25, 0.4);
    const hillsToMountains = THREE.MathUtils.smoothstep(biomeValue, 0.55, 0.7);
    const mountainsToGorges = THREE.MathUtils.smoothstep(biomeValue, 0.8, 0.95);

    const plainsMult = 0.15;
    const hillsMult = 0.5;
    const mountainMult = 1.8;
    const gorgeMult = 2.0;

    let finalNoise = THREE.MathUtils.lerp(noiseNormal, noiseNormal, plainsToHills);
    finalNoise = THREE.MathUtils.lerp(finalNoise, noiseRidged, hillsToMountains);

    let m = THREE.MathUtils.lerp(plainsMult, hillsMult, plainsToHills);
    m = THREE.MathUtils.lerp(m, mountainMult, hillsToMountains);

    // Apply Drama Multiplier
    const spireWeight = THREE.MathUtils.smoothstep(dramaControl, 0.55, 0.8);
    const trenchWeight = THREE.MathUtils.smoothstep(dramaControl, 0.45, 0.2);
    
    let dramaMult = THREE.MathUtils.lerp(1.0, 2.5, spireWeight);
    dramaMult = THREE.MathUtils.lerp(dramaMult, 0.5, trenchWeight);
    
    m *= dramaMult;

    const baseHeight = 120;
    const offset = -30;

    let height = (finalNoise * baseHeight * m) + offset;

    if (biomeValue > 0.8) {
        const gorgeDepth = (noiseGorge * baseHeight * gorgeMult * dramaMult);
        const targetGorgeHeight = offset - gorgeDepth;
        height = THREE.MathUtils.lerp(height, targetGorgeHeight, mountainsToGorges);
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
    const vertexCount = (res + 1) * (res + 1);
    const heights = new Float32Array(vertexCount);

    // Initial height generation
    for (let i = 0; i <= res; i++) {
      for (let j = 0; j <= res; j++) {
        const px = (j / res - 0.5) * size + cx * size;
        const pz = (i / res - 0.5) * size + cz * size;
        heights[i * (res + 1) + j] = this.getHeight(px, pz);
      }
    }

    // 2-pass smoothing for low-lying areas
    for (let pass = 0; pass < 2; pass++) {
        const newHeights = new Float32Array(heights);
        for (let i = 0; i <= res; i++) {
            for (let j = 0; j <= res; j++) {
                const idx = i * (res + 1) + j;
                const h = heights[idx];

                // Only smooth flat low-lying areas (height < -10)
                if (h < -10) {
                    let sum = h;
                    let count = 1;

                    // Sample neighbors (including across chunk boundaries if needed)
                    // For simplicity and seamlessness, we'll just use the 2D array we have
                    // and fall back to getHeight for boundaries to ensure no seams.
                    const neighbors = [[i-1, j], [i+1, j], [i, j-1], [i, j+1]];
                    for (const [ni, nj] of neighbors) {
                        if (ni >= 0 && ni <= res && nj >= 0 && nj <= res) {
                            sum += heights[ni * (res + 1) + nj];
                        } else {
                            // Boundary neighbor - sample fresh to avoid seams
                            const npx = (nj / res - 0.5) * size + cx * size;
                            const npz = (ni / res - 0.5) * size + cz * size;
                            sum += this.getHeight(npx, npz);
                        }
                        count++;
                    }
                    newHeights[idx] = sum / count;
                }
            }
        }
        heights.set(newHeights);
    }

    // Apply heights to geometry
    for (let i = 0; i < vertexCount; i++) {
      pos.setY(i, heights[i]);
    }
    
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, this.terrainMaterial);
    group.add(mesh);

    // Asteroids
    for(let i = 0; i < CONFIG.asteroidCount; i++) {
      const rx = (Math.random() - 0.5) * CONFIG.chunkSize;
      const rz = (Math.random() - 0.5) * CONFIG.chunkSize;
      const ry = 10 + Math.random() * 40;
      const astGeo = new THREE.DodecahedronGeometry(2 + Math.random() * 5, 0);
      const ast = new THREE.Mesh(astGeo, new THREE.MeshPhongMaterial({ color: 0x444444, flatShading: true }));
      ast.position.set(rx, ry, rz);
      group.add(ast);
      this.obstacles.push(ast);
    }

    // Fuel Cells
    const dist = Math.abs(cz * CONFIG.chunkSize);
    const densityScale = Math.max(0.2, 1 - (dist / 10000));
    const fuelCount = Math.floor(CONFIG.fuelCanCount * densityScale);

    for(let i = 0; i < fuelCount; i++) {
      const rx = (Math.random() - 0.5) * CONFIG.chunkSize;
      const rz = (Math.random() - 0.5) * CONFIG.chunkSize;
      const ry = 5 + Math.random() * 25;
      const fuelGroup = new THREE.Group();
      fuelGroup.add(new THREE.Mesh(new THREE.SphereGeometry(1.2, 16, 16), new THREE.MeshPhongMaterial({ color: 0x00ffff, emissive: 0x00aaaa, transparent: true, opacity: 0.9 })));
      fuelGroup.add(new THREE.Mesh(new THREE.SphereGeometry(2.5, 16, 16), new THREE.MeshBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.2 })));
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
      this.onBiomeChange?.(getRandomPlanetName());
    }

    if (this.biomeTransition < 1) {
      this.biomeTransition += 0.005;
      const b1 = BIOMES[this.currentBiomeIndex % BIOMES.length];
      const b2 = BIOMES[this.nextBiomeIndex % BIOMES.length];
      this.fog.color.lerpColors(new THREE.Color(b1.fog), new THREE.Color(b2.fog), this.biomeTransition);
      this.terrainMaterial.color.lerpColors(new THREE.Color(b1.ground), new THREE.Color(b2.ground), this.biomeTransition);
      this.renderer.setClearColor(new THREE.Color(b1.sky).lerp(new THREE.Color(b2.sky), this.biomeTransition));
      if (this.biomeTransition >= 1) this.currentBiomeIndex = this.nextBiomeIndex;
    }
  }

  public getSpeedMultiplier() {
    return 1 + (this.nextBiomeIndex * (CONFIG.speedIncrementPerBiome / CONFIG.baseForwardSpeed));
  }
}
