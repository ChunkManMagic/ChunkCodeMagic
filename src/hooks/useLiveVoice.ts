import { useCallback, useEffect, useRef, useState } from 'react';
import {
  startLiveVoice,
  stopLiveVoice,
  setPushToTalk,
  setLiveVoiceMicMode,
  setLiveVoiceOutputDevice,
  setLiveVoiceInputDevice,
  toggleLiveVoiceMicMute,
  toggleLiveVoiceAiMute,
  interruptAiSpeech,
  getLiveVoiceState,
  sendTextMessage,
  LiveVoiceOptions,
  LiveVoiceState,
  LiveVoiceMicMode,
} from '../lib/liveVoice';
import { getSettings, saveSettings } from '../lib/types';
import { useToast } from './useToast';

export function useLiveVoice() {
  const { toastError, toastSuccess } = useToast();
  const [state, setState] = useState<LiveVoiceState>(() => getLiveVoiceState());
  const [userTranscript, setUserTranscript] = useState('');
  const [modelTranscript, setModelTranscript] = useState('');
  const [inputLevel, setInputLevel] = useState(0);
  const [outputLevel, setOutputLevel] = useState(0);

  const stateRef = useRef<LiveVoiceState>(state);
  const callbacksRef = useRef<{
    onTurnEnd?: (userText: string, modelText: string) => void;
  }>({});

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const handleStateChange = useCallback((next: LiveVoiceState) => {
    setState(next);
  }, []);

  const handleAudioLevels = useCallback((inLvl: number, outLvl: number) => {
    setInputLevel(inLvl);
    setOutputLevel(outLvl);
  }, []);

  const start = useCallback(
    async (
      options: Omit<
        LiveVoiceOptions,
        'onUserTranscript' | 'onModelTranscript' | 'onStateChange' | 'onAudioLevels' | 'onError'
      >
    ) => {
      setUserTranscript('');
      setModelTranscript('');
      setInputLevel(0);
      setOutputLevel(0);
      try {
        const settings = getSettings();
        await startLiveVoice({
          ...options,
          micDeviceId: options.micDeviceId ?? settings.liveVoiceMicDeviceId ?? '',
          outputDeviceId: options.outputDeviceId ?? settings.liveVoiceOutputDeviceId ?? '',
          onUserTranscript: (text) => setUserTranscript(text),
          onModelTranscript: (text) => setModelTranscript(text),
          onStateChange: handleStateChange,
          onAudioLevels: handleAudioLevels,
          onError: (message) => {
            toastError('Live Voice Error', message);
          },
          onTurnEnd: (userText, modelText) => {
            callbacksRef.current.onTurnEnd?.(userText, modelText);
          },
        });
        if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
          try {
            navigator.vibrate([15, 30, 15]);
          } catch (e) {}
        }
      } catch (err: any) {
        toastError('Live Voice Failed', err?.message || 'Could not start live voice session.');
      }
    },
    [handleStateChange, handleAudioLevels, toastError]
  );

  const stop = useCallback(() => {
    stopLiveVoice();
    setState(getLiveVoiceState());
    setUserTranscript('');
    setModelTranscript('');
    setInputLevel(0);
    setOutputLevel(0);
  }, []);

  const holdToTalk = useCallback((listening: boolean) => {
    if (listening) {
      setUserTranscript('');
      setModelTranscript('');
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        try {
          navigator.vibrate(15);
        } catch (e) {}
      }
    }
    setPushToTalk(listening);
  }, []);

  const toggleMic = useCallback(() => {
    const nextListening = !stateRef.current.isListening;
    if (nextListening) {
      setUserTranscript('');
      setModelTranscript('');
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        try {
          navigator.vibrate(20);
        } catch (e) {}
      }
    }
    setPushToTalk(nextListening);
  }, []);

  const setMicMode = useCallback((mode: LiveVoiceMicMode) => {
    setLiveVoiceMicMode(mode);
  }, []);

  const setOutputDevice = useCallback((deviceId: string) => {
    const ok = setLiveVoiceOutputDevice(deviceId);
    if (ok) {
      const settings = getSettings();
      saveSettings({ ...settings, liveVoiceOutputDeviceId: deviceId });
    }
  }, []);

  const setInputDevice = useCallback(async (deviceId: string) => {
    const ok = await setLiveVoiceInputDevice(deviceId);
    if (ok) {
      const settings = getSettings();
      saveSettings({ ...settings, liveVoiceMicDeviceId: deviceId });
    }
    return ok;
  }, []);

  const toggleMicMute = useCallback(() => {
    const isMuted = toggleLiveVoiceMicMute();
    if (isMuted) {
      toastSuccess('Microphone Muted');
    } else {
      toastSuccess('Microphone Unmuted');
    }
  }, [toastSuccess]);

  const toggleAiMute = useCallback(() => {
    const isMuted = toggleLiveVoiceAiMute();
    if (isMuted) {
      toastSuccess('AI Voice Muted');
    } else {
      toastSuccess('AI Voice Unmuted');
    }
  }, [toastSuccess]);

  const interrupt = useCallback(() => {
    interruptAiSpeech();
  }, []);

  const setOnTurnEnd = useCallback((cb: (userText: string, modelText: string) => void) => {
    callbacksRef.current.onTurnEnd = cb;
  }, []);

  const sendText = useCallback((text: string) => {
    if (!text.trim()) return;
    setUserTranscript(text.trim());
    sendTextMessage(text.trim());
  }, []);

  useEffect(() => {
    return () => {
      stopLiveVoice();
    };
  }, []);

  return {
    state,
    userTranscript,
    modelTranscript,
    inputLevel,
    outputLevel,
    start,
    stop,
    holdToTalk,
    toggleMic,
    setMicMode,
    setOutputDevice,
    setInputDevice,
    toggleMicMute,
    toggleAiMute,
    interrupt,
    sendText,
    setOnTurnEnd,
    isActive: state.status === 'connected' || state.status === 'connecting',
    isConnecting: state.status === 'connecting',
    isConnected: state.status === 'connected',
  };
}