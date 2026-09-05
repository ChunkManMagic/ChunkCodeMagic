import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  PhoneOff,
  Maximize2,
  Minimize2,
  Send,
  Sparkles,
  Radio,
  Square,
  ChevronUp,
  Zap,
  RotateCcw,
  RotateCw,
} from 'lucide-react';
import { CharacterProfile, getSettings, saveSettings } from '../../lib/types';
import {
  LIVE_VOICES,
  LIVE_VOICE_DESCRIPTIONS,
  LiveVoiceMicMode,
  LiveVoiceState,
  AudioDeviceInfo,
  getAudioDevices,
  isAudioContextSinkSupported,
  playOutputTest,
} from '../../lib/liveVoice';
import { ALL_VOICES, ROLEPLAY_VOICES, NARRATOR_VOICES, BRIGHT_VOICES } from '../../lib/ttsEngine';

interface LiveVoiceHUDProps {
  liveVoice: {
    state: LiveVoiceState;
    userTranscript: string;
    modelTranscript: string;
    transcriptTurns: { user: string; model: string }[];
    inputLevel: number;
    outputLevel: number;
    start: (options: any) => Promise<void>;
    stop: () => void;
    holdToTalk: (listening: boolean) => void;
    toggleMic: () => void;
    setMicMode: (mode: LiveVoiceMicMode) => void;
    setOutputDevice: (deviceId: string) => void;
    setInputDevice: (deviceId: string) => Promise<boolean>;
    setOutputVolume: (volume: number) => void;
    setBargeIn: (enabled: boolean) => void;
    toggleMicMute: () => void;
    toggleAiMute: () => void;
    interrupt: () => void;
    rewind: (onRewind?: () => void) => void;
    replay?: () => boolean;
    recoverInterruption?: (restart?: boolean) => boolean;
    sendText: (text: string) => void;
    forceReply: () => void;
    isActive: boolean;
    isConnecting: boolean;
    isConnected: boolean;
  };
  profile: CharacterProfile;
  avatarBase64: string;
  onUpdateProfile?: (updates: Partial<CharacterProfile>) => void;
  onRewind?: () => void;
}


