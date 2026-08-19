import { GoogleGenAI } from "@google/genai";

export const LIVE_MODELS = [
  "gemini-3.1-flash-live-preview",
  "gemini-2.5-flash-native-audio-preview-12-2025",
] as const;

export const LIVE_VOICES = ["Puck", "Charon", "Kore", "Fenrir", "Aoede"] as const;

export const LIVE_VOICE_DESCRIPTIONS: Record<string, { label: string; tone: string; description: string }> = {
  Kore: { label: "Kore", tone: "Calm & Narrative", description: "Balanced, articulate, and expressive storytelling voice." },
  Puck: { label: "Puck", tone: "Playful & Youthful", description: "Energetic, bright, and spirited tone." },
  Charon: { label: "Charon", tone: "Deep & Resonant", description: "Authoritative, grave, and cinematic narrator voice." },
  Fenrir: { label: "Fenrir", tone: "Gravelly & Bold", description: "Intense, dramatic, and rugged persona." },
  Aoede: { label: "Aoede", tone: "Melodic & Elegant", description: "Soft, graceful, and enchanting delivery." },
};

export type LiveVoiceStatus = "idle" | "connecting" | "connected" | "error";
export type LiveVoiceMicMode = "hold" | "toggle" | "handsFree";

export interface AudioDeviceInfo {
  deviceId: string;
  label: string;
  kind: "audioinput" | "audiooutput";
  isDefault: boolean;
}

export async function getAudioDevices(): Promise<{ inputs: AudioDeviceInfo[]; outputs: AudioDeviceInfo[] }> {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const inputs: AudioDeviceInfo[] = [];
    const outputs: AudioDeviceInfo[] = [];
    for (const d of devices) {
      if (d.kind === "audioinput") {
        inputs.push({
          deviceId: d.deviceId,
          label: d.label || (d.deviceId === "default" ? "Default Microphone" : "Microphone"),
          kind: "audioinput",
          isDefault: d.deviceId === "default",
        });
      } else if (d.kind === "audiooutput") {
        outputs.push({
          deviceId: d.deviceId,
          label: d.label || (d.deviceId === "default" ? "Default Speaker" : "Speaker"),
          kind: "audiooutput",
          isDefault: d.deviceId === "default",
        });
      }
    }
    return { inputs, outputs };
  } catch (e) {
    console.warn("Failed to enumerate audio devices:", e);
    return { inputs: [], outputs: [] };
  }
}

export function isAudioContextSinkSupported(): boolean {
  return typeof window !== "undefined" && "setSinkId" in (window.AudioContext || (window as any).webkitAudioContext).prototype;
}

export interface LiveVoiceState {
  status: LiveVoiceStatus;
  isListening: boolean;
  isSpeaking: boolean;
  isMicMuted: boolean;
  isAiMuted: boolean;
  micMode: LiveVoiceMicMode;
  model: string;
  voiceName: string;
  inputLevel: number;
  outputLevel: number;
  isReconnecting: boolean;
}

export interface LiveVoiceOptions {
  systemInstruction?: string;
  voiceName?: string;
  temperature?: number;
  preferredModel?: string;
  micMode?: LiveVoiceMicMode;
  micDeviceId?: string;
  outputDeviceId?: string;
  contextTurns?: { role: string; text: string }[];
  onUserTranscript?: (text: string, final: boolean) => void;
  onModelTranscript?: (text: string, final: boolean) => void;
  onTurnEnd?: (userText: string, modelText: string) => void;
  onStateChange?: (state: LiveVoiceState) => void;
  onAudioLevels?: (inputLevel: number, outputLevel: number) => void;
  onError?: (message: string) => void;
}

interface SessionHandle {
  session: any;
  model: string;
  voiceName: string;
  audioContext: AudioContext | null;
  stream: MediaStream | null;
  processor: ScriptProcessorNode | null;
  processorSink: GainNode | null;
  workletNode: AudioWorkletNode | null;
  workletSink: GainNode | null;
  workletDelivered: boolean;
  source: MediaStreamAudioSourceNode | null;
  inputAnalyser: AnalyserNode | null;
  outputAnalyser: AnalyserNode | null;
  outputGainNode: GainNode | null;
  micDeviceId: string;
  outputDeviceId: string;
  appliedSinkId: string;
  disposed: boolean;
  pushToTalk: boolean;
  isMicMuted: boolean;
  isAiMuted: boolean;
  micMode: LiveVoiceMicMode;
  status: LiveVoiceStatus;
  isSpeaking: boolean;
  inputLevel: number;
  outputLevel: number;
  userTranscript: string;
  modelTranscript: string;
  playbackQueue: AudioBufferSourceNode[];
  nextPlaybackTime: number;
  animFrameId: number | null;
  options: LiveVoiceOptions;
}

let active: SessionHandle | null = null;

// Auto-reconnect bookkeeping: when the WebSocket drops mid-call (network blip,
// headset mode switch, server hiccup) we quietly rejoin instead of dumping the
// user back to idle. `manualStop` distinguishes a user hang-up from a drop.
const MAX_RECONNECT_ATTEMPTS = 6;
let lastOptions: LiveVoiceOptions | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempts = 0;
let manualStop = true;
let operationId = 0;
let isReconnecting = false;

