import { useState, useRef, useEffect, useCallback } from 'react';
import { generateSpeech } from '../lib/gemini';
import { VoiceSettings, getSettings } from '../lib/types';

export function useVoice(voiceName: string, voiceSettings: VoiceSettings | undefined, storyTone: string) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isProcessingSpeech, setIsProcessingSpeech] = useState(false);
  const [isManualPause, setIsManualPause] = useState(false);
  const [currentAudioSource, setCurrentAudioSource] = useState<AudioBufferSourceNode | null>(null);
  
  const audioQueue = useRef<AudioBuffer[]>([]);
  const speechQueue = useRef<string[]>([]);
  const nextStartTimeRef = useRef<number>(0);
  const playbackAudioContextRef = useRef<AudioContext | null>(null);
  const audioCache = useRef<Map<string, string>>(new Map());

  const initAudioContext = () => {
    if (!playbackAudioContextRef.current || playbackAudioContextRef.current.state === 'closed') {
      playbackAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (playbackAudioContextRef.current.state === 'suspended') {
      playbackAudioContextRef.current.resume();
    }
    return playbackAudioContextRef.current;
  };

  const playNextInQueue = useCallback(() => {
    if (audioQueue.current.length === 0 || isManualPause) {
      if (audioQueue.current.length === 0 && speechQueue.current.length === 0) {
        setIsPlaying(false);
        nextStartTimeRef.current = 0;
      }
      return;
    }

    const ctx = initAudioContext();
    const buffer = audioQueue.current.shift();
    if (!buffer) return;

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    
    const startTime = Math.max(ctx.currentTime, nextStartTimeRef.current);
    source.start(startTime);
    
    nextStartTimeRef.current = startTime + buffer.duration + 0.1; // 100ms gap
    setCurrentAudioSource(source);
    setIsPlaying(true);

    source.onended = () => {
      setCurrentAudioSource(null);
      playNextInQueue();
    };
  }, [isManualPause]);

  const processSpeechQueue = useCallback(async () => {
    if (isProcessingSpeech || speechQueue.current.length === 0) return;
    setIsProcessingSpeech(true);

    try {
      const text = speechQueue.current.shift();
      if (!text) return;

      const settings = getSettings();
      const activeVoiceName = settings.premiumCustomVoices ? voiceName : 'Kore';
      const activeVoiceSettings = settings.premiumCustomVoices ? voiceSettings : { pitch: 'Normal', speed: 'Normal', accent: 'None' };
      
      const cacheKey = `${text.trim()}_${activeVoiceName}_${activeVoiceSettings?.pitch}_${activeVoiceSettings?.speed}`;
      let base64Audio = audioCache.current.get(cacheKey);
      
      if (!base64Audio) {
        base64Audio = await generateSpeech(text, activeVoiceName, activeVoiceSettings, storyTone);
        if (base64Audio) {
          audioCache.current.set(cacheKey, base64Audio);
        }
      }

      if (base64Audio) {
        const ctx = initAudioContext();
        const binaryString = window.atob(base64Audio);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        
        const audioBuffer = await ctx.decodeAudioData(bytes.buffer);
        audioQueue.current.push(audioBuffer);
        
        if (!isPlaying && !isManualPause) {
          playNextInQueue();
        }
      }
    } catch (error) {
      console.error("TTS Error:", error);
    } finally {
      setIsProcessingSpeech(false);
      if (speechQueue.current.length > 0) {
        processSpeechQueue();
      }
    }
  }, [isProcessingSpeech, isPlaying, isManualPause, playNextInQueue, voiceName, voiceSettings, storyTone]);

  const handleReadAloud = useCallback((text: string) => {
    try {
      const textWithoutOoc = text.replace(/<ooc>[\s\S]*?<\/ooc>/gi, '').trim();
      const cleanText = textWithoutOoc.replace(/[*#_~`]/g, '').trim();
      if (!cleanText) return;
      
      const settings = getSettings();
      
      // Helper for browser TTS fallback
      const speakWithBrowser = (txt: string) => {
        const utterance = new SpeechSynthesisUtterance(txt);
        if (voiceSettings?.speed === 'Fast') utterance.rate = 1.2;
        else if (voiceSettings?.speed === 'Slow') utterance.rate = 0.8;
        if (voiceSettings?.pitch === 'High') utterance.pitch = 1.2;
        else if (voiceSettings?.pitch === 'Low') utterance.pitch = 0.8;
        window.speechSynthesis.speak(utterance);
      };

      if (settings.voiceEngine === 'Fast Browser') {
        speakWithBrowser(cleanText);
        return;
      }

      // Split text into small chunks (~200 chars) for sequential generation
      const chunks: string[] = [];
      let remainingText = cleanText;
      
      while (remainingText.length > 0) {
        if (remainingText.length <= 200) {
          chunks.push(remainingText);
          break;
        }
        
        let breakIndex = remainingText.lastIndexOf('. ', 200);
        if (breakIndex === -1) breakIndex = remainingText.lastIndexOf('? ', 200);
        if (breakIndex === -1) breakIndex = remainingText.lastIndexOf('! ', 200);
        if (breakIndex === -1) breakIndex = remainingText.lastIndexOf('\n', 200);
        if (breakIndex === -1) breakIndex = remainingText.lastIndexOf(' ', 200);
        
        if (breakIndex === -1 || breakIndex < 50) breakIndex = 200;
        
        chunks.push(remainingText.substring(0, breakIndex + 1).trim());
        remainingText = remainingText.substring(breakIndex + 1).trim();
      }
      
      speechQueue.current = [...speechQueue.current, ...chunks];
      setIsManualPause(false);
      
      if (!isProcessingSpeech) {
        processSpeechQueue();
      }
    } catch (err) {
      console.error('Speech Error:', err);
    }
  }, [processSpeechQueue, voiceSettings, isProcessingSpeech]);

  const togglePause = useCallback(() => {
    if (isManualPause) {
      setIsManualPause(false);
      if (playbackAudioContextRef.current?.state === 'suspended') {
        playbackAudioContextRef.current.resume();
      }
      playNextInQueue();
    } else {
      setIsManualPause(true);
      if (currentAudioSource) {
        currentAudioSource.stop();
        setCurrentAudioSource(null);
      }
      if (playbackAudioContextRef.current?.state === 'running') {
        playbackAudioContextRef.current.suspend();
      }
      setIsPlaying(false);
    }
  }, [isManualPause, currentAudioSource, playNextInQueue]);

  const stopAudio = useCallback(() => {
    setIsManualPause(true);
    speechQueue.current = [];
    audioQueue.current = [];
    if (currentAudioSource) {
      currentAudioSource.stop();
      setCurrentAudioSource(null);
    }
    setIsPlaying(false);
    nextStartTimeRef.current = 0;
    window.speechSynthesis.cancel();
  }, [currentAudioSource]);

  useEffect(() => {
    return () => {
      stopAudio();
      if (playbackAudioContextRef.current) {
        playbackAudioContextRef.current.close();
      }
    };
  }, [stopAudio]);

  return {
    isPlaying,
    isProcessingSpeech,
    isManualPause,
    handleReadAloud,
    togglePause,
    stopAudio
  };
}
