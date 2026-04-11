import { useState, useRef, useEffect, useCallback } from 'react';
import { generateSpeech } from '../lib/gemini';
import { VoiceSettings, getSettings } from '../lib/types';
import { useToast } from './useToast';

export function useVoice(voiceName: string, voiceSettings: VoiceSettings | undefined, storyTone: string) {
  const { toastError } = useToast();
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
      
      if (settings.voiceEngine === 'Cinematic') {
        if (!base64Audio) {
          base64Audio = await generateSpeech(text, activeVoiceName, activeVoiceSettings, storyTone);
          if (base64Audio) {
            audioCache.current.set(cacheKey, base64Audio);
            if (audioCache.current.size > 50) {
              const firstKey = audioCache.current.keys().next().value;
              if (firstKey) audioCache.current.delete(firstKey);
            }
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
          
          // Decode 16-bit PCM
          const int16Array = new Int16Array(bytes.buffer);
          const audioBuffer = ctx.createBuffer(1, int16Array.length, 24000);
          const channelData = audioBuffer.getChannelData(0);
          for (let i = 0; i < int16Array.length; i++) {
            channelData[i] = int16Array[i] / 32768.0;
          }

          audioQueue.current.push(audioBuffer);
          
          if (!isPlaying && !isManualPause) {
            playNextInQueue();
          }
        }
      }
    } catch (error: any) {
      console.error("TTS Error:", error);
      const errorMessage = error?.message || String(error);
      if (errorMessage.toLowerCase().includes('quota') || errorMessage.toLowerCase().includes('limit') || errorMessage.includes('429')) {
        toastError("Voice Quota Reached", "The AI voice limit has been reached. Try again in a few minutes or switch to 'Fast Browser' in Settings.");
        speechQueue.current = [];
        audioQueue.current = [];
        setIsPlaying(false);
      } else if (errorMessage === "Failed to fetch") {
        toastError("Network Error", "Failed to connect to the voice server. Please check your internet connection or API keys.");
        speechQueue.current = [];
        audioQueue.current = [];
        setIsPlaying(false);
      }
    } finally {
      setIsProcessingSpeech(false);
      if (speechQueue.current.length > 0) {
        // Small delay between chunks to avoid hitting RPM limits
        setTimeout(() => {
          processSpeechQueue();
        }, 500);
      }
    }
  }, [isProcessingSpeech, isPlaying, isManualPause, playNextInQueue, voiceName, voiceSettings, storyTone, toastError]);

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

      // Split text into larger chunks (~1000 chars) for sequential generation
      // Larger chunks reduce the number of API calls and help stay within quotas
      const chunks: string[] = [];
      let remainingText = cleanText;
      
      while (remainingText.length > 0) {
        if (remainingText.length <= 1000) {
          chunks.push(remainingText);
          break;
        }
        
        let breakIndex = remainingText.lastIndexOf('. ', 1000);
        if (breakIndex === -1) breakIndex = remainingText.lastIndexOf('? ', 1000);
        if (breakIndex === -1) breakIndex = remainingText.lastIndexOf('! ', 1000);
        if (breakIndex === -1) breakIndex = remainingText.lastIndexOf('\n', 1000);
        if (breakIndex === -1) breakIndex = remainingText.lastIndexOf(' ', 1000);
        
        if (breakIndex === -1 || breakIndex < 200) breakIndex = 1000;
        
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
