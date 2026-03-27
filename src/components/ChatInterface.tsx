import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useToast } from '../hooks/useToast';
import { Send, Mic, MicOff, Loader2, Edit3, Wand2, RotateCcw, Edit2, X as CloseIcon, Volume2, VolumeX, Sparkles, Pause, SkipBack, Repeat, Globe, Heart, Swords, Info, Book, Settings2, Sliders, RefreshCw, GitBranch, Phone, Package } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { useVoice } from '../hooks/useVoice';
import { useCodex } from '../hooks/useCodex';
import { useInventory } from '../hooks/useInventory';
import { useChatState } from '../hooks/useChatState';
import { useProfileUpdate } from '../hooks/useProfileUpdate';
import { useFirestoreSync } from '../hooks/useFirestoreSync';
import { InventorySidebar } from './chat/InventorySidebar';
import { CodexSidebar } from './chat/CodexSidebar';
import { useConversation } from '@elevenlabs/react';
import { CharacterProfile, refineInput, AppMode, generateTextReplyStream, suggestNextAction, generateId, CodexEntry, summarizeHistory } from '../lib/gemini';
import { getSettings, saveSettings } from '../lib/types';

export interface Message {
  id: string;
  role: 'user' | 'model';
  text: string;
  isSummarized?: boolean;
  provider?: string;
}

