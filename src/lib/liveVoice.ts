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
}

export interface LiveVoiceOptions {
  systemInstruction?: string;
  voiceName?: string;
  temperature?: number;
  preferredModel?: string;
  micMode?: LiveVoiceMicMode;
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
  stream: MediaStream;
  processor: ScriptProcessorNode | null;
  source: MediaStreamAudioSourceNode | null;
  inputAnalyser: AnalyserNode | null;
  outputAnalyser: AnalyserNode | null;
  outputGainNode: GainNode | null;
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
  };
  if (typeof options.temperature === "number") config.temperature = options.temperature;
  if (options.systemInstruction) {
    config.systemInstruction = { parts: [{ text: options.systemInstruction }] };
  }
  return config;
}

function setupAudioPlayback(handle: SessionHandle): AudioContext {
  if (!handle.audioContext || handle.audioContext.state === "closed") {
    handle.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
  }
  if (handle.audioContext.state === "suspended") {
    handle.audioContext.resume();
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

  return handle.audioContext;
}

function resampleTo16k(input: Float32Array, fromRate: number, toRate: number): Float32Array {
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

function enqueuePcmAudio(handle: SessionHandle, base64: string) {
  const ctx = setupAudioPlayback(handle);
  const pcm = base64DecodeToPcm(base64);
  const buffer = ctx.createBuffer(1, pcm.length, 24000);
  const channelData = buffer.getChannelData(0);
  for (let i = 0; i < pcm.length; i++) {
    channelData[i] = pcm[i] / 32768.0;
  }
  const startTime = Math.max(ctx.currentTime + 0.04, handle.nextPlaybackTime);
  const source = ctx.createBufferSource();
  source.buffer = buffer;

  if (handle.outputGainNode) {
    source.connect(handle.outputGainNode);
  } else {
    source.connect(ctx.destination);
  }

  source.start(startTime);
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

function attachMicCapture(handle: SessionHandle) {
  const ctx = setupAudioPlayback(handle);
  const sourceNode = ctx.createMediaStreamSource(handle.stream);

  const inputAnalyser = ctx.createAnalyser();
  inputAnalyser.fftSize = 256;
  inputAnalyser.smoothingTimeConstant = 0.5;
  sourceNode.connect(inputAnalyser);

  const processor = ctx.createScriptProcessor(4096, 1, 1);
  sourceNode.connect(processor);
  processor.connect(ctx.destination);

  processor.onaudioprocess = (event) => {
    if (!isMicSending(handle) || !handle.session) return;
    const inputData = event.inputBuffer.getChannelData(0);
    const sampleRate = ctx.sampleRate || 48000;
    const resampled = resampleTo16k(inputData, sampleRate, 16000);
    const int16 = new Int16Array(resampled.length);
    for (let i = 0; i < resampled.length; i++) {
      const s = Math.max(-1, Math.min(1, resampled[i]));
      int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    const base64 = base64EncodePcm(int16);
    try {
      handle.session.sendRealtimeInput({
        audio: { data: base64, mimeType: "audio/pcm;rate=16000" },
      });
    } catch (e) {
      console.warn("Failed to stream audio chunk:", e);
    }
  };

  handle.processor = processor;
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
    source: null,
    inputAnalyser: null,
    outputAnalyser: null,
    outputGainNode: null,
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
        seedContext(handle);
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
        handle.status = "idle";
        emitState(handle);
      },
    },
  });

  handle.session = session;
  return handle;
}

export async function startLiveVoice(options: LiveVoiceOptions): Promise<void> {
  stopLiveVoice();

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });
  let lastError: Error | null = null;

  const modelChain: string[] = [];
  if (options.preferredModel) {
    modelChain.push(options.preferredModel);
  }
  for (const m of LIVE_MODELS) {
    if (!modelChain.includes(m)) modelChain.push(m);
  }

  for (const model of modelChain) {
    try {
      const token = await fetchLiveToken(model, buildConnectConfig(options));
      const handle = await connectSession(token, model, stream, options);
      handle.status = "connected";
      attachMicCapture(handle);
      active = handle;
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

export function setPushToTalk(listening: boolean): void {
  if (!active) return;
  setupAudioPlayback(active);
  active.pushToTalk = listening;
  emitState(active);
}

export function setLiveVoiceMicMode(mode: LiveVoiceMicMode): void {
  if (!active) return;
  active.micMode = mode;
  if (mode === "handsFree") {
    active.pushToTalk = true;
  } else {
    active.pushToTalk = false;
  }
  emitState(active);
}

export function toggleLiveVoiceMicMute(): boolean {
  if (!active) return false;
  active.isMicMuted = !active.isMicMuted;
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
  if (active) {
    if (active.animFrameId) {
      cancelAnimationFrame(active.animFrameId);
    }
    try {
      active.session?.close();
    } catch (e) {}
    try {
      active.processor?.disconnect();
    } catch (e) {}
    try {
      active.source?.disconnect();
    } catch (e) {}
    try {
      active.inputAnalyser?.disconnect();
    } catch (e) {}
    try {
      active.outputAnalyser?.disconnect();
    } catch (e) {}
    try {
      active.outputGainNode?.disconnect();
    } catch (e) {}
    active.stream?.getTracks().forEach((t) => t.stop());
    if (active.audioContext && active.audioContext.state !== "closed") {
      active.audioContext.close();
    }
    active = null;
  }
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
  };
}