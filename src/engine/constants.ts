import * as THREE from 'three';
import gameConfig from './gameConfig.json';

export interface Biome {
  name: string;
  fog: number;
  ground: number;
  sky: number;
}

export const BIOMES: Biome[] = [
  { name: "AETHERIA", fog: 0x000011, ground: 0x00ffff, sky: 0x000005 },
  { name: "MARS PRIME", fog: 0x331100, ground: 0xff4400, sky: 0x110500 },
  { name: "VERIDIA", fog: 0x002211, ground: 0x00ff88, sky: 0x001105 },
  { name: "NEON VOID", fog: 0x220044, ground: 0xff00ff, sky: 0x110022 },
  { name: "FROST REACH", fog: 0x112233, ground: 0xffffff, sky: 0x051122 }
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
  chunkRes: 24,
  renderDist: 3
};