function clearReconnectTimer() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

function teardownSession(handle: SessionHandle | null) {
  if (!handle) return;
  // Prevent a stale session's late onclose from clobbering the state of a
  // newer session (it would emit idle/connecting after the new one is live).
  handle.disposed = true;
  if (handle.animFrameId) {
    cancelAnimationFrame(handle.animFrameId);
  }
  try {
    handle.session?.close();
  } catch (e) {}
  try {
    handle.processor?.disconnect();
  } catch (e) {}
  try {
    handle.processorSink?.disconnect();
  } catch (e) {}
  try {
    handle.workletNode?.disconnect();
  } catch (e) {}
  try {
    handle.workletSink?.disconnect();
  } catch (e) {}
  try {
    handle.source?.disconnect();
  } catch (e) {}
  try {
    handle.inputAnalyser?.disconnect();
  } catch (e) {}
  try {
    handle.outputAnalyser?.disconnect();
  } catch (e) {}
  try {
    handle.outputGainNode?.disconnect();
  } catch (e) {}
  handle.stream?.getTracks().forEach((t) => t.stop());
  if (handle.audioContext && handle.audioContext.state !== "closed") {
    handle.audioContext.close().catch(() => {});
  }
}

function buildMicConstraints(micDeviceId?: string): MediaTrackConstraints {
  const constraints: MediaTrackConstraints = {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
  };
  if (micDeviceId && micDeviceId !== "default") {
    constraints.deviceId = { exact: micDeviceId };
  }
  return constraints;
}

function buildModelChain(preferredModel?: string): string[] {
  const chain: string[] = [];
  if (preferredModel) chain.push(preferredModel);
  for (const m of LIVE_MODELS) {
    if (!chain.includes(m)) chain.push(m);
  }
  return chain;
}

async function acquireMicStream(micDeviceId?: string): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({ audio: buildMicConstraints(micDeviceId) });
}

async function acquireMicWithFallback(micDeviceId?: string): Promise<MediaStream> {
  try {
    return await acquireMicStream(micDeviceId);
  } catch (e) {
    // A stale persisted mic id (headset unplugged) makes getUserMedia reject
    // outright with an exact deviceId — fall back to the default mic so the
    // call still starts instead of failing completely.
    if (micDeviceId && micDeviceId !== "default") {
      console.warn("Requested microphone unavailable, falling back to default:", e);
      return acquireMicStream(undefined);
    }
    throw e;
  }
}

