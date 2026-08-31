/**
 * Web parity of Android GeminiTtsClient.kt
 * Same model fallback chains, voice list, quota detection, 24kHz PCM16 playback via Web Audio.
 */
import { getGenAI } from './gemini';
import { getSettings } from './types';

export const SAMPLE_RATE = 24000;

// Ordered fallback chain: highest quality first — matches Android
export const TTS_MODEL_CHAIN = [
  'gemini-2.5-pro-preview-tts',
  'gemini-3.1-flash-tts-preview',
  'gemini-2.5-flash-preview-tts',
  'gemini-2.5-flash',
  'gemini-2.0-flash',
] as const;

// For real-time VoiceChat (speed over quality), start at Flash
export const TTS_MODEL_CHAIN_FAST = [
  'gemini-3.1-flash-tts-preview',
  'gemini-2.5-flash-preview-tts',
  'gemini-2.5-flash',
  'gemini-2.0-flash',
] as const;

export interface GeminiVoice {
  name: string;
  character: string;
}

export const ALL_VOICES: GeminiVoice[] = [
  { name: 'Zephyr', character: 'Bright' }, { name: 'Puck', character: 'Upbeat' },
  { name: 'Charon', character: 'Informative' }, { name: 'Kore', character: 'Firm' },
  { name: 'Fenrir', character: 'Excitable' }, { name: 'Leda', character: 'Youthful' },
  { name: 'Orus', character: 'Firm' }, { name: 'Aoede', character: 'Breezy' },
  { name: 'Callirrhoe', character: 'Easy-going' }, { name: 'Autonoe', character: 'Bright' },
  { name: 'Enceladus', character: 'Breathy' }, { name: 'Iapetus', character: 'Clear' },
  { name: 'Umbriel', character: 'Easy-going' }, { name: 'Algieba', character: 'Smooth' },
  { name: 'Despina', character: 'Smooth' }, { name: 'Erinome', character: 'Clear' },
  { name: 'Algenib', character: 'Gravelly' }, { name: 'Rasalgethi', character: 'Informative' },
  { name: 'Laomedeia', character: 'Upbeat' }, { name: 'Achernar', character: 'Soft' },
  { name: 'Alnilam', character: 'Firm' }, { name: 'Schedar', character: 'Even' },
  { name: 'Gacrux', character: 'Mature' }, { name: 'Pulcherrima', character: 'Forward' },
  { name: 'Achird', character: 'Friendly' }, { name: 'Zubenelgenubi', character: 'Casual' },
  { name: 'Vindemiatrix', character: 'Gentle' }, { name: 'Sadachbia', character: 'Lively' },
  { name: 'Sadaltager', character: 'Knowledgeable' }, { name: 'Sulafat', character: 'Warm' },
];

export const ROLEPLAY_VOICES = ['Fenrir','Charon','Enceladus','Algenib','Gacrux','Kore','Erinome','Achernar'];
export const NARRATOR_VOICES = ['Rasalgethi','Iapetus','Sadaltager','Alnilam','Schedar'];
export const BRIGHT_VOICES   = ['Zephyr','Puck','Autonoe','Laomedeia','Sadachbia','Aoede'];

export function isQuotaOrRateLimit(e: any): boolean {
  const msg = (e?.message || String(e)).toLowerCase();
  return msg.includes('429') || msg.includes('quota') || msg.includes('resource exhausted') || msg.includes('rate limit');
}
export function isModelNotFound(e: any): boolean {
  const msg = (e?.message || String(e)).toLowerCase();
  return msg.includes('404') || msg.includes('not found') || msg.includes('deprecated');
}

// --- Web Audio playback (24kHz PCM16 mono, same format as Android AudioTrack) ---

let audioCtx: AudioContext | null = null;
function getAudioContext(): AudioContext {
  if (!audioCtx || audioCtx.state === 'closed') {
    audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: SAMPLE_RATE });
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

