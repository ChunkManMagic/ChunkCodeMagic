import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { get, set } from 'idb-keyval';
import { Send, Mic, MicOff, Loader2, Play, Edit3, Wand2, RotateCcw, Edit2, X as CloseIcon, Volume2, VolumeX, Sparkles, Pause, SkipBack, Repeat, Globe, Heart, Swords, Info } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { CharacterProfile, getGenAI, refineInput, generateSpeech, AppMode, generateTextReplyStream, suggestNextAction } from '../lib/gemini';
import { LiveServerMessage, Modality } from '@google/genai';

interface Message {
  id: string;
  role: 'user' | 'model';
  text: string;
}

interface ChatInterfaceProps {
  profile: CharacterProfile;
  avatarBase64: string;
  scenarioId: string;
  onEditCharacter: () => void;
  onCarryOver: () => void;
}

export function ChatInterface({ profile, avatarBase64, scenarioId, onEditCharacter, onCarryOver }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const loadMessages = async () => {
      try {
        let saved = await get(`personaforge_messages_${scenarioId}`);
        if (!saved) {
          const localSaved = localStorage.getItem(`personaforge_messages_${scenarioId}`);
          if (localSaved) {
            saved = JSON.parse(localSaved);
            await set(`personaforge_messages_${scenarioId}`, saved);
          }
        }
        if (saved) {
          setMessages(saved);
        }
      } catch (e) {
        console.error("Failed to load messages", e);
      } finally {
        setIsLoaded(true);
      }
    };
    loadMessages();
  }, [scenarioId]);

  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isRefining, setIsRefining] = useState(false);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [isAutoRead, setIsAutoRead] = useState(true);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editInput, setEditInput] = useState('');
  const [isLiveMode, setIsLiveMode] = useState(false);
  const [isMicActive, setIsMicActive] = useState(false);
  const [showModeDetails, setShowModeDetails] = useState(false);
  
  // Audio State
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentAudioSource, setCurrentAudioSource] = useState<AudioBufferSourceNode | null>(null);
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  const [startTime, setStartTime] = useState(0);
  const [pausedAt, setPausedAt] = useState(0);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [liveSession, setLiveSession] = useState<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const playbackAudioContextRef = useRef<AudioContext | null>(null);
  const nextPlaybackTimeRef = useRef<number>(0);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    if (isLoaded) {
      set(`personaforge_messages_${scenarioId}`, messages).catch(e => {
        console.error("Failed to save messages to IndexedDB", e);
      });
      // Also save to localStorage for quick sync, but limit size
      try {
        const recentMessages = messages.slice(-50); // Keep only last 50 for localStorage
        localStorage.setItem(`personaforge_messages_${scenarioId}`, JSON.stringify(recentMessages));
      } catch (e) {
        // Ignore quota errors
      }
    }
  }, [messages, scenarioId, isLoaded]);

  const handleRefine = async () => {
    if (!input.trim() || isRefining) return;
    setIsRefining(true);
    try {
      const history = messages.map(m => ({ role: m.role, parts: [{ text: m.text }] }));
      const refined = await refineInput(input, profile, history);
      setInput(refined);
    } catch (err) {
      console.error(err);
    } finally {
      setIsRefining(false);
    }
  };

  const handleSuggest = async () => {
    if (isSuggesting) return;
    setIsSuggesting(true);
    try {
      const history = messages.map(m => ({ role: m.role, parts: [{ text: m.text }] }));
      const suggestion = await suggestNextAction(history, profile);
      setInput(suggestion);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSuggesting(false);
    }
  };

  const handleRewind = (messageId: string) => {
    const index = messages.findIndex(m => m.id === messageId);
    if (index !== -1) {
      const newMessages = messages.slice(0, index);
      setMessages(newMessages);
    }
  };

  const startEditing = (message: Message) => {
    setEditingMessageId(message.id);
    setEditInput(message.text);
  };

  const cancelEditing = () => {
    setEditingMessageId(null);
    setEditInput('');
  };

  const saveEdit = async (messageId: string) => {
    if (!editInput.trim() || isTyping) return;
    const index = messages.findIndex(m => m.id === messageId);
    if (index === -1) return;
    const message = messages[index];
    
    if (message.role === 'user') {
      const baseMessages = messages.slice(0, index);
      const updatedUserMessage = { ...message, text: editInput };
      const newHistory = [...baseMessages, updatedUserMessage];
      setMessages(newHistory);
      setEditingMessageId(null);
      setEditInput('');
      setIsTyping(true);
      
      try {
        const historyForAi = baseMessages.map(m => ({ role: m.role, parts: [{ text: m.text }] }));
        const aiMessageId = crypto.randomUUID();
        const aiMessage: Message = { id: aiMessageId, role: 'model', text: '' };
        setMessages(prev => [...prev, aiMessage]);
        
        let fullReply = '';
        let sentenceBuffer = '';
        const stream = generateTextReplyStream(historyForAi, profile, editInput);
        
        for await (const chunk of stream) {
          fullReply += chunk;
          sentenceBuffer += chunk;
          
          setMessages(prev => prev.map(m => m.id === aiMessageId ? { ...m, text: fullReply } : m));
          
          if (isAutoRead && /[.!?]\s$/.test(sentenceBuffer)) {
            handleReadAloud(sentenceBuffer);
            sentenceBuffer = '';
          }
        }
        
        if (isAutoRead && sentenceBuffer.trim()) {
          handleReadAloud(sentenceBuffer);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setIsTyping(false);
      }
    } else {
      const newMessages = [...messages];
      newMessages[index] = { ...message, text: editInput };
      setMessages(newMessages);
      setEditingMessageId(null);
      setEditInput('');
    }
  };

  const handleSendText = async () => {
    if (!input.trim() || isTyping) return;
    const userMsg: Message = { id: crypto.randomUUID(), role: 'user', text: input };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    
    if (isLiveMode && liveSession) {
      try {
        liveSession.then((session: any) => {
          session.sendClientContent({ turns: [{ role: 'user', parts: [{ text: userMsg.text }] }], turnComplete: true });
        }).catch((err: any) => {
          console.error("Live session message error:", err);
        });
      } catch (e) { console.error(e); }
      return;
    }

    setIsTyping(true);
    try {
      const history = messages.map(m => ({ role: m.role, parts: [{ text: m.text }] }));
      const aiMessageId = crypto.randomUUID();
      const aiMessage: Message = { id: aiMessageId, role: 'model', text: '' };
      setMessages(prev => [...prev, aiMessage]);
      
      let fullReply = '';
      let sentenceBuffer = '';
      const stream = generateTextReplyStream(history, profile, userMsg.text);
      
      for await (const chunk of stream) {
        fullReply += chunk;
        sentenceBuffer += chunk;
        
        setMessages(prev => prev.map(m => m.id === aiMessageId ? { ...m, text: fullReply } : m));
        
        // Simple sentence detection: ends with punctuation followed by space
        if (isAutoRead && /[.!?]\s$/.test(sentenceBuffer)) {
          handleReadAloud(sentenceBuffer);
          sentenceBuffer = '';
        }
      }
      
      if (isAutoRead && sentenceBuffer.trim()) {
        handleReadAloud(sentenceBuffer);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsTyping(false);
    }
  };

  const [audioQueue, setAudioQueue] = useState<string[]>([]);
  const [isProcessingQueue, setIsProcessingQueue] = useState(false);

  useEffect(() => {
    const processQueue = async () => {
      if (isProcessingQueue || audioQueue.length === 0 || isPlaying) return;
      setIsProcessingQueue(true);
      const nextAudio = audioQueue[0];
      setAudioQueue(prev => prev.slice(1));
      await playBase64Audio(nextAudio);
      setIsProcessingQueue(false);
    };
    processQueue();
  }, [audioQueue, isProcessingQueue, isPlaying]);

  const handleReadAloud = async (text: string) => {
    try {
      const cleanText = text.replace(/[*#_~`]/g, '').trim();
      if (!cleanText) return;
      const audioBase64 = await generateSpeech(cleanText, profile.voiceName, profile.voiceSettings);
      setAudioQueue(prev => [...prev, audioBase64]);
    } catch (e) { console.error(e); }
  };

  const playBase64Audio = async (base64: string) => {
    try {
      stopAudio();
      const binaryString = window.atob(base64);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) bytes[i] = binaryString.charCodeAt(i);
      
      if (!playbackAudioContextRef.current) {
        playbackAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      }
      
      const audioContext = playbackAudioContextRef.current;
      const float32Data = new Float32Array(bytes.length / 2);
      const view = new DataView(bytes.buffer);
      for (let i = 0; i < float32Data.length; i++) {
        float32Data[i] = view.getInt16(i * 2, true) / 32768.0;
      }
      
      const buffer = audioContext.createBuffer(1, float32Data.length, 24000);
      buffer.getChannelData(0).set(float32Data);
      setAudioBuffer(buffer);
      
      startPlayback(buffer, 0);
    } catch (e) { console.error(e); }
  };

  const startPlayback = (buffer: AudioBuffer, offset: number) => {
    if (!playbackAudioContextRef.current) return;
    const audioContext = playbackAudioContextRef.current;
    
    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(audioContext.destination);
    
    source.onended = () => {
      if (audioContext.currentTime - startTime >= buffer.duration - offset) {
        setIsPlaying(false);
        setCurrentAudioSource(null);
      }
    };

    source.start(0, offset);
    setCurrentAudioSource(source);
    setStartTime(audioContext.currentTime - offset);
    setIsPlaying(true);
  };

  const stopAudio = () => {
    if (currentAudioSource) {
      try { currentAudioSource.stop(); } catch (e) {}
      setCurrentAudioSource(null);
    }
    setIsPlaying(false);
  };

  const togglePlayPause = () => {
    if (isPlaying) {
      if (playbackAudioContextRef.current) {
        setPausedAt(playbackAudioContextRef.current.currentTime - startTime);
      }
      stopAudio();
    } else if (audioBuffer) {
      startPlayback(audioBuffer, pausedAt);
    }
  };

  const rewindAudio = () => {
    if (audioBuffer) {
      stopAudio();
      setPausedAt(0);
      startPlayback(audioBuffer, 0);
    }
  };

  const toggleLiveMode = async () => {
    if (isLiveMode) {
      if (liveSession) { 
        try { 
          const session = await liveSession;
          session.close(); 
        } catch (e) {} 
      }
      stopAudioCapture();
      setIsLiveMode(false);
      setIsMicActive(false);
      setLiveSession(null);
      return;
    }

    // Check for API key
    if (window.aistudio && !(await window.aistudio.hasSelectedApiKey())) {
      await window.aistudio.openSelectKey();
      // Assume key selection was successful and proceed
    }

    try {
      const ai = getGenAI();
      const sessionPromise = ai.live.connect({
        model: "gemini-2.5-flash-native-audio-preview-09-2025",
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: profile.voiceName || "Zephyr" } },
          },
          systemInstruction: `You are playing the role of the following character in a live voice conversation. Stay in character at all times. Never break character.
You MUST provide a complete narrative experience. This includes:
1. NARRATED ACTIONS (THOUGHTS): Narrate your actions, feelings, and environment in asterisks (e.g., *she sighs softly, looking out the window*).
2. SPOKEN DIALOGUE: Speak your character's words naturally.

IMPORTANT: Ensure that your narrated actions (the text in asterisks) are included in your response so they can be transcribed and shown to the player. The player should see both what you are doing and what you are saying.

Provide lengthy, immersive, and interactive responses. Prioritize depth, detail, and emotional resonance.

Character Details:
Name: ${profile.name}
Personality: ${profile.personality}
Backstory: ${profile.backstory}
VOICE: Pitch: ${profile.voiceSettings?.pitch}, Speed: ${profile.voiceSettings?.speed}, Accent: ${profile.voiceSettings?.accent}

If the player sends a message in the format ((OOC: ...)), treat it as an out-of-character meta-instruction, question, or correction. Respond to it directly as the AI assistant, not as the character, and then continue the roleplay if appropriate. Do not incorporate the OOC content into the story itself.
`,
          outputAudioTranscription: {},
          inputAudioTranscription: {},
        },
        callbacks: {
          onopen: () => {
            setIsLiveMode(true);
            setLiveSession(sessionPromise);
            startAudioCapture(sessionPromise);
            
            // Send conversation history to the live session so it knows what's going on
            sessionPromise.then((session: any) => {
              // Get the last 15 messages for deep context
              const historyTurns = messages.slice(-15).map(m => ({
                role: m.role,
                parts: [{ text: m.text }]
              }));
              
              if (historyTurns.length > 0) {
                // Send history as previous turns
                session.sendClientContent({ 
                  turns: historyTurns,
                  turnComplete: true 
                });
                
                // Also send a small nudge to the model to acknowledge the context and continue
                // but only if the last message was from the user, otherwise it might double-reply
                const lastMsg = messages[messages.length - 1];
                if (lastMsg && lastMsg.role === 'user') {
                   // Model will likely respond naturally to the last user message once history is processed
                }
              }
            });
          },
          onmessage: async (message: LiveServerMessage) => {
            // 1. Handle audio output
            const parts = message.serverContent?.modelTurn?.parts || [];
            for (const part of parts) {
              if (part.inlineData?.data) {
                playAudioStream(part.inlineData.data);
              }
            }

            // 2. Handle user transcription (what the user said via mic)
            const userParts = (message.serverContent as any)?.userTurn?.parts || [];
            let userText = "";
            for (const part of userParts) {
              if (part.text) userText += part.text;
            }
            if (userText) {
              setMessages(prev => {
                const lastMessage = prev[prev.length - 1];
                // If the last message is a user message, append to it (streaming transcription)
                if (lastMessage && lastMessage.role === 'user') {
                  return [...prev.slice(0, -1), { ...lastMessage, text: lastMessage.text + userText }];
                } else {
                  return [...prev, { id: crypto.randomUUID(), role: 'user', text: userText }];
                }
              });
            }

            // 3. Handle model transcription (both spoken words and narrated actions)
            let modelText = "";
            for (const part of parts) {
              if (part.text) {
                modelText += part.text;
              }
            }

            if (modelText) {
              setMessages(prev => {
                const lastMessage = prev[prev.length - 1];
                // If the last message is from the model, append to it (streaming transcription)
                if (lastMessage && lastMessage.role === 'model') {
                  return [...prev.slice(0, -1), { ...lastMessage, text: lastMessage.text + modelText }];
                } else {
                  return [...prev, { id: crypto.randomUUID(), role: 'model', text: modelText }];
                }
              });
            }

            if (message.serverContent?.interrupted) {
              nextPlaybackTimeRef.current = 0;
              if (playbackAudioContextRef.current) {
                playbackAudioContextRef.current.close();
                playbackAudioContextRef.current = null;
              }
            }
          },
          onclose: () => { setIsLiveMode(false); setIsMicActive(false); stopAudioCapture(); },
          onerror: (err) => { console.error(err); setIsLiveMode(false); setIsMicActive(false); stopAudioCapture(); }
        }
      });
    } catch (err) { console.error(err); }
  };

  const startAudioCapture = async (sessionPromise: any) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      audioContextRef.current = new AudioContext({ sampleRate: 16000 });
      sourceRef.current = audioContextRef.current.createMediaStreamSource(stream);
      processorRef.current = audioContextRef.current.createScriptProcessor(4096, 1, 1);
      processorRef.current.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        const pcm16 = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) pcm16[i] = Math.max(-1, Math.min(1, inputData[i])) * 0x7FFF;
        const base64Data = btoa(String.fromCharCode(...new Uint8Array(pcm16.buffer)));
        sessionPromise.then((session: any) => {
          session.sendRealtimeInput({ media: { data: base64Data, mimeType: 'audio/pcm;rate=16000' } });
        }).catch(console.error);
      };
      sourceRef.current.connect(processorRef.current);
      processorRef.current.connect(audioContextRef.current.destination);
      setIsMicActive(true);
    } catch (err) { console.error(err); }
  };

  const stopAudioCapture = () => {
    if (processorRef.current && sourceRef.current && audioContextRef.current) {
      sourceRef.current.disconnect();
      processorRef.current.disconnect();
      processorRef.current = null;
      sourceRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    setIsMicActive(false);
  };

  const toggleMic = () => {
    if (isMicActive) stopAudioCapture();
    else if (liveSession) startAudioCapture(liveSession);
  };

  const playAudioStream = (base64Audio: string) => {
    try {
      if (!playbackAudioContextRef.current) {
        playbackAudioContextRef.current = new AudioContext({ sampleRate: 24000 });
        nextPlaybackTimeRef.current = playbackAudioContextRef.current.currentTime;
      }
      const audioContext = playbackAudioContextRef.current;
      const binaryString = atob(base64Audio);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) bytes[i] = binaryString.charCodeAt(i);
      const pcm16 = new Int16Array(bytes.buffer);
      const float32 = new Float32Array(pcm16.length);
      for (let i = 0; i < pcm16.length; i++) float32[i] = pcm16[i] / 32768.0;
      const buffer = audioContext.createBuffer(1, float32.length, 24000);
      buffer.getChannelData(0).set(float32);
      const source = audioContext.createBufferSource();
      source.buffer = buffer;
      source.connect(audioContext.destination);
      const startTime = Math.max(nextPlaybackTimeRef.current, audioContext.currentTime);
      source.start(startTime);
      nextPlaybackTimeRef.current = startTime + buffer.duration;
    } catch (e) {
      console.error("Audio stream playback error:", e);
    }
  };

  return (
    <div className="flex flex-col h-full max-w-6xl mx-auto glass-panel rounded-[2rem] overflow-hidden shadow-2xl border border-white/5">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 sm:px-8 sm:py-5 border-b border-white/5 bg-black/20 backdrop-blur-xl">
        <div className="flex items-center gap-2 sm:gap-5">
          <div className="relative w-10 h-10 sm:w-14 sm:h-14 rounded-xl sm:rounded-2xl overflow-hidden border border-white/10 shadow-lg">
            <img src={avatarBase64} alt={profile.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm sm:text-xl font-bold text-white font-serif tracking-tight leading-tight">{profile.name}</h3>
              <div className="px-1.5 py-0.5 rounded-md bg-white/5 border border-white/10 flex items-center gap-1">
                {profile.mode === AppMode.SCENARIO ? <Globe className="w-2 h-2 sm:w-2.5 sm:h-2.5 text-blue-400" /> :
                 profile.mode === AppMode.GAME ? <Swords className="w-2 h-2 sm:w-2.5 sm:h-2.5 text-purple-400" /> :
                 <Heart className="w-2 h-2 sm:w-2.5 sm:h-2.5 text-pink-400" />}
                <span className="text-[6px] sm:text-[8px] font-bold text-zinc-400 uppercase tracking-tighter">{profile.mode}</span>
              </div>
            </div>
            <div className="flex items-center gap-2 text-[8px] sm:text-[10px] uppercase tracking-[0.2em] font-bold text-zinc-500 mt-0.5">
              <span className="text-emerald-500/80">{profile.storyTone}</span>
              <span className="w-0.5 h-0.5 sm:w-1 sm:h-1 bg-zinc-800 rounded-full" />
              <span>{profile.relationship}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1 sm:gap-3">
          <div className="relative">
            <button
              onClick={() => setShowModeDetails(!showModeDetails)}
              className={`p-2 rounded-xl transition-all ${showModeDetails ? 'bg-emerald-500/20 text-emerald-400' : 'text-zinc-500 hover:text-white hover:bg-white/5'}`}
              title="Mode Details"
            >
              <Info className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
            <AnimatePresence>
              {showModeDetails && (
                <motion.div
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  className="absolute right-0 mt-2 w-64 glass-panel p-4 rounded-2xl shadow-2xl border border-white/10 z-50 space-y-4"
                >
                  {profile.mode === AppMode.SCENARIO && (
                    <>
                      <div>
                        <h4 className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest mb-1">Atmosphere</h4>
                        <p className="text-xs text-zinc-300 leading-relaxed">{profile.worldAtmosphere}</p>
                      </div>
                      <div>
                        <h4 className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest mb-1">Locations</h4>
                        <p className="text-xs text-zinc-300 leading-relaxed">{profile.keyLocations}</p>
                      </div>
                    </>
                  )}
                  {profile.mode === AppMode.ROLEPLAY && (
                    <>
                      <div>
                        <h4 className="text-[10px] font-bold text-blue-400 uppercase tracking-widest mb-1">Character Flaws</h4>
                        <p className="text-xs text-zinc-300 leading-relaxed">{profile.characterFlaws}</p>
                      </div>
                      <div>
                        <h4 className="text-[10px] font-bold text-blue-400 uppercase tracking-widest mb-1">Secret Motive</h4>
                        <p className="text-xs text-zinc-300 leading-relaxed">{profile.secretMotive}</p>
                      </div>
                    </>
                  )}
                  {profile.mode === AppMode.GAME && (
                    <>
                      <div>
                        <h4 className="text-[10px] font-bold text-purple-400 uppercase tracking-widest mb-1">Game System</h4>
                        <p className="text-xs text-zinc-300 leading-relaxed">{profile.gameSystem}</p>
                      </div>
                      <div>
                        <h4 className="text-[10px] font-bold text-purple-400 uppercase tracking-widest mb-1">Quest Objective</h4>
                        <p className="text-xs text-zinc-300 leading-relaxed">{profile.questObjective}</p>
                      </div>
                    </>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <button
            onClick={onCarryOver}
            className="p-2 rounded-xl text-zinc-500 hover:text-blue-400 hover:bg-white/5 transition-all"
            title="Carry over to new scenario"
          >
            <Repeat className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
          <button
            onClick={onEditCharacter}
            className="p-2 rounded-xl text-zinc-500 hover:text-white hover:bg-white/5 transition-all"
            title="Edit Character"
          >
            <Edit3 className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
          <button
            onClick={toggleLiveMode}
            className={`px-3 py-2 sm:px-6 sm:py-2.5 rounded-xl text-[10px] sm:text-sm font-bold flex items-center gap-2 sm:gap-3 transition-all ${
              isLiveMode ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shadow-lg shadow-emerald-500/10' : 'glass-input text-zinc-400 hover:text-white'
            }`}
          >
            {isLiveMode ? <><Loader2 className="w-3 h-3 sm:w-4 sm:h-4 animate-spin" /> LIVE</> : <><Mic className="w-3 h-3 sm:w-4 sm:h-4" /> VOICE</>}
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 flex flex-col relative bg-black/10">
          {/* Avatar Display */}
          <div className="h-72 border-b border-white/5 relative bg-black/20 flex items-center justify-center overflow-hidden">
            <motion.img
              initial={{ opacity: 0, scale: 1.1 }}
              animate={{ opacity: 1, scale: 1 }}
              src={avatarBase64}
              alt={profile.name}
              className="w-full h-full object-cover opacity-20 blur-2xl"
              referrerPolicy="no-referrer"
            />
            <div className="absolute inset-0 flex items-center justify-center">
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="relative group">
                <img src={avatarBase64} alt={profile.name} className="h-60 w-60 object-cover rounded-3xl shadow-2xl border border-white/10 relative z-10" referrerPolicy="no-referrer" />
              </motion.div>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-8 space-y-8 scroll-smooth custom-scrollbar">
            {!isLoaded ? (
              <div className="h-full flex flex-col items-center justify-center text-zinc-600 gap-4">
                <Loader2 className="w-8 h-8 animate-spin opacity-50 text-emerald-500" />
                <p className="text-sm font-serif italic tracking-wide">Loading narrative...</p>
              </div>
            ) : messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-zinc-600 gap-4">
                <Sparkles className="w-8 h-8 opacity-20" />
                <p className="text-sm font-serif italic tracking-wide">The story begins with your first word...</p>
              </div>
            ) : (
              messages.map((msg) => (
                <motion.div key={msg.id} initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} className={`flex group relative ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`absolute -top-6 opacity-0 group-hover:opacity-100 transition-all flex items-center gap-1.5 z-10 ${msg.role === 'user' ? 'right-0' : 'left-0'}`}>
                    <button onClick={() => handleRewind(msg.id)} className="p-1.5 glass-panel rounded-lg text-zinc-500 hover:text-red-400 transition-colors" title="Rewind to here"><RotateCcw className="w-3.5 h-3.5" /></button>
                    <button onClick={() => startEditing(msg)} className="p-1.5 glass-panel rounded-lg text-zinc-500 hover:text-emerald-400 transition-colors" title="Edit message"><Edit2 className="w-3.5 h-3.5" /></button>
                    {msg.role === 'model' && (
                      <button onClick={() => handleReadAloud(msg.text)} className="p-1.5 glass-panel rounded-lg text-zinc-500 hover:text-blue-400 transition-colors" title="Read aloud"><Volume2 className="w-3.5 h-3.5" /></button>
                    )}
                  </div>
                  <div className={`max-w-[85%] rounded-[1.5rem] px-6 py-4 shadow-xl ${msg.role === 'user' ? 'bg-emerald-600 text-white rounded-tr-none' : 'glass-panel text-zinc-200 rounded-tl-none'}`}>
                    {editingMessageId === msg.id ? (
                      <div className="space-y-3 min-w-[280px]">
                        <textarea value={editInput} onChange={(e) => setEditInput(e.target.value)} className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-sm text-white focus:outline-none focus:ring-1 focus:ring-emerald-500 resize-none" rows={4} autoFocus />
                        <div className="flex justify-end gap-3">
                          <button onClick={cancelEditing} className="text-xs font-bold text-zinc-500 hover:text-white uppercase tracking-widest">Cancel</button>
                          <button onClick={() => saveEdit(msg.id)} className="text-xs font-bold text-emerald-400 hover:text-emerald-300 uppercase tracking-widest">Save</button>
                        </div>
                      </div>
                    ) : (
                      <div className={`prose prose-invert max-w-none text-[15px] leading-relaxed ${msg.role === 'model' ? 'narrative-text' : ''}`}>
                        <ReactMarkdown>{msg.text}</ReactMarkdown>
                      </div>
                    )}
                  </div>
                </motion.div>
              ))
            )}
            {isTyping && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-start">
                <div className="glass-panel rounded-[1.5rem] rounded-tl-none px-6 py-5 flex items-center gap-2.5">
                  <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-bounce" />
                  <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-bounce [animation-delay:0.2s]" />
                  <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-bounce [animation-delay:0.4s]" />
                </div>
              </motion.div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Audio Controls Overlay */}
          <AnimatePresence>
            {audioBuffer && (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                className="absolute bottom-32 left-1/2 -translate-x-1/2 glass-panel px-4 sm:px-6 py-2 sm:py-3 rounded-2xl flex items-center gap-4 sm:gap-6 shadow-2xl border border-emerald-500/20 z-20"
              >
                <button onClick={rewindAudio} className="text-zinc-400 hover:text-white transition-colors" title="Restart Speech">
                  <SkipBack className="w-4 h-4 sm:w-5 sm:h-5" />
                </button>
                <button 
                  onClick={togglePlayPause} 
                  className="w-8 h-8 sm:w-10 sm:h-10 bg-emerald-600 hover:bg-emerald-500 rounded-full flex items-center justify-center text-white transition-all shadow-lg shadow-emerald-900/20"
                >
                  {isPlaying ? <Pause className="w-4 h-4 sm:w-5 sm:h-5" /> : <Play className="w-4 h-4 sm:w-5 sm:h-5 ml-0.5" />}
                </button>
                <button onClick={() => { stopAudio(); setAudioBuffer(null); }} className="text-zinc-400 hover:text-red-400 transition-colors" title="Stop">
                  <CloseIcon className="w-4 h-4 sm:w-5 sm:h-5" />
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Input Area */}
          <div className="p-4 sm:p-6 bg-black/20 backdrop-blur-2xl border-t border-white/5">
            <div className="flex items-center gap-2 sm:gap-3 mb-4 px-2">
              <button
                onClick={() => {
                  if (input.startsWith('*') && input.endsWith('*')) setInput(input.slice(1, -1));
                  else setInput(`*${input}*`);
                }}
                className={`text-[9px] sm:text-[10px] font-bold px-2 sm:px-3 py-1 rounded-lg border transition-all tracking-widest ${
                  input.startsWith('*') && input.endsWith('*')
                    ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                    : 'glass-input text-zinc-500 border-transparent hover:text-zinc-300'
                }`}
              >
                ACTION
              </button>
              <button
                onClick={handleRefine}
                disabled={!input.trim() || isRefining}
                className={`text-[9px] sm:text-[10px] font-bold px-2 sm:px-3 py-1 rounded-lg border transition-all tracking-widest flex items-center gap-1 sm:gap-2 ${
                  isRefining ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'glass-input text-zinc-500 border-transparent hover:text-emerald-400'
                }`}
              >
                {isRefining ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
                REFINE
              </button>
              <button
                onClick={handleSuggest}
                disabled={isSuggesting}
                className={`text-[9px] sm:text-[10px] font-bold px-2 sm:px-3 py-1 rounded-lg border transition-all tracking-widest flex items-center gap-1 sm:gap-2 ${
                  isSuggesting ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'glass-input text-zinc-500 border-transparent hover:text-emerald-400'
                }`}
              >
                {isSuggesting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                SUGGEST ACTION
              </button>
              <button
                onClick={() => setIsAutoRead(!isAutoRead)}
                className={`text-[9px] sm:text-[10px] font-bold px-2 sm:px-3 py-1 rounded-lg border transition-all tracking-widest flex items-center gap-1 sm:gap-2 ${
                  isAutoRead ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'glass-input text-zinc-500 border-transparent hover:text-zinc-300'
                }`}
              >
                {isAutoRead ? <Volume2 className="w-3 h-3" /> : <VolumeX className="w-3 h-3" />}
                AUTO-READ
              </button>
              <div className="text-[8px] sm:text-[10px] text-zinc-600 uppercase tracking-[0.2em] font-bold ml-auto hidden sm:block">
                Playing as: <span className="text-zinc-400">{profile.playerProfile?.name || 'The Protagonist'}</span>
              </div>
            </div>
            <div className="flex items-end gap-2 sm:gap-3">
              {isLiveMode && (
                <button
                  onClick={toggleMic}
                  className={`p-3 sm:p-4 rounded-2xl transition-all shadow-lg ${
                    isMicActive ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'glass-input text-zinc-500 hover:text-white'
                  }`}
                >
                  {isMicActive ? <Mic className="w-5 h-5 sm:w-6 sm:h-6" /> : <MicOff className="w-5 h-5 sm:w-6 sm:h-6" />}
                </button>
              )}
              <div className="flex-1 relative group">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendText(); } }}
                  placeholder={isLiveMode ? "Type or speak..." : "Describe an action or speak..."}
                  className="w-full glass-input rounded-2xl px-4 sm:px-6 py-3 sm:py-4 text-sm sm:text-base text-white placeholder-zinc-600 focus:ring-2 focus:ring-emerald-500/30 transition-all resize-none max-h-40"
                  rows={1}
                  style={{ minHeight: '50px' }}
                />
              </div>
              <button onClick={handleSendText} disabled={!input.trim() || isTyping} className="p-3 sm:p-4 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-white rounded-2xl shadow-xl transition-all">
                <Send className="w-5 h-5 sm:w-6 sm:h-6" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
