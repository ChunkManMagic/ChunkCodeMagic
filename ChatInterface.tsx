import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Send, Mic, MicOff, Loader2, Edit3, Wand2, RotateCcw, Edit2,
  X as CloseIcon, Volume2, VolumeX, Sparkles, Pause, Repeat,
  Globe, Heart, Swords, Info, Book, Plus, Trash2, Settings2,
  Sliders, RefreshCw, GitBranch, Phone, SkipBack,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { useConversation } from '@elevenlabs/react';
import { getSettings, saveSettings, generateId } from '../lib/gemini';
import type { CharacterProfile, CodexEntry, Message } from '../lib/types';
import { AppMode } from '../lib/types';
import { STORAGE_KEYS } from '../constants';
import { useChat } from '../hooks/useChat';
import { useVoice } from '../hooks/useVoice';
import { useCodex } from '../hooks/useCodex';
import { ChatSkeleton } from './Skeleton';

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function parseMessageContent(text: string, role: string) {
  if (role === 'model') {
    const m = text.match(/<ooc>([\s\S]*?)<\/ooc>/i);
    if (m) return { mainText: text.replace(/<ooc>[\s\S]*?<\/ooc>/i, '').trim(), oocText: m[1].trim() };
  } else {
    const m = text.match(/\[Director's Note: ([\s\S]*?)\]/i);
    if (m) return { mainText: text.replace(/\[Director's Note: [\s\S]*?\]/i, '').trim(), oocText: m[1].trim() };
  }
  return { mainText: text, oocText: null };
}

// ─────────────────────────────────────────────
// Confirm Modal
// ─────────────────────────────────────────────

interface ConfirmModalState { isOpen: boolean; title: string; message: string; onConfirm: () => void; }

function ConfirmModal({ state, onClose }: { state: ConfirmModalState; onClose: () => void }) {
  return (
    <AnimatePresence>
      {state.isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
          <motion.div initial={{ opacity: 0, scale: 0.9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, y: 20 }} className="relative w-full max-w-md glass-panel p-8 rounded-[2rem] border border-white/10 shadow-2xl">
            <h3 className="text-2xl font-serif text-white mb-2">{state.title}</h3>
            <p className="text-zinc-400 mb-8 leading-relaxed">{state.message}</p>
            <div className="flex gap-4">
              <button onClick={onClose} className="flex-1 px-6 py-3 rounded-xl font-bold text-zinc-400 hover:text-white hover:bg-white/5 transition-all uppercase tracking-widest text-xs">Cancel</button>
              <button onClick={() => { state.onConfirm(); onClose(); }} className="flex-1 px-6 py-3 rounded-xl font-bold bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-all uppercase tracking-widest text-xs border border-red-500/20">Confirm</button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

// ─────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────

interface ChatInterfaceProps {
  profile: CharacterProfile;
  avatarBase64: string;
  scenarioId: string;
  onEditCharacter: () => void;
  onCarryOver: () => void;
  onUpdateProfile: (profile: CharacterProfile) => void;
  onBranchScenario: (slicedMessages: Message[], codexEntries: CodexEntry[], storySummary: string) => void;
}

// ─────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────

export function ChatInterface({ profile, avatarBase64, scenarioId, onEditCharacter, onCarryOver, onUpdateProfile, onBranchScenario }: ChatInterfaceProps) {

  const {
    codexEntries, isAutoCodexEnabled, setIsAutoCodexEnabled,
    isAutoPopulating, autoPopulate, addEntry, deleteEntry, refineEntry, resetCodex,
  } = useCodex({ scenarioId, profile, messages: [], isReady: true });

  const {
    messages, setMessages, storySummary, isLoaded, isTyping, error, setError,
    sendMessage, editAndRegenerate, regenerateMessage, refineUserInput, suggestInput,
    rewindTo, resetChat,
  } = useChat({ profile, scenarioId, codexEntries, onAutoPopulateCodex: () => autoPopulate() });

  const { isAutoRead, setIsAutoRead, isPlaying, readAloud, stopAudio, togglePlayPause } = useVoice(profile);

  const [input, setInput] = useState('');
  const [directorNote, setDirectorNote] = useState('');
  const [isRefining, setIsRefining] = useState(false);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [isInputExpanded, setIsInputExpanded] = useState(false);
  const [showCodex, setShowCodex] = useState(false);
  const [showVoiceSettings, setShowVoiceSettings] = useState(false);
  const [showRefineSettings, setShowRefineSettings] = useState(false);
  const [showModeDetails, setShowModeDetails] = useState(false);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editInput, setEditInput] = useState('');
  const [regeneratingMessageId, setRegeneratingMessageId] = useState<string | null>(null);
  const [rerollGuidance, setRerollGuidance] = useState('');
  const [isLiveMode, setIsLiveMode] = useState(false);
  const [isMicActive, setIsMicActive] = useState(false);
  const [newCodexEntry, setNewCodexEntry] = useState<Partial<CodexEntry>>({ category: 'Lore' });
  const [isAddingCodex, setIsAddingCodex] = useState(false);
  const [isRefiningCodexEntry, setIsRefiningCodexEntry] = useState(false);
  const [confirmModal, setConfirmModal] = useState<ConfirmModalState>({ isOpen: false, title: '', message: '', onConfirm: () => {} });
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, isTyping]);

  const conversation = useConversation({
    onConnect: () => { setIsMicActive(true); setIsLiveMode(true); },
    onDisconnect: () => { setIsMicActive(false); setIsLiveMode(false); },
    onMessage: (message: any) => {
      if (message.source === 'user' && message.isFinal) setMessages(prev => [...prev, { id: generateId(), role: 'user', text: message.message }]);
      else if (message.source === 'ai') setMessages(prev => [...prev, { id: generateId(), role: 'model', text: message.message }]);
    },
    onError: () => { setIsLiveMode(false); setIsMicActive(false); },
  });

  const toggleLiveMode = async () => {
    if (isLiveMode || conversation.status === 'connected') { await conversation.endSession(); setIsLiveMode(false); return; }
    const settings = getSettings();
    const agentId = settings.elevenLabsAgentId || (import.meta as any).env?.VITE_ELEVENLABS_AGENT_ID;
    if (!agentId) { setError('Configure an ElevenLabs Agent ID in Settings to use Live Mode.'); return; }
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      await (conversation as any).startSession({ agentId, clientKey: settings.elevenLabsApiKey });
      setIsLiveMode(true);
    } catch { setError('Failed to start voice session. Check microphone permissions.'); }
  };

  const handleSend = useCallback(async () => {
    await sendMessage(input, directorNote, isAutoRead ? readAloud : undefined);
    setInput(''); setDirectorNote('');
  }, [input, directorNote, isAutoRead, sendMessage, readAloud]);

  const handleRefine = async () => {
    if (!input.trim() || isRefining) return;
    setIsRefining(true); setError(null);
    try { const r = await refineUserInput(input); if (r) setInput(r); }
    catch (e: any) { setError(e.message || 'Failed to refine input.'); }
    finally { setIsRefining(false); }
  };

  const handleSuggest = async () => {
    if (isSuggesting) return;
    setIsSuggesting(true); setError(null);
    try { const s = await suggestInput(); if (s) setInput(s); }
    catch (e: any) { setError(e.message || 'Failed to get suggestion.'); }
    finally { setIsSuggesting(false); }
  };

  const handleRewind = (id: string) => setConfirmModal({ isOpen: true, title: 'Rewind Narrative', message: 'All messages after this point will be deleted.', onConfirm: () => rewindTo(id) });
  const handleReset = () => setConfirmModal({ isOpen: true, title: 'Reset Story', message: 'This will delete all messages and codex entries.', onConfirm: () => { resetChat(); resetCodex(); } });
  const handleBranch = (id: string) => { const i = messages.findIndex(m => m.id === id); if (i !== -1) onBranchScenario(messages.slice(0, i + 1), codexEntries, storySummary); };

  const saveEdit = async (id: string) => {
    if (!editInput.trim() || isTyping) return;
    await editAndRegenerate(id, editInput, isAutoRead ? readAloud : undefined);
    setEditingMessageId(null); setEditInput('');
  };

  const handleRegenerate = async (id: string, guidance: string) => {
    await regenerateMessage(id, guidance, isAutoRead ? readAloud : undefined);
    setRegeneratingMessageId(null); setRerollGuidance('');
  };

  const handleAddCodexEntry = () => {
    if (!newCodexEntry.title || !newCodexEntry.content) return;
    addEntry({ title: newCodexEntry.title, content: newCodexEntry.content, category: (newCodexEntry.category as CodexEntry['category']) || 'Lore' });
    setNewCodexEntry({ category: 'Lore' }); setIsAddingCodex(false);
  };

  const handleRefineCodexEntry = async () => {
    if (isRefiningCodexEntry || !newCodexEntry.title || !newCodexEntry.content) return;
    setIsRefiningCodexEntry(true);
    try { setNewCodexEntry(await refineEntry(newCodexEntry)); } finally { setIsRefiningCodexEntry(false); }
  };

  const handleUpdateVoice = (updates: Partial<CharacterProfile>) => onUpdateProfile({ ...profile, ...updates });

  const voicePresets = [
    { name: 'Cinematic', pitch: 'Normal', speed: 'Normal', tone: 'Dramatic' },
    { name: 'Deep Narrator', pitch: 'Low', speed: 'Slow', tone: 'Epic' },
    { name: 'Fast Action', pitch: 'Normal', speed: 'Fast', tone: 'Intense' },
    { name: 'Whisper', pitch: 'High', speed: 'Slow', tone: 'Mysterious' },
  ];

  return (
    <div className="flex flex-col h-full max-w-6xl mx-auto glass-panel rounded-[2rem] overflow-hidden shadow-2xl border border-white/5">

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 sm:px-8 sm:py-5 border-b border-white/5 bg-black/20 backdrop-blur-xl">
        <div className="flex items-center gap-2 sm:gap-5">
          <div className="w-10 h-10 sm:w-14 sm:h-14 rounded-xl sm:rounded-2xl overflow-hidden border border-white/10 shadow-lg">
            <img src={avatarBase64} alt={profile.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm sm:text-xl font-bold text-white font-serif tracking-tight">{profile.name}</h3>
              <div className="px-1.5 py-0.5 rounded-md bg-white/5 border border-white/10 flex items-center gap-1">
                {profile.mode === AppMode.SCENARIO ? <Globe className="w-2.5 h-2.5 text-blue-400" /> : profile.mode === AppMode.GAME ? <Swords className="w-2.5 h-2.5 text-purple-400" /> : <Heart className="w-2.5 h-2.5 text-pink-400" />}
                <span className="text-[8px] font-bold text-zinc-400 uppercase tracking-tighter">{profile.mode}</span>
              </div>
            </div>
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] font-bold text-zinc-500 mt-0.5">
              <span className="text-emerald-500/80">{profile.storyTone}</span>
              <span className="w-1 h-1 bg-zinc-800 rounded-full" />
              <span>{profile.relationship}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1 sm:gap-3">
          <button onClick={() => setShowCodex(!showCodex)} className={`p-2 rounded-xl transition-all ${showCodex ? 'bg-emerald-500/20 text-emerald-400' : 'text-zinc-500 hover:text-white hover:bg-white/5'}`} title="World Codex"><Book className="w-4 h-4 sm:w-5 sm:h-5" /></button>
          <div className="relative">
            <button onClick={() => setShowModeDetails(!showModeDetails)} className={`p-2 rounded-xl transition-all ${showModeDetails ? 'bg-emerald-500/20 text-emerald-400' : 'text-zinc-500 hover:text-white hover:bg-white/5'}`}><Info className="w-4 h-4 sm:w-5 sm:h-5" /></button>
            <AnimatePresence>
              {showModeDetails && (
                <motion.div initial={{ opacity: 0, y: 10, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10, scale: 0.95 }} className="absolute right-0 mt-2 w-64 glass-panel p-4 rounded-2xl shadow-2xl border border-white/10 z-50 space-y-4">
                  {profile.mode === AppMode.SCENARIO && (<><div><h4 className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest mb-1">Atmosphere</h4><p className="text-xs text-zinc-300 leading-relaxed">{profile.worldAtmosphere}</p></div><div><h4 className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest mb-1">Locations</h4><p className="text-xs text-zinc-300 leading-relaxed">{profile.keyLocations}</p></div></>)}
                  {profile.mode === AppMode.ROLEPLAY && (<><div><h4 className="text-[10px] font-bold text-blue-400 uppercase tracking-widest mb-1">Character Flaws</h4><p className="text-xs text-zinc-300 leading-relaxed">{profile.characterFlaws}</p></div><div><h4 className="text-[10px] font-bold text-blue-400 uppercase tracking-widest mb-1">Secret Motive</h4><p className="text-xs text-zinc-300 leading-relaxed">{profile.secretMotive}</p></div></>)}
                  {profile.mode === AppMode.GAME && (<><div><h4 className="text-[10px] font-bold text-purple-400 uppercase tracking-widest mb-1">Game System</h4><p className="text-xs text-zinc-300 leading-relaxed">{profile.gameSystem}</p></div><div><h4 className="text-[10px] font-bold text-purple-400 uppercase tracking-widest mb-1">Quest Objective</h4><p className="text-xs text-zinc-300 leading-relaxed">{profile.questObjective}</p></div></>)}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <button onClick={onCarryOver} className="p-2 rounded-xl text-zinc-500 hover:text-blue-400 hover:bg-white/5 transition-all" title="Carry over"><Repeat className="w-4 h-4 sm:w-5 sm:h-5" /></button>
          <button onClick={onEditCharacter} className="p-2 rounded-xl text-zinc-500 hover:text-white hover:bg-white/5 transition-all"><Edit3 className="w-4 h-4 sm:w-5 sm:h-5" /></button>
          <button onClick={() => setShowVoiceSettings(!showVoiceSettings)} className={`p-2 rounded-xl transition-all ${showVoiceSettings ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' : 'text-zinc-500 hover:text-blue-400 hover:bg-white/5'}`}><Settings2 className="w-4 h-4 sm:w-5 sm:h-5" /></button>
          <button onClick={toggleLiveMode} className={`px-3 py-2 sm:px-6 sm:py-2.5 rounded-xl text-[10px] sm:text-sm font-bold flex items-center gap-2 transition-all ${isLiveMode ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'glass-input text-zinc-400 hover:text-white'}`}>
            {isLiveMode ? <><div className={`w-2 h-2 rounded-full ${conversation.isSpeaking ? 'bg-blue-500 animate-pulse' : 'bg-emerald-500'}`} /><span>AGENT CONNECTED</span></> : <><Phone className="w-3 h-3 sm:w-4 sm:h-4" /> START CALL</>}
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden relative">

        {/* Codex Sidebar */}
        <AnimatePresence>
          {showCodex && (
            <motion.div initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'spring', damping: 25, stiffness: 200 }} className="absolute right-0 top-0 bottom-0 w-80 glass-panel border-l border-white/10 z-40 flex flex-col shadow-2xl">
              <div className="p-6 border-b border-white/5 flex items-center justify-between">
                <h3 className="text-lg font-serif font-bold text-white flex items-center gap-2"><Book className="w-5 h-5 text-emerald-400" /> World Codex</h3>
                <div className="flex items-center gap-2">
                  <button onClick={() => setIsAutoCodexEnabled(!isAutoCodexEnabled)} className={`p-2 rounded-lg transition-all ${isAutoCodexEnabled ? 'text-blue-400 bg-blue-500/10' : 'text-zinc-500 hover:text-blue-400'}`}><Repeat className={`w-4 h-4 ${isAutoCodexEnabled ? 'animate-spin-slow' : ''}`} /></button>
                  <button onClick={() => autoPopulate(true)} disabled={isAutoPopulating || messages.length < 2} className={`p-2 rounded-lg transition-all ${isAutoPopulating ? 'text-emerald-400 animate-pulse' : 'text-zinc-500 hover:text-emerald-400'}`}>{isAutoPopulating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}</button>
                  <button onClick={() => setShowCodex(false)} className="text-zinc-500 hover:text-white"><CloseIcon className="w-5 h-5" /></button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
                {isAddingCodex ? (
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4 p-4 rounded-2xl bg-white/5 border border-white/10">
                    <input type="text" placeholder="Entry Title" value={newCodexEntry.title || ''} onChange={e => setNewCodexEntry(p => ({ ...p, title: e.target.value }))} className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-emerald-500" />
                    <select value={newCodexEntry.category} onChange={e => setNewCodexEntry(p => ({ ...p, category: e.target.value as any }))} className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-emerald-500">
                      <option value="Lore">Lore</option><option value="Mechanics">Mechanics</option><option value="Location">Location</option><option value="Item">Item</option>
                    </select>
                    <textarea placeholder="Description/Rules..." value={newCodexEntry.content || ''} onChange={e => setNewCodexEntry(p => ({ ...p, content: e.target.value }))} rows={4} className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-emerald-500 resize-none" />
                    <button onClick={handleRefineCodexEntry} disabled={isRefiningCodexEntry || !newCodexEntry.title || !newCodexEntry.content} className="w-full py-2 rounded-xl bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 text-[10px] font-bold uppercase tracking-widest border border-blue-500/20 flex items-center justify-center gap-2">{isRefiningCodexEntry ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />} Refine</button>
                    <div className="flex gap-2">
                      <button onClick={() => setIsAddingCodex(false)} className="flex-1 py-2 rounded-xl text-xs font-bold text-zinc-500 hover:text-white uppercase tracking-widest">Cancel</button>
                      <button onClick={handleAddCodexEntry} className="flex-1 py-2 rounded-xl bg-emerald-600/20 text-emerald-400 text-xs font-bold uppercase tracking-widest border border-emerald-500/20">Save</button>
                    </div>
                  </motion.div>
                ) : (
                  <button onClick={() => setIsAddingCodex(true)} className="w-full py-4 rounded-2xl border border-dashed border-white/10 text-zinc-500 hover:text-emerald-400 hover:border-emerald-500/30 transition-all flex flex-col items-center gap-2 group">
                    <Plus className="w-5 h-5 group-hover:scale-110 transition-transform" />
                    <span className="text-[10px] font-bold uppercase tracking-widest">Add New Entry</span>
                  </button>
                )}
                <div className="space-y-4">
                  {codexEntries.length === 0 && <p className="text-center text-xs text-zinc-600 italic py-4">No codex entries yet. Play the scenario to discover lore.</p>}
                  {codexEntries.map(entry => (
                    <div key={entry.id} className="group p-4 rounded-2xl bg-white/5 border border-white/5 hover:border-white/10 transition-all">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[8px] font-bold uppercase tracking-tighter px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">{entry.category}</span>
                        <button onClick={() => setConfirmModal({ isOpen: true, title: 'Delete Entry', message: `Delete "${entry.title}"?`, onConfirm: () => deleteEntry(entry.id) })} className="opacity-0 group-hover:opacity-100 p-1 text-zinc-600 hover:text-red-400 transition-all"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                      <h4 className="text-sm font-bold text-white mb-1">{entry.title}</h4>
                      <p className="text-xs text-zinc-500 leading-relaxed line-clamp-3 group-hover:line-clamp-none transition-all">{entry.content}</p>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Main chat */}
        <div className="flex-1 flex flex-col relative bg-black/10">

          {/* Avatar banner */}
          <div className="h-72 border-b border-white/5 relative bg-black/20 flex items-center justify-center overflow-hidden">
            <motion.img initial={{ opacity: 0, scale: 1.1 }} animate={{ opacity: 1, scale: 1 }} src={avatarBase64} alt="" className="w-full h-full object-cover opacity-20 blur-2xl" referrerPolicy="no-referrer" />
            <div className="absolute inset-0 flex items-center justify-center">
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
                <img src={avatarBase64} alt={profile.name} className="h-60 w-60 object-cover rounded-3xl shadow-2xl border border-white/10 z-10 relative" referrerPolicy="no-referrer" />
              </motion.div>
            </div>
          </div>

          {/* Messages list */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-8 space-y-8 scroll-smooth custom-scrollbar">
            {!isLoaded ? (
              <ChatSkeleton />
            ) : messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-zinc-600 gap-4 py-16">
                <Sparkles className="w-10 h-10 opacity-20" />
                <p className="text-sm font-serif italic tracking-wide">The story begins with your first word…</p>
                <p className="text-xs text-zinc-700 text-center max-w-xs">Type an action below to start the narrative with {profile.name}.</p>
              </div>
            ) : messages.map(msg => (
              <motion.div key={msg.id} initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} className={`flex group relative ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`absolute -top-6 opacity-0 group-hover:opacity-100 transition-all flex items-center gap-1.5 z-10 ${msg.role === 'user' ? 'right-0' : 'left-0'}`}>
                  <button onClick={() => handleRewind(msg.id)} className="p-1.5 glass-panel rounded-lg text-zinc-500 hover:text-red-400 transition-colors" title="Rewind"><RotateCcw className="w-3.5 h-3.5" /></button>
                  <button onClick={() => { setEditingMessageId(msg.id); setEditInput(msg.text); }} className="p-1.5 glass-panel rounded-lg text-zinc-500 hover:text-emerald-400 transition-colors" title="Edit"><Edit2 className="w-3.5 h-3.5" /></button>
                  {msg.role === 'model' && (<>
                    <button onClick={() => readAloud(parseMessageContent(msg.text, msg.role).mainText)} className="p-1.5 glass-panel rounded-lg text-zinc-500 hover:text-blue-400 transition-colors" title="Read aloud"><Volume2 className="w-3.5 h-3.5" /></button>
                    <button onClick={() => setRegeneratingMessageId(msg.id)} className="p-1.5 glass-panel rounded-lg text-zinc-500 hover:text-emerald-400 transition-colors" title="Regenerate"><RefreshCw className="w-3.5 h-3.5" /></button>
                    <button onClick={() => handleBranch(msg.id)} className="p-1.5 glass-panel rounded-lg text-zinc-500 hover:text-purple-400 transition-colors" title="Branch"><GitBranch className="w-3.5 h-3.5" /></button>
                  </>)}
                </div>
                <div className={`max-w-[85%] rounded-[1.5rem] px-6 py-4 shadow-xl ${msg.role === 'user' ? 'bg-emerald-600 text-white rounded-tr-none' : 'glass-panel text-zinc-200 rounded-tl-none'}`}>
                  {editingMessageId === msg.id ? (
                    <div className="space-y-3 min-w-[280px]">
                      <textarea value={editInput} onChange={e => setEditInput(e.target.value)} className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-sm text-white focus:outline-none focus:ring-1 focus:ring-emerald-500 resize-none" rows={4} autoFocus />
                      <div className="flex justify-end gap-3">
                        <button onClick={() => setEditingMessageId(null)} className="text-xs font-bold text-zinc-500 hover:text-white uppercase tracking-widest">Cancel</button>
                        <button onClick={() => saveEdit(msg.id)} className="text-xs font-bold text-emerald-400 hover:text-emerald-300 uppercase tracking-widest">Save</button>
                      </div>
                    </div>
                  ) : (() => {
                    const { mainText, oocText } = parseMessageContent(msg.text, msg.role);
                    return (
                      <div className="flex flex-col gap-3">
                        {mainText && <div className={`prose prose-invert max-w-none text-[15px] leading-relaxed ${msg.role === 'model' ? 'narrative-text' : ''}`}><ReactMarkdown>{mainText}</ReactMarkdown></div>}
                        {oocText && (
                          <div className={`text-sm p-3 rounded-xl border ${msg.role === 'user' ? 'bg-emerald-700/30 border-emerald-500/30 text-emerald-100' : 'bg-zinc-800/50 border-zinc-700/50 text-zinc-300'}`}>
                            <div className="text-xs font-bold uppercase tracking-wider mb-1 opacity-70">{msg.role === 'user' ? "Director's Note" : 'OOC Reply'}</div>
                            <div className="prose prose-invert max-w-none text-sm"><ReactMarkdown>{oocText}</ReactMarkdown></div>
                          </div>
                        )}
                        {msg.role === 'model' && msg.provider && <div className="text-[9px] text-zinc-500 uppercase tracking-widest text-right mt-1 opacity-50">Generated by {msg.provider}</div>}
                        {regeneratingMessageId === msg.id && (
                          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="mt-3 pt-3 border-t border-white/10">
                            <div className="flex flex-col gap-2">
                              <input type="text" value={rerollGuidance} onChange={e => setRerollGuidance(e.target.value)} placeholder='Guide the rewrite (e.g. "Make it darker")' className="w-full bg-black/40 border border-white/10 rounded-lg p-2.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-emerald-500 placeholder:text-zinc-600" autoFocus
                                onKeyDown={e => { if (e.key === 'Enter') handleRegenerate(msg.id, rerollGuidance); if (e.key === 'Escape') { setRegeneratingMessageId(null); setRerollGuidance(''); } }} />
                              <div className="flex justify-end gap-2">
                                <button onClick={() => { setRegeneratingMessageId(null); setRerollGuidance(''); }} className="px-3 py-1.5 text-xs font-bold text-zinc-500 hover:text-white uppercase tracking-widest rounded-lg hover:bg-white/5">Cancel</button>
                                <button onClick={() => handleRegenerate(msg.id, rerollGuidance)} className="px-3 py-1.5 text-xs font-bold text-emerald-400 uppercase tracking-widest bg-emerald-500/10 hover:bg-emerald-500/20 rounded-lg flex items-center gap-1.5"><RefreshCw className="w-3 h-3" /> Confirm Reroll</button>
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              </motion.div>
            ))}
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

          {/* Audio controls overlay */}
          <AnimatePresence>
            {isPlaying && (
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }} className="absolute bottom-32 left-1/2 -translate-x-1/2 glass-panel px-4 sm:px-6 py-3 sm:py-4 rounded-[2rem] flex items-center gap-4 sm:gap-6 justify-center shadow-2xl border border-emerald-500/20 z-20 w-[90%] max-w-md">
                <div className="flex items-center gap-2 text-emerald-500 animate-pulse"><Volume2 className="w-4 h-4" /><span className="text-[10px] font-bold uppercase tracking-widest">Narrating...</span></div>
                <button onClick={togglePlayPause} className="w-10 h-10 sm:w-12 sm:h-12 bg-emerald-600 hover:bg-emerald-500 rounded-full flex items-center justify-center text-white transition-all"><Pause className="w-5 h-5 sm:w-6 sm:h-6" /></button>
                <button onClick={stopAudio} className="text-zinc-400 hover:text-red-400 transition-colors"><CloseIcon className="w-4 h-4 sm:w-5 sm:h-5" /></button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Input area — sticky on mobile */}
          <div className="p-4 sm:p-6 bg-black/20 backdrop-blur-2xl border-t border-white/5 sticky bottom-0">
            <AnimatePresence>
              {showRefineSettings && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden mb-4">
                  <div className="glass-panel p-4 rounded-2xl border border-white/5 space-y-3">
                    <div className="flex items-center justify-between"><h4 className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Refine Style Instructions</h4><button onClick={() => setShowRefineSettings(false)} className="text-zinc-500 hover:text-white"><CloseIcon className="w-4 h-4" /></button></div>
                    <textarea value={getSettings().customRefineInstructions || ''} onChange={e => saveSettings({ ...getSettings(), customRefineInstructions: e.target.value })} placeholder="e.g. 'Make it more poetic', 'Keep it concise'" className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:border-emerald-500/50 min-h-[80px] resize-y" />
                    <p className="text-xs text-zinc-500">These instructions guide the AI when you click REFINE.</p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            <AnimatePresence>
              {showVoiceSettings && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden mb-4">
                  <div className="glass-panel p-4 rounded-2xl border border-white/5 space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Voice Customizer</h4>
                      <div className="flex gap-2">{voicePresets.map(p => <button key={p.name} onClick={() => handleUpdateVoice({ voiceSettings: { ...profile.voiceSettings, pitch: p.pitch as any, speed: p.speed as any }, storyTone: p.tone })} className="px-2 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-[9px] font-bold text-zinc-400">{p.name}</button>)}</div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <label className="flex items-center justify-between text-[9px] font-bold text-zinc-500 uppercase tracking-widest"><span>Pitch: {profile.voiceSettings?.pitch}</span><Sliders className="w-3 h-3" /></label>
                          <div className="flex gap-2">{['Low', 'Normal', 'High'].map(p => <button key={p} onClick={() => handleUpdateVoice({ voiceSettings: { ...profile.voiceSettings, pitch: p as any } })} className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold transition-all ${profile.voiceSettings?.pitch === p ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-white/5 text-zinc-500 hover:text-zinc-300'}`}>{p}</button>)}</div>
                        </div>
                        <div className="space-y-2">
                          <label className="flex items-center justify-between text-[9px] font-bold text-zinc-500 uppercase tracking-widest"><span>Speed: {profile.voiceSettings?.speed}</span><Sliders className="w-3 h-3" /></label>
                          <div className="flex gap-2">{['Slow', 'Normal', 'Fast'].map(s => <button key={s} onClick={() => handleUpdateVoice({ voiceSettings: { ...profile.voiceSettings, speed: s as any } })} className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold transition-all ${profile.voiceSettings?.speed === s ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-white/5 text-zinc-500 hover:text-zinc-300'}`}>{s}</button>)}</div>
                        </div>
                      </div>
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <label className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest">Narrative Tone</label>
                          <input type="text" value={profile.storyTone} onChange={e => handleUpdateVoice({ storyTone: e.target.value })} placeholder="e.g. Dramatic, Epic..." className="w-full glass-input rounded-xl px-4 py-2 text-xs text-white placeholder-zinc-700 focus:ring-1 focus:ring-blue-500/30" />
                        </div>
                        <div className="p-3 rounded-xl bg-blue-500/5 border border-blue-500/10"><p className="text-[9px] text-blue-400/60 leading-relaxed italic">Tone affects both AI writing style and voice delivery.</p></div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="flex items-center gap-2 sm:gap-3 mb-4 px-2 flex-wrap">
              <button onClick={() => setInput(i => i.startsWith('*') && i.endsWith('*') ? i.slice(1, -1) : `*${i}*`)} className={`text-[10px] font-bold px-3 py-1 rounded-lg border transition-all tracking-widest ${input.startsWith('*') && input.endsWith('*') ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'glass-input text-zinc-500 border-transparent hover:text-zinc-300'}`}>ACTION</button>
              <button onClick={handleRefine} disabled={!input.trim() || isRefining} className={`text-[10px] font-bold px-3 py-1 rounded-l-lg border-y border-l transition-all tracking-widest flex items-center gap-2 ${isRefining ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'glass-input text-zinc-500 border-transparent hover:text-emerald-400'}`}>{isRefining ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />} REFINE</button>
              <button onClick={() => setShowRefineSettings(!showRefineSettings)} className={`text-[10px] font-bold px-2 py-1 rounded-r-lg border-y border-r transition-all ${showRefineSettings ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'glass-input text-zinc-500 border-transparent hover:text-emerald-400'}`}><Sliders className="w-3 h-3" /></button>
              <button onClick={handleSuggest} disabled={isSuggesting} className={`text-[10px] font-bold px-3 py-1 rounded-lg border transition-all tracking-widest flex items-center gap-2 ${isSuggesting ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'glass-input text-zinc-500 border-transparent hover:text-emerald-400'}`}>{isSuggesting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />} SUGGEST</button>
              <button onClick={() => setIsAutoRead(!isAutoRead)} className={`text-[10px] font-bold px-3 py-1 rounded-lg border transition-all tracking-widest flex items-center gap-2 ${isAutoRead ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'glass-input text-zinc-500 border-transparent hover:text-zinc-300'}`}>{isAutoRead ? <Volume2 className="w-3 h-3" /> : <VolumeX className="w-3 h-3" />} AUTO-READ</button>
              <div className="text-[10px] text-zinc-600 uppercase tracking-[0.2em] font-bold ml-auto hidden sm:block">Playing as: <span className="text-zinc-400">{profile.playerProfile?.name || 'The Protagonist'}</span></div>
            </div>

            <AnimatePresence>
              {error && (
                <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mb-3 bg-red-500/20 border border-red-500/30 text-red-400 text-xs px-4 py-2 rounded-xl flex items-center justify-between">
                  <span>{error}</span><button onClick={() => setError(null)} className="ml-3 hover:text-white text-lg leading-none">×</button>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="flex items-end gap-2 sm:gap-3">
              {isLiveMode && (
                <button onClick={() => setIsMicActive(m => !m)} className={`p-3 sm:p-4 rounded-2xl transition-all shadow-lg ${isMicActive ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'glass-input text-zinc-500 hover:text-white'}`}>
                  {isMicActive ? <Mic className="w-5 h-5 sm:w-6 sm:h-6" /> : <MicOff className="w-5 h-5 sm:w-6 sm:h-6" />}
                </button>
              )}
              <div className="flex-1 flex flex-col gap-2">
                <div className="relative">
                  <textarea value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }} placeholder={isLiveMode ? 'Type or speak…' : 'Describe an action or speak…'} className={`w-full glass-input rounded-2xl px-4 sm:px-6 py-3 sm:py-4 text-sm sm:text-base text-white placeholder-zinc-600 focus:ring-2 focus:ring-emerald-500/30 transition-all resize-none ${isInputExpanded ? 'h-64 sm:h-80' : 'h-[50px] max-h-40'}`} rows={1} />
                  <button onClick={() => setIsInputExpanded(e => !e)} className="absolute right-3 top-3 p-1.5 text-zinc-600 hover:text-emerald-400 transition-colors">{isInputExpanded ? <SkipBack className="w-4 h-4 rotate-90" /> : <Repeat className="w-4 h-4 rotate-90" />}</button>
                </div>
                <input type="text" value={directorNote} onChange={e => setDirectorNote(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleSend(); } }} placeholder="Director's Note / OOC (e.g. 'Act surprised', 'Change the subject')" className="w-full glass-input rounded-xl px-4 py-2 text-xs text-zinc-300 placeholder-zinc-600 focus:ring-1 focus:ring-emerald-500/30 transition-all" />
              </div>
              <button onClick={handleSend} disabled={(!input.trim() && !directorNote.trim()) || isTyping} className="p-3 sm:p-4 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-white rounded-2xl shadow-xl transition-all">
                <Send className="w-5 h-5 sm:w-6 sm:h-6" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <ConfirmModal state={confirmModal} onClose={() => setConfirmModal(s => ({ ...s, isOpen: false }))} />
    </div>
  );
}