export const LiveVoiceHUD: React.FC<LiveVoiceHUDProps> = ({
  liveVoice,
  profile,
  avatarBase64,
  onUpdateProfile,
  onRewind,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showVoicePicker, setShowVoicePicker] = useState(false);
  const [showDevicePicker, setShowDevicePicker] = useState(false);
  const [typedMessage, setTypedMessage] = useState('');
  const [noteType, setNoteType] = useState<'dialogue' | 'action' | 'note'>('dialogue');
  const [audioInputs, setAudioInputs] = useState<AudioDeviceInfo[]>([]);
  const [audioOutputs, setAudioOutputs] = useState<AudioDeviceInfo[]>([]);
  const [micDeviceId, setMicDeviceId] = useState(() => getSettings().liveVoiceMicDeviceId || 'default');
  const [outputDeviceId, setOutputDeviceId] = useState(() => getSettings().liveVoiceOutputDeviceId || 'default');
  const [isSwitchingMic, setIsSwitchingMic] = useState(false);
  const [liveVoiceTemp, setLiveVoiceTemp] = useState(() => getSettings().liveVoiceTemperature ?? 1.0);
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const refreshDevices = useCallback(async () => {
    // Chromium requires the speaker-selection permission to expose more than
    // the default output device; request it (when available) so Bluetooth /
    // wired headsets show up in the picker.
    try {
      const perms = (navigator as any).permissions;
      if (perms && typeof perms.request === 'function') {
        await perms.request({ name: 'speaker-selection' });
      }
    } catch (e) {}
    const { inputs, outputs } = await getAudioDevices();
    setAudioInputs(inputs);
    setAudioOutputs(outputs);
  }, []);

  // Enumerate devices whenever the list changes (headset plug/unplug, BT pair)
  useEffect(() => {
    refreshDevices();
    if (typeof navigator !== 'undefined' && navigator.mediaDevices) {
      navigator.mediaDevices.addEventListener('devicechange', refreshDevices);
      return () => {
        navigator.mediaDevices.removeEventListener('devicechange', refreshDevices);
      };
    }
  }, [refreshDevices]);

  const handleSelectMic = async (deviceId: string) => {
    setIsSwitchingMic(true);
    try {
      await liveVoice.setInputDevice(deviceId);
      setMicDeviceId(deviceId);
    } finally {
      setIsSwitchingMic(false);
    }
  };

  const handleSelectOutput = (deviceId: string) => {
    liveVoice.setOutputDevice(deviceId);
    setOutputDeviceId(deviceId);
  };

  const handleTestSound = () => {
    playOutputTest(outputDeviceId === 'default' ? undefined : outputDeviceId);
  };

  // Auto-scroll transcripts when updated (block:'nearest' keeps the browser from
// also scrolling the page / modal body around the transcript container).
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [liveVoice.userTranscript, liveVoice.modelTranscript, liveVoice.transcriptTurns]);

  const liveVoiceRef = useRef(liveVoice);
  useEffect(() => {
    liveVoiceRef.current = liveVoice;
  }, [liveVoice]);

  // Global keyboard shortcuts while live voice is active
  useEffect(() => {
    if (!liveVoice.isActive) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';

      if (e.key === 'Escape') {
        if (liveVoiceRef.current.state.isSpeaking) {
          liveVoiceRef.current.interrupt();
        } else if (isExpanded) {
          setIsExpanded(false);
        }
        return;
      }

      if (isInput) return;

      if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        if (liveVoiceRef.current.state.micMode === 'hold') {
          liveVoiceRef.current.holdToTalk(true);
        } else if (liveVoiceRef.current.state.micMode === 'toggle') {
          liveVoiceRef.current.toggleMic();
        }
      } else if (e.key.toLowerCase() === 'm') {
        e.preventDefault();
        liveVoiceRef.current.toggleMicMute();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';
      if (isInput) return;

      if ((e.key === ' ' || e.code === 'Space') && liveVoiceRef.current.state.micMode === 'hold') {
        e.preventDefault();
        liveVoiceRef.current.holdToTalk(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [liveVoice.isActive, isExpanded]);

  if (!liveVoice.isActive) return null;

  const handleSelectVoice = (voice: (typeof LIVE_VOICES)[number]) => {
    const settings = getSettings();
    saveSettings({ ...settings, liveVoiceName: voice });
    if (onUpdateProfile) {
      onUpdateProfile({ voiceName: voice });
    }
    setShowVoicePicker(false);
  };

  const handleSendTyped = (e: React.FormEvent) => {
    e.preventDefault();
    if (!typedMessage.trim()) return;

    let formattedText = typedMessage.trim();
    if (noteType === 'action') {
      formattedText = `*${formattedText}*`;
    } else if (noteType === 'note') {
      formattedText = `[OOC Note to ${profile.name}: ${formattedText}]`;
    }

    liveVoice.sendText(formattedText);
    setTypedMessage('');
  };

  const currentVoice = getSettings().liveVoiceName || profile.voiceName || 'Kore';
  const voiceInfo = LIVE_VOICE_DESCRIPTIONS[currentVoice] || LIVE_VOICE_DESCRIPTIONS.Kore;

  // Sound waveform bar height calculations
  const inLevel = Math.max(0.1, liveVoice.inputLevel);
  const outLevel = Math.max(0.1, liveVoice.outputLevel);

  return (
    <AnimatePresence>
      {!isExpanded ? (
        /* ================= COMPACT FLOATING BAR ================= */
        <motion.div
          key="compact-hud"
          initial={{ opacity: 0, y: 40, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 40, scale: 0.95 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          role="region"
          aria-label="Live Voice Call Panel"
          className="fixed bottom-5 right-4 sm:right-8 z-[95] w-[min(26rem,calc(100vw-2rem))] bg-zinc-950/90 backdrop-blur-2xl rounded-2xl border border-white/10 shadow-2xl shadow-black/80 overflow-hidden"
        >
          {/* Top Status Bar */}
          <div className="flex items-center justify-between px-3.5 py-2.5 bg-white/[0.02] border-b border-white/5">
            <div className="flex items-center gap-2.5">
              <div className="relative">
                <img
                  src={avatarBase64}
                  alt={profile.name}
                  className="w-8 h-8 rounded-xl object-cover border border-white/10"
                />
                {liveVoice.state.isSpeaking ? (
                  <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-amber-400 animate-ping" />
                ) : liveVoice.state.isListening ? (
                  <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                ) : (
                  <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500" />
                )}
              </div>

              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-white font-serif tracking-tight truncate max-w-[110px]">
                    {profile.name}
                  </span>
                  <span className="px-1.5 py-0.2 rounded text-[9px] font-semibold tracking-wider uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    Live
                  </span>
                </div>
                <div className="flex items-center gap-1 text-[10px] text-zinc-400 font-mono">
                  {liveVoice.state.isReconnecting ? (
                    <span className="text-cyan-300 animate-pulse font-semibold flex items-center gap-1">
                      <Radio className="w-2.5 h-2.5" /> Reconnecting...
                    </span>
                  ) : liveVoice.isConnecting ? (
                    <span className="text-amber-400 animate-pulse">Connecting...</span>
                  ) : liveVoice.state.isSpeaking ? (
                    <span className="text-amber-300 font-semibold flex items-center gap-1">
                      <Volume2 className="w-2.5 h-2.5 animate-bounce" /> Speaking
                    </span>
                  ) : liveVoice.state.isListening ? (
                    <span className="text-emerald-400 font-semibold flex items-center gap-1">
                      <Radio className="w-2.5 h-2.5 animate-pulse" /> Listening
                    </span>
                  ) : liveVoice.state.isMicMuted ? (
                    <span className="text-red-400">Mic Muted</span>
                  ) : (
                    <span className="text-zinc-500">Ready</span>
                  )}
                </div>
              </div>
            </div>

            {/* Audio Waveform Bars */}
            <div className="flex items-center gap-0.5 px-2 py-1 bg-black/40 rounded-lg border border-white/5 h-6">
              {[0.4, 0.8, 0.5, 0.9, 0.3, 0.7].map((mult, i) => {
                const activeLevel = liveVoice.state.isSpeaking
                  ? outLevel
                  : liveVoice.state.isListening
                  ? inLevel
                  : 0.15;
                const height = Math.max(3, Math.min(18, activeLevel * 20 * mult));
                return (
                  <motion.div
                    key={i}
                    animate={{ height: `${height}px` }}
                    transition={{ duration: 0.08 }}
                    className={`w-0.5 rounded-full ${
                      liveVoice.state.isSpeaking
                        ? 'bg-amber-400'
                        : liveVoice.state.isListening
                        ? 'bg-emerald-400'
                        : 'bg-zinc-700'
                    }`}
                  />
                );
              })}
            </div>

            {/* Control Icons */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => setIsExpanded(true)}
                className="p-1.5 text-zinc-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                title="Expand Voice Studio"
                aria-label="Expand Voice Studio"
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={liveVoice.stop}
                className="p-1.5 text-zinc-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                title="End Call"
                aria-label="End Live Voice Call"
              >
                <PhoneOff className="w-3.5 h-3.5 text-red-400" />
              </button>
            </div>
          </div>

          {/* Mini Transcript Preview */}
          <div className="px-3 py-2 text-xs bg-black/30 min-h-[44px] max-h-[70px] overflow-y-auto">
            {liveVoice.userTranscript ? (
              <p className="text-blue-300 line-clamp-2">
                <span className="font-semibold text-blue-400">You: </span>
                {liveVoice.userTranscript}
              </p>
            ) : liveVoice.modelTranscript ? (
              <p className="text-amber-200 line-clamp-2">
                <span className="font-semibold text-amber-300">{profile.name}: </span>
                {liveVoice.modelTranscript}
              </p>
            ) : (() => {
              const last = liveVoice.transcriptTurns[liveVoice.transcriptTurns.length - 1];
              if (last?.model) {
                return (
                  <p className="text-amber-200/80 line-clamp-2">
                    <span className="font-semibold text-amber-300">{profile.name}: </span>
                    {last.model}
                  </p>
                );
              }
              if (last?.user) {
                return (
                  <p className="text-blue-300/80 line-clamp-2">
                    <span className="font-semibold text-blue-400">You: </span>
                    {last.user}
                  </p>
                );
              }
              return (
                <p className="text-zinc-500 text-[11px] italic">
                  {liveVoice.state.micMode === 'hold'
                    ? 'Hold button or Space to speak...'
                    : liveVoice.state.micMode === 'handsFree'
                    ? 'Open mic active. Speak freely...'
                    : 'Tap mic button to speak...'}
                </p>
              );
            })()}
            <div ref={transcriptEndRef} />
          </div>

          {/* Collapsed Interruption Recovery Banner */}
          {liveVoice.state.canRecoverInterruption && (
            <div className="px-3 py-1.5 bg-amber-500/15 border-t border-amber-500/30 flex items-center justify-between gap-2 text-[11px]">
              <div className="flex items-center gap-1.5 text-amber-300 truncate">
                <Radio className="w-3 h-3 text-amber-400 animate-pulse shrink-0" />
                <span className="font-medium shrink-0">Interrupted:</span>
                {liveVoice.state.lastInterruptedStatement && (
                  <span className="text-amber-200/70 truncate">
                    "{liveVoice.state.lastInterruptedStatement}"
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => liveVoice.recoverInterruption?.(false)}
                  className="px-2 py-0.5 bg-amber-500 text-black text-[10px] font-bold rounded hover:bg-amber-400 transition-colors shadow"
                  title="Ask AI to finish what it was saying"
                >
                  Finish
                </button>
                <button
                  onClick={() => liveVoice.recoverInterruption?.(true)}
                  className="px-2 py-0.5 bg-white/10 hover:bg-white/20 text-zinc-300 text-[10px] font-bold rounded transition-colors border border-white/10"
                  title="Restart response from beginning"
                >
                  Restart
                </button>
              </div>
            </div>
          )}

          {/* Bottom Interactive Controls */}
          <div className="flex items-center justify-between px-3 py-2 bg-white/[0.01] border-t border-white/5 gap-2">
            <div className="flex items-center gap-1">
              <button
                onClick={liveVoice.toggleMicMute}
                className={`p-2 rounded-xl text-xs transition-all ${
                  liveVoice.state.isMicMuted
                    ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                    : 'bg-white/5 text-zinc-400 hover:text-white hover:bg-white/10'
                }`}
                title={liveVoice.state.isMicMuted ? 'Unmute Mic' : 'Mute Mic'}
                aria-label="Toggle Microphone Mute"
              >
                {liveVoice.state.isMicMuted ? (
                  <MicOff className="w-4 h-4" />
                ) : (
                  <Mic className="w-4 h-4" />
                )}
              </button>

              {/* Force Reply — always visible so the user can kick Gemini into
                  replying immediately without waiting for silence detection */}
              <button
                onClick={liveVoice.forceReply}
                className="px-2.5 py-1.5 rounded-xl bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 border border-emerald-500/25 text-[10px] font-bold flex items-center gap-1 transition-all"
                title="Force Gemini to reply right now"
              >
                <Zap className="w-2.5 h-2.5 fill-emerald-400" /> Reply Now
              </button>

              {/* Repeat — re-speak last AI statement */}
              {liveVoice.state.canReplay && (
                <button
                  onClick={() => liveVoice.replay?.()}
                  className="px-2.5 py-1.5 rounded-xl bg-sky-500/15 text-sky-300 hover:bg-sky-500/25 border border-sky-500/25 text-[10px] font-bold flex items-center gap-1 transition-all"
                  title="Repeat last AI response"
                >
                  <RotateCw className="w-2.5 h-2.5" /> Repeat
                </button>
              )}

              {/* Rewind — undo last live turn */}
              {onRewind && (
                <button
                  onClick={() => {
                    liveVoice.rewind(onRewind);
                  }}
                  className="px-2.5 py-1.5 rounded-xl bg-purple-500/15 text-purple-400 hover:bg-purple-500/25 border border-purple-500/25 text-[10px] font-bold flex items-center gap-1 transition-all"
                  title="Rewind Last Turn"
                >
                  <RotateCcw className="w-2.5 h-2.5" /> Rewind
                </button>
              )}

              {liveVoice.state.isSpeaking && (
                <button
                  onClick={liveVoice.interrupt}
                  className="px-2.5 py-1.5 rounded-xl bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 border border-amber-500/30 text-[10px] font-bold flex items-center gap-1 transition-all"
                  title="Interrupt AI"
                >
                  <Square className="w-2.5 h-2.5 fill-amber-400" /> Interrupt
                </button>
              )}
            </div>


            {/* Central Talk Button */}
            {liveVoice.isConnecting || liveVoice.state.isReconnecting ? (
              <div className="px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 bg-amber-500/15 text-amber-400 border border-amber-500/30 animate-pulse">
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                <span>{liveVoice.state.isReconnecting ? 'Reconnecting...' : 'Connecting...'}</span>
              </div>
            ) : liveVoice.state.micMode === 'hold' ? (
              <button
                onPointerDown={(e) => {
                  e.preventDefault();
                  liveVoice.holdToTalk(true);
                }}
                onPointerUp={(e) => {
                  e.preventDefault();
                  liveVoice.holdToTalk(false);
                }}
                onPointerLeave={() => liveVoice.holdToTalk(false)}
                className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 select-none touch-none transition-all ${
                  liveVoice.state.isListening
                    ? 'bg-red-600 text-white scale-95 shadow-lg shadow-red-600/30'
                    : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-600/20'
                }`}
              >
                <Mic className="w-3.5 h-3.5" />
                <span>{liveVoice.state.isListening ? 'Listening...' : 'Hold to Speak'}</span>
              </button>
            ) : liveVoice.state.micMode === 'handsFree' ? (
              <div className="px-3 py-1.5 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-medium flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                <span>Hands-Free Active</span>
              </div>
            ) : (
              <button
                onClick={liveVoice.toggleMic}
                className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all ${
                  liveVoice.state.isListening
                    ? 'bg-red-600 text-white shadow-lg shadow-red-600/30 animate-pulse'
                    : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-600/20'
                }`}
              >
                <Mic className="w-3.5 h-3.5" />
                <span>{liveVoice.state.isListening ? 'Listening (Tap to Send)' : 'Tap to Speak'}</span>
              </button>
            )}

            <button
              onClick={() => setIsExpanded(true)}
              className="px-2 py-1.5 text-zinc-400 hover:text-emerald-400 text-[11px] font-medium flex items-center gap-1 transition-colors"
            >
              <span>Studio</span>
              <ChevronUp className="w-3 h-3" />
            </button>
          </div>
        </motion.div>
      ) : (
        /* ================= EXPANDED VOICE STUDIO MODAL ================= */
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-6">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsExpanded(false)}
            className="absolute inset-0 bg-black/85 backdrop-blur-xl"
          />

          <motion.div
            key="expanded-hud"
            initial={{ opacity: 0, scale: 0.92, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 20 }}
            transition={{ type: 'spring', damping: 28, stiffness: 320 }}
            role="dialog"
            aria-modal="true"
            aria-label={`Live Voice Studio with ${profile.name}`}
            className="relative w-full max-w-2xl bg-zinc-950/95 border border-white/10 rounded-[2.5rem] shadow-2xl shadow-black overflow-hidden flex flex-col max-h-[92vh]"
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-white/[0.02]">
              <div className="flex items-center gap-3">
                <div className="relative w-10 h-10 rounded-2xl overflow-hidden border border-white/15 shadow-md">
                  <img
                    src={avatarBase64}
                    alt={profile.name}
                    className="w-full h-full object-cover"
                  />
                  <div
                    className={`absolute bottom-0 inset-x-0 h-1 ${
                      liveVoice.state.isSpeaking
                        ? 'bg-amber-400'
                        : liveVoice.state.isListening
                        ? 'bg-emerald-400'
                        : 'bg-zinc-600'
                    }`}
                  />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-bold text-white font-serif tracking-tight">
                      {profile.name}
                    </h3>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                      <Radio className="w-2.5 h-2.5 animate-pulse" /> Live Call
                    </span>
                  </div>
                  <p className="text-xs text-zinc-400">
                    Voice: <span className="text-zinc-200 font-medium">{currentVoice}</span> •{' '}
                    <span className="text-zinc-400">{voiceInfo.tone}</span>
                  </p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowVoicePicker(!showVoicePicker)}
                  className={`p-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all ${
                    showVoicePicker
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                      : 'bg-white/5 text-zinc-400 hover:text-white hover:bg-white/10'
                  }`}
                  title="Change Voice Persona"
                >
                  <Sparkles className="w-4 h-4 text-emerald-400" />
                  <span className="hidden sm:inline">Voice</span>
                </button>

                <button
                  onClick={() => {
                    setShowDevicePicker(!showDevicePicker);
                    setShowVoicePicker(false);
                    refreshDevices();
                  }}
                  className={`p-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all ${
                    showDevicePicker
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                      : 'bg-white/5 text-zinc-400 hover:text-white hover:bg-white/10'
                  }`}
                  title="Choose Audio Devices"
                >
                  <Volume2 className="w-4 h-4 text-cyan-400" />
                  <span className="hidden sm:inline">Audio</span>
                </button>

                <button
                  onClick={() => setIsExpanded(false)}
                  className="p-2 text-zinc-400 hover:text-white hover:bg-white/10 rounded-xl transition-colors"
                  title="Minimize to Floating Bar"
                  aria-label="Minimize Studio"
                >
                  <Minimize2 className="w-4 h-4" />
                </button>

                <button
                  onClick={liveVoice.stop}
                  className="px-3 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all"
                  title="End Live Call"
                  aria-label="End Session"
                >
                  <PhoneOff className="w-4 h-4" />
                  <span className="hidden sm:inline">End Call</span>
                </button>
              </div>
            </div>

            {/* Voice Persona Quick Picker Drawer */}
            <AnimatePresence>
              {showVoicePicker && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="bg-black/60 border-b border-white/10 px-6 py-4 overflow-hidden"
                >
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                      Select Gemini Live Voice
                    </h4>
                    <span className="text-[10px] text-zinc-500 font-mono">
                      Real-time bidirectional speech
                    </span>
                  </div>
                  <div className="space-y-3">
                    {(() => {
                      const groups: Array<[string, string[]]> = [
                        ['Roleplay / Character', [...ROLEPLAY_VOICES]],
                        ['Narration', [...NARRATOR_VOICES]],
                        ['Bright / Companion', [...BRIGHT_VOICES]],
                        ['All', ALL_VOICES.map(v=>v.name).filter(n=> ![...ROLEPLAY_VOICES, ...NARRATOR_VOICES, ...BRIGHT_VOICES].includes(n))],
                      ];
                      return groups.map(([label, names])=> (
                      <div key={label}>
                        <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 mb-1">{label}</div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                          {names.map((v: string)=>{
                            const isLive = (LIVE_VOICES as readonly string[]).includes(v);
                            const desc = ALL_VOICES.find(x=>x.name===v)?.character || (LIVE_VOICE_DESCRIPTIONS as any)[v]?.tone || '';
                            const info = (LIVE_VOICE_DESCRIPTIONS as any)[v];
                            const isSelected = currentVoice===v;
                            return (
                              <button key={v} onClick={()=> handleSelectVoice(v as any)} className={`p-2 rounded-xl text-left border transition-all ${isSelected ? 'bg-emerald-500/15 border-emerald-500/40 shadow-lg shadow-emerald-500/10' : 'bg-white/5 border-white/5 hover:border-white/20 hover:bg-white/10'}`}>
                                <div className="flex items-center justify-between">
                                  <span className="text-xs font-bold text-white">{v} <span className="text-[10px] font-normal text-zinc-400">— {desc}</span></span>
                                  {isSelected && <span className="w-2 h-2 rounded-full bg-emerald-400" />}
                                </div>
                                {info ? <p className="text-[10px] text-zinc-400 mt-0.5 leading-snug">{info.description} {isLive ? '' : ' (TTS only — Live will use Kore)'}</p> : null}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ));
                    })()}
                  </div>

                  {/* Tone Preset Quick Picker */}
                  <div className="mt-4 pt-3 border-t border-white/10">
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                        Tone & Personality Preset
                      </label>
                      <span className="text-[10px] text-zinc-500">
                        Shapes speech style, vocabulary & mood
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {[
                        { id: 'cinematic', label: '🎬 Cinematic' },
                        { id: 'cozy', label: '☕ Cozy' },
                        { id: 'gritty', label: '🗡️ Gritty' },
                        { id: 'whimsical', label: '✨ Whimsical' },
                        { id: 'poetic', label: '📜 Poetic' },
                        { id: 'snappy', label: '⚡ Snappy' },
                        { id: 'literary', label: '📖 Literary' },
                        { id: 'noir', label: '🌧️ Noir' }
                      ].map((tPreset) => {
                        const curSettings = getSettings();
                        const isSelected = curSettings.writingTonePreset === tPreset.id;
                        return (
                          <button
                            key={tPreset.id}
                            onClick={() => {
                              const s = getSettings();
                              saveSettings({ ...s, writingTonePreset: tPreset.id });
                            }}
                            className={`px-2.5 py-1 rounded-xl text-xs font-semibold border transition-all ${
                              isSelected
                                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-sm'
                                : 'bg-white/5 text-zinc-400 hover:text-white border-white/5 hover:border-white/20'
                            }`}
                          >
                            {tPreset.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Temperature / Spontaneity Slider */}
                  <div className="mt-3 pt-3 border-t border-white/10">
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                        Spontaneity & Creativity (Temperature: {liveVoiceTemp.toFixed(1)})
                      </label>
                      <span className="text-[10px] text-zinc-500 font-mono">
                        {liveVoiceTemp < 0.7 ? 'Focused & Precise' : liveVoiceTemp > 1.2 ? 'Wild & Inventive' : 'Balanced & Natural'}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0.2}
                      max={1.8}
                      step={0.1}
                      value={liveVoiceTemp}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        setLiveVoiceTemp(val);
                        const s = getSettings();
                        saveSettings({ ...s, liveVoiceTemperature: val });
                      }}
                      className="w-full accent-emerald-500"
                    />
                    <div className="flex justify-between text-[9px] text-zinc-600 mt-0.5">
                      <span>0.2 (Consistent)</span>
                      <span>1.0 (Default)</span>
                      <span>1.8 (Expressive)</span>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Audio Device Picker Drawer */}
            <AnimatePresence>
              {showDevicePicker && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="bg-black/60 border-b border-white/10 px-6 py-4 overflow-hidden"
                >
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                      Audio Devices
                    </h4>
                    <span className="text-[10px] text-zinc-500 font-mono">
                      Headset / speaker routing
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 flex items-center gap-1.5 mb-1.5">
                        <Mic className="w-3 h-3 text-emerald-400" /> Microphone
                      </label>
                      <select
                        value={micDeviceId}
                        onChange={(e) => handleSelectMic(e.target.value)}
                        disabled={isSwitchingMic}
                        className="w-full bg-zinc-900 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500/40 disabled:opacity-50"
                      >
                        {!audioInputs.some((d) => d.deviceId === micDeviceId) && (
                          <option value={micDeviceId}>Current ({micDeviceId.slice(0, 8)}…)</option>
                        )}
                        {audioInputs.length === 0 && (
                          <option value="default">Default Microphone</option>
                        )}
                        {audioInputs.map((d) => (
                          <option key={d.deviceId} value={d.deviceId}>
                            {d.label}
                          </option>
                        ))}
                      </select>
                      <p className="text-[10px] text-zinc-600 mt-1">
                        {isSwitchingMic ? 'Switching microphone…' : 'Applies immediately to this call.'}
                      </p>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 flex items-center gap-1.5">
                          <Volume2 className="w-3 h-3 text-cyan-400" /> Speaker
                        </label>
                        <button
                          onClick={handleTestSound}
                          className="px-2 py-0.5 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/20 text-[10px] font-semibold flex items-center gap-1 transition-colors"
                          title="Play a test tone through the selected speaker"
                        >
                          <Volume2 className="w-3 h-3" /> Test Sound
                        </button>
                      </div>
                      {isAudioContextSinkSupported() ? (
                        <>
                          <select
                            value={outputDeviceId}
                            onChange={(e) => handleSelectOutput(e.target.value)}
                            className="w-full bg-zinc-900 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500/40"
                          >
                            {!audioOutputs.some((d) => d.deviceId === outputDeviceId) && (
                              <option value={outputDeviceId}>Current ({outputDeviceId.slice(0, 8)}…)</option>
                            )}
                            {audioOutputs.length === 0 && (
                              <option value="default">Default Speaker</option>
                            )}
                            {audioOutputs.map((d) => (
                              <option key={d.deviceId} value={d.deviceId}>
                                {d.label}
                              </option>
                            ))}
                          </select>
                          <p className="text-[10px] text-zinc-600 mt-1">
                            {audioOutputs.length <= 1
                              ? 'This device routes sound to your headset or speaker automatically — "Default" is correct here.'
                              : 'Applies immediately to this call.'}
                          </p>
                        </>
                      ) : (
                        <div className="w-full bg-zinc-900 border border-white/10 rounded-xl px-3 py-2 text-xs text-zinc-500">
                          Speaker selection not supported in this browser.
                        </div>
                      )}
                      <div className="mt-3">
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                            AI Voice Volume
                          </label>
                          <span className="text-[10px] text-zinc-500 font-mono tabular-nums">
                            {Math.round((liveVoice.state.outputVolume ?? 1) * 100)}%
                          </span>
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={100}
                          value={Math.round((liveVoice.state.outputVolume ?? 1) * 100)}
                          onChange={(e) => liveVoice.setOutputVolume(Number(e.target.value) / 100)}
                          className="w-full accent-emerald-500"
                          title="AI voice volume"
                        />
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Center Visualizer & Persona Stage */}
            <div className="flex-1 overflow-y-auto px-6 py-6 flex flex-col items-center justify-center relative">
              {/* Glowing Character Avatar with Audio Rings */}
              <div className="relative my-4">
                {/* Outer Breathing Aura (Reacts to AI speech amplitude) */}
                <motion.div
                  animate={{
                    scale: liveVoice.state.isSpeaking ? 1 + outLevel * 0.45 : 1,
                    opacity: liveVoice.state.isSpeaking ? 0.8 : 0.25,
                  }}
                  transition={{ duration: 0.1 }}
                  className="absolute -inset-6 rounded-full bg-gradient-to-r from-emerald-500/30 via-teal-500/20 to-amber-500/30 blur-xl"
                />

                {/* Inner Wave Ring (Reacts to User mic level) */}
                {liveVoice.state.isListening && (
                  <motion.div
                    animate={{
                      scale: 1 + inLevel * 0.35,
                      opacity: 0.7,
                    }}
                    transition={{ duration: 0.08 }}
                    className="absolute -inset-3 rounded-full border-2 border-emerald-400/60 animate-pulse"
                  />
                )}

                <div className="relative w-28 h-28 sm:w-36 sm:h-36 rounded-full overflow-hidden border-2 border-white/20 shadow-2xl">
                  <img
                    src={avatarBase64}
                    alt={profile.name}
                    className="w-full h-full object-cover"
                  />
                </div>

                {/* Speaker indicator badge */}
                <div className="absolute -bottom-2 inset-x-0 flex justify-center">
                  <div
                    className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider shadow-lg border ${
                      liveVoice.state.isSpeaking
                        ? 'bg-amber-500 text-black border-amber-300 animate-pulse'
                        : liveVoice.state.isListening
                        ? 'bg-emerald-500 text-black border-emerald-300'
                        : 'bg-zinc-800 text-zinc-300 border-white/10'
                    }`}
                  >
                    {liveVoice.state.isSpeaking
                      ? `${profile.name} Speaking...`
                      : liveVoice.state.isListening
                      ? 'Listening to You...'
                      : 'Live Connected'}
                  </div>
                </div>
              </div>

              {/* Dynamic Waveform Visualizer Bar */}
              <div className="flex items-center gap-1.5 h-10 my-3 px-4 py-2 bg-black/40 rounded-2xl border border-white/10">
                {Array.from({ length: 24 }).map((_, i) => {
                  const mult = Math.sin((i / 24) * Math.PI);
                  const activeLevel = liveVoice.state.isSpeaking
                    ? outLevel
                    : liveVoice.state.isListening
                    ? inLevel
                    : 0.1;
                  const barHeight = Math.max(4, Math.min(32, activeLevel * 36 * mult));
                  return (
                    <motion.div
                      key={i}
                      animate={{ height: `${barHeight}px` }}
                      transition={{ duration: 0.06 }}
                      className={`w-1 rounded-full ${
                        liveVoice.state.isSpeaking
                          ? 'bg-gradient-to-t from-amber-500 to-amber-300'
                          : liveVoice.state.isListening
                          ? 'bg-gradient-to-t from-emerald-500 to-teal-300'
                          : 'bg-zinc-800'
                      }`}
                    />
                  );
                })}
              </div>

              {/* Live Subtitle Transcript Stream */}
              <div className="w-full max-w-xl bg-black/40 rounded-2xl border border-white/5 p-4 my-2 min-h-[120px] max-h-[220px] overflow-y-auto space-y-2">
                {liveVoice.transcriptTurns.map((turn, i) => (
                  <div key={i} className="space-y-1.5">
                    {turn.user && (
                      <div className="text-xs text-blue-200/90 bg-blue-500/10 border border-blue-500/20 rounded-xl px-3 py-2">
                        <span className="font-bold text-blue-400">You: </span>
                        {turn.user}
                      </div>
                    )}
                    {turn.model && (
                      <div className="text-xs text-amber-100/90 bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2">
                        <span className="font-bold text-amber-300">{profile.name}: </span>
                        {turn.model}
                      </div>
                    )}
                  </div>
                ))}

                {liveVoice.userTranscript && (
                  <div className="text-xs text-blue-200/90 bg-blue-500/10 border border-blue-500/30 rounded-xl px-3 py-2">
                    <span className="font-bold text-blue-400">You: </span>
                    {liveVoice.userTranscript}
                  </div>
                )}

                {liveVoice.modelTranscript && (
                  <div className="text-xs text-amber-100/90 bg-amber-500/10 border border-amber-500/30 rounded-xl px-3 py-2">
                    <span className="font-bold text-amber-300">{profile.name}: </span>
                    {liveVoice.modelTranscript}
                  </div>
                )}

                {liveVoice.transcriptTurns.length === 0 &&
                  !liveVoice.userTranscript &&
                  !liveVoice.modelTranscript && (
                    <div className="text-center text-xs text-zinc-500 py-3">
                      Start speaking with {profile.name} or type a prompt below. Responses will
                      stream in real-time.
                    </div>
                  )}
                <div ref={transcriptEndRef} />
              </div>

              {/* Interruption Recovery Banner */}
              {liveVoice.state.canRecoverInterruption && (
                <div className="w-full max-w-xl mx-auto px-4 py-2.5 my-2 bg-amber-500/15 border border-amber-500/30 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-2 shadow-lg">
                  <div className="flex items-center gap-2 text-amber-300 text-xs font-medium">
                    <Radio className="w-4 h-4 animate-pulse text-amber-400" />
                    <span>Speech was interrupted</span>
                    {liveVoice.state.lastInterruptedStatement && (
                      <span className="text-amber-200/70 truncate max-w-[200px]">
                        "{liveVoice.state.lastInterruptedStatement}"
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => liveVoice.recoverInterruption?.(false)}
                      className="px-3 py-1 bg-amber-500 text-black text-xs font-bold rounded-lg hover:bg-amber-400 transition-colors shadow"
                      title="Ask AI to finish what it was saying"
                    >
                      Finish Thought
                    </button>
                    <button
                      onClick={() => liveVoice.recoverInterruption?.(true)}
                      className="px-3 py-1 bg-white/10 hover:bg-white/20 text-zinc-300 text-xs font-bold rounded-lg transition-colors border border-white/10"
                      title="Ask AI to restart its response from the beginning"
                    >
                      Restart
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Mode Switcher Tabs */}
            <div className="px-6 py-2 bg-white/[0.02] border-t border-white/5 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1 bg-black/40 p-1 rounded-xl border border-white/10">
                <button
                  onClick={() => liveVoice.setMicMode('handsFree')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    liveVoice.state.micMode === 'handsFree'
                      ? 'bg-emerald-500 text-black shadow-md'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                  title="Continuous natural speaking"
                >
                  🎙️ Hands-Free
                </button>
                <button
                  onClick={() => liveVoice.setMicMode('toggle')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    liveVoice.state.micMode === 'toggle'
                      ? 'bg-emerald-500 text-black shadow-md'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                  title="Tap once to speak, tap again to send"
                >
                  👆 Tap to Talk
                </button>
                <button
                  onClick={() => liveVoice.setMicMode('hold')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    liveVoice.state.micMode === 'hold'
                      ? 'bg-emerald-500 text-black shadow-md'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                  title="Press and hold to speak"
                >
                  ⏱️ Push-to-Talk
                </button>
              </div>

              {/* Utility Mute Controls */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => liveVoice.setBargeIn(!liveVoice.state.bargeInEnabled)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 border transition-all ${
                    liveVoice.state.bargeInEnabled
                      ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                      : 'bg-white/5 text-zinc-400 hover:text-white border-transparent'
                  }`}
                  title={
                    liveVoice.state.bargeInEnabled
                      ? 'Voice barge-in is ON: talking over the AI cuts it off mid-sentence. Headsets may feed its voice back and cause self-interruption.'
                      : 'Voice barge-in is OFF: while the AI speaks, your mic is muted. Cut in with the Interrupt button or a typed message.'
                  }
                >
                  <Zap className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Barge-In</span>{' '}
                  {liveVoice.state.bargeInEnabled ? 'On' : 'Off'}
                </button>

                <button
                  onClick={liveVoice.toggleMicMute}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all ${
                    liveVoice.state.isMicMuted
                      ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                      : 'bg-white/5 text-zinc-400 hover:text-white'
                  }`}
                >
                  {liveVoice.state.isMicMuted ? (
                    <>
                      <MicOff className="w-3.5 h-3.5" /> Mic Muted
                    </>
                  ) : (
                    <>
                      <Mic className="w-3.5 h-3.5" /> Mic Live
                    </>
                  )}
                </button>

                <button
                  onClick={liveVoice.toggleAiMute}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all ${
                    liveVoice.state.isAiMuted
                      ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                      : 'bg-white/5 text-zinc-400 hover:text-white'
                  }`}
                >
                  {liveVoice.state.isAiMuted ? (
                    <>
                      <VolumeX className="w-3.5 h-3.5" /> Audio Muted
                    </>
                  ) : (
                    <>
                      <Volume2 className="w-3.5 h-3.5" /> Speaker Live
                    </>
                  )}
                </button>
              </div>

              {liveVoice.state.micMode === 'handsFree' && !liveVoice.state.bargeInEnabled && (
                <p className="w-full text-[10px] text-zinc-500 flex items-center gap-1 mt-0.5">
                  <Zap className="w-3 h-3 text-amber-400/70" />
                  Barge-in is off — use the <span className="text-amber-300 font-semibold">Interrupt</span>{' '}
                  button or a typed message to cut in while {profile.name} is speaking.
                </p>
              )}
            </div>

            {/* In-Call Typed Note / Discreet Message Bar */}
            <form
              onSubmit={handleSendTyped}
              className="px-6 py-3 bg-black/60 border-t border-white/5 flex items-center gap-2"
            >
              <div className="flex items-center gap-1 bg-white/5 rounded-xl p-1 border border-white/5">
                <button
                  type="button"
                  onClick={() => setNoteType('dialogue')}
                  className={`px-2 py-1 rounded-lg text-[10px] font-bold uppercase transition-all ${
                    noteType === 'dialogue'
                      ? 'bg-white/15 text-white'
                      : 'text-zinc-500 hover:text-zinc-300'
                  }`}
                  title="Spoken dialogue"
                >
                  Say
                </button>
                <button
                  type="button"
                  onClick={() => setNoteType('action')}
                  className={`px-2 py-1 rounded-lg text-[10px] font-bold uppercase transition-all ${
                    noteType === 'action'
                      ? 'bg-purple-500/20 text-purple-300'
                      : 'text-zinc-500 hover:text-zinc-300'
                  }`}
                  title="Action or physical gesture"
                >
                  *Action*
                </button>
                <button
                  type="button"
                  onClick={() => setNoteType('note')}
                  className={`px-2 py-1 rounded-lg text-[10px] font-bold uppercase transition-all ${
                    noteType === 'note'
                      ? 'bg-blue-500/20 text-blue-300'
                      : 'text-zinc-500 hover:text-zinc-300'
                  }`}
                  title="Out-of-character / Director note"
                >
                  OOC
                </button>
              </div>

              <div className="flex-1 flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-3 py-2 focus-within:border-emerald-500/40">
                <input
                  ref={inputRef}
                  type="text"
                  value={typedMessage}
                  onChange={(e) => setTypedMessage(e.target.value)}
                  placeholder={
                    noteType === 'action'
                      ? "Type an action, e.g. 'nods thoughtfully'..."
                      : noteType === 'note'
                      ? "Type an OOC note or direction..."
                      : "Type a discreet message without speaking..."
                  }
                  className="flex-1 bg-transparent text-xs text-white placeholder-zinc-500 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={!typedMessage.trim()}
                  className="text-emerald-400 hover:text-emerald-300 disabled:text-zinc-600 transition-colors"
                  title="Send text to live character"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </form>

            {/* Bottom Interaction Area with Large Talk Button */}
            <div className="px-6 py-4 bg-zinc-950 border-t border-white/5 flex items-center justify-between">
              <div className="text-[11px] text-zinc-500 hidden sm:block">
                Press <kbd className="px-1.5 py-0.5 bg-zinc-800 rounded text-zinc-300 font-mono text-[10px]">Space</kbd> to talk • <kbd className="px-1.5 py-0.5 bg-zinc-800 rounded text-zinc-300 font-mono text-[10px]">M</kbd> mute • <kbd className="px-1.5 py-0.5 bg-zinc-800 rounded text-zinc-300 font-mono text-[10px]">Esc</kbd> interrupt
              </div>

              {/* Central Mic Button */}
              <div className="flex items-center justify-center flex-1 sm:flex-none">
                {liveVoice.state.micMode === 'hold' ? (
                  <button
                    onPointerDown={(e) => {
                      e.preventDefault();
                      liveVoice.holdToTalk(true);
                    }}
                    onPointerUp={(e) => {
                      e.preventDefault();
                      liveVoice.holdToTalk(false);
                    }}
                    onPointerLeave={() => liveVoice.holdToTalk(false)}
                    className={`w-16 h-16 rounded-full flex items-center justify-center transition-all select-none touch-none ${
                      liveVoice.state.isListening
                        ? 'bg-red-600 text-white scale-95 shadow-2xl shadow-red-600/40 ring-4 ring-red-500/30'
                        : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-xl shadow-emerald-600/30'
                    }`}
                    title="Hold to Speak"
                  >
                    <Mic className="w-7 h-7" />
                  </button>
                ) : liveVoice.state.micMode === 'handsFree' ? (
                  <button
                    onClick={liveVoice.toggleMicMute}
                    className={`w-16 h-16 rounded-full flex items-center justify-center transition-all ${
                      liveVoice.state.isMicMuted
                        ? 'bg-red-600/30 border border-red-500/40 text-red-400'
                        : 'bg-emerald-600 text-white shadow-xl shadow-emerald-600/30 animate-pulse'
                    }`}
                    title="Toggle Mic Mute in Hands-Free mode"
                  >
                    {liveVoice.state.isMicMuted ? (
                      <MicOff className="w-7 h-7" />
                    ) : (
                      <Mic className="w-7 h-7" />
                    )}
                  </button>
                ) : (
                  <button
                    onClick={liveVoice.toggleMic}
                    className={`w-16 h-16 rounded-full flex items-center justify-center transition-all ${
                      liveVoice.state.isListening
                        ? 'bg-red-600 text-white shadow-2xl shadow-red-600/40 ring-4 ring-red-500/30 animate-pulse'
                        : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-xl shadow-emerald-600/30'
                    }`}
                    title="Tap to Speak"
                  >
                    <Mic className="w-7 h-7" />
                  </button>
                )}
              </div>

              {/* Right-side action buttons: Force Reply always, Interrupt/Rewind conditionally */}
              <div className="flex items-center gap-2">
                {/* Force Reply: always shown — sends audioStreamEnd + turnComplete
                    so Gemini replies immediately without waiting for VAD */}
                <button
                  onClick={liveVoice.forceReply}
                  className="px-4 py-2 rounded-xl bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25 border border-emerald-500/25 text-xs font-bold flex items-center gap-1.5 transition-all"
                  title="Force Gemini to reply right now"
                >
                  <Zap className="w-3.5 h-3.5 fill-emerald-400" /> Reply Now
                </button>

                {liveVoice.state.isSpeaking ? (
                  <button
                    onClick={liveVoice.interrupt}
                    className="px-4 py-2 rounded-xl bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 border border-amber-500/30 text-xs font-bold flex items-center gap-1.5 transition-all"
                  >
                    <Square className="w-3.5 h-3.5 fill-amber-400" /> Interrupt AI
                  </button>
                ) : (
                  <>
                    {liveVoice.state.canReplay && (
                      <button
                        onClick={() => liveVoice.replay?.()}
                        className="px-3.5 py-2 rounded-xl bg-zinc-800/50 text-zinc-300 hover:bg-zinc-700 hover:text-white border border-zinc-700 text-xs font-bold flex items-center gap-1.5 transition-all"
                        title="Repeat last AI response"
                      >
                        <RotateCw className="w-3.5 h-3.5" /> Repeat
                      </button>
                    )}
                    <button
                      onClick={() => liveVoice.rewind(onRewind)}
                      className="px-3.5 py-2 rounded-xl bg-zinc-800/50 text-zinc-400 hover:bg-zinc-700 hover:text-white border border-zinc-700 text-xs font-bold flex items-center gap-1.5 transition-all"
                      title="Rewind last live turn"
                    >
                      <RotateCcw className="w-3.5 h-3.5" /> Rewind
                    </button>
                  </>
                )}
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