// PCM16 mono 24kHz -> AudioBuffer
function pcmToAudioBuffer(bytes: Uint8Array, ctx: AudioContext): AudioBuffer {
  // bytes are little-endian PCM16
  const int16 = new Int16Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.byteLength / 2));
  const buf = ctx.createBuffer(1, int16.length, SAMPLE_RATE);
  const ch = buf.getChannelData(0);
  for (let i = 0; i < int16.length; i++) ch[i] = int16[i] / 32768;
  return buf;
}

export function base64ToPcmBytes(b64: string): Uint8Array {
  return base64ToBytes(b64);
}

export async function playPcmBase64(b64: string, onDone?: () => void, signal?: { cancelled: boolean }): Promise<AudioBufferSourceNode | null> {
  if (!b64) return null;
  try {
    const bytes = base64ToBytes(b64);
    const ctx = getAudioContext();
    const buffer = pcmToAudioBuffer(bytes, ctx);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(ctx.destination);
    src.onended = () => { if (!signal?.cancelled) onDone?.(); };
    src.start();
    return src;
  } catch (e) {
    console.error('playPcmBase64 failed', e);
    onDone?.();
    return null;
  }
}

export async function playPcmBytes(pcm: Uint8Array, onDone?: () => void): Promise<AudioBufferSourceNode | null> {
  if (!pcm || pcm.length < 44) return null;
  try {
    const ctx = getAudioContext();
    // Heuristic: if pcm is already base64 string decoded bytes (raw PCM), convert directly.
    // Android's PCM is raw; if we get raw bytes we treat same as above without base64 step.
    const buffer = pcmToAudioBuffer(pcm, ctx);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(ctx.destination);
    src.onended = () => onDone?.();
    src.start();
    return src;
  } catch (e) {
    console.error('playPcmBytes failed', e);
    onDone?.();
    return null;
  }
}

// Browser speechSynthesis fallback — matches Android system TTS fallback
export function speakWithBrowser(text: string, _voiceName?: string, rate: number = 1): void {
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = rate;
    // Strip audio tags for browser TTS so they aren't spoken literally
    u.text = text.replace(/\[.*?\]/g, '').trim();
    window.speechSynthesis.speak(u);
  } catch {}
}
export function stopBrowserTts() {
  try { window.speechSynthesis.cancel(); } catch {}
}

/**
 * Core synthesize with fallback chain — mirrors GeminiTtsClient.synthesize
 * Returns base64 PCM string or null (caller falls back to browser TTS).
 */
export async function synthesizeSpeech(
  text: string,
  voiceName?: string,
  stylePrefix?: string | null,
  useFastChain: boolean = false,
  extraConfig?: any
): Promise<string | null> {
  const ai = getGenAI();
  const chain = useFastChain ? TTS_MODEL_CHAIN_FAST : TTS_MODEL_CHAIN;
  const prompt = `${stylePrefix ? stylePrefix + '\n\n' : ''}${text.slice(0, 4000)}`;

  const configBase = {
    responseModalities: ['AUDIO'] as const,
    speechConfig: {
      voiceConfig: {
        prebuiltVoiceConfig: { voiceName: voiceName || 'Kore' },
      },
    },
    ...(extraConfig || {}),
  };

  // Per-model timeouts: Pro gets longer (it's slower but higher quality). Flash gets tighter window.
  const timeoutMs = (model: string): number => {
    if (model.includes('pro')) return 12000;
    if (model.includes('flash')) return 6000;
    return 5000;
  };
  const withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T | null> => {
    return Promise.race([
      promise,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
    ]);
  };

  for (const model of chain) {
    try {
      const result = await withTimeout(
        ai.models.generateContent({
          model,
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          config: configBase,
        }) as Promise<any>,
        timeoutMs(model)
      );
      if (result == null) {
        console.warn(`[TtsEngine] ${model} timed out after ${timeoutMs(model)}ms, trying next`);
        continue;
      }
      const b64 = result.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data
        ?? result.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData?.data)?.inlineData?.data;
      if (b64) {
        console.log(`[TtsEngine] succeeded: ${model}`);
        return b64;
      }
      console.warn(`[TtsEngine] ${model} returned no audio, trying next`);
    } catch (e: any) {
      console.warn(`[TtsEngine] ${model} failed (${e?.message}), trying next`);
      continue;
    }
  }
  console.warn('[TtsEngine] All TTS models exhausted — caller falls back to browser TTS');
  return null;
}

