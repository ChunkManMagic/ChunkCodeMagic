import { GoogleGenAI } from "@google/genai";

export const LIVE_MODELS = [
  "gemini-3.1-flash-live-preview",
  "gemini-2.5-flash-native-audio-preview-12-2025",
] as const;

export const LIVE_VOICES = ["Puck", "Charon", "Kore", "Fenrir", "Aoede"] as const;

export type LiveVoiceStatus = "idle" | "connecting" | "connected" | "error";

export interface LiveVoiceState {
  status: LiveVoiceStatus;
  isListening: boolean;
  isSpeaking: boolean;
  model: string;
}

export interface LiveVoiceOptions {
  systemInstruction?: string;
  voiceName?: string;
  temperature?: number;
  preferredModel?: string;
  onUserTranscript?: (text: string, final: boolean) => void;
  onModelTranscript?: (text: string, final: boolean) => void;
  onTurnEnd?: (userText: string, modelText: string) => void;
  onStateChange?: (state: LiveVoiceState) => void;
  onError?: (message: string) => void;
}

interface SessionHandle {
  session: any;
  model: string;
  audioContext: AudioContext | null;
  stream: MediaStream;
  processor: ScriptProcessorNode | null;
  source: MediaStreamAudioSourceNode | null;
  pushToTalk: boolean;
  status: LiveVoiceStatus;
  isSpeaking: boolean;
  userTranscript: string;
  modelTranscript: string;
  playbackQueue: AudioBufferSourceNode[];
  nextPlaybackTime: number;
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
  const startTime = Math.max(ctx.currentTime + 0.05, handle.nextPlaybackTime);
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(ctx.destination);
  source.start(startTime);
  handle.nextPlaybackTime = startTime + buffer.duration;
  handle.playbackQueue.push(source);
  handle.isSpeaking = true;
  emitState(handle);
  source.onended = () => {
    handle.playbackQueue = handle.playbackQueue.filter(s => s !== source);
    if (handle.playbackQueue.length === 0) {
      handle.isSpeaking = false;
      emitState(handle);
    }
  };
}

function stopPlayback(handle: SessionHandle) {
  for (const source of handle.playbackQueue) {
    try { source.stop(); } catch (e) {}
  }
  handle.playbackQueue = [];
  handle.nextPlaybackTime = 0;
  handle.isSpeaking = false;
  emitState(handle);
}

function emitState(handle: SessionHandle) {
  handle.options?.onStateChange?.({
    status: handle.status,
    isListening: handle.pushToTalk,
    isSpeaking: handle.isSpeaking,
    model: handle.model,
  });
}

function attachMicCapture(handle: SessionHandle) {
  const ctx = setupAudioPlayback(handle);
  const sourceNode = ctx.createMediaStreamSource(handle.stream);
  const processor = ctx.createScriptProcessor(4096, 1, 1);
  sourceNode.connect(processor);
  processor.connect(ctx.destination);

  processor.onaudioprocess = (event) => {
    if (!handle.pushToTalk || !handle.session) return;
    const inputData = event.inputBuffer.getChannelData(0);
    const sampleRate = ctx.sampleRate || 48000;
    const resampled = resampleTo16k(inputData, sampleRate, 16000);
    const int16 = new Int16Array(resampled.length);
    for (let i = 0; i < resampled.length; i++) {
      const s = Math.max(-1, Math.min(1, resampled[i]));
      int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    const base64 = base64EncodePcm(int16);
    handle.session.sendRealtimeInput({
      audio: { data: base64, mimeType: "audio/pcm;rate=16000" },
    });
  };

  handle.processor = processor;
  handle.source = sourceNode;
}

function finalizeTurn(handle: SessionHandle) {
  if (handle.userTranscript.trim() || handle.modelTranscript.trim()) {
    handle.options?.onTurnEnd?.(handle.userTranscript.trim(), handle.modelTranscript.trim());
  }
  handle.userTranscript = "";
  handle.modelTranscript = "";
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
    audioContext: null,
    stream,
    processor: null,
    source: null,
    pushToTalk: false,
    status: "connecting",
    isSpeaking: false,
    userTranscript: "",
    modelTranscript: "",
    playbackQueue: [],
    nextPlaybackTime: 0,
    options,
  };

  const session = await ai.live.connect({
    model,
    config,
    callbacks: {
      onopen: () => {
        handle.status = "connected";
        emitState(handle);
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
              enqueuePcmAudio(handle, part.inlineData.data);
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

  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
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

  stream.getTracks().forEach(t => t.stop());
  throw lastError || new Error("All Live voice models failed.");
}

export function setPushToTalk(listening: boolean): void {
  if (!active) return;
  setupAudioPlayback(active);
  active.pushToTalk = listening;
  emitState(active);
}

export function stopLiveVoice(): void {
  if (active) {
    try { active.session?.close(); } catch (e) {}
    try { active.processor?.disconnect(); } catch (e) {}
    try { active.source?.disconnect(); } catch (e) {}
    active.stream?.getTracks().forEach(t => t.stop());
    if (active.audioContext && active.audioContext.state !== "closed") {
      active.audioContext.close();
    }
    active = null;
  }
}

export function getLiveVoiceState(): LiveVoiceState {
  if (!active) {
    return { status: "idle", isListening: false, isSpeaking: false, model: "" };
  }
  return {
    status: active.status,
    isListening: active.pushToTalk,
    isSpeaking: active.isSpeaking,
    model: active.model,
  };
}