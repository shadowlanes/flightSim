# Low-Poly Flight Sim

A high-performance, web-based third-person flight simulator featuring procedural infinite terrain, dynamic biomes, and realistic flight physics. Built with React, Three.js, and TypeScript.

## Game Concepts

### 1. Procedural Terrain Generation
The terrain is generated infinitely using a chunk-based system. Each chunk's elevation is calculated using **Multi-Octave Simplex Noise**.

*   **Fractal Brownian Motion (FBM):** We layer multiple frequencies of noise on top of each other. Lower frequencies define the large shapes (hills), while higher frequencies add the fine low-poly details.
*   **Ridged Noise Peaks:** For the Mountain biome, we use a specialized "ridged" noise function that creates sharp, aggressive peaks by inverting the absolute value of the noise.
*   **Dynamic Biome Blending:** As you travel, the terrain parameters (frequency, amplitude, and noise type) are smoothly interpolated based on your radial distance from the origin. This ensures seamless transitions between flatlands, rolling hills, towering peaks, and deep canyons.

### 2. Flight Physics & Control
The ship uses a 360-degree free-roaming flight model inspired by traditional aviation and open-world simulators.

*   **Aerodynamic Torque:** Rolling the aircraft automatically induces a "banking turn" (yaw torque), allowing for natural, fluid navigation without always needing rudder input.
*   **Dynamic Speed & Energy:**
    *   **Gravity Impact:** Diving converts altitude into kinetic energy, rapidly increasing your speed. Climbing works against gravity, causing the ship to lose momentum unless boosted.
    *   **Integrated Thrust:** Pitching up with the primary controls provides a sustained engine boost to help maintain energy during steep climbs.
*   **Agility Scaling:** Handling is dynamic. At lower cruise speeds, the ship is highly responsive and agile. At extreme high speeds (e.g., during a vertical dive), the control surfaces become "stiff," making it harder to pull out of maneuvers.
*   **Natural Dip:** To keep the player engaged, the aircraft has a slight natural nose-down tendency, requiring constant active handling to maintain level flight—just like a real aircraft.

### 3. Visuals & Performance
*   **Low-Poly Aesthetic:** Every mesh is rendered with flat shading to emphasize its geometric facets.
*   **Adaptive HUD:** Features real-time km/h conversion, proximity "PULL UP" warnings with haptic screen shake, and dynamic biome-based atmosphere (fog and sky) shifts.

## Development
- **Dev:** `npm run dev`
- **Build:** `npm run build`
- **Preview:** `npm run preview`

Deployable to Netlify/Vercel with standard Vite build settings.
