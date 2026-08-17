import { useCallback, useEffect, useRef, useState } from 'react';
import { startLiveVoice, stopLiveVoice, setPushToTalk, getLiveVoiceState, sendTextMessage, LiveVoiceOptions, LiveVoiceState } from '../lib/liveVoice';
import { useToast } from './useToast';

export function useLiveVoice() {
  const { toastError } = useToast();
  const [state, setState] = useState<LiveVoiceState>(() => getLiveVoiceState());
  const [userTranscript, setUserTranscript] = useState('');
  const [modelTranscript, setModelTranscript] = useState('');
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

  const start = useCallback(async (options: Omit<LiveVoiceOptions, 'onUserTranscript' | 'onModelTranscript' | 'onStateChange' | 'onError'>) => {
    setUserTranscript('');
    setModelTranscript('');
    try {
      await startLiveVoice({
        ...options,
        onUserTranscript: (text) => setUserTranscript(text),
        onModelTranscript: (text) => setModelTranscript(text),
        onStateChange: handleStateChange,
        onError: (message) => {
          toastError('Live Voice Error', message);
        },
        onTurnEnd: (userText, modelText) => {
          callbacksRef.current.onTurnEnd?.(userText, modelText);
        },
      });
    } catch (err: any) {
      toastError('Live Voice Failed', err?.message || 'Could not start live voice.');
    }
  }, [handleStateChange, toastError]);

  const stop = useCallback(() => {
    stopLiveVoice();
    setState(getLiveVoiceState());
    setUserTranscript('');
    setModelTranscript('');
  }, []);

  const holdToTalk = useCallback((listening: boolean) => {
    if (listening) {
      setUserTranscript('');
      setModelTranscript('');
    }
    setPushToTalk(listening);
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
    start,
    stop,
    holdToTalk,
    sendText,
    setOnTurnEnd,
    isActive: state.status === 'connected' || state.status === 'connecting',
  };
}