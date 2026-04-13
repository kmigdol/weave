# WEA-4: Art Pass — Cars, Skybox, Environment, On-Ramp Intro

**Date:** 2026-04-11
**Ticket:** WEA-4
**Status:** Design approved

---

## 1. Asset Loading & Car Models

### New file: `src/render/Assets.ts`

Centralized asset loader using Three.js `GLTFLoader`. Loads all car GLBs at startup, returns a `Promise<AssetManifest>` that `Game.ts` awaits before starting the loop.

**AssetManifest** maps car types to loaded GLTF scenes:
- `sedan` (player car)
- `sedanSports`, `suv`, `hatchbackSports`, `police` (normal traffic)
- `truck`, `delivery`, `van` (semi traffic)
- `taxi` (swerving traffic)

**Player car:** `sedan` clone with emissive red tail-light material applied to rear-facing meshes.

**Traffic cars:** Replace current `BoxGeometry` mesh creation in `TrafficManager`. Each traffic type maps to a subset:
- `normal` → random pick from `[sedanSports, suv, hatchbackSports, police]`
- `semi` → random pick from `[truck, delivery, van]`
- `swerving` → `taxi`

Models are `.clone()`d from loaded templates — same pooling pattern as today but with GLTF scenes instead of boxes.

**Hitbox handling:** Measure loaded model bounding boxes and scale to match current collision constants, or update constants to match actual model dimensions.

### GLB files in `public/models/`

Kenney Car Kit (CC0 license, kenney.nl):
- sedan.glb, sedan-sports.glb, truck.glb, van.glb, taxi.glb
- suv.glb, delivery.glb, hatchback-sports.glb, police.glb
- wheel-default.glb

~1.7MB total.

---

## 2. Skybox, Sun, and SF Skyline

### Sky sphere

Inverted `SphereGeometry` with a `ShaderMaterial` that renders a vertical gradient in the fragment shader:
- Bottom: deep orange (`#ff6b35`)
- Middle: magenta (`#c2185b`)
- Top: navy (`#0a1628`)

Three color uniforms — no texture upload, pixel-perfect, trivial to tweak.

### Sun billboard

`Sprite` or small `PlaneGeometry` with additive blending, warm orange/yellow. Positioned low on the horizon behind the skyline. Soft circular gradient texture generated via canvas.

### SF skyline silhouette

Wide canvas texture (~2048x256) painted procedurally:
- Dark navy/purple fill
- Polygon paths for recognizable shapes: Transamerica pyramid, Salesforce Tower, Sutro Tower (antenna), Bay Bridge span, rolling hills baseline
- Subtle haze gradient at the base (fades into the sky)
- Mapped onto a wide `PlaneGeometry` positioned just above the horizon, behind the road
- Very slow parallax (barely moves) to sell depth

---

## 3. Environment Props

All props use the same scroll-and-wrap pattern as lane dashes in `World.ts`. Managed by a new `src/game/Environment.ts` class that owns mesh pools and scroll logic.

### Roadside billboards (near layer)

- `PlaneGeometry` on post geometry, spawned every ~200m on alternating sides
- 17 procedural canvas textures (512x256) rendered at init
- Each billboard picks a random texture from the pool

**Billboard text list:**

1. "Anthropical — Sorry About That"
2. "OpenEye — Now With Feelings"
3. "zAI — Move Fast And Replace Everyone"
4. "Cursyr — Just Tab Accept Everything Tab Tab Tab Tab"
5. "Wayless — Our Cars Are Lost Too"
6. "degrees.fyi — I Mass-Produced Your Job"
7. "[stealth]" (just that word, white background, Helvetica)
8. "Series F" (plain, no explanation)
9. "AI for AI" (corporate blue, no company name)
10. "STOP HIRING HUMANS"
11. "WE RAISED $400M" (no punchline — that IS the punchline)
12. "Nexus." (meaningless name, period, nothing else)
13. "Pre-Revenue, Post-Vibes"
14. "HONK IF YOU'VE BEEN DISRUPTED"
15. "YOUR AD HERE — WE ACCEPT EQUITY"
16. "INJURED IN AN AI ACCIDENT? CALL AN PHONG — 1-800-SHADING"
17. "MY OTHER CAR IS A FOUNDATION MODEL"
18. "DISRUPTING THE DISRUPTION"

