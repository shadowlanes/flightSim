import * as THREE from 'three';
import gameConfig from './gameConfig.json';

export interface Biome {
  name: string;
  fog: number;
  ground: number;
  terrainType: 'FLAT' | 'HILLS' | 'MOUNTAINS' | 'GORGES';
  sunColor: number;
  sunIntensity: number;
}

export const BIOMES: Biome[] = [
  { name: "AETHERIA", fog: 0x000008, ground: 0x00aaaa, terrainType: 'FLAT', sunColor: 0x00ffff, sunIntensity: 0.8 },
  { name: "MARS PRIME", fog: 0x1a0800, ground: 0xcc3300, terrainType: 'MOUNTAINS', sunColor: 0xff6600, sunIntensity: 1.2 },
  { name: "VERIDIA", fog: 0x000a05, ground: 0x00aa44, terrainType: 'HILLS', sunColor: 0x00ff88, sunIntensity: 0.7 },
  { name: "NEON VOID", fog: 0x0a001a, ground: 0xaa00aa, terrainType: 'GORGES', sunColor: 0xff00ff, sunIntensity: 0.6 },
  { name: "FROST REACH", fog: 0x080a10, ground: 0xaaaaaa, terrainType: 'HILLS', sunColor: 0xccccff, sunIntensity: 0.9 }
];

const PREFIXES = ["NEO", "ALPHA", "CYBER", "VOID", "AERO", "TERRA", "XENON"];
const SUFFIXES = ["PRIME", "IV", "VII", "MINUS", "CORP", "OS", "ALPHA"];

export const getRandomPlanetName = () => {
  const p = PREFIXES[Math.floor(Math.random() * PREFIXES.length)];
  const s = SUFFIXES[Math.floor(Math.random() * SUFFIXES.length)];
  return `${p} ${s}`;
};

export const CONFIG = {
  ...gameConfig,
  cameraOffset: new THREE.Vector3(0, 5, -15),
  cameraLookAtOffset: new THREE.Vector3(0, 2, 10),
  chunkSize: 200,
  chunkRes: 64,
  renderDist: 2,
  
  // Speed Constants (in m/s for engine, converted to km/h for UI)
  minSpeed: 40,
  maxSpeed: 250,
  cruiseSpeed: 80,
  accelRate: 0.5,
  decelRate: 0.3,
  gravitySpeedImpact: 0.8
};
