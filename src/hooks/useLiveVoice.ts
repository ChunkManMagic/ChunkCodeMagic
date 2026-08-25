import { useCallback, useEffect, useRef, useState } from 'react';
import {
  startLiveVoice,
  stopLiveVoice,
  setPushToTalk,
  setLiveVoiceMicMode,
  setLiveVoiceOutputDevice,
  setLiveVoiceInputDevice,
  setLiveVoiceOutputVolume,
  setLiveVoiceBargeIn,
  toggleLiveVoiceMicMute,
  toggleLiveVoiceAiMute,
  interruptAiSpeech,
  rewindLiveVoice,
  getLiveVoiceState,
  sendTextMessage,
  LiveVoiceOptions,
  LiveVoiceState,
  LiveVoiceMicMode,
} from '../lib/liveVoice';
import { getSettings, saveSettings } from '../lib/types';
import { sanitizeUserInput } from '../lib/sanitize';
import { useToast } from './useToast';

export function useLiveVoice() {
  const { toastError, toastSuccess } = useToast();
  const [state, setState] = useState<LiveVoiceState>(() => getLiveVoiceState());
  const [userTranscript, setUserTranscript] = useState('');
  const [modelTranscript, setModelTranscript] = useState('');
  const [transcriptTurns, setTranscriptTurns] = useState<{ user: string; model: string }[]>([]);
  const [inputLevel, setInputLevel] = useState(0);
  const [outputLevel, setOutputLevel] = useState(0);


  const stateRef = useRef<LiveVoiceState>(state);
  const callbacksRef = useRef<{
    onTurnEnd?: (userText: string, modelText: string) => void;
    onQuotaExhausted?: (message: string) => void;
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
      setTranscriptTurns([]);
      setInputLevel(0);
      setOutputLevel(0);
      try {
        const settings = getSettings();
        await startLiveVoice({
          ...options,
          micDeviceId: options.micDeviceId ?? settings.liveVoiceMicDeviceId ?? '',
          outputDeviceId: options.outputDeviceId ?? settings.liveVoiceOutputDeviceId ?? '',
          outputVolume: options.outputVolume ?? settings.liveVoiceOutputVolume ?? 1,
          bargeInEnabled: options.bargeInEnabled ?? settings.liveVoiceBargeIn ?? false,
          onUserTranscript: (text) => setUserTranscript(text),
          onModelTranscript: (text) => setModelTranscript(text),
          onStateChange: handleStateChange,
          onAudioLevels: handleAudioLevels,
          onError: (message) => {
            toastError('Live Voice Error', message);
            if (/quota|429|resource.?exhausted|all live voice models|failed to connect/i.test(message)) {
              callbacksRef.current.onQuotaExhausted?.(message);
            }
          },
          onTurnEnd: (userText, modelText) => {
            callbacksRef.current.onTurnEnd?.(userText, modelText);
            if (userText || modelText) {
              setTranscriptTurns((prev) => [...prev, { user: userText, model: modelText }]);
            }
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
    setTranscriptTurns([]);
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

  const setOutputVolume = useCallback((volume: number) => {
    const ok = setLiveVoiceOutputVolume(volume);
    if (ok) {
      const settings = getSettings();
      saveSettings({ ...settings, liveVoiceOutputVolume: volume });
    }
  }, []);

  const setBargeIn = useCallback((enabled: boolean) => {
    const ok = setLiveVoiceBargeIn(enabled);
    if (ok) {
      const settings = getSettings();
      saveSettings({ ...settings, liveVoiceBargeIn: enabled });
    }
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

  const rewind = useCallback((onRewind?: () => void) => {
    rewindLiveVoice(onRewind);
  }, []);

  const setOnTurnEnd = useCallback((cb: (userText: string, modelText: string) => void) => {
    callbacksRef.current.onTurnEnd = cb;
  }, []);

  const setOnQuotaExhausted = useCallback((cb: (message: string) => void) => {
    callbacksRef.current.onQuotaExhausted = cb;
  }, []);

  const sendText = useCallback((text: string) => {
    const safe = sanitizeUserInput(text).trim();
    if (!safe) return;
    setUserTranscript(safe);
    sendTextMessage(safe);
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
    transcriptTurns,
    inputLevel,
    outputLevel,
    start,
    stop,
    holdToTalk,
    toggleMic,
    setMicMode,
    setOutputDevice,
    setInputDevice,
    setOutputVolume,
    setBargeIn,
    toggleMicMute,
    toggleAiMute,
    interrupt,
    rewind,
    sendText,
    setOnTurnEnd,
    setOnQuotaExhausted,
    isActive: state.status === 'connected' || state.status === 'connecting',
    isConnecting: state.status === 'connecting',
    isConnected: state.status === 'connected',
  };
}
