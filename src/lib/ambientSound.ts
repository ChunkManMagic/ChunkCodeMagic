// Procedural ambient soundscapes. Everything is synthesized with WebAudio —
// no audio files, so it works offline and never bloats the bundle. Presets are
// mapped from the scene's world atmosphere / story tone and duck automatically
// while a Live Voice call is active so the mic never picks the ambience up.

import { AmbientPresetId } from './ambientPresets';

export type { AmbientPresetId };
export { AMBIENT_PRESETS } from './ambientPresets';

export interface AmbientState {
  active: boolean;
  preset: AmbientPresetId | null;
  volume: number;
  ducked: boolean;
}

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let activePreset: AmbientPresetId | null = null;
let stopLayers: (() => void) | null = null;
let volume = 0.15;
let ducked = false;

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function noiseBuffer(type: 'white' | 'brown'): AudioBuffer | null {
  if (!ctx) return null;
  const len = ctx.sampleRate * 2;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const white = Math.random() * 2 - 1;
    if (type === 'brown') {
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.5;
    } else {
      data[i] = white;
    }
  }
  return buf;
}

interface NoiseBedOpts {
  filter: { type: BiquadFilterType; freq: number; q: number };
  gain: number;
  swell?: number; // LFO depth on the gain (slow breathing), 0 = steady
  swellRate?: number;
}

function noiseBed(type: 'white' | 'brown', opts: NoiseBedOpts): (() => void) | null {
  if (!ctx || !master) return null;
  const src = ctx.createBufferSource();
  const buf = noiseBuffer(type);
  if (!buf) return null;
  src.buffer = buf;
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = opts.filter.type;
  f.frequency.value = opts.filter.freq;
  f.Q.value = opts.filter.q;
  const g = ctx.createGain();
  g.gain.value = opts.gain;
  src.connect(f);
  f.connect(g);
  g.connect(master);
  let lfo: OscillatorNode | null = null;
  let lfoGain: GainNode | null = null;
  if (opts.swell && opts.swell > 0) {
    lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = opts.swellRate || 0.08;
    lfoGain = ctx.createGain();
    lfoGain.gain.value = opts.swell;
    lfo.connect(lfoGain);
    lfoGain.connect(g.gain);
    lfo.start();
  }
  src.start();
  return () => {
    try {
      src.stop();
    } catch (e) {}
    src.disconnect();
    f.disconnect();
    g.disconnect();
    try {
      lfo?.stop();
    } catch (e) {}
    lfoGain?.disconnect();
    lfo?.disconnect();
  };
}

function drone(freq: number, gain: number, opts?: { type?: OscillatorType; detune?: number; attack?: number }): (() => void) | null {
  if (!ctx || !master) return null;
  const c = ctx;
  const t0 = c.currentTime;
  const o = c.createOscillator();
  o.type = opts?.type || 'sine';
  o.frequency.value = freq;
  o.detune.value = opts?.detune || 0;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + (opts?.attack ?? 2));
  o.connect(g);
  g.connect(master);
  o.start();
  return () => {
    const t1 = c.currentTime;
    g.gain.cancelScheduledValues(t1);
    g.gain.setValueAtTime(g.gain.value, t1);
    g.gain.exponentialRampToValueAtTime(0.0001, t1 + 0.4);
    try {
      o.stop(t1 + 0.5);
    } catch (e) {}
    o.onended = () => {
      o.disconnect();
      g.disconnect();
    };
  };
}

// Run fn after a delay, then again after a random delay in [min, max].
function loop(delay: number, jitterMin: number, jitterMax: number, fn: () => void): () => void {
  let stop = false;
  let id = 0;
  const tick = () => {
    if (stop || !ctx) return;
    fn();
    id = window.setTimeout(tick, jitterMin + Math.random() * (jitterMax - jitterMin));
  };
  id = window.setTimeout(tick, delay);
  return () => {
    stop = true;
    window.clearTimeout(id);
  };
}

function birdChirps(): () => void {
  return loop(900, 1800, 5500, () => {
    if (!ctx || !master) return;
    const t0 = ctx.currentTime;
    const f0 = 1900 + Math.random() * 1600;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(f0, t0);
    o.frequency.exponentialRampToValueAtTime(f0 * 1.6, t0 + 0.06);
    o.frequency.exponentialRampToValueAtTime(f0 * 0.7, t0 + 0.14);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.035 + Math.random() * 0.03, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.2);
    o.connect(g);
    g.connect(master);
    o.start(t0);
    o.stop(t0 + 0.25);
    o.onended = () => {
      o.disconnect();
      g.disconnect();
    };
  });
}