const parseMessageContent = (text: string, role: string) => {
  if (role === 'model') {
    const oocMatch = text.match(/<ooc>([\s\S]*?)<\/ooc>/i);
    if (oocMatch) {
      return {
        mainText: text.replace(/<ooc>[\s\S]*?<\/ooc>/i, '').trim(),
        oocText: oocMatch[1].trim()
      };
    }
  } else if (role === 'user') {
    const noteMatch = text.match(/\[Director's Note: ([\s\S]*?)\]/i);
    if (noteMatch) {
      return {
        mainText: text.replace(/\[Director's Note: [\s\S]*?\]/i, '').trim(),
        oocText: noteMatch[1].trim()
      };
    }
  }
  return { mainText: text, oocText: null };
};

interface ChatInterfaceProps {
  profile: CharacterProfile;
  avatarBase64: string;
  scenarioId: string;
  onEditCharacter: () => void;
  onCarryOver: () => void;
  onUpdateProfile: (profile: CharacterProfile) => void;
  onBranchScenario: (slicedMessages: Message[], codexEntries: CodexEntry[], storySummary: string) => void;
}

export function ChatInterface({ profile, avatarBase64, scenarioId, onEditCharacter, onCarryOver, onUpdateProfile, onBranchScenario }: ChatInterfaceProps) {
  const { messages, setMessages, addMessage, updateMessage, storySummary, setStorySummary, updateSummary, isLoaded } = useChatState(scenarioId);
  const { user, saveMessage, saveSummary } = useFirestoreSync();
  const [showCodex, setShowCodex] = useState(false);
  const [showInventory, setShowInventory] = useState(false);
  const [newCodexEntry, setNewCodexEntry] = useState<Partial<CodexEntry>>({ category: 'Lore' });
  const {
    isAutoProfileEnabled,
    setIsAutoProfileEnabled,
    isUpdatingProfile,
    handleAutoUpdateProfile
  } = useProfileUpdate(profile, onUpdateProfile);

  const {
    codexEntries,
    setCodexEntries,
    isAutoPopulatingCodex,
    isAutoCodexEnabled,
    setIsAutoCodexEnabled,
    isRefiningCodexEntry,
    isGeneratingCodexImage,
    handleAutoPopulateCodex,
    handleRefineCodexEntry: refineCodexEntryHook,
    handleGenerateCodexImage
  } = useCodex(scenarioId, profile, messages);

  const {
    isScanningInventory,
    isAutoInventoryEnabled,
    setIsAutoInventoryEnabled,
    isGeneratingItemImage,
    handleGenerateItemImage,
    handleAutoUpdateInventory
  } = useInventory(profile, onUpdateProfile);
  // Modal State
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type: 'delete' | 'reset' | 'rewind' | null;
    targetId: string | null;
  }>({
    isOpen: false,
    title: '',
    message: '',
    type: null,
    targetId: null,
  });

  const getRelationshipPercentage = (relationship: string) => {
    const rel = relationship.toLowerCase();
    if (rel.includes('stranger')) return 5;
    if (rel.includes('acquaintance')) return 20;
    if (rel.includes('friend')) return 50;
    if (rel.includes('ally') || rel.includes('allies')) return 75;
    if (rel.includes('lover')) return 95;
    if (rel.includes('rival')) return 40;
    if (rel.includes('enemy')) return 0;
    return 10;
  };

  const handleConfirmAction = async () => {
    if (!confirmModal.type) return;

    if (confirmModal.type === 'delete' && confirmModal.targetId) {
      setCodexEntries(prev => prev.filter(e => e.id !== confirmModal.targetId));
    } else if (confirmModal.type === 'reset') {
      setMessages([]);
      setCodexEntries([]);
      if (user) {
        // We don't have a bulk delete for subcollections in client SDK easily,
        // but we can at least clear the scenario metadata or handle it.
        // For now, we'll just clear local state and let the user delete the scenario from library if they want a full wipe.
      }
    } else if (confirmModal.type === 'rewind' && confirmModal.targetId) {
      const index = messages.findIndex(m => m.id === confirmModal.targetId);
      if (index !== -1) {
        const newMessages = messages.slice(0, index + 1).map(m => ({ ...m, isSummarized: false }));
        setMessages(newMessages);
        setStorySummary('');
        if (user) {
          await saveSummary(scenarioId, '');
          // In a real app, we'd delete the messages after the rewind point in Firestore too.
        }
      }
    }

    setConfirmModal(prev => ({ ...prev, isOpen: false, type: null, targetId: null }));
  };

  const [input, setInput] = useState('');
  const [directorNote, setDirectorNote] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isRefining, setIsRefining] = useState(false);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [isAutoRead, setIsAutoRead] = useState(true);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editInput, setEditInput] = useState('');
  const [regeneratingMessageId, setRegeneratingMessageId] = useState<string | null>(null);
  const [rerollGuidance, setRerollGuidance] = useState('');
  const [isLiveMode, setIsLiveMode] = useState(false);
  const [isMicActive, setIsMicActive] = useState(false);
  const { toastSuccess, toastError } = useToast();
  const [isInputExpanded, setIsInputExpanded] = useState(false);
  const [showVoiceSettings, setShowVoiceSettings] = useState(false);
  const [showRefineSettings, setShowRefineSettings] = useState(false);
  const [showModeDetails, setShowModeDetails] = useState(false);

  // ElevenLabs Conversational AI
  const conversation = useConversation({
    onConnect: () => {
      setIsMicActive(true);
      setIsLiveMode(true);
    },
    onDisconnect: () => {
      setIsMicActive(false);
      setIsLiveMode(false);
    },
    onMessage: (message: any) => {
      if (message.source === 'user' && message.isFinal) {
        const userMsg: Message = {
          id: generateId(),
          role: 'user',
          text: message.message,
        };
        setMessages(prev => [...prev, userMsg]);
      } else if (message.source === 'ai') {
        const aiMsg: Message = {
          id: generateId(),
          role: 'model',
          text: message.message,
        };
        setMessages(prev => [...prev, aiMsg]);
      }
    },
    onError: (error: any) => {
      console.error('ElevenLabs Error:', error);
      setIsLiveMode(false);
      setIsMicActive(false);
    },
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const {
    isPlaying,
    handleReadAloud,
    togglePause,
    stopAudio
  } = useVoice(profile.voiceName || 'Kore', profile.voiceSettings, profile.storyTone || '');

  const [error, setError] = useState<string | null>(null);

  const handleRefine = async () => {
    if (!input.trim() || isRefining) return;
    setIsRefining(true);
    setError(null);
    try {
      const history = messages.map(m => ({ role: m.role, parts: [{ text: m.text }] }));
      const settings = getSettings();
      const refined = await refineInput(input, profile, history, settings.customRefineInstructions);
      if (refined) {
        setInput(refined);
        toastSuccess("Input refined");
      } else {
        setError("No refinement received from AI. Check your API key.");
        toastError("No refinement received");
      }
    } catch (err: any) {
      console.error("Refinement Error:", err);
      setError(err.message || "Failed to refine input. Check your connection or API key.");
      toastError(`Refinement Error: ${err.message || 'Unknown error'}`);
    } finally {
      setIsRefining(false);
    }
  };

  const handleSuggest = async () => {
    if (isSuggesting) return;
    setIsSuggesting(true);
    setError(null);
    try {
      const history = messages.map(m => ({ role: m.role, parts: [{ text: m.text }] }));
      const suggestion = await suggestNextAction(history, profile);
      if (suggestion) {
        setInput(suggestion);
        toastSuccess("AI suggested an action");
      } else {
        setError("No suggestion received from AI. Check your API key.");
        toastError("No suggestion received");
      }
    } catch (err: any) {
      console.error("Suggestion Error:", err);
      setError(err.message || "Failed to get suggestion. Check your connection or API key.");
      toastError(`Suggestion Error: ${err.message || 'Unknown error'}`);
    } finally {
      setIsSuggesting(false);
    }
  };

  const handleRewind = (messageId: string) => {
    setConfirmModal({
      isOpen: true,
      title: 'Rewind Narrative',
      message: 'Are you sure you want to rewind the story to this point? All subsequent messages will be deleted.',
      type: 'rewind',
      targetId: messageId
    });
  };

  const handleBranch = (messageId: string) => {
    const index = messages.findIndex(m => m.id === messageId);
    if (index === -1) return;
    const slicedMessages = messages.slice(0, index + 1);
    onBranchScenario(slicedMessages, codexEntries, storySummary);
  };

  const startEditing = (message: Message) => {
    setEditingMessageId(message.id);
    setEditInput(message.text);
  };

  const cancelEditing = () => {
    setEditingMessageId(null);
    setEditInput('');
  };

  const generateReply = async (baseMessages: Message[], userInput: string, userMsgId: string) => {
    setIsTyping(true);
    try {
      let currentSummary = storySummary;
      let unsummarizedMessages = baseMessages.filter(m => !m.isSummarized);
      
      if (unsummarizedMessages.length > 10) {
        const toSummarize = unsummarizedMessages.slice(0, unsummarizedMessages.length - 10);
        const historyToSummarize = toSummarize.map(m => ({ role: m.role, parts: [{ text: m.text }] }));
        
        currentSummary = await summarizeHistory(historyToSummarize, currentSummary);
        await updateSummary(currentSummary);
        
        const summarizedIds = new Set(toSummarize.map(m => m.id));
        setMessages(prev => prev.map(m => summarizedIds.has(m.id) ? { ...m, isSummarized: true } : m));
        
        unsummarizedMessages = unsummarizedMessages.slice(-10);
      }

      const historyForAi = unsummarizedMessages.map(m => ({ role: m.role, parts: [{ text: m.text }] }));
      const aiMessageId = generateId();
      const aiMessage: Message = { id: aiMessageId, role: 'model', text: '', provider: getSettings().activeTextProvider };
      setMessages(prev => [...prev, aiMessage]);
      
      let fullReply = '';
      let sentenceBuffer = '';
      let isInsideOoc = false;
      let lastUpdateTime = Date.now();
      
      const stream = generateTextReplyStream(historyForAi, profile, userInput, codexEntries, currentSummary);
      
      for await (const chunk of stream) {
        fullReply += chunk;
        
        let processChunk = chunk;
        if (fullReply.includes('<ooc>') && !fullReply.includes('</ooc>')) {
          isInsideOoc = true;
          processChunk = '';
        } else if (fullReply.includes('</ooc>') && isInsideOoc) {
          isInsideOoc = false;
          processChunk = '';
        } else if (isInsideOoc) {
          processChunk = '';
        }

        sentenceBuffer += processChunk;
        
        if (Date.now() - lastUpdateTime > 100) {
          setMessages(prev => prev.map(m => m.id === aiMessageId ? { ...m, text: fullReply } : m));
          lastUpdateTime = Date.now();
        }
      }
      
      const finalAiMessage = { ...aiMessage, text: fullReply };
      setMessages(prev => prev.map(m => m.id === aiMessageId ? finalAiMessage : m));
      if (user) {
        await saveMessage(scenarioId, finalAiMessage);
      }
      
      if (isAutoRead && sentenceBuffer.trim() && !isLiveMode) {
        handleReadAloud(sentenceBuffer);
      }

      const historyWithReply = [
        ...historyForAi,
        { role: 'user', parts: [{ text: userInput }] },
        { role: 'model', parts: [{ text: fullReply }] }
      ];
      const messagesWithReply = [...baseMessages, { id: userMsgId, role: 'user', text: userInput }, { ...aiMessage, text: fullReply }];

      if (isAutoCodexEnabled) handleAutoPopulateCodex(false, historyWithReply);
      if (isAutoInventoryEnabled) handleAutoUpdateInventory(messagesWithReply, false);
      if (isAutoProfileEnabled) handleAutoUpdateProfile(messagesWithReply, false, historyWithReply);
    } catch (err: any) {
      console.error(err);
      toastError(`Narrative Error: ${err.message || 'Unknown error'}`);
      setMessages(prev => [...prev, {
        id: generateId(),
        role: 'model',
        text: `*The narrative stream falters: ${err.message || 'Please try again.'}*`,
        provider: getSettings().activeTextProvider
      }]);
    } finally {
      setIsTyping(false);
    }
  };

  const saveEdit = async (messageId: string) => {
    if (!editInput.trim() || isTyping) return;
    const index = messages.findIndex(m => m.id === messageId);
    if (index === -1) return;
    const message = messages[index];
    
    if (message.role === 'user') {
      const baseMessages = messages.slice(0, index);
      const updatedUserMessage = { ...message, text: editInput };
      
      // We need to handle the rewind/regenerate logic here.
      // For now, we'll just update the message and regenerate.
      await updateMessage(updatedUserMessage);
      setEditingMessageId(null);
      setEditInput('');
      
      await generateReply(baseMessages, editInput, message.id);
    } else {
      const updatedModelMessage = { ...message, text: editInput };
      await updateMessage(updatedModelMessage);
      setEditingMessageId(null);
      setEditInput('');
    }
  };

  const handleRegenerate = async (messageId: string, guidance: string) => {
    if (isTyping || !profile) return;
    
    const index = messages.findIndex(m => m.id === messageId);
    if (index === -1) return;

    const slicedHistory = messages.slice(0, index);
    const lastUserIndex = slicedHistory.map(m => m.role).lastIndexOf('user');
    if (lastUserIndex === -1) return;

    const historyBeforeUser = slicedHistory.slice(0, lastUserIndex);
    const lastUserMessage = slicedHistory[lastUserIndex];
    
    let userInput = lastUserMessage.text;
    if (guidance.trim()) {
      userInput += `\n\n[Director's Note for AI: ${guidance.trim()}]`;
    }

    setMessages(slicedHistory);
    setRegeneratingMessageId(null);
    setRerollGuidance('');

    await generateReply(historyBeforeUser, userInput, lastUserMessage.id);
  };

  const handleSendText = async (overrideText?: string) => {
    let textToSend = overrideText || input;
    if (directorNote.trim()) {
      if (textToSend.trim()) {
        textToSend += `\n\n[Director's Note: ${directorNote.trim()}]`;
      } else {
        textToSend = `[Director's Note: ${directorNote.trim()}]`;
      }
    }
    
    if (!textToSend.trim() || isTyping) return;
    const userMsgId = generateId();
    const userMsg: Message = { id: userMsgId, role: 'user', text: textToSend };
    await addMessage(userMsg);
    setInput('');
    setDirectorNote('');
    
    await generateReply(messages, textToSend, userMsgId);
  };



  const toggleLiveMode = async () => {
    if (isLiveMode || conversation.status === 'connected') {
      await conversation.endSession();
      setIsLiveMode(false);
      return;
    }

    const settings = getSettings();
    const agentId = settings.elevenLabsAgentId || process.env.VITE_ELEVENLABS_AGENT_ID;
    const apiKey = settings.elevenLabsApiKey || process.env.VITE_ELEVENLABS_API_KEY;

    if (!agentId) {
      alert("Please configure an ElevenLabs Agent ID in Settings to use Live Mode.");
      return;
    }

    try {
      // Request microphone permission explicitly if needed
      await navigator.mediaDevices.getUserMedia({ audio: true });
      
      await (conversation as any).startSession({
        agentId: agentId,
        clientKey: apiKey,
      });
      setIsLiveMode(true);
    } catch (err) {
      console.error("Failed to start ElevenLabs session:", err);
      alert("Failed to start voice session. Check your microphone permissions and API key.");
    }
  };

  const toggleMic = () => {
    if (isMicActive) {
      setIsMicActive(false);
    } else {
      setIsMicActive(true);
    }
  };

  const handleRefineCodexEntry = async () => {
    if (isRefiningCodexEntry || !newCodexEntry.title || !newCodexEntry.content) return;
    const refined = await refineCodexEntryHook(newCodexEntry);
    if (refined) {
      setNewCodexEntry(refined);
    }
  };

  const handleUpdateVoice = (updates: Partial<CharacterProfile>) => {
    onUpdateProfile({ ...profile, ...updates });
  };

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
            <div className="flex flex-col gap-1 mt-1">
              <div className="flex items-center gap-2 text-[8px] sm:text-[10px] uppercase tracking-[0.2em] font-bold text-zinc-500">
                <span className="text-emerald-500/80">{profile.storyTone}</span>
                <span className="w-0.5 h-0.5 sm:w-1 sm:h-1 bg-zinc-800 rounded-full" />
                <span>{profile.relationship}</span>
              </div>
              <div className="w-24 sm:w-32 h-1 bg-white/5 rounded-full overflow-hidden relative">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: `${getRelationshipPercentage(profile.relationship)}%` }}
                  className={`absolute inset-y-0 left-0 rounded-full ${
                    profile.relationship.toLowerCase().includes('enemy') ? 'bg-red-500' :
                    profile.relationship.toLowerCase().includes('rival') ? 'bg-amber-500' :
                    profile.relationship.toLowerCase().includes('lover') ? 'bg-pink-500' :
                    'bg-emerald-500'
                  } shadow-[0_0_8px_rgba(16,185,129,0.3)]`}
                />
              </div>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1 sm:gap-3">
          <button
            onClick={() => setShowCodex(!showCodex)}
            className={`p-2 rounded-xl transition-all ${showCodex ? 'bg-emerald-500/20 text-emerald-400' : 'text-zinc-500 hover:text-white hover:bg-white/5'}`}
            title="World Codex"
          >
            <Book className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
          {profile.mode === AppMode.GAME && (
            <button
              onClick={() => setShowInventory(!showInventory)}
              className={`p-2 rounded-xl transition-all ${showInventory ? 'bg-purple-500/20 text-purple-400' : 'text-zinc-500 hover:text-white hover:bg-white/5'}`}
              title="Inventory"
            >
              <Package className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
          )}
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
            onClick={() => setShowVoiceSettings(!showVoiceSettings)}
            className={`p-2 rounded-xl transition-all ${
              showVoiceSettings ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' : 'text-zinc-500 hover:text-blue-400 hover:bg-white/5'
            }`}
            title="Voice Settings"
          >
            <Settings2 className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
          <button
            onClick={toggleLiveMode}
            className={`px-3 py-2 sm:px-6 sm:py-2.5 rounded-xl text-[10px] sm:text-sm font-bold flex items-center gap-2 sm:gap-3 transition-all ${
              isLiveMode ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shadow-lg shadow-emerald-500/10' : 'glass-input text-zinc-400 hover:text-white'
            }`}
          >
            {isLiveMode ? (
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${conversation.isSpeaking ? 'bg-blue-500 animate-pulse' : 'bg-emerald-500'}`} />
                <span className="text-emerald-400">AGENT CONNECTED</span>
              </div>
            ) : (
              <><Phone className="w-3 h-3 sm:w-4 sm:h-4" /> START CALL</>
            )}
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden relative">
        {/* Inventory Sidebar */}
        <AnimatePresence>
          {showInventory && profile.mode === AppMode.GAME && (
            <InventorySidebar
              profile={profile}
              onUpdateProfile={onUpdateProfile}
              messages={messages}
              setShowInventory={setShowInventory}
              isAutoInventoryEnabled={isAutoInventoryEnabled}
              setIsAutoInventoryEnabled={setIsAutoInventoryEnabled}
              isScanningInventory={isScanningInventory}
              handleAutoUpdateInventory={handleAutoUpdateInventory}
              isGeneratingItemImage={isGeneratingItemImage}
              handleGenerateItemImage={handleGenerateItemImage}
            />
          )}
        </AnimatePresence>

        {/* Codex Sidebar */}
        <AnimatePresence>
          {showCodex && (
            <CodexSidebar
              codexEntries={codexEntries}
              setCodexEntries={setCodexEntries}
              messages={messages}
              setShowCodex={setShowCodex}
              isAutoProfileEnabled={isAutoProfileEnabled}
              setIsAutoProfileEnabled={setIsAutoProfileEnabled}
              isAutoCodexEnabled={isAutoCodexEnabled}
              setIsAutoCodexEnabled={setIsAutoCodexEnabled}
              isAutoPopulatingCodex={isAutoPopulatingCodex}
              handleAutoPopulateCodex={handleAutoPopulateCodex}
              isUpdatingProfile={isUpdatingProfile}
              handleAutoUpdateProfile={handleAutoUpdateProfile}
              isRefiningCodexEntry={isRefiningCodexEntry}
              handleRefineCodexEntry={handleRefineCodexEntry}
              isGeneratingCodexImage={isGeneratingCodexImage}
              handleGenerateCodexImage={handleGenerateCodexImage}
              newCodexEntry={newCodexEntry}
              setNewCodexEntry={setNewCodexEntry}
              setConfirmModal={setConfirmModal}
            />
          )}
        </AnimatePresence>

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
                      <>
                        <button onClick={() => {
                          const { mainText } = parseMessageContent(msg.text, msg.role);
                          handleReadAloud(mainText);
                        }} className="p-1.5 glass-panel rounded-lg text-zinc-500 hover:text-blue-400 transition-colors" title="Read aloud"><Volume2 className="w-3.5 h-3.5" /></button>
                        <button onClick={() => setRegeneratingMessageId(msg.id)} className="p-1.5 glass-panel rounded-lg text-zinc-500 hover:text-emerald-400 transition-colors" title="Regenerate message"><RefreshCw className="w-3.5 h-3.5" /></button>
                        <button onClick={() => handleBranch(msg.id)} className="p-1.5 glass-panel rounded-lg text-zinc-500 hover:text-purple-400 transition-colors" title="Branch scenario from here"><GitBranch className="w-3.5 h-3.5" /></button>
                      </>
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
                      (() => {
                        const { mainText, oocText } = parseMessageContent(msg.text, msg.role);
                        return (
                          <div className="flex flex-col gap-3">
                            {mainText && (
                              <div className={`prose prose-invert max-w-none text-[15px] leading-relaxed ${msg.role === 'model' ? 'narrative-text' : ''}`}>
                                <ReactMarkdown>{mainText}</ReactMarkdown>
                              </div>
                            )}
                            {oocText && (
                              <div className={`text-sm p-3 rounded-xl border ${msg.role === 'user' ? 'bg-emerald-700/30 border-emerald-500/30 text-emerald-100' : 'bg-zinc-800/50 border-zinc-700/50 text-zinc-300'}`}>
                                <div className="text-xs font-bold uppercase tracking-wider mb-1 opacity-70">
                                  {msg.role === 'user' ? "Director's Note" : "OOC Reply"}
                                </div>
                                <div className="prose prose-invert max-w-none text-sm">
                                  <ReactMarkdown>{oocText}</ReactMarkdown>
                                </div>
                              </div>
                            )}
                            {msg.role === 'model' && msg.provider && (
                              <div className="text-[9px] text-zinc-500 uppercase tracking-widest text-right mt-1 opacity-50">
                                Generated by {msg.provider}
                              </div>
                            )}
                            {regeneratingMessageId === msg.id && (
                              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="mt-3 pt-3 border-t border-white/10">
                                <div className="flex flex-col gap-2">
                                  <input
                                    type="text"
                                    value={rerollGuidance}
                                    onChange={(e) => setRerollGuidance(e.target.value)}
                                    placeholder='Optional: Guide the rewrite (e.g., "Make it more aggressive", "Focus on the environment").'
                                    className="w-full bg-black/40 border border-white/10 rounded-lg p-2.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-emerald-500 placeholder:text-zinc-600"
                                    autoFocus
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        handleRegenerate(msg.id, rerollGuidance);
                                      } else if (e.key === 'Escape') {
                                        setRegeneratingMessageId(null);
                                        setRerollGuidance('');
                                      }
                                    }}
                                  />
                                  <div className="flex justify-end gap-2 mt-1">
                                    <button onClick={() => { setRegeneratingMessageId(null); setRerollGuidance(''); }} className="px-3 py-1.5 text-xs font-bold text-zinc-500 hover:text-white uppercase tracking-widest rounded-lg hover:bg-white/5 transition-colors">Cancel</button>
                                    <button onClick={() => handleRegenerate(msg.id, rerollGuidance)} className="px-3 py-1.5 text-xs font-bold text-emerald-400 hover:text-emerald-300 uppercase tracking-widest bg-emerald-500/10 hover:bg-emerald-500/20 rounded-lg transition-colors flex items-center gap-1.5">
                                      <RefreshCw className="w-3 h-3" />
                                      Confirm Reroll
                                    </button>
                                  </div>
                                </div>
                              </motion.div>
                            )}
                          </div>
                        );
                      })()
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
            {isPlaying && (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                className="absolute bottom-32 left-1/2 -translate-x-1/2 glass-panel px-4 sm:px-6 py-3 sm:py-4 rounded-[2rem] flex flex-col gap-3 shadow-2xl border border-emerald-500/20 z-20 w-[90%] max-w-md"
              >
                <div className="flex items-center gap-4 sm:gap-6 justify-center">
                  <div className="flex items-center gap-2 text-emerald-500 animate-pulse">
                    <Volume2 className="w-4 h-4" />
                    <span className="text-[10px] font-bold uppercase tracking-widest">Narrating...</span>
                  </div>
                  <button 
                    onClick={togglePause} 
                    className="w-10 h-10 sm:w-12 sm:h-12 bg-emerald-600 hover:bg-emerald-500 rounded-full flex items-center justify-center text-white transition-all shadow-lg shadow-emerald-900/20"
                  >
                    <Pause className="w-5 h-5 sm:w-6 sm:h-6" />
                  </button>
                  <button onClick={stopAudio} className="text-zinc-400 hover:text-red-400 transition-colors" title="Stop">
                    <CloseIcon className="w-4 h-4 sm:w-5 sm:h-5" />
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Input Area */}
          <div className="p-4 sm:p-6 bg-black/20 backdrop-blur-2xl border-t border-white/5">

            <AnimatePresence>
              {showRefineSettings && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden mb-4"
                >
                  <div className="glass-panel p-4 rounded-2xl border border-white/5 space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Refine Style Instructions</h4>
                      <button onClick={() => setShowRefineSettings(false)} className="text-zinc-500 hover:text-white">
                        <CloseIcon className="w-4 h-4" />
                      </button>
                    </div>
                    <textarea
                      value={getSettings().customRefineInstructions || ''}
                      onChange={(e) => {
                        const newSettings = { ...getSettings(), customRefineInstructions: e.target.value };
                        saveSettings(newSettings);
                        // Force re-render to reflect changes
                        setShowRefineSettings(true);
                      }}
                      placeholder="e.g. 'Make it more poetic', 'Keep it concise', 'Use a darker tone'"
                      className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:border-emerald-500/50 min-h-[80px] resize-y"
                    />
                    <p className="text-xs text-zinc-500">These instructions guide the AI when you click the REFINE button.</p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence>
              {showVoiceSettings && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden mb-4"
                >
                  <div className="glass-panel p-4 rounded-2xl border border-white/5 space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Voice Customizer</h4>
                      <div className="flex gap-2">
                        {voicePresets.map(preset => (
                          <button
                            key={preset.name}
                            onClick={() => handleUpdateVoice({
                              voiceSettings: { ...profile.voiceSettings, pitch: preset.pitch, speed: preset.speed },
                              storyTone: preset.tone
                            })}
                            className="px-2 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-[9px] font-bold text-zinc-400 transition-all"
                          >
                            {preset.name}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <label className="flex items-center justify-between text-[9px] font-bold text-zinc-500 uppercase tracking-widest">
                            <span>Pitch: {profile.voiceSettings?.pitch}</span>
                            <Sliders className="w-3 h-3" />
                          </label>
                          <div className="flex gap-2">
                            {['Low', 'Normal', 'High'].map(p => (
                              <button
                                key={p}
                                onClick={() => handleUpdateVoice({ voiceSettings: { ...profile.voiceSettings, pitch: p } })}
                                className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold transition-all ${profile.voiceSettings?.pitch === p ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-white/5 text-zinc-500 hover:text-zinc-300'}`}
                              >
                                {p}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="space-y-2">
                          <label className="flex items-center justify-between text-[9px] font-bold text-zinc-500 uppercase tracking-widest">
                            <span>Speed: {profile.voiceSettings?.speed}</span>
                            <Sliders className="w-3 h-3" />
                          </label>
                          <div className="flex gap-2">
                            {['Slow', 'Normal', 'Fast'].map(s => (
                              <button
                                key={s}
                                onClick={() => handleUpdateVoice({ voiceSettings: { ...profile.voiceSettings, speed: s } })}
                                className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold transition-all ${profile.voiceSettings?.speed === s ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-white/5 text-zinc-500 hover:text-zinc-300'}`}
                              >
                                {s}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <div className="space-y-2">
                          <label className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest">Narrative Tone</label>
                          <input
                            type="text"
                            value={profile.storyTone}
                            onChange={(e) => handleUpdateVoice({ storyTone: e.target.value })}
                            placeholder="e.g. Dramatic, Epic, Whispered..."
                            className="w-full glass-input rounded-xl px-4 py-2 text-xs text-white placeholder-zinc-700 focus:ring-1 focus:ring-blue-500/30"
                          />
                        </div>
                        
                        <div className="p-3 rounded-xl bg-blue-500/5 border border-blue-500/10">
                          <p className="text-[9px] text-blue-400/60 leading-relaxed italic">
                            Tip: The tone affects both the AI's writing style and the emotional delivery of the voice.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

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
                className={`text-[9px] sm:text-[10px] font-bold px-2 sm:px-3 py-1 rounded-l-lg border-y border-l transition-all tracking-widest flex items-center gap-1 sm:gap-2 ${
                  isRefining ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'glass-input text-zinc-500 border-transparent hover:text-emerald-400'
                }`}
              >
                {isRefining ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
                REFINE
              </button>
              <button
                onClick={() => setShowRefineSettings(!showRefineSettings)}
                className={`text-[9px] sm:text-[10px] font-bold px-2 py-1 rounded-r-lg border-y border-r transition-all tracking-widest flex items-center ${
                  showRefineSettings ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'glass-input text-zinc-500 border-transparent hover:text-emerald-400'
                }`}
                title="Refine Settings"
              >
                <Sliders className="w-3 h-3" />
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
              {error && (
                <div className="absolute -top-10 left-0 right-0 bg-red-500/20 border border-red-500/30 text-red-400 text-[10px] px-3 py-1 rounded-lg backdrop-blur-sm animate-in fade-in slide-in-from-bottom-2">
                  {error}
                  <button onClick={() => setError(null)} className="ml-2 hover:text-white">×</button>
                </div>
              )}
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
              <div className="flex-1 flex flex-col gap-2 relative group">
                <div className="relative">
                  <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendText(); } }}
                    placeholder={isLiveMode ? "Type or speak..." : "Describe an action or speak..."}
                    className={`w-full glass-input rounded-2xl px-4 sm:px-6 py-3 sm:py-4 text-sm sm:text-base text-white placeholder-zinc-600 focus:ring-2 focus:ring-emerald-500/30 transition-all resize-none ${isInputExpanded ? 'h-64 sm:h-80' : 'h-[50px] max-h-40'}`}
                    rows={1}
                  />
                  <button 
                    onClick={() => setIsInputExpanded(!isInputExpanded)}
                    className="absolute right-3 top-3 p-1.5 text-zinc-600 hover:text-emerald-400 transition-colors"
                    title={isInputExpanded ? "Collapse" : "Expand"}
                  >
                    {isInputExpanded ? <SkipBack className="w-4 h-4 rotate-90" /> : <Repeat className="w-4 h-4 rotate-90" />}
                  </button>
                </div>
                <input
                  type="text"
                  value={directorNote}
                  onChange={(e) => setDirectorNote(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleSendText(); } }}
                  placeholder="Director's Note / OOC (e.g. 'Act surprised', 'Change the subject')"
                  className="w-full glass-input rounded-xl px-4 py-2 text-xs text-zinc-300 placeholder-zinc-600 focus:ring-1 focus:ring-emerald-500/30 transition-all"
                />
              </div>
              <button onClick={() => handleSendText()} disabled={(!input.trim() && !directorNote.trim()) || isTyping} className="p-3 sm:p-4 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-white rounded-2xl shadow-xl transition-all">
                <Send className="w-5 h-5 sm:w-6 sm:h-6" />
              </button>
            </div>
          </div>
        </div>
      </div>
      {/* Confirmation Modal */}
  <AnimatePresence>
    {confirmModal.isOpen && (
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
          className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        />
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          className="relative w-full max-w-md glass-panel p-8 rounded-[2rem] border border-white/10 shadow-2xl"
        >
          <h3 className="text-2xl font-serif text-white mb-2">{confirmModal.title}</h3>
          <p className="text-zinc-400 mb-8 leading-relaxed">{confirmModal.message}</p>
          <div className="flex gap-4">
            <button
              onClick={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
              className="flex-1 px-6 py-3 rounded-xl font-bold text-zinc-400 hover:text-white hover:bg-white/5 transition-all uppercase tracking-widest text-xs"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirmAction}
              className="flex-1 px-6 py-3 rounded-xl font-bold bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-all uppercase tracking-widest text-xs border border-red-500/20"
            >
              Confirm
            </button>
          </div>
        </motion.div>
      </div>
    )}
  </AnimatePresence>
</div>
);
}