Parody styles: neon startup logo, corporate minimalist, bold protest sign, retro ad, lawyer billboard. Mix of deadpan and loud.

### Freeway signs (mid layer)

- Green rectangle planes with white text, mounted on overhead gantry structures (box geometry frames)
- "SAN FRANCISCO 12", "EXIT 429 VIBE CODING JAM"
- Spawned ~500m apart

### Palm trees (mid layer)

- Procedural geometry: brown `CylinderGeometry` trunk + green `ConeGeometry` canopy clusters
- Spawned in clusters along roadsides, ~100m spacing

### Overhead gantries

- Box geometry frame spanning road width with sign plates attached
- ~400m spacing

---

## 4. On-Ramp Intro

### New game state

```
GameState = OnRampState | RunningState | GameOverState
```

`OnRampState` tracks `elapsedSeconds` (0 to 4s). Fully scripted — no player agency.

### Sequence (4 seconds)

- **t=0-4s:** Camera and player car follow a cubic bezier path that arcs from an offset on-ramp position into the rightmost lane. Speed eases from 0 to 60 mph (0 to 27 m/s) using an ease-in curve.
- **t~1.5s:** A "101 N" freeway sign scrolls past on the right (green rectangle, white text).
- **t=4s:** Car arrives in rightmost lane. World scrolling begins. "GO!" flashes center screen (large white text, fades out over 0.5s). Phase transitions to `running`, inputs unlock, scoring starts.

### Implementation

- `Game.ts` gets a new branch in the frame loop for `onRamp` phase
- `Input.ts` already gates lane changes on `state.phase === 'running'` — no changes needed
- Curved path = interpolated `playerMesh.position.x/z` + camera offset (no actual road geometry bends)
- "GO!" flash = DOM element like existing HUD floating text
- On restart: game resets to `onRamp` phase, not `running`

---

## 5. Lighting

Replacing current placeholder lights:

### Warm key light (sun)

`DirectionalLight`, warm orange-gold (`#ffb07a`), intensity ~1.2. Positioned low and behind-left to match sun billboard. No shadow maps (perf concern for jam).

### Cool ambient fill

`HemisphereLight` — sky: cool blue-purple (`#4466aa`), ground: warm dark (`#1a0a28`), intensity ~0.5. Gives twilight-sky-above, warm-ground-bounce feel.

### Rim light on cars

Second `DirectionalLight` from behind-right, cool blue-white (`#88aaff`), intensity ~0.4. Creates bright edge on car silhouettes for readability against dusk palette.

### Fog

`FogExp2('#1a0a28', 0.004)` — exponential fog in dark dusk color. Fades distant traffic and props into the horizon. Keeps draw distance natural.

---

## 6. File Changes Summary

**New files:**
- `src/render/Assets.ts` — GLTFLoader, asset manifest, model loading
- `src/game/Environment.ts` — billboard, sign, tree, gantry mesh pools and scroll logic

**Modified files:**
- `src/game/GameState.ts` — add `OnRampState` type
- `src/game/Game.ts` — asset loading await, on-ramp phase logic, environment updates, model-based player/traffic
- `src/render/Renderer.ts` — sky sphere, lighting overhaul, fog, sun billboard, skyline plane
- `src/game/Traffic.ts` — GLB models instead of boxes, model type mapping
- `src/game/World.ts` — minor fog compatibility

**Assets (already in repo):**
- `public/models/*.glb` — 9 car models + wheels from Kenney Car Kit (CC0)
