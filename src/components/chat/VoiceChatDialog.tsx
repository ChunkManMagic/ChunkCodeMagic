import { useEffect, useRef, useState } from 'react';
import { X, Mic, Volume2, Loader2 } from 'lucide-react';
import { CharacterProfile } from '../../lib/types';
import { TtsEngine, ALL_VOICES } from '../../lib/ttsEngine';
import { buildDirectorPromptFromProfile } from '../../lib/voiceDirector';
import { getSettings } from '../../lib/types';

interface VoiceChatDialogProps {
  isOpen: boolean;
  onClose: () => void;
  profile: CharacterProfile;
  storySummary: string;
  messages: Array<{ id: string; role: string; text: string }>;
  isStreaming: boolean;
  onSendMessage: (text: string) => Promise<void> | void;
}

export function VoiceChatDialog({ isOpen, onClose, profile, storySummary, messages, isStreaming, onSendMessage }: VoiceChatDialogProps) {
  const [phase, setPhase] = useState<'idle' | 'listening' | 'thinking' | 'speaking'>('idle');
  const [transcript, setTranscript] = useState('');
  const [replyText, setReplyText] = useState('');
  const [handsFree, setHandsFree] = useState(false);
  const [awaitingReply, setAwaitingReply] = useState(false);
  const spokenIds = useRef<Set<string>>(new Set());
  const ttsRef = useRef<TtsEngine | null>(null);
  const recognitionRef = useRef<any>(null);

  if (!ttsRef.current) ttsRef.current = new TtsEngine();

  useEffect(() => {
    return () => { try { ttsRef.current?.stop(); } catch {} };
  }, []);

  const handsFreeRef = useRef(handsFree);
  useEffect(() => {
    handsFreeRef.current = handsFree;
  }, [handsFree]);

  // Watch for AI reply
  useEffect(() => {
    if (!awaitingReply || isStreaming) return;
    const last = messages[messages.length - 1];
    if (!last || last.role === 'user') return;
    if (spokenIds.current.has(last.id)) return;
    spokenIds.current.add(last.id);
    setAwaitingReply(false);
    setReplyText(last.text);
    setPhase('speaking');

    const voiceName = getSettings().liveVoiceName || profile.voiceName || 'Kore';
    const useFast = (getSettings().voiceQuality || 'quality') !== 'quality';
    const directorPrompt = buildDirectorPromptFromProfile(profile, storySummary, (profile as any).backstory || '', last.text) || undefined;

    (async () => {
      try {
        const tts = ttsRef.current!;
        await tts.speak(last.text, voiceName, directorPrompt || null, useFast, () => {
          setPhase('idle');
          if (handsFreeRef.current) {
            // auto-loop: go back to listening
            setTimeout(() => {
              if (handsFreeRef.current) launchSTT();
            }, 400);
          }
        });
        // If TtsEngine fallback handled speaking internally, phase already set to speaking; we rely on onDone.
        // If TtsEngine used browser fallback, it still calls onDone after estimated duration.
      } catch {
        setPhase('idle');
        if (handsFreeRef.current) setTimeout(() => { if (handsFreeRef.current) launchSTT(); }, 400);
      }
    })();
  }, [messages, isStreaming, awaitingReply, profile, storySummary]);

  const launchSTT = () => {
    const SR: any = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      alert('Speech Recognition not supported in this browser. Use Chrome/Edge.');
      setPhase('idle');
      return;
    }
    if (recognitionRef.current) {
      try { recognitionRef.current.abort(); } catch {}
    }
    const rec = new SR();
    rec.lang = navigator.language || 'en-US';
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.continuous = false;
    setPhase('listening');
    rec.onresult = (e: any) => {
      const heard = e.results?.[0]?.[0]?.transcript?.trim();
      if (heard) {
        setTranscript(heard);
        setPhase('thinking');
        setAwaitingReply(true);
        try { const r = onSendMessage(heard); if (r instanceof Promise) r.catch(()=> setPhase('idle')); } catch { setPhase('idle'); }
      } else {
        setPhase('idle');
      }
    };
    rec.onerror = () => setPhase('idle');
    rec.onend = () => {
      // if handsFree and still idle and not thinking/speaking, restart
      if (handsFree && phase === 'listening') {
        // will be handled by effect
      }
    };
    recognitionRef.current = rec;
    try { rec.start(); } catch { setPhase('idle'); }
  };

  const handleMicClick = () => {
    if (phase === 'speaking') {
      try { ttsRef.current?.stop(); } catch {}
      setPhase('idle');
      return;
    }
    if (phase === 'listening') {
      try { recognitionRef.current?.abort(); } catch {}
      setPhase('idle');
      return;
    }
    // check permission via getUserMedia? SpeechRecognition handles it.
    launchSTT();
  };

  // handsFree auto-loop
  useEffect(() => {
    if (handsFree && phase === 'idle' && !awaitingReply) {
      // small delay to avoid immediate re-trigger after speaking
      const id = setTimeout(() => {
        if (handsFree && phase === 'idle' && !awaitingReply) launchSTT();
      }, 800);
      return () => clearTimeout(id);
    }
  }, [handsFree, phase, awaitingReply]);

  if (!isOpen) return null;

  const voiceName = getSettings().liveVoiceName || profile.voiceName || 'Kore';
  const voiceDesc = ALL_VOICES.find(v=> v.name===voiceName)?.character || '';

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-md p-4">
      <div className="bg-zinc-950 border border-white/10 rounded-[28px] w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-white">Voice Chat</h2>
            <p className="text-xs text-zinc-400">{profile.name || 'Character'} · {voiceName} {voiceDesc ? `— ${voiceDesc}` : ''}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-xl text-zinc-400 hover:text-white"><X className="w-5 h-5" /></button>
        </div>

        <div className="px-6 py-4 space-y-4 overflow-y-auto flex-1">
          <div className="w-full min-h-[100px] max-h-[200px] rounded-2xl bg-white/[0.04] border border-white/5 p-3 overflow-y-auto space-y-2">
            {transcript && <p className="text-sm text-emerald-300"><span className="font-semibold">You:</span> {transcript}</p>}
            {replyText && <p className="text-sm text-amber-200"><span className="font-semibold">{profile.name}:</span> {replyText}</p>}
            {!transcript && !replyText && (
              <p className="text-sm text-zinc-500">
                {phase === 'listening' ? 'Listening… speak now' : phase === 'thinking' ? 'Thinking…' : phase === 'speaking' ? 'Speaking…' : 'Tap mic to speak. Hands-free keeps listening automatically.'}
              </p>
            )}
          </div>

          <div className="flex items-center justify-between">
            <span className="text-xs text-zinc-400">{handsFree ? 'Hands-free' : 'Tap mode'}</span>
            <button
              role="switch"
              aria-checked={handsFree}
              onClick={()=> setHandsFree(v=> !v)}
              className={`w-10 h-5 rounded-full relative transition-colors ${handsFree ? 'bg-emerald-600' : 'bg-zinc-800'}`}
            >
              <span className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${handsFree ? 'left-6' : 'left-1'}`} />
            </button>
          </div>

          <button
            onClick={handleMicClick}
            className={`w-full h-28 rounded-2xl flex flex-col items-center justify-center gap-2 transition-colors ${
              phase === 'speaking' ? 'bg-red-500/20 border border-red-500/30 text-red-300' :
              phase === 'listening' ? 'bg-red-500/30 border border-red-500/40 text-red-200' :
              phase === 'thinking' ? 'bg-white/5 border border-white/10 text-zinc-400' :
              'bg-emerald-600 hover:bg-emerald-500 text-white'
            }`}
          >
            {phase === 'thinking' ? <Loader2 className="w-8 h-8 animate-spin" /> : phase === 'speaking' ? <Volume2 className="w-8 h-8" /> : <Mic className="w-8 h-8" />}
            <span className="text-xs font-bold uppercase tracking-wider">
              {phase === 'listening' ? 'LISTENING — TAP TO CANCEL' : phase === 'thinking' ? 'THINKING…' : phase === 'speaking' ? 'TAP TO STOP' : 'TAP TO TALK'}
            </span>
          </button>
          {phase === 'speaking' && <p className="text-[11px] text-center text-zinc-500">Speaking via { (getSettings().voiceQuality === 'speed' ? 'Flash (fast)' : 'Pro (quality)') } — tap to interrupt</p>}
        </div>

        <div className="px-6 py-3 border-t border-white/10 flex justify-end">
          <button onClick={onClose} className="px-4 py-2 text-xs font-bold text-zinc-400 hover:text-white">Close</button>
        </div>
      </div>
    </div>
  );
}
