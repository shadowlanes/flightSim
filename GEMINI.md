# Low-Poly Flight Sim - Project Context

## Project Overview
A lightweight, web-based, third-person low-poly flight simulator built using **React**, **Three.js**, **TypeScript**, and **Vite**. The game features procedural infinite terrain, dynamic biome transitions, and a collision-based "Game Over" system.

## Core Architecture
- **Vite/React Wrapper**: The main UI (`src/App.tsx`) handles game state (altitude, distance), "Planet Discovery" notifications, and the "Game Over" overlay.
- **Game Engine**: A dedicated class-based engine (`src/engine/GameEngine.ts`) manages the Three.js scene, rendering loop, and input handling.
- **Procedural Systems**: 
  - **Terrain**: Chunk-based generation using layered sine waves to simulate Perlin-like noise.
  - **Biomes**: Dynamic shifts in fog, terrain, and sky colors every 500 units, with randomized planet names.
  - **Collision**: Real-time height checking between the ship and terrain geometry.

## Building and Running
- **Development**: `npm run dev` (or `pnpm`/`yarn`)
- **Build**: `npm run build` (Minifies and bundles to `/dist`)
- **Preview**: `npm run preview` (Serves the production build locally)

## Key Files
- `src/engine/GameEngine.ts`: The core logic for movement, rendering, and terrain.
- `src/engine/constants.ts`: Global configuration for speed, camera offsets, and biome data.
- `src/App.tsx`: The React UI layer and engine orchestration.
- `index.html`: Entry point for the Vite application.

## Development Conventions
- **TypeScript**: Strictly typed interfaces for biomes and configuration.
- **Modularity**: Keeps the 3D rendering engine separate from the UI state.
- **Performance**: Uses geometry disposal and chunk-based cleanup to maintain a stable frame rate during infinite flight.