function cricketBeds(): () => void {
  return loop(350, 500, 1200, () => {
    if (!ctx || !master) return;
    const t0 = ctx.currentTime;
    const count = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < count; i++) {
      const o = ctx.createOscillator();
      o.type = 'square';
      o.frequency.value = 3400 + Math.random() * 700;
      const g = ctx.createGain();
      const s = t0 + i * 0.07;
      g.gain.setValueAtTime(0.0001, s);
      g.gain.exponentialRampToValueAtTime(0.02 + Math.random() * 0.012, s + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, s + 0.03);
      o.connect(g);
      g.connect(master);
      o.start(s);
      o.stop(s + 0.035);
      o.onended = () => {
        o.disconnect();
        g.disconnect();
      };
    }
  });
}

function fireCrackles(): () => void {
  return loop(150, 120, 800, () => {
    if (!ctx || !master) return;
    const dur = 0.03 + Math.random() * 0.07;
    const buf = noiseBuffer('white');
    if (!buf) return;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = 0.5 + Math.random();
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 900 + Math.random() * 2600;
    f.Q.value = 0.8;
    const g = ctx.createGain();
    const t0 = ctx.currentTime;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.09 + Math.random() * 0.14, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f);
    f.connect(g);
    g.connect(master);
    src.start(t0);
    src.stop(t0 + dur + 0.05);
    src.onended = () => {
      src.disconnect();
      f.disconnect();
      g.disconnect();
    };
  });
}

function thunderClaps(): () => void {
  return loop(5000, 11000, 19000, () => {
    if (!ctx || !master) return;
    const t0 = ctx.currentTime;
    const buf = noiseBuffer('brown');
    if (!buf) return;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(380, t0);
    f.frequency.exponentialRampToValueAtTime(55, t0 + 3.2);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.22 + Math.random() * 0.1, t0 + 0.18);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 3.6);
    src.connect(f);
    f.connect(g);
    g.connect(master);
    src.start(t0);
    src.stop(t0 + 4);
    src.onended = () => {
      src.disconnect();
      f.disconnect();
      g.disconnect();
    };
  });
}

function raindrops(): () => void {
  return loop(250, 400, 1600, () => {
    if (!ctx || !master) return;
    const t0 = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sine';
    const f0 = 700 + Math.random() * 500;
    o.frequency.setValueAtTime(f0, t0);
    o.frequency.exponentialRampToValueAtTime(f0 * 0.55, t0 + 0.09);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.045, t0 + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.13);
    o.connect(g);
    g.connect(master);
    o.start(t0);
    o.stop(t0 + 0.16);
    o.onended = () => {
      o.disconnect();
      g.disconnect();
    };
  });
}

function oceanWaves(): () => void {
  return loop(2600, 500, 1400, () => {
    if (!ctx || !master) return;
    const t0 = ctx.currentTime;
    const buf = noiseBuffer('brown');
    if (!buf) return;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 240 + Math.random() * 160;
    f.Q.value = 0.7;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.09 + Math.random() * 0.08, t0 + 1.4);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 3.8);
    src.connect(f);
    f.connect(g);
    g.connect(master);
    src.start(t0);
    src.stop(t0 + 4);
    src.onended = () => {
      src.disconnect();
      f.disconnect();
      g.disconnect();
    };
  });
}

function distantHorns(): () => void {
  return loop(9000, 9000, 20000, () => {
    if (!ctx || !master) return;
    const t0 = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = 190 + Math.random() * 60;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 700;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(0.035, t0 + 0.05);
    g.gain.linearRampToValueAtTime(0.0001, t0 + 0.3);
    g.gain.linearRampToValueAtTime(0.035, t0 + 0.42);
    g.gain.linearRampToValueAtTime(0.0001, t0 + 0.7);
    o.connect(f);
    f.connect(g);
    g.connect(master);
    o.start(t0);
    o.stop(t0 + 0.75);
    o.onended = () => {
      o.disconnect();
      f.disconnect();
      g.disconnect();
    };
  });
}

function desertChimes(): () => void {
  return loop(8000, 6000, 15000, () => {
    if (!ctx || !master) return;
    const t0 = ctx.currentTime;
    const f0 = 1200 + Math.random() * 900;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = f0;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.03, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 2.2);
    o.connect(g);
    g.connect(master);
    o.start(t0);
    o.stop(t0 + 2.4);
    o.onended = () => {
      o.disconnect();
      g.disconnect();
    };
  });
}

function spacePings(): () => void {
  return loop(4000, 3000, 9000, () => {
    if (!ctx || !master) return;
    const t0 = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = 600 + Math.random() * 500;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.022, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.5);
    o.connect(g);
    g.connect(master);
    o.start(t0);
    o.stop(t0 + 0.55);
    o.onended = () => {
      o.disconnect();
      g.disconnect();
    };
  });
}

