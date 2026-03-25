import { useState, useRef, useCallback } from 'react';
import { generateSpeech, getSettings } from '../lib/gemini';
import type { CharacterProfile } from '../lib/types';

export function useVoice(profile: CharacterProfile) {
  const [isAutoRead, setIsAutoRead] = useState(true);
  const [isProcessingSpeech, setIsProcessingSpeech] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isManualPause, setIsManualPause] = useState(false);
  const [audioQueue, setAudioQueue] = useState<AudioBuffer[]>([]);
  const [currentSource, setCurrentSource] = useState<AudioBufferSourceNode | null>(null);

  const speechQueue = useRef<string[]>([]);
  const nextStartTime = useRef(0);
  const audioCtx = useRef<AudioContext | null>(null);
  const audioCache = useRef<Map<string, string>>(new Map());

  const getAudioContext = useCallback((): AudioContext => {
    if (!audioCtx.current) {
      audioCtx.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    return audioCtx.current;
  }, []);

  const decodeBase64Audio = useCallback(
    async (base64: string): Promise<AudioBuffer | null> => {
      try {
        const binaryString = atob(base64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }

        const ctx = getAudioContext();
        const float32 = new Float32Array(bytes.length / 2);
        const view = new DataView(bytes.buffer);
        for (let i = 0; i < float32.length; i++) {
          float32[i] = view.getInt16(i * 2, true) / 32768.0;
        }

        const buffer = ctx.createBuffer(1, float32.length, 24000);
        buffer.getChannelData(0).set(float32);
        return buffer;
      } catch (e) {
        console.error('[useVoice] Audio decode error:', e);
        return null;
      }
    },
    [getAudioContext],
  );

  const playNextInQueue = useCallback(() => {
    setAudioQueue(prev => {
      if (prev.length === 0 || isManualPause) {
        setIsPlaying(false);
        return prev;
      }

      const [nextBuffer, ...rest] = prev;
      const ctx = getAudioContext();
      const source = ctx.createBufferSource();
      source.buffer = nextBuffer;

      const gain = ctx.createGain();
      source.connect(gain);
      gain.connect(ctx.destination);

      const now = ctx.currentTime;
      const startAt = Math.max(now, nextStartTime.current);
      const fade = 0.005;

      gain.gain.setValueAtTime(0, startAt);
      gain.gain.linearRampToValueAtTime(1, startAt + fade);
      gain.gain.setValueAtTime(1, startAt + nextBuffer.duration - fade);
      gain.gain.linearRampToValueAtTime(0, startAt + nextBuffer.duration);

      source.start(startAt);
      nextStartTime.current = startAt + nextBuffer.duration;

      setCurrentSource(source);
      setIsPlaying(true);

      source.onended = () => {
        setIsPlaying(false);
        // Will re-trigger via audioQueue useEffect
      };

      return rest;
    });
  }, [isManualPause, getAudioContext]);

  // Kick off playback whenever the queue grows
  const triggerPlayback = useCallback(() => {
    setAudioQueue(q => {
      if (q.length > 0 && !isPlaying && !isManualPause) {
        // Can't call playNextInQueue here due to stale closure — flag instead
        setTimeout(playNextInQueue, 0);
      }
      return q;
    });
  }, [isPlaying, isManualPause, playNextInQueue]);

  const processSpeechQueue = useCallback(async () => {
    if (speechQueue.current.length === 0) {
      setIsProcessingSpeech(false);
      return;
    }

    setIsProcessingSpeech(true);
    const chunk = speechQueue.current.shift();
    if (!chunk) {
      processSpeechQueue();
      return;
    }

    try {
      const settings = getSettings();
      const voiceName = settings.premiumCustomVoices ? profile.voiceName : 'Kore';
      const vs = settings.premiumCustomVoices
        ? profile.voiceSettings
        : { pitch: 'Normal', speed: 'Normal', accent: 'None' };

      const cacheKey = `${chunk}_${voiceName}_${vs?.pitch}_${vs?.speed}`;
      let audioBase64 = audioCache.current.get(cacheKey);

      if (!audioBase64) {
        audioBase64 = await generateSpeech(chunk, voiceName, vs, profile.storyTone);
        if (audioBase64) audioCache.current.set(cacheKey, audioBase64);
      }

      if (audioBase64) {
        const buffer = await decodeBase64Audio(audioBase64);
        if (buffer) {
          setAudioQueue(prev => {
            const next = [...prev, buffer];
            return next;
          });
          triggerPlayback();
        }
      }
    } catch (e) {
      console.error('[useVoice] Speech generation error:', e);
    }

    processSpeechQueue();
  }, [profile, decodeBase64Audio, triggerPlayback]);

  const readAloud = useCallback(
    (text: string) => {
      const settings = getSettings();

      const cleanText = text
        .replace(/<ooc>[\s\S]*?<\/ooc>/gi, '')
        .replace(/[*#_~`]/g, '')
        .trim();

      if (!cleanText) return;

      if (settings.voiceEngine === 'Fast Browser') {
        const utterance = new SpeechSynthesisUtterance(cleanText);
        if (profile.voiceSettings?.speed === 'Fast') utterance.rate = 1.2;
        else if (profile.voiceSettings?.speed === 'Slow') utterance.rate = 0.8;
        if (profile.voiceSettings?.pitch === 'High') utterance.pitch = 1.2;
        else if (profile.voiceSettings?.pitch === 'Low') utterance.pitch = 0.8;
        window.speechSynthesis.speak(utterance);
        return;
      }

      // Chunk into ~200-char segments at sentence boundaries
      const chunks: string[] = [];
      let remaining = cleanText;
      while (remaining.length > 0) {
        if (remaining.length <= 200) {
          chunks.push(remaining);
          break;
        }
        let idx = remaining.lastIndexOf('. ', 200);
        if (idx === -1) idx = remaining.lastIndexOf('? ', 200);
        if (idx === -1) idx = remaining.lastIndexOf('! ', 200);
        if (idx === -1) idx = remaining.lastIndexOf('\n', 200);
        if (idx === -1) idx = remaining.lastIndexOf(' ', 200);
        if (idx < 50) idx = 200;
        chunks.push(remaining.slice(0, idx + 1).trim());
        remaining = remaining.slice(idx + 1).trim();
      }

      speechQueue.current = [...speechQueue.current, ...chunks];
      if (!isProcessingSpeech) {
        processSpeechQueue();
      }
    },
    [profile, isProcessingSpeech, processSpeechQueue],
  );

  const stopAudio = useCallback(() => {
    try { currentSource?.stop(); } catch { /* already stopped */ }
    setCurrentSource(null);
    setIsPlaying(false);
    nextStartTime.current = 0;
    setAudioQueue([]);
    speechQueue.current = [];
  }, [currentSource]);

  const togglePlayPause = useCallback(() => {
    if (isPlaying) {
      stopAudio();
      setIsManualPause(true);
    } else {
      setIsManualPause(false);
    }
  }, [isPlaying, stopAudio]);

  return {
    isAutoRead,
    setIsAutoRead,
    isPlaying,
    isProcessingSpeech,
    readAloud,
    stopAudio,
    togglePlayPause,
  };
}
