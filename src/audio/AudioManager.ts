import * as Tone from 'tone';
import { SPEED_MIN_MS, SPEED_MAX_MS } from '../game/constants';

const STORAGE_KEY = 'weave-audio-muted';

/** Map game speed (m/s) to engine oscillator frequency (Hz). */
export function speedToFrequency(speedMs: number): number {
  const t = Math.max(0, Math.min(1, (speedMs - SPEED_MIN_MS) / (SPEED_MAX_MS - SPEED_MIN_MS)));
  return 110 + t * 330;
}

/** Map combo level to near-miss SFX frequency (Hz). */
export function comboToFrequency(combo: number): number {
  return 880 + combo * 110;
}

/**
 * AudioManager owns all Tone.js audio state for the Weave game.
 *
 * Provides a procedural synthwave music loop (~120 BPM, key of A minor)
 * and SFX for engine tone, lane changes, near-misses, crashes, slipstream,
 * and UI blips.
 *
 * Audio context is NOT started in the constructor — call `unlock()` after
 * a user gesture (click / tap) to begin playback.
 */
export class AudioManager {
  // ── master bus ──────────────────────────────────────────────────────
  private readonly masterVolume: Tone.Volume;

  // ── synth voices ───────────────────────────────────────────────────
  private readonly kick: Tone.MembraneSynth;
  private readonly snare: Tone.NoiseSynth;
  private readonly bass: Tone.MonoSynth;
  private readonly pad: Tone.PolySynth<Tone.Synth>;
  private readonly lead: Tone.Synth;

  // ── SFX voices ─────────────────────────────────────────────────────
  private readonly engineOsc: Tone.Synth;
  private readonly engineGain: Tone.Gain;
  private readonly whooshNoise: Tone.NoiseSynth;
  private readonly zipSynth: Tone.Synth;
  private readonly slipNoise: Tone.Noise;
  private readonly slipFilter: Tone.Filter;
  private readonly slipGain: Tone.Gain;
  private readonly crashNoise: Tone.NoiseSynth;
  private readonly crashDistortion: Tone.Distortion;
  private readonly blipSynth: Tone.Synth;

  // ── pad filter sweep ───────────────────────────────────────────────
  private readonly padFilter: Tone.AutoFilter;

  // ── boost effect chain ─────────────────────────────────────────────
  private readonly boostFilter: Tone.Filter;
  private readonly boostPitch: Tone.PitchShift;
  private readonly boostDropSynth: Tone.MembraneSynth;
  private _boosting = false;

  // ── sequences ──────────────────────────────────────────────────────
  private readonly kickSeq: Tone.Sequence;
  private readonly snareSeq: Tone.Sequence;
  private readonly bassSeq: Tone.Sequence;
  private readonly padSeq: Tone.Sequence;
  private readonly leadSeq: Tone.Sequence;

  // ── state ──────────────────────────────────────────────────────────
  private _muted: boolean;
  private _audioFailed = false;
  private _unlocked = false;
  private readonly _handleVisibility: () => void;