// --- Stateful TTS Engine class (mirrors Android isSpeaking / onSpeakingChanged pattern) ---

export class TtsEngine {
  private _isSpeaking = false;
  private currentSource: AudioBufferSourceNode | null = null;
  private cancelFlag = { cancelled: false };
  onSpeakingChanged?: (speaking: boolean) => void;

  get isSpeaking() { return this._isSpeaking; }

  private setSpeaking(v: boolean) {
    this._isSpeaking = v;
    this.onSpeakingChanged?.(v);
  }

  async synthesize(text: string, voiceName?: string, stylePrefix?: string | null, useFastChain: boolean = false): Promise<string | null> {
    return synthesizeSpeech(text, voiceName, stylePrefix, useFastChain);
  }

  async playBase64(b64: string, onDone?: () => void): Promise<void> {
    this.stop();
    this.cancelFlag = { cancelled: false };
    this.setSpeaking(true);
    try {
      const src = await playPcmBase64(b64, () => {
        if (!this.cancelFlag.cancelled) {
          this.setSpeaking(false);
          onDone?.();
        }
      }, this.cancelFlag);
      this.currentSource = src;
      if (!src) {
        this.setSpeaking(false);
        onDone?.();
      }
    } catch {
      this.setSpeaking(false);
      onDone?.();
    }
  }

  // Convenience: synthesize + play, with browser fallback and 30s outer timeout
  async speak(text: string, voiceName?: string, stylePrefix?: string | null, useFastChain: boolean = false, onDone?: () => void): Promise<void> {
    const withOuterTimeout = <T>(p: Promise<T>, ms: number): Promise<T | null> => Promise.race([p, new Promise<null>(r => setTimeout(() => r(null), ms))]);
    const b64 = await withOuterTimeout(this.synthesize(text, voiceName, stylePrefix, useFastChain), 30000) as string | null;
    if (b64) {
      await this.playBase64(b64, onDone);
    } else {
      // browser fallback
      const settings = getSettings();
      const rate = (settings as any)?.ttsSpeed ?? 1; // if app ever stores it
      speakWithBrowser(text, voiceName, rate);
      // Estimate duration and fire onDone
      const words = text.split(/\s+/).length;
      const estMs = Math.max(800, (words / 2.5) * 1000);
      setTimeout(() => {
        this.setSpeaking(false);
        onDone?.();
      }, estMs);
      this.setSpeaking(true);
      const handler = () => { this.setSpeaking(false); window.speechSynthesis.removeEventListener?.('voiceschanged', handler as any); };
      // fallback: listen to end via polling
      const poll = setInterval(() => {
        if (!window.speechSynthesis.speaking) {
          clearInterval(poll);
          this.setSpeaking(false);
        }
      }, 200);
      setTimeout(() => clearInterval(poll), estMs + 2000);
    }
  }

  stop() {
    this.cancelFlag.cancelled = true;
    try { this.currentSource?.stop(); } catch {}
    this.currentSource = null;
    try { window.speechSynthesis.cancel(); } catch {}
    if (this._isSpeaking) this.setSpeaking(false);
    // Also stop Web Audio context source
    stopBrowserTts();
  }

  async playPcmBytes(pcm: Uint8Array, onDone?: () => void) {
    await playPcmBytes(pcm, onDone);
  }
}

// Default singleton for convenience
export const defaultTtsEngine = new TtsEngine();