function eagleCries(): () => void {
  return loop(8000, 9000, 18000, () => {
    if (!ctx || !master) return;
    const t0 = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sine';
    const f0 = 900;
    o.frequency.setValueAtTime(f0, t0);
    o.frequency.exponentialRampToValueAtTime(f0 * 1.5, t0 + 0.25);
    o.frequency.exponentialRampToValueAtTime(f0 * 0.9, t0 + 0.7);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.028, t0 + 0.06);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.9);
    o.connect(g);
    g.connect(master);
    o.start(t0);
    o.stop(t0 + 0.95);
    o.onended = () => {
      o.disconnect();
      g.disconnect();
    };
  });
}

function buildPreset(preset: AmbientPresetId): (() => void) | null {
  const cleanups: Array<(() => void) | null> = [];
  switch (preset) {
    case 'forest':
      cleanups.push(
        noiseBed('brown', { filter: { type: 'bandpass', freq: 1200, q: 0.4 }, gain: 0.05, swell: 0.02, swellRate: 0.06 }),
        noiseBed('white', { filter: { type: 'bandpass', freq: 2600, q: 0.6 }, gain: 0.012, swell: 0.008, swellRate: 0.09 })
      );
      cleanups.push(birdChirps());
      break;
    case 'cave':
      cleanups.push(
        drone(55, 0.035, { type: 'sine', detune: 3, attack: 4 }),
        noiseBed('brown', { filter: { type: 'lowpass', freq: 320, q: 0.4 }, gain: 0.05, swell: 0.02, swellRate: 0.05 })
      );
      cleanups.push(raindrops());
      break;
    case 'tavern':
      cleanups.push(
        noiseBed('brown', { filter: { type: 'bandpass', freq: 480, q: 0.5 }, gain: 0.028, swell: 0.012, swellRate: 0.07 }),
        noiseBed('white', { filter: { type: 'bandpass', freq: 1100, q: 0.5 }, gain: 0.008, swell: 0.005, swellRate: 0.1 })
      );
      cleanups.push(fireCrackles());
      break;
    case 'space':
      cleanups.push(
        drone(52, 0.04, { type: 'triangle', detune: -5, attack: 5 }),
        drone(104, 0.022, { type: 'sine', detune: 4, attack: 6 }),
        noiseBed('brown', { filter: { type: 'lowpass', freq: 140, q: 0.6 }, gain: 0.02, swell: 0.014, swellRate: 0.04 })
      );
      cleanups.push(spacePings());
      break;
    case 'storm':
      cleanups.push(
        noiseBed('brown', { filter: { type: 'bandpass', freq: 480, q: 0.6 }, gain: 0.09, swell: 0.035, swellRate: 0.08 }),
        noiseBed('white', { filter: { type: 'bandpass', freq: 2400, q: 0.4 }, gain: 0.01, swell: 0.008, swellRate: 0.11 })
      );
      cleanups.push(raindrops(), thunderClaps());
      break;
    case 'ocean':
      cleanups.push(
        noiseBed('brown', { filter: { type: 'bandpass', freq: 420, q: 0.5 }, gain: 0.075, swell: 0.04, swellRate: 0.06 }),
        noiseBed('white', { filter: { type: 'bandpass', freq: 1800, q: 0.4 }, gain: 0.008, swell: 0.005, swellRate: 0.06 })
      );
      cleanups.push(oceanWaves());
      break;
    case 'city':
      cleanups.push(
        noiseBed('brown', { filter: { type: 'lowpass', freq: 520, q: 0.4 }, gain: 0.06, swell: 0.02, swellRate: 0.09 }),
        noiseBed('white', { filter: { type: 'bandpass', freq: 2000, q: 0.3 }, gain: 0.006, swell: 0.004, swellRate: 0.13 })
      );
      cleanups.push(distantHorns());
      break;
    case 'meadow':
      cleanups.push(
        noiseBed('white', { filter: { type: 'bandpass', freq: 3200, q: 0.5 }, gain: 0.016, swell: 0.01, swellRate: 0.06 }),
        noiseBed('brown', { filter: { type: 'lowpass', freq: 500, q: 0.5 }, gain: 0.02, swell: 0.012, swellRate: 0.05 })
      );
      cleanups.push(birdChirps(), cricketBeds());
      break;
    case 'desert':
      cleanups.push(
        noiseBed('brown', { filter: { type: 'lowpass', freq: 420, q: 0.5 }, gain: 0.07, swell: 0.035, swellRate: 0.04 }),
        drone(60, 0.015, { type: 'sine', attack: 5 })
      );
      cleanups.push(desertChimes());
      break;
    case 'mountain':
      cleanups.push(
        noiseBed('brown', { filter: { type: 'bandpass', freq: 700, q: 0.4 }, gain: 0.055, swell: 0.03, swellRate: 0.05 }),
        noiseBed('white', { filter: { type: 'bandpass', freq: 2900, q: 0.4 }, gain: 0.009, swell: 0.006, swellRate: 0.08 })
      );
      cleanups.push(eagleCries());
      break;
    case 'void':
      cleanups.push(
        drone(38, 0.03, { type: 'sine', detune: 2, attack: 6 }),
        noiseBed('brown', { filter: { type: 'lowpass', freq: 90, q: 0.7 }, gain: 0.018, swell: 0.012, swellRate: 0.03 })
      );
      break;
  }
  return () => {
    cleanups.forEach((c) => c?.());
  };
}

