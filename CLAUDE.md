# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A web-based third-person flight simulator with procedural infinite terrain, dynamic biomes, and realistic flight physics. Built with React, Three.js, and TypeScript using Vite.

## Commands

- **Development**: `npm run dev` - Start dev server with hot reload
- **Build**: `npm run build` - TypeScript compile + Vite production build
- **Preview**: `npm run preview` - Preview production build locally

## Architecture

### Core Engine Classes (src/engine/)

The game engine is separated into distinct, single-responsibility modules:

**GameEngine.ts** - Main game loop and orchestration
- Owns the Three.js scene, camera, renderer, and post-processing (bloom)
- Manages game state (health, fuel, points, crash detection)
- Coordinates between ShipController and TerrainManager
- Handles collision detection and particle effects
- Implements altitude warnings and guardrails
- Optional day/night cycle with dynamic lighting

**ShipController.ts** - Ship physics and controls
- 360-degree free-roam flight model with quaternion-based rotations
- Keyboard input handling (WASD/Arrows for pitch/roll, QE for yaw)
- Dynamic speed system: diving increases speed (gravity), climbing decreases it
- Agility scaling: controls stiffen at high speeds
- Natural nose-down tendency requiring active piloting
- Engine glow intensity tied to W key (throttle up)

**TerrainManager.ts** - Procedural terrain generation
- Chunk-based infinite terrain using simplex noise
- Multi-octave Fractal Brownian Motion (FBM) for varied elevation
- Four terrain types: FLAT, HILLS, MOUNTAINS (ridged peaks), GORGES
- Biome transitions based on 2D radial distance from origin
- Spawns obstacles (asteroids) and terrain features (rocks, craters)
- Manages chunk loading/unloading based on player position

**PlasmaRecharger.ts** - Fuel replenishment system (replaced fuel cells)
- Spawns plasma recharger stations on terrain with visible beam cones
- Proximity-based collection: fly through the beam to replenish fuel
- Auto-expires after 30 seconds if uncollected
- Ship glow effect on collection

**ShipModel.ts** - Procedural ship geometry
- Parametric ship mesh built from hex cross-section fuselage, swept wings, and engine nacelles
- Shape parameters at top of file control dimensions without touching geometry code
- Supports skin/accent color customization via material properties

**MusicManager.ts** - Background music with crossfade
- Two-track system with seamless crossfade transitions
- Tracks stored in `/music/` directory

**PersistenceService.ts** - User data and localStorage
- Multi-user system stored in localStorage
- Tracks total points, upgrades (fuel efficiency, max health), and ship skins
- Session management (login/logout)

### React Layer (src/)

**App.tsx** - Game UI and state management
- Four states: login, menu, shop, playing, gameOver
- HUD rendering (health, fuel, speed, altitude, warnings)
- Shop/hangar for purchasing upgrades and changing skins
- Manages game engine lifecycle in `useEffect`

**ShipPreview.tsx** - 3D ship preview component for the shop/hangar UI
- Renders an interactive ShipModel in a standalone Three.js scene
- Supports mouse-drag rotation

### Configuration

**constants.ts** - Core constants and biome definitions
- Biome array with fog color, sun color/intensity, terrain type
- Speed, gravity, and camera constants
- Merges with gameConfig.json

**gameConfig.json** - Tunable gameplay parameters
- Health, fuel, drain rates, replenish amounts
- Chunk and collision parameters
- Day/night cycle toggle

## Flight Physics Model

The ship uses **incremental quaternion rotations**, not Euler angles:
- Pitch (W/S): rotates around local X-axis
- Roll (A/D): rotates around local Z-axis
- Yaw (Q/E): rudder + banking-induced yaw from roll

Speed is affected by:
- **Gravity**: Diving → speed up, climbing → speed down
- **Throttle**: W key adds thrust boost during climbs
- **Drag**: Natural tendency toward cruise speed

Control response degrades at extreme speeds via `speedFactor` calculation.

## Terrain Generation

Uses **distance-based biome blending**:
```
distance = sqrt(x² + z²)
biomeIndex = floor(distance / biomeDist)
transition = (distance % biomeDist) / biomeDist
```

Height is calculated by:
1. Sample noise for current and next biome
2. Apply terrain-specific transformations (ridging for mountains, power curve for gorges)
3. Lerp between the two based on transition value
4. Scale by amplitude and add offset

Terrain color is **randomized** on each biome change (not predetermined).

## Key Patterns

### Adding New Controls
Controls are handled in `ShipController.update()`. Input is converted to -1/0/1 values, then multiplied by speed constants and applied as quaternion rotations.

### Modifying Biomes
Edit `BIOMES` array in `constants.ts`. Each biome needs:
- `name`: Display name
- `fog`: Hex color for fog
- `terrainType`: One of 'FLAT' | 'HILLS' | 'MOUNTAINS' | 'GORGES'
- `sunColor`: Hex color for directional light
- `sunIntensity`: Number (typically 0.5-1.5)

Terrain parameters for each type are in `TERRAIN_PARAMS` in `TerrainManager.ts`.

### Adding Collectibles/Obstacles
- Obstacles: Spawned in `TerrainManager.createChunk()`, added to `this.obstacles[]`, checked in `GameEngine.checkCollisions()`
- Fuel replenishment: Managed by `PlasmaRechargerManager` in `PlasmaRecharger.ts`. Rechargers are spawned/updated via the manager and collected by proximity in `GameEngine`

### Upgrades
Upgrade costs are defined in `App.tsx` as `UPGRADE_COSTS` array.
Effects are applied in:
- `GameEngine` constructor: maxHealth, fuelDrainRate calculations
- `ShipController` constructor: skin color passed to ship mesh creation

## Git Conventions

- Use **conventional commit** messages (e.g. `feat:`, `fix:`, `refactor:`, `docs:`, `chore:`).
- Do **not** add a Co-Authored-By trailer.

## Important Constraints

- **Never use Euler angles** - The ship's rotation is managed via quaternions. Using Euler will break the free-roam flight model.
- **Chunk system is critical** - Do not load all terrain at once. The render distance is limited to prevent performance issues.
- **Biomes are purely visual** - They do not affect speed, gravity, or scoring. Distance-based scoring was removed to keep gameplay consistent.
- **Flight controls reversed** - A key steers left (roll -1), D steers right (roll +1). This was intentionally corrected from the original inverted controls.
