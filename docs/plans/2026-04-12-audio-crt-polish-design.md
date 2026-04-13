# WEA-5: Audio + CRT Polish Pass — Design

**Ticket:** WEA-5
**Date:** 2026-04-12
**Branch:** `feature/wea-5-audio-crt-polish`

---

## Overview

Add fully procedural audio (Tone.js), CRT shader polish with bloom, a title screen, and a low-quality mode toggle. Every game action gets an audio and visual response — BOOST feels like a rush, crash feels like a punch.

## Approach

**100% procedural audio** — no audio files. All music and SFX generated via Tone.js synths and the Web Audio API. This gives us zero asset downloads, perfect looping, tiny bundle size, and trivial BOOST effect integration.

---

## 1. Audio Architecture

### New file: `src/audio/AudioManager.ts`

Single class owning all Tone.js state.

```
AudioManager
├── music: synthwave sequencer (kick, snare, bass, pad, lead)
├── engine: procedural tone (frequency tied to speed)
├── sfx: one-shot triggers (whoosh, zip, boom, crunch, blip)
├── boostFilter: low-pass + pitch shift applied to master chain
├── muted: boolean (persisted to localStorage)
└── started: boolean (tracks Safari autoplay unlock)
```

**Lifecycle:**
- Constructed at game init, audio context stays suspended
- `unlock()` on first user interaction → resumes context, starts music
- `setSpeed(ms)` every tick → modulates engine tone pitch
- `startBoost()` / `endBoost()` → applies/removes filter on music chain
- `triggerSFX(name)` → fires one-shots
- `setMuted(bool)` → mutes master output, saves to localStorage
- `dispose()` → cleanup

**Safari autoplay:** First user interaction (space/tap on title screen) calls `Tone.start()` to resume the suspended AudioContext.

---

## 2. Procedural Music — Synthwave Loop

5 voices, 8-bar loop, ~120 BPM, key of A minor.

| Voice | Tone.js Synth | Pattern |
|-------|--------------|---------|
| Kick | `MembraneSynth` | Four-on-the-floor |
| Snare | `NoiseSynth` (filtered) | Beats 2 & 4 |
| Bass | `MonoSynth` (saw) | 8th-note arpeggio, root + 5th |
| Pad | `PolySynth` (detuned saws) | Sustained chords, slow filter LFO |
| Lead | `Synth` (square) | 4-bar melodic phrase, repeats |

**BOOST effect:** Master chain gets `Tone.Filter` sweep (cutoff 800Hz → 4kHz) and `Tone.PitchShift` (+2 semitones). Eases back on boost end.

---

## 3. SFX Library

6 procedural SFX + continuous engine tone.

| SFX | Approach | Trigger |
|-----|----------|---------|
| Lane-change whoosh | Filtered white noise sweep (high→low, ~150ms) | `player.changeLane()` |
| Near-miss zip | Short sine chirp, pitch rises with combo level | `events.nearMiss` |
| Slipstream whoosh | Looping filtered noise, volume tied to slipstreamTimer | Continuous in slipstream zone |
| BOOST bass drop | MembraneSynth low hit + filter sweep on music | `events.boostActivated` |
| Crash crunch | Noise burst through distortion + bitcrusher, ~300ms | Collision detected |
| UI blip | Quick square wave ping, ~50ms | Menu interactions |

**Engine tone:** Continuous sawtooth oscillator, frequency mapped from `currentSpeed` (low hum at 60mph, aggressive whine at 180mph). Fades out on crash.

---

## 4. CRT Shader + Quality Mode

### Constants block in `constants.ts`

```ts
export const CRT_DEFAULTS = {
  bloomStrength: 0.35,
  bloomRadius: 0.4,
  bloomThreshold: 0.85,
  scanlineIntensity: 0.18,
  chromaOffset: 0.0015,
  vignetteStrength: 0.55,
};

export const CRT_LOW_QUALITY = {
  bloomStrength: 0,
  scanlineIntensity: 0.1,
  chromaOffset: 0,
  vignetteStrength: 0.4,
};
```

### Post-process chain

Add `UnrealBloomPass` between `RenderPass` and `CRTPass`.

`Renderer.setQuality(low: boolean)`:
- Swaps CRT constants
- Enables/disables bloom pass
- Adjusts pixel ratio (1 for low, min(dpr, 2) for default)
- Adjusts fog draw distance

### Low-quality toggle

DOM button on title screen and game over (next to mute toggle). Persisted to `localStorage`. Applied immediately, no restart.

---

## 5. Title Screen

### New file: `src/ui/TitleScreen.ts`

DOM overlay (same pattern as HUD/GameOverOverlay).

- 3D scene renders behind (road + traffic + billboards scrolling)
- "WEAVE" title, large monospace
- "PRESS SPACE TO START" / "TAP TO START"
- Mute icon button (bottom-right)
- Quality toggle (bottom-right, next to mute)

### Game flow

```
Title Screen (scene auto-scrolling) → First interaction → Run → Crash → Game Over → Space → Run → ...
```

Adds `'title'` phase to game state. Title screen shows on load and the scene renders behind it with the camera auto-advancing so billboards scroll past.

---

## Files to create/modify

### New files
- `src/audio/AudioManager.ts` — all audio logic
- `src/ui/TitleScreen.ts` — title screen overlay

### Modified files
- `src/game/Game.ts` — integrate AudioManager, add title phase, wire SFX triggers
- `src/game/GameState.ts` — add 'title' phase
- `src/game/Player.ts` — expose lane-change event for whoosh SFX
- `src/game/constants.ts` — add CRT constants block
- `src/render/Renderer.ts` — add bloom pass, setQuality(), title-screen auto-scroll
- `src/render/CRTPass.ts` — use constants from constants block
- `src/ui/GameOverOverlay.ts` — add mute + quality toggle buttons
- `src/main.ts` — start on title screen instead of immediate run
- `package.json` — add `tone` dependency

### Not touched
- Scoring.ts, Collisions.ts, Traffic.ts, SpeedCurve.ts — no changes needed
- Supabase/leaderboard code — not in scope