async function fetchLiveToken(model: string, config: any): Promise<string> {
  const base = typeof window !== "undefined" ? "" : "http://localhost:3000";
  const res = await fetch(`${base}/api/gemini/live/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, config }),
  });
  if (!res.ok) {
    let errMsg = `Backend error ${res.status}`;
    try {
      const errData = await res.json();
      if (errData.error?.message) errMsg = errData.error.message;
    } catch (e) {}
    throw new Error(errMsg);
  }
  const data = await res.json();
  if (!data.token) throw new Error("No live token returned from server.");
  return data.token;
}

function base64EncodePcm(int16: Int16Array): string {
  const bytes = new Uint8Array(int16.length * 2);
  for (let i = 0; i < int16.length; i++) {
    bytes[i * 2] = int16[i] & 0xff;
    bytes[i * 2 + 1] = (int16[i] >> 8) & 0xff;
  }
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize) as any);
  }
  return btoa(binary);
}

function base64DecodeToPcm(base64: string): Int16Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Int16Array(bytes.buffer);
}

function buildConnectConfig(options: LiveVoiceOptions) {
  const config: any = {
    responseModalities: ["AUDIO"],
    outputAudioTranscription: {},
    inputAudioTranscription: {},
    speechConfig: {
      voiceConfig: {
        prebuiltVoiceConfig: {
          voiceName:
            options.voiceName && (LIVE_VOICES as readonly string[]).includes(options.voiceName)
              ? options.voiceName
              : "Kore",
        },
      },
    },
    // Tune automatic voice detection so the model doesn't interrupt itself.
    // In toggle / hands-free the mic stays open while the model speaks, and the
    // model's own voice echoing back triggers the server's VAD as if the user
    // started talking -> barge-in -> the response cuts in and out. A lower
    // start sensitivity plus a longer silence window make it robust to that
    // echo without making the user's real speech hard to detect.
    realtimeInputConfig: {
      automaticActivityDetection: {
        startOfSpeechSensitivity: "START_SENSITIVITY_LOW",
        endOfSpeechSensitivity: "END_SENSITIVITY_LOW",
        prefixPaddingMs: 400,
        silenceDurationMs: 900,
      },
    },
  };
  if (typeof options.temperature === "number") config.temperature = options.temperature;
  if (options.systemInstruction) {
    config.systemInstruction = { parts: [{ text: options.systemInstruction }] };
  }
  return config;
}

function setupAudioPlayback(handle: SessionHandle): AudioContext {
  if (!handle.audioContext || handle.audioContext.state === "closed") {
    // Use the device's native sample rate: requesting a non-native rate
    // (e.g. 24 kHz on a 48 kHz device) forces the browser to resample the
    // whole graph and is a known source of glitchy / cutting audio on
    // Android. Gemini's 24 kHz PCM is resampled to the context rate per
    // chunk in enqueuePcmAudio instead, so buffers always play natively.
    handle.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    // Auto-resume when the browser suspends the context (tab switch, power
    // management, Bluetooth device change, etc.) so playback doesn't go
    // silent mid-response. Android fires "interrupted" when audio focus is
    // taken away (e.g. a headset button or another app grabs the mic).
    handle.audioContext.onstatechange = () => {
      if (handle.audioContext && handle.audioContext.state !== "running") {
        handle.audioContext.resume().catch(() => {});
      }
    };
  }
  if (handle.audioContext.state === "suspended" || (handle.audioContext.state as string) === "interrupted") {
    handle.audioContext.resume().catch(() => {});
  }

  if (!handle.outputGainNode && handle.audioContext) {
    const gain = handle.audioContext.createGain();
    const analyser = handle.audioContext.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.8;
    gain.connect(analyser);
    analyser.connect(handle.audioContext.destination);
    handle.outputGainNode = gain;
    handle.outputAnalyser = analyser;
  }

  applyOutputSink(handle).catch(() => {});

  return handle.audioContext;
}

interface AudioContextWithSink {
  setSinkId?: (deviceId: string) => Promise<void>;
}

async function isOutputDevicePresent(deviceId: string): Promise<boolean> {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.some((d) => d.kind === "audiooutput" && d.deviceId === deviceId);
  } catch (e) {
    // Can't enumerate right now — don't reset a user's choice on a guess.
    return true;
  }
}

async function applyOutputSink(handle: SessionHandle): Promise<void> {
  const ctx = handle.audioContext;
  if (!ctx || !handle.outputDeviceId) return;
  if (!isAudioContextSinkSupported()) return;
  if (handle.appliedSinkId === handle.outputDeviceId) return;
  // A persisted device id can go stale (headset unplugged, BT forgotten). Set a
  // sink to a device that's no longer present and audio goes silent with no
  // error anywhere. Validate against what's actually connected and fall back
  // to default routing instead of applying a dead sink.
  if (handle.outputDeviceId !== "default") {
    const present = await isOutputDevicePresent(handle.outputDeviceId);
    if (!present) {
      console.warn(`Output device "${handle.outputDeviceId}" no longer present; using default.`);
      handle.outputDeviceId = "";
      return;
    }
  }
  const withSink = ctx as AudioContext & AudioContextWithSink;
  try {
    if (withSink.setSinkId) {
      await withSink.setSinkId(handle.outputDeviceId);
      handle.appliedSinkId = handle.outputDeviceId;
    }
  } catch (e) {
    // No user gesture yet, or the sink isn't available (device unplugged).
    // The next explicit setLiveVoiceOutputDevice call (from the HUD, which is
    // always a user gesture) will re-apply it.
    console.warn("setSinkId failed:", e);
  }
}

if (typeof navigator !== "undefined" && navigator.mediaDevices) {
  navigator.mediaDevices.addEventListener("devicechange", () => {
    if (!active || !active.outputDeviceId || active.outputDeviceId === "default") return;
    // Headset was unplugged mid-call: route back to the default speaker and
    // forget the dead sink so the next chunk doesn't retry it.
    isOutputDevicePresent(active.outputDeviceId).then((present) => {
      if (!present && active) {
        console.warn("Audio output device disconnected; routed back to default.");
        active.outputDeviceId = "";
        active.appliedSinkId = "";
      }
    });
  });
}

function resampleAudio(input: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate === toRate) return input;
  const ratio = toRate / fromRate;
  const outLen = Math.max(1, Math.round(input.length * ratio));
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const srcPos = i / ratio;
    const idx = Math.floor(srcPos);
    const frac = srcPos - idx;
    const next = Math.min(input.length - 1, idx + 1);
    out[i] = input[idx] * (1 - frac) + input[next] * frac;
  }
  return out;
}

// Keep the playback head this far ahead of the live stream. Bluetooth
// headsets add noticeable transport delay and are prone to micro-stalls, so a
// slightly larger budget than the bare minimum smooths those out.
const TARGET_PLAYBACK_LATENCY = 0.22;

function enqueuePcmAudio(handle: SessionHandle, base64: string) {
  const ctx = setupAudioPlayback(handle);
  const pcm = base64DecodeToPcm(base64);
  if (pcm.length === 0) return;

  // Gemini streams 24 kHz PCM. Create the buffer at the context's ACTUAL
  // sample rate (resampling here once) so every chunk plays natively instead
  // of relying on the browser to resample a rate-mismatched buffer per chunk.
  const outRate = ctx.sampleRate || 24000;
  const pcmFloat = new Float32Array(pcm.length);
  for (let i = 0; i < pcm.length; i++) {
    pcmFloat[i] = pcm[i] / 32768.0;
  }
  const audio = outRate === 24000 ? pcmFloat : resampleAudio(pcmFloat, 24000, outRate);
  const buffer = ctx.createBuffer(1, audio.length, outRate);
  buffer.getChannelData(0).set(audio);

  // Jitter buffer: keep the playback head ~180ms ahead so brief stalls
  // between chunks (network / server buffering) don't turn into audible gaps.
  // If we fell behind (stall, context suspend/resume), resync to now instead
  // of scheduling stale audio with dead air.
  const now = ctx.currentTime;
  if (handle.nextPlaybackTime < now) {
    handle.nextPlaybackTime = now;
  }
  const startTime = Math.max(now + TARGET_PLAYBACK_LATENCY, handle.nextPlaybackTime);
  const source = ctx.createBufferSource();
  source.buffer = buffer;

  if (handle.outputGainNode) {
    source.connect(handle.outputGainNode);
  } else {
    source.connect(ctx.destination);
  }

  try {
    source.start(startTime);
  } catch (e) {
    console.warn("Failed to schedule live audio chunk:", e);
    return;
  }
  handle.nextPlaybackTime = startTime + buffer.duration;
  handle.playbackQueue.push(source);
  handle.isSpeaking = true;
  emitState(handle);

  source.onended = () => {
    handle.playbackQueue = handle.playbackQueue.filter((s) => s !== source);
    if (handle.playbackQueue.length === 0) {
      handle.isSpeaking = false;
      handle.outputLevel = 0;
      emitState(handle);
    }
  };
}

export function stopPlayback(handle: SessionHandle) {
  for (const source of handle.playbackQueue) {
    try {
      source.stop();
    } catch (e) {}
  }
  handle.playbackQueue = [];
  handle.nextPlaybackTime = 0;
  handle.isSpeaking = false;
  handle.outputLevel = 0;
  emitState(handle);
}

function isMicSending(handle: SessionHandle): boolean {
  if (handle.isMicMuted) return false;
  if (handle.micMode === "handsFree") return true;
  return handle.pushToTalk;
}

function emitState(handle: SessionHandle) {
  handle.options?.onStateChange?.({
    status: handle.status,
    isListening: isMicSending(handle),
    isSpeaking: handle.isSpeaking,
    isMicMuted: handle.isMicMuted,
    isAiMuted: handle.isAiMuted,
    micMode: handle.micMode,
    model: handle.model,
    voiceName: handle.voiceName,
    inputLevel: handle.inputLevel,
    outputLevel: handle.outputLevel,
    isReconnecting,
  });
}

function startAudioMeterLoop(handle: SessionHandle) {
  const inputBuffer = new Uint8Array(128);
  const outputBuffer = new Uint8Array(128);

  const tick = () => {
    if (!active || active !== handle) return;

    let inLevel = 0;
    if (handle.inputAnalyser && isMicSending(handle)) {
      handle.inputAnalyser.getByteFrequencyData(inputBuffer);
      let sum = 0;
      for (let i = 0; i < inputBuffer.length; i++) {
        sum += inputBuffer[i];
      }
      inLevel = Math.min(1, (sum / inputBuffer.length) / 128);
    }

    let outLevel = 0;
    if (handle.outputAnalyser && handle.isSpeaking && !handle.isAiMuted) {
      handle.outputAnalyser.getByteFrequencyData(outputBuffer);
      let sum = 0;
      for (let i = 0; i < outputBuffer.length; i++) {
        sum += outputBuffer[i];
      }
      outLevel = Math.min(1, (sum / outputBuffer.length) / 128);
    }

    handle.inputLevel = inLevel;
    handle.outputLevel = outLevel;
    handle.options?.onAudioLevels?.(inLevel, outLevel);

    handle.animFrameId = requestAnimationFrame(tick);
  };

  handle.animFrameId = requestAnimationFrame(tick);
}

const WORKLET_PROCESSOR_NAME = "pcm-capture";

// AudioWorklet processor: converts the mic stream to 16 kHz mono PCM on the
// audio render thread and posts base64 chunks to the main thread. Runs off the
// main thread (ScriptProcessorNode runs on it and is a known source of glitchy
// audio on Android). The processor is self-contained: AudioWorklet modules
// cannot import, so the resampler/base64 helpers live inline.
const WORKLET_SOURCE = `
const PCM_RATE = 16000;
const CHUNK_SAMPLES = 320;
function encodePcm(int16) {
  const bytes = new Uint8Array(int16.length * 2);
  for (let i = 0; i < int16.length; i++) {
    bytes[i * 2] = int16[i] & 0xff;
    bytes[i * 2 + 1] = (int16[i] >> 8) & 0xff;
  }
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}
class PcmCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.active = false;
    this.pending = [];
    this.pendingSamples = 0;
    this.port.onmessage = (e) => {
      if (e.data && e.data.type === 'setActive') {
        this.active = !!e.data.active;
        if (!this.active) {
          this.pending = [];
          this.pendingSamples = 0;
        }
      }
    };
  }
  process(inputs) {
    if (!this.active) return true;
    const input = inputs[0];
    if (!input || !input[0]) return true;
    const channel = input[0];
    // Resample the context rate down to 16 kHz once here.
    const ratio = PCM_RATE / sampleRate;
    const outLen = Math.max(1, Math.round(channel.length * ratio));
    for (let i = 0; i < outLen; i++) {
      const srcPos = i / ratio;
      const idx = Math.floor(srcPos);
      const frac = srcPos - idx;
      const next = Math.min(channel.length - 1, idx + 1);
      this.pending.push(channel[idx] * (1 - frac) + channel[next] * frac);
      this.pendingSamples++;
    }
    if (this.pendingSamples >= CHUNK_SAMPLES) {
      const chunk = new Int16Array(this.pendingSamples);
      for (let i = 0; i < this.pendingSamples; i++) {
        const s = Math.max(-1, Math.min(1, this.pending[i]));
        chunk[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }
      this.pending = [];
      this.pendingSamples = 0;
      this.port.postMessage({ pcm: encodePcm(chunk) });
    }
    return true;
  }
}
registerProcessor("${WORKLET_PROCESSOR_NAME}", PcmCaptureProcessor);
`;

let workletUrl: string | null = null;

function getWorkletUrl(): string {
  if (!workletUrl) {
    workletUrl = URL.createObjectURL(new Blob([WORKLET_SOURCE], { type: "application/javascript" }));
  }
  return workletUrl;
}

function isWorkletSupported(ctx: AudioContext): boolean {
  return !!(ctx.audioWorklet && typeof AudioWorkletNode === "function");
}

function syncWorkletState(handle: SessionHandle) {
  if (handle.workletNode) {
    try {
      handle.workletNode.port.postMessage({ type: "setActive", active: isMicSending(handle) });
    } catch (e) {}
  }
}

function detachMicCapture(handle: SessionHandle) {
  try {
    handle.processor?.disconnect();
  } catch (e) {}
  try {
    handle.processorSink?.disconnect();
  } catch (e) {}
  try {
    handle.workletNode?.disconnect();
  } catch (e) {}
  try {
    handle.workletSink?.disconnect();
  } catch (e) {}
  try {
    handle.source?.disconnect();
  } catch (e) {}
  try {
    handle.inputAnalyser?.disconnect();
  } catch (e) {}
  handle.processor = null;
  handle.processorSink = null;
  handle.workletNode = null;
  handle.workletSink = null;
  handle.workletDelivered = false;
  handle.source = null;
  handle.inputAnalyser = null;
}

// If an AudioWorklet node is silent (not pulled by the render graph, a
// device/browser quirk, or a dead message port) the mic would go dead with no
// error anywhere. When the mic should be sending but the worklet has delivered
// nothing after a grace period, tear it down and re-attach using the
// ScriptProcessor fallback so speech keeps flowing.
function scheduleWorkletWatchdog(handle: SessionHandle) {
  const check = () => {
    if (!handle.workletNode || handle.disposed || handle.workletDelivered) return;
    if (isMicSending(handle)) {
      console.warn("AudioWorklet produced no mic audio; falling back to ScriptProcessor.");
      attachMicCapture(handle, true).catch(() => {});
    } else {
      setTimeout(check, 1000);
    }
  };
  setTimeout(check, 2000);
}

async function attachMicCapture(handle: SessionHandle, forceProcessor = false) {
  if (!handle.stream) return;
  detachMicCapture(handle);
  const ctx = setupAudioPlayback(handle);
  const sourceNode = ctx.createMediaStreamSource(handle.stream);

  const inputAnalyser = ctx.createAnalyser();
  inputAnalyser.fftSize = 256;
  inputAnalyser.smoothingTimeConstant = 0.5;
  sourceNode.connect(inputAnalyser);

  const sendChunk = (base64: string) => {
    if (!isMicSending(handle) || !handle.session) return;
    try {
      handle.session.sendRealtimeInput({
        audio: { data: base64, mimeType: "audio/pcm;rate=16000" },
      });
    } catch (e) {
      console.warn("Failed to stream audio chunk:", e);
    }
  };

  if (!forceProcessor && isWorkletSupported(ctx)) {
    try {
      // Timeout so a hanging addModule can't block the session from activating.
      const addModule = ctx.audioWorklet.addModule(getWorkletUrl());
      await Promise.race([
        addModule,
        new Promise((_, reject) => setTimeout(() => reject(new Error("addModule timeout")), 3000)),
      ]);
      const workletNode = new AudioWorkletNode(ctx, WORKLET_PROCESSOR_NAME, {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        channelCount: 1,
        channelCountMode: "explicit",
      });
      // Route the worklet output through a muted gain to the destination. The
      // node MUST be pulled by the graph for process() to run — an
      // AudioWorkletNode left unconnected downstream is not guaranteed to
      // process, which silently kills the mic. The muted gain keeps it silent.
      const workletSink = ctx.createGain();
      workletSink.gain.value = 0;
      sourceNode.connect(workletNode);
      workletNode.connect(workletSink);
      workletSink.connect(ctx.destination);
      workletNode.port.onmessage = (e) => {
        if (e.data && e.data.pcm) {
          handle.workletDelivered = true;
          sendChunk(e.data.pcm);
        }
      };
      handle.workletNode = workletNode;
      handle.workletSink = workletSink;
      handle.workletDelivered = false;
      handle.source = sourceNode;
      handle.inputAnalyser = inputAnalyser;
      syncWorkletState(handle);
      scheduleWorkletWatchdog(handle);
      return;
    } catch (e) {
      console.warn("AudioWorklet unavailable, falling back to ScriptProcessor:", e);
      detachMicCapture(handle);
    }
  }

  // Fallback: ScriptProcessorNode. It must be pulled by the graph for
  // onaudioprocess to fire, but routing it straight to the destination pipes
  // the mic into the speakers (audible self-echo that trips the model's VAD on
  // headsets). Sink it through a muted gain instead: processing still runs.
  const processor = ctx.createScriptProcessor(4096, 1, 1);
  sourceNode.connect(processor);
  const processorSink = ctx.createGain();
  processorSink.gain.value = 0;
  processor.connect(processorSink);
  processorSink.connect(ctx.destination);

  processor.onaudioprocess = (event) => {
    const inputData = event.inputBuffer.getChannelData(0);
    const sampleRate = ctx.sampleRate || 48000;
    const resampled = resampleAudio(inputData, sampleRate, 16000);
    const int16 = new Int16Array(resampled.length);
    for (let i = 0; i < resampled.length; i++) {
      const s = Math.max(-1, Math.min(1, resampled[i]));
      int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    sendChunk(base64EncodePcm(int16));
  };

  handle.processor = processor;
  handle.processorSink = processorSink;
  handle.source = sourceNode;
  handle.inputAnalyser = inputAnalyser;
}

function finalizeTurn(handle: SessionHandle) {
  if (handle.userTranscript.trim() || handle.modelTranscript.trim()) {
    handle.options?.onTurnEnd?.(handle.userTranscript.trim(), handle.modelTranscript.trim());
  }
  handle.userTranscript = "";
  handle.modelTranscript = "";
}

function seedContext(handle: SessionHandle) {
  const context = handle.options.contextTurns;
  if (!context?.length) return;
  const turns = context.map((c) => ({
    role: c.role === "user" ? "user" : "model",
    parts: [{ text: c.text }],
  }));
  try {
    handle.session.sendClientContent({
      turns,
      turnComplete: false,
    });
  } catch (e) {
    console.warn("Failed to seed live voice context:", e);
  }
}

async function connectSession(
  token: string,
  model: string,
  stream: MediaStream,
  options: LiveVoiceOptions
): Promise<SessionHandle> {
  const ai = new GoogleGenAI({ apiKey: token, httpOptions: { apiVersion: "v1alpha" } as any });
  const config = buildConnectConfig(options);

  const handle: SessionHandle = {
    session: null,
    model,
    voiceName: options.voiceName || "Kore",
    audioContext: null,
    stream,
    processor: null,
    processorSink: null,
    workletNode: null,
    workletSink: null,
    workletDelivered: false,
    source: null,
    inputAnalyser: null,
    outputAnalyser: null,
    outputGainNode: null,
    micDeviceId: options.micDeviceId || "",
    outputDeviceId: options.outputDeviceId || "",
    appliedSinkId: "",
    disposed: false,
    pushToTalk: options.micMode === "handsFree",
    isMicMuted: false,
    isAiMuted: false,
    micMode: options.micMode || "hold",
    status: "connecting",
    isSpeaking: false,
    inputLevel: 0,
    outputLevel: 0,
    userTranscript: "",
    modelTranscript: "",
    playbackQueue: [],
    nextPlaybackTime: 0,
    animFrameId: null,
    options,
  };

  const session = await ai.live.connect({
    model,
    config,
    callbacks: {
      onopen: () => {
        handle.status = "connected";
        emitState(handle);
        startAudioMeterLoop(handle);
      },
      onmessage: (message: any) => {
        const content = message.serverContent;
        if (!content) return;

        if (content.interrupted) {
          stopPlayback(handle);
          return;
        }

        if (content.modelTurn?.parts) {
          for (const part of content.modelTurn.parts) {
            if (part.inlineData?.data) {
              if (!handle.isAiMuted) {
                enqueuePcmAudio(handle, part.inlineData.data);
              }
            } else if (part.text) {
              handle.modelTranscript += part.text;
              handle.options?.onModelTranscript?.(handle.modelTranscript, false);
            }
          }
        }

        if (content.inputTranscription?.text) {
          handle.userTranscript = content.inputTranscription.text;
          handle.options?.onUserTranscript?.(handle.userTranscript, false);
        }

        if (content.outputTranscription?.text) {
          handle.modelTranscript = content.outputTranscription.text;
          handle.options?.onModelTranscript?.(handle.modelTranscript, false);
        }

        if (content.turnComplete) {
          finalizeTurn(handle);
        }
      },
      onerror: (e: any) => {
        handle.options?.onError?.(e?.message || "Live voice error");
      },
      onclose: () => {
        if (handle.disposed) return;
        stopPlayback(handle);
        if (active === handle && !manualStop) {
          // Unexpected drop. Keep the HUD up in a "connecting" state and
          // rejoin quietly instead of throwing the user back to idle.
          isReconnecting = true;
          handle.status = "connecting";
          emitState(handle);
          scheduleReconnect();
        } else {
          handle.status = "idle";
          emitState(handle);
        }
      },
    },
  });

  handle.session = session;
  // The connect promise resolves AFTER onopen fires, so handle.session is only
  // guaranteed here — seeding context in onopen was silently no-op'ing before.
  seedContext(handle);
  return handle;
}

export async function startLiveVoice(options: LiveVoiceOptions): Promise<void> {
  const op = ++operationId;
  manualStop = false;
  isReconnecting = false;
  clearReconnectTimer();
  lastOptions = options;
  reconnectAttempts = 0;
  teardownSession(active);
  active = null;

  const stream = await acquireMicWithFallback(options.micDeviceId);
  if (op !== operationId) {
    stream.getTracks().forEach((t) => t.stop());
    return;
  }
  let lastError: Error | null = null;

  for (const model of buildModelChain(options.preferredModel)) {
    try {
      const token = await fetchLiveToken(model, buildConnectConfig(options));
      if (op !== operationId) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      const handle = await connectSession(token, model, stream, options);
      if (op !== operationId) {
        stream.getTracks().forEach((t) => t.stop());
        teardownSession(handle);
        return;
      }
      await attachMicCapture(handle);
      // Hold / Tap modes don't need the mic until the user actually talks —
      // release it now so the phone doesn't sit in "call" mode the whole time.
      if (!isMicSending(handle)) {
        stopMicForSending(handle);
      }
      active = handle;
      handle.status = "connected";
      emitState(handle);
      return;
    } catch (err: any) {
      lastError = err;
      console.warn(`Live voice model ${model} failed: ${err?.message}`);
    }
  }

  stream.getTracks().forEach((t) => t.stop());
  throw lastError || new Error("All Live voice models failed to connect.");
}

function scheduleReconnect() {
  if (manualStop || !lastOptions || reconnectTimer) return;
  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    // Give up: mark the (dead) session as errored so the HUD collapses, and
    // tell the user why the call ended.
    if (active) {
      active.status = "error";
      active.stream?.getTracks().forEach((t) => t.stop());
      emitState(active);
    }
    lastOptions?.onError?.("Live connection was lost and could not be restored.");
    lastOptions = null;
    return;
  }
  const delay = Math.min(30000, 1000 * Math.pow(2, reconnectAttempts));
  reconnectAttempts += 1;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    reconnectNow().catch(() => scheduleReconnect());
  }, delay);
}

async function reconnectNow(): Promise<void> {
  if (manualStop || !lastOptions) return;
  const op = operationId;
  const options = lastOptions;
  const stale = active;

  const stream = await acquireMicWithFallback(options.micDeviceId);
  if (op !== operationId || manualStop || !lastOptions) {
    stream.getTracks().forEach((t) => t.stop());
    return;
  }

  for (const model of buildModelChain(options.preferredModel)) {
    try {
      const token = await fetchLiveToken(model, buildConnectConfig(options));
      if (op !== operationId || manualStop || !lastOptions) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      const handle = await connectSession(token, model, stream, options);
      if (op !== operationId || manualStop || !lastOptions) {
        stream.getTracks().forEach((t) => t.stop());
        teardownSession(handle);
        return;
      }
      // Carry the user's in-call settings across to the fresh session.
      if (stale) {
        handle.micMode = stale.micMode;
        handle.isMicMuted = stale.isMicMuted;
        handle.isAiMuted = stale.isAiMuted;
        handle.pushToTalk = stale.micMode === "handsFree" || isMicSending(stale);
      }
      await attachMicCapture(handle);
      if (stale?.isAiMuted && handle.outputGainNode) {
        handle.outputGainNode.gain.value = 0;
      }
      if (!isMicSending(handle)) {
        stopMicForSending(handle);
      }
      // Swap in the live session before tearing the stale one down so the
      // stale onclose doesn't clobber the fresh state.
      active = null;
      teardownSession(stale);
      active = handle;
      handle.status = "connected";
      reconnectAttempts = 0;
      isReconnecting = false;
      emitState(handle);
      return;
    } catch (err: any) {
      console.warn(`Live voice reconnect model ${model} failed: ${err?.message}`);
    }
  }

  stream.getTracks().forEach((t) => t.stop());
  if (active) {
    // Keep the dead handle in "connecting" so the HUD stays alive for retries.
    active.status = "connecting";
    emitState(active);
  }
  scheduleReconnect();
}

function sendAudioStreamEnd(handle: SessionHandle): void {
  if (!handle.session) return;
  try {
    handle.session.sendRealtimeInput({ audioStreamEnd: true });
  } catch (e) {
    console.warn("Failed to send audioStreamEnd:", e);
  }
}

// In Hold / Tap-to-Talk modes the mic only needs to be captured while the user
// is actually talking. Holding it open the whole session is what makes Android
// treat the page as an active call — audio focus gets pulled, the context gets
// "interrupted", and responses go silent (transcripts still stream). Release
// the capture between sends and re-acquire on the next press; Hands-Free keeps
// it continuous.
function stopMicForSending(handle: SessionHandle) {
  if (handle.micMode === "handsFree") return;
  if (handle.stream) {
    handle.stream.getTracks().forEach((t) => t.stop());
    detachMicCapture(handle);
    handle.stream = null;
  }
}

async function startMicForSending(handle: SessionHandle): Promise<void> {
  if (handle.stream) return;
  const stream = await acquireMicWithFallback(handle.micDeviceId);
  if (handle.disposed) {
    stream.getTracks().forEach((t) => t.stop());
    return;
  }
  handle.stream = stream;
  await attachMicCapture(handle);
  // The user may have released the talk button (or muted) while we were
  // acquiring — don't leave the mic captured if it's no longer needed.
  if (!isMicSending(handle)) {
    stopMicForSending(handle);
  }
}

function onMicSendingChanged(handle: SessionHandle, wasSending: boolean): void {
  const nowSending = isMicSending(handle);
  if (wasSending && !nowSending) {
    // Flush the user's turn so the model responds promptly instead of
    // waiting for more input after push-to-talk is released.
    sendAudioStreamEnd(handle);
    stopMicForSending(handle);
  } else if (!wasSending && nowSending) {
    startMicForSending(handle).catch((e: any) => {
      console.warn("Failed to start microphone:", e);
      handle.options?.onError?.(e?.message || "Microphone unavailable");
    });
  }
  syncWorkletState(handle);
}

export function setPushToTalk(listening: boolean): void {
  if (!active) return;
  setupAudioPlayback(active);
  const wasSending = isMicSending(active);
  active.pushToTalk = listening;
  if (!wasSending && listening && active.isSpeaking) {
    // Clean barge-in: stop playback immediately instead of letting the
    // server's VAD cut the AI's speech erratically mid-syllable.
    stopPlayback(active);
  }
  onMicSendingChanged(active, wasSending);
  emitState(active);
}

export function setLiveVoiceMicMode(mode: LiveVoiceMicMode): void {
  if (!active) return;
  const wasSending = isMicSending(active);
  active.micMode = mode;
  active.pushToTalk = mode === "handsFree";
  onMicSendingChanged(active, wasSending);
  emitState(active);
}

export function setLiveVoiceOutputDevice(deviceId: string): boolean {
  if (!active) return false;
  active.outputDeviceId = deviceId;
  setupAudioPlayback(active);
  applyOutputSink(active).catch(() => {});
  return true;
}

export async function setLiveVoiceInputDevice(deviceId: string): Promise<boolean> {
  if (!active) return false;
  if (deviceId === active.micDeviceId) return true;
  active.micDeviceId = deviceId;
  if (!active.stream) {
    // Mic is currently released (Hold/Tap mode between turns); the next
    // press will re-acquire with this device automatically.
    return true;
  }
  const wasSending = isMicSending(active);
  const oldStream = active.stream;
  try {
    const newStream = await navigator.mediaDevices.getUserMedia({
      audio: buildMicConstraints(deviceId),
    });
    oldStream.getTracks().forEach((t) => t.stop());
    active.stream = newStream;
    await attachMicCapture(active);
    onMicSendingChanged(active, wasSending);
    emitState(active);
    return true;
  } catch (e: any) {
    active.options?.onError?.(e?.message || "Failed to switch microphone");
    return false;
  }
}

export function toggleLiveVoiceMicMute(): boolean {
  if (!active) return false;
  const wasSending = isMicSending(active);
  active.isMicMuted = !active.isMicMuted;
  onMicSendingChanged(active, wasSending);
  emitState(active);
  return active.isMicMuted;
}

export function toggleLiveVoiceAiMute(): boolean {
  if (!active) return false;
  active.isAiMuted = !active.isAiMuted;
  if (active.outputGainNode) {
    active.outputGainNode.gain.value = active.isAiMuted ? 0 : 1;
  }
  if (active.isAiMuted) {
    stopPlayback(active);
  }
  emitState(active);
  return active.isAiMuted;
}

export function interruptAiSpeech(): void {
  if (!active) return;
  stopPlayback(active);
}

export function sendTextMessage(text: string): void {
  if (!active?.session) return;
  active.userTranscript = text;
  active.options?.onUserTranscript?.(text, true);
  active.session.sendClientContent({
    turns: [{ role: "user", parts: [{ text }] }],
    turnComplete: true,
  });
}

export function stopLiveVoice(): void {
  operationId += 1;
  manualStop = true;
  isReconnecting = false;
  clearReconnectTimer();
  teardownSession(active);
  active = null;
}

export function getLiveVoiceState(): LiveVoiceState {
  if (!active) {
    return {
      status: "idle",
      isListening: false,
      isSpeaking: false,
      isMicMuted: false,
      isAiMuted: false,
      micMode: "hold",
      model: "",
      voiceName: "Kore",
      inputLevel: 0,
      outputLevel: 0,
      isReconnecting: false,
    };
  }
  return {
    status: active.status,
    isListening: isMicSending(active),
    isSpeaking: active.isSpeaking,
    isMicMuted: active.isMicMuted,
    isAiMuted: active.isAiMuted,
    micMode: active.micMode,
    model: active.model,
    voiceName: active.voiceName,
    inputLevel: active.inputLevel,
    outputLevel: active.outputLevel,
    isReconnecting,
  };
}