  constructor() {
    // ── Master volume → boost chain → Destination ──────────────────
    this.masterVolume = new Tone.Volume(0);

    // ── Boost effect chain (transparent when not boosting) ─────────
    this.boostFilter = new Tone.Filter({ frequency: 800, type: 'lowpass' });
    this.boostPitch = new Tone.PitchShift({ pitch: 0 });
    this.masterVolume.connect(this.boostFilter);
    this.boostFilter.connect(this.boostPitch);
    this.boostPitch.toDestination();

    // ── Boost bass drop synth ─────────────────────────────────────
    this.boostDropSynth = new Tone.MembraneSynth({
      pitchDecay: 0.08,
      octaves: 8,
      envelope: { attack: 0.01, decay: 0.5, sustain: 0, release: 0.3 },
      volume: -4,
    }).connect(this.masterVolume);

    // ── Read persisted mute state ──────────────────────────────────
    this._muted = false;
    try {
      this._muted = localStorage.getItem(STORAGE_KEY) === 'true';
    } catch {
      // Private browsing or no localStorage — default unmuted
    }
    if (this._muted) {
      this.masterVolume.volume.value = -Infinity;
    }

    // ── Transport config ───────────────────────────────────────────
    const transport = Tone.getTransport();
    transport.bpm.value = 120;
    transport.loop = true;
    transport.loopStart = 0;
    transport.loopEnd = '8m'; // 8-bar loop

    // ── KICK — MembraneSynth, four-on-the-floor ────────────────────
    this.kick = new Tone.MembraneSynth({
      pitchDecay: 0.05,
      octaves: 6,
      envelope: { attack: 0.001, decay: 0.3, sustain: 0, release: 0.1 },
      volume: -6,
    }).connect(this.masterVolume);

    this.kickSeq = new Tone.Sequence(
      (time) => {
        this.kick.triggerAttackRelease('C1', '8n', time);
      },
      // Every quarter note for 8 bars = 32 hits
      Array.from<string | null>({ length: 32 }).fill('C1'),
      '4n',
    );
    this.kickSeq.loop = true;

    // ── SNARE — NoiseSynth, beats 2 and 4 ──────────────────────────
    this.snare = new Tone.NoiseSynth({
      noise: { type: 'pink' },
      envelope: { attack: 0.001, decay: 0.15, sustain: 0, release: 0.05 },
      volume: -8,
    }).connect(this.masterVolume);

    this.snareSeq = new Tone.Sequence(
      (time, value) => {
        if (value !== null) {
          this.snare.triggerAttackRelease('16n', time);
        }
      },
      // Pattern per bar: rest, hit, rest, hit (quarter-note grid)
      // 8 bars × 4 beats = 32 slots
      Array.from({ length: 32 }, (_, i) => (i % 4 === 1 || i % 4 === 3 ? 1 : null)),
      '4n',
    );
    this.snareSeq.loop = true;

    // ── BASS — MonoSynth, 8th-note arpeggio A1 / E2 ───────────────
    this.bass = new Tone.MonoSynth({
      oscillator: { type: 'sawtooth' },
      envelope: { attack: 0.01, decay: 0.2, sustain: 0.4, release: 0.1 },
      filterEnvelope: {
        attack: 0.01,
        decay: 0.1,
        sustain: 0.5,
        release: 0.2,
        baseFrequency: 200,
        octaves: 2.5,
      },
      volume: -10,
    }).connect(this.masterVolume);

    // Alternating root (A1) and fifth (E2) on 8th notes across 8 bars
    // 8 bars × 8 eighth-notes = 64 events
    const bassPattern: string[] = [];
    for (let i = 0; i < 64; i++) {
      bassPattern.push(i % 2 === 0 ? 'A1' : 'E2');
    }

    this.bassSeq = new Tone.Sequence(
      (time, note) => {
        this.bass.triggerAttackRelease(note, '16n', time);
      },
      bassPattern,
      '8n',
    );
    this.bassSeq.loop = true;

    // ── PAD — PolySynth with AutoFilter sweep, whole-note chords ───
    this.padFilter = new Tone.AutoFilter(0.08, 200, 4).connect(
      this.masterVolume,
    );
    this.padFilter.start();

    this.pad = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'sawtooth' },
      envelope: { attack: 0.4, decay: 0.3, sustain: 0.8, release: 1.5 },
      volume: -18,
    }).connect(this.padFilter);

    // Chord progression: Am → F → C → G, each chord 2 bars (whole note × 2)
    // Repeat once to fill 8 bars
    const chords: (string[] | null)[] = [
      ['A3', 'C4', 'E4'],  // Am (bars 1-2)
      null,
      ['F3', 'A3', 'C4'],  // F  (bars 3-4)
      null,
      ['C3', 'E3', 'G3'],  // C  (bars 5-6)
      null,
      ['G3', 'B3', 'D4'],  // G  (bars 7-8)
      null,
    ];

    this.padSeq = new Tone.Sequence(
      (time, chord) => {
        if (chord !== null) {
          this.pad.triggerAttackRelease(chord, '1n', time);
        }
      },
      chords,
      '1n',
    );
    this.padSeq.loop = true;

    // ── LEAD — Synth with square wave, simple 4-bar melody ─────────
    this.lead = new Tone.Synth({
      oscillator: { type: 'square' },
      envelope: { attack: 0.02, decay: 0.1, sustain: 0.3, release: 0.4 },
      volume: -14,
    }).connect(this.masterVolume);

    // 8-note melodic phrase in A minor, repeats over 4 bars then rests 4 bars
    // Using quarter-note subdivision: 4 bars = 16 quarter-note slots
    // 8 bars total = 32 slots
    const leadNotes: (string | null)[] = [
      // Bars 1-4: melody
      'A4', null, 'C5', null,
      'E5', null, 'D5', null,
      'C5', null, 'B4', null,
      'A4', null, 'E4', null,
      // Bars 5-8: rest (let the other voices breathe)
      null, null, null, null,
      null, null, null, null,
      null, null, null, null,
      null, null, null, null,
    ];

    this.leadSeq = new Tone.Sequence(
      (time, note) => {
        if (note !== null) {
          this.lead.triggerAttackRelease(note, '8n', time);
        }
      },
      leadNotes,
      '4n',
    );
    this.leadSeq.loop = true;

    // ── ENGINE TONE — continuous sawtooth, pitch tracks game speed ──
    this.engineOsc = new Tone.Synth({
      oscillator: { type: 'sawtooth' },
      envelope: { attack: 0.1, decay: 0, sustain: 1, release: 0.5 },
      volume: -20,
    });
    this.engineGain = new Tone.Gain(0).connect(this.masterVolume);
    this.engineOsc.connect(this.engineGain);

    // ── LANE-CHANGE WHOOSH — white noise, short decay ──────────────
    this.whooshNoise = new Tone.NoiseSynth({
      noise: { type: 'white' },
      envelope: { attack: 0.005, decay: 0.15, sustain: 0, release: 0.05 },
      volume: -12,
    }).connect(this.masterVolume);

    // ── NEAR-MISS ZIP — sine chirp, pitch rises with combo ─────────
    this.zipSynth = new Tone.Synth({
      oscillator: { type: 'sine' },
      envelope: { attack: 0.01, decay: 0.1, sustain: 0, release: 0.05 },
      volume: -10,
    }).connect(this.masterVolume);

    // ── SLIPSTREAM — pink noise through bandpass, gain-controlled ───
    this.slipNoise = new Tone.Noise({ type: 'pink', volume: -15 });
    this.slipFilter = new Tone.Filter({ type: 'bandpass', frequency: 1000 });
    this.slipGain = new Tone.Gain(0).connect(this.masterVolume);
    this.slipNoise.connect(this.slipFilter);
    this.slipFilter.connect(this.slipGain);

    // ── CRASH CRUNCH — white noise + distortion ────────────────────
    this.crashDistortion = new Tone.Distortion(0.8).connect(this.masterVolume);
    this.crashNoise = new Tone.NoiseSynth({
      noise: { type: 'white' },
      envelope: { attack: 0.001, decay: 0.3, sustain: 0, release: 0.1 },
      volume: -6,
    }).connect(this.crashDistortion);

    // ── UI BLIP — square wave, very short ──────────────────────────
    this.blipSynth = new Tone.Synth({
      oscillator: { type: 'square' },
      envelope: { attack: 0.01, decay: 0.05, sustain: 0, release: 0.02 },
      volume: -12,
    }).connect(this.masterVolume);

    // ── Visibility change handler ──────────────────────────────────
    this._handleVisibility = () => {
      if (!this._unlocked || this._audioFailed) return;
      const transport = Tone.getTransport();
      if (document.hidden) {
        transport.pause();
      } else {
        transport.start();
      }
    };
    document.addEventListener('visibilitychange', this._handleVisibility);
  }

  // ── Public API ───────────────────────────────────────────────────

  /**
   * Unlock the audio context (must be called from a user gesture handler)
   * and start the synthwave music loop.
   */
  async unlock(): Promise<void> {
    if (this._unlocked || this._audioFailed) return;
    try {
      await Tone.start();
      this._unlocked = true;

      // Start all sequences at the beginning
      this.kickSeq.start(0);
      this.snareSeq.start(0);
      this.bassSeq.start(0);
      this.padSeq.start(0);
      this.leadSeq.start(0);

      // Start the transport
      Tone.getTransport().start();

      // Start continuous SFX sources
      this.slipNoise.start();
      this.engineOsc.triggerAttack('A2');
    } catch {
      this._audioFailed = true;
    }
  }

  /**
   * Mute or unmute all audio. Persists to localStorage.
   */
  setMuted(muted: boolean): void {
    this._muted = muted;
    this.masterVolume.volume.value = muted ? -Infinity : 0;
    try {
      localStorage.setItem(STORAGE_KEY, String(muted));
    } catch {
      // localStorage unavailable — silently ignore
    }
  }

  /**
   * Returns whether audio is currently muted.
   */
  isMuted(): boolean {
    return this._muted;
  }

  /**
   * Tear down all audio resources.
   */
  dispose(): void {
    document.removeEventListener('visibilitychange', this._handleVisibility);

    const transport = Tone.getTransport();
    transport.stop();
    transport.cancel();

    this.kickSeq.dispose();
    this.snareSeq.dispose();
    this.bassSeq.dispose();
    this.padSeq.dispose();
    this.leadSeq.dispose();

    this.kick.dispose();
    this.snare.dispose();
    this.bass.dispose();
    this.pad.dispose();
    this.lead.dispose();

    this.engineOsc.dispose();
    this.engineGain.dispose();
    this.whooshNoise.dispose();
    this.zipSynth.dispose();
    this.slipNoise.dispose();
    this.slipFilter.dispose();
    this.slipGain.dispose();
    this.crashNoise.dispose();
    this.crashDistortion.dispose();
    this.blipSynth.dispose();

    this.padFilter.dispose();
    this.boostFilter.dispose();
    this.boostPitch.dispose();
    this.boostDropSynth.dispose();
    this.masterVolume.dispose();
  }

  // ── SFX ───────────────────────────────────────────────────────────

  /** Trigger a one-shot sound effect. */
  triggerSFX(name: 'laneChange' | 'nearMiss' | 'crash' | 'uiBlip', combo?: number): void {
    if (this._audioFailed || !this._unlocked) return;
    switch (name) {
      case 'laneChange':
        this.whooshNoise.triggerAttackRelease('16n');
        break;
      case 'nearMiss': {
        const freq = comboToFrequency(combo ?? 1);
        this.zipSynth.triggerAttackRelease(freq, '32n');
        break;
      }
      case 'crash':
        this.crashNoise.triggerAttackRelease('8n');
        // Fade out engine on crash
        this.engineGain.gain.rampTo(0, 0.3);
        break;
      case 'uiBlip':
        this.blipSynth.triggerAttackRelease('C6', '64n');
        break;
    }
  }

  /** Adjust engine tone pitch and volume to match gameplay speed. */
  setSpeed(speedMs: number): void {
    if (this._audioFailed || !this._unlocked) return;
    const freq = speedToFrequency(speedMs);
    const t = Math.max(0, Math.min(1, (speedMs - SPEED_MIN_MS) / (SPEED_MAX_MS - SPEED_MIN_MS)));
    this.engineOsc.frequency.rampTo(freq, 0.1);
    // Engine volume: quiet at low speed, louder at high speed
    this.engineGain.gain.rampTo(0.15 + t * 0.35, 0.1);
  }

  /** Start boost audio effect. */
  startBoost(): void {
    if (this._audioFailed || !this._unlocked || this._boosting) return;
    this._boosting = true;

    // Sweep low-pass filter from current to 4000Hz (lift the brightness)
    this.boostFilter.frequency.rampTo(4000, 0.3);

    // Pitch shift up 2 semitones
    this.boostPitch.pitch = 2;

    // Fire bass drop hit
    this.boostDropSynth.triggerAttackRelease('C1', '4n');
  }

  /** End boost audio effect. */
  endBoost(): void {
    if (this._audioFailed || !this._unlocked || !this._boosting) return;
    this._boosting = false;

    // Sweep filter back to baseline (slightly muffled)
    this.boostFilter.frequency.rampTo(800, 0.5);

    // Pitch shift back to normal
    this.boostPitch.pitch = 0;
  }

  /** Set slipstream intensity (0-1 progress). */
  setSlipstreamIntensity(progress: number): void {
    if (this._audioFailed || !this._unlocked) return;
    this.slipGain.gain.rampTo(Math.min(1, progress) * 0.5, 0.05);
  }
}