function applyDuck() {
  if (!ctx || !master) return;
  const target = ducked ? volume * 0.1 : volume;
  master.gain.setTargetAtTime(target, ctx.currentTime, 0.08);
}

export function startAmbientSoundscape(preset: AmbientPresetId): boolean {
  stopAmbientSoundscape();
  if (typeof window === 'undefined') return false;
  // Hidden right now (or a re-render raced a background stop): park the
  // preset instead of playing — handleVisibilityChange will start it on show.
  if (typeof document !== 'undefined' && document.hidden) {
    hiddenPausedPreset = preset;
    return false;
  }
  const Ctor = window.AudioContext || (window as any).webkitAudioContext;
  if (!Ctor) return false;
  try {
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = ducked ? volume * 0.1 : volume;
    master.connect(ctx.destination);
    activePreset = preset;
    stopLayers = buildPreset(preset);
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    return true;
  } catch (e) {
    console.warn('Could not start ambient soundscape:', e);
    ctx = null;
    master = null;
    return false;
  }
}

export function stopAmbientSoundscape(): void {
  stopLayers?.();
  stopLayers = null;
  activePreset = null;
  if (ctx) {
    ctx.close().catch(() => {});
    ctx = null;
    master = null;
  }
}

// Android/Chrome often keep an AudioContext running when the tab or PWA goes
// to the background, so ambience would keep chiming over other apps. Fully
// stop the graph on hide and rebuild it on return — suspending alone isn't
// enough because the one-shot loops (pings/chimes) keep scheduling events on
// the frozen clock and burst-play them all at once on resume.
let hiddenPausedPreset: AmbientPresetId | null = null;

function handleVisibilityChange(): void {
  if (typeof document === 'undefined') return;
  if (document.hidden) {
    if (activePreset) {
      hiddenPausedPreset = activePreset;
      stopAmbientSoundscape();
    }
  } else if (hiddenPausedPreset) {
    const preset = hiddenPausedPreset;
    hiddenPausedPreset = null;
    startAmbientSoundscape(preset);
  }
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', handleVisibilityChange);
}

// Autoplay policy: a freshly-created context may start suspended. Call this
// from a user gesture (pointer/key/touch) to bring it back up.
export function resumeAmbient(): void {
  if (ctx && ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
  }
}

export function setAmbientVolume(v: number): void {
  volume = clamp01(v);
  applyDuck();
}

// Duck while a live voice call is active so the mic doesn't pick up the
// ambience and trip the server-side VAD.
export function setAmbientDucked(d: boolean): void {
  ducked = d;
  applyDuck();
}

export function getAmbientState(): AmbientState {
  return {
    active: activePreset !== null,
    preset: activePreset,
    volume,
    ducked,
  };
}

export function mapToAmbientPreset(atmosphere: string, storyTone: string): AmbientPresetId {
  const a = `${atmosphere || ''} ${storyTone || ''}`.toLowerCase();
  if (/(space|starship|spaceship|orbit|station|cyber|sci-fi|sci fi|futur|neon|cosmic)/.test(a)) return 'space';
  if (/(storm|thunder|rain|tempest|hurricane|downpour|monsoon)/.test(a)) return 'storm';
  if (/(ocean|sea|beach|coast|shore|ship|pirate|harbor|harbour|port)/.test(a)) return 'ocean';
  if (/(tavern|inn|bar|pub|saloon|festival|market|crowd|village square)/.test(a)) return 'tavern';
  if (/(cave|cavern|underground|dungeon|catacomb|tomb|crypt|ruin|mine|sewer)/.test(a)) return 'cave';
  if (/(city|street|urban|metropolis|alley|district|slum|industrial)/.test(a)) return 'city';
  if (/(desert|dune|arid|wasteland|savanna|dry|scorch)/.test(a)) return 'desert';
  if (/(mountain|peak|cliff|alpine|tundra|snow|arctic|highlands|summit)/.test(a)) return 'mountain';
  if (/(forest|woods|jungle|grove|arboretum|wild|hunt|canopy|thicket)/.test(a)) return 'forest';
  if (/(meadow|plains|field|farm|pasture|rolling|countryside|garden|valley)/.test(a)) return 'meadow';
  return 'void';
}
