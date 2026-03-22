import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { get, set } from 'idb-keyval';
import { Send, Mic, MicOff, Loader2, Edit3, Wand2, RotateCcw, Edit2, X as CloseIcon, Volume2, VolumeX, Sparkles, Pause, SkipBack, Repeat, Globe, Heart, Swords, Info, Book, Plus, Trash2, Settings2, Sliders, RefreshCw, GitBranch, Phone } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { useConversation } from '@elevenlabs/react';
import { CharacterProfile, refineInput, generateSpeech, AppMode, generateTextReplyStream, suggestNextAction, generateId, CodexEntry, extractCodexEntries, refineCodexEntry, summarizeHistory, getSettings } from '../lib/gemini';

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

import { STORAGE_KEYS } from '../constants';

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
  const [messages, setMessages] = useState<Message[]>([]);
  const [storySummary, setStorySummary] = useState<string>('');
  const [isLoaded, setIsLoaded] = useState(false);
  const [codexEntries, setCodexEntries] = useState<CodexEntry[]>([]);
  const [showCodex, setShowCodex] = useState(false);
  const [newCodexEntry, setNewCodexEntry] = useState<Partial<CodexEntry>>({ category: 'Lore' });
  const [isAddingCodex, setIsAddingCodex] = useState(false);
  const [isAutoPopulatingCodex, setIsAutoPopulatingCodex] = useState(false);
  const [isAutoCodexEnabled, setIsAutoCodexEnabled] = useState(false);
  const [isRefiningCodexEntry, setIsRefiningCodexEntry] = useState(false);

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

  const handleConfirmAction = () => {
    if (!confirmModal.type) return;

    if (confirmModal.type === 'delete' && confirmModal.targetId) {
      setCodexEntries(prev => prev.filter(e => e.id !== confirmModal.targetId));
    } else if (confirmModal.type === 'reset') {
      setMessages([]);
      setCodexEntries([]);
    } else if (confirmModal.type === 'rewind' && confirmModal.targetId) {
      const index = messages.findIndex(m => m.id === confirmModal.targetId);
      if (index !== -1) {
        setMessages(messages.slice(0, index));
      }
    }

    setConfirmModal(prev => ({ ...prev, isOpen: false, type: null, targetId: null }));
  };

  useEffect(() => {
    const loadData = async () => {
      try {
        // Load Messages
        let saved = await get(STORAGE_KEYS.SCENARIO_MESSAGES(scenarioId));
        if (!saved) {
          const localSaved = localStorage.getItem(STORAGE_KEYS.SCENARIO_MESSAGES(scenarioId));
          if (localSaved) {
            saved = JSON.parse(localSaved);
            await set(STORAGE_KEYS.SCENARIO_MESSAGES(scenarioId), saved);
          }
        }
        if (saved) {
          const seen = new Set();
          const clean = saved.filter((m: any) => {
            if (!m.id || seen.has(m.id)) return false;
            seen.add(m.id);
            return true;
          });
          setMessages(clean);
        }

        // Load Codex
        const savedCodex = await get(STORAGE_KEYS.SCENARIO_CODEX(scenarioId));
        if (savedCodex) {
          setCodexEntries(savedCodex);
        }

        // Load Summary
        const savedSummary = await get(STORAGE_KEYS.SCENARIO_SUMMARY(scenarioId));
        if (savedSummary) {
          setStorySummary(savedSummary);
        }
      } catch (e) {
        console.error("Failed to load data", e);
      } finally {
        setIsLoaded(true);
      }
    };
    loadData();
  }, [scenarioId]);

  const [input, setInput] = useState('');
  const [directorNote, setDirectorNote] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isRefining, setIsRefining] = useState(false);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [isAutoRead, setIsAutoRead] = useState(true);
  const [audioQueue, setAudioQueue] = useState<AudioBuffer[]>([]);
  const [isProcessingSpeech, setIsProcessingSpeech] = useState(false);
  const speechQueue = useRef<string[]>([]);
  const nextStartTimeRef = useRef<number>(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentAudioSource, setCurrentAudioSource] = useState<AudioBufferSourceNode | null>(null);
  const [isManualPause, setIsManualPause] = useState(false);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editInput, setEditInput] = useState('');
  const [regeneratingMessageId, setRegeneratingMessageId] = useState<string | null>(null);
  const [rerollGuidance, setRerollGuidance] = useState('');
  const [isLiveMode, setIsLiveMode] = useState(false);
  const [isMicActive, setIsMicActive] = useState(false);
  const audioCache = useRef<Map<string, string>>(new Map());
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
  const playbackAudioContextRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    let interval: any;
    if (isPlaying && playbackAudioContextRef.current) {
      interval = setInterval(() => {
        // playbackTime removed
      }, 100);
    }
    return () => clearInterval(interval);
  }, [isPlaying]);

  useEffect(() => {
    if (isLoaded) {
      set(STORAGE_KEYS.SCENARIO_MESSAGES(scenarioId), messages).catch(e => {
        console.error("Failed to save messages to IndexedDB", e);
      });
      // Also save to localStorage for quick sync, but limit size
      try {
        const recentMessages = messages.slice(-50); // Keep only last 50 for localStorage
        localStorage.setItem(STORAGE_KEYS.SCENARIO_MESSAGES(scenarioId), JSON.stringify(recentMessages));
      } catch (e) {
        // Ignore quota errors
      }
      set(STORAGE_KEYS.SCENARIO_SUMMARY(scenarioId), storySummary).catch(e => {
        console.error("Failed to save summary to IndexedDB", e);
      });
    }
  }, [messages, storySummary, scenarioId, isLoaded]);

  useEffect(() => {
    if (isLoaded) {
      set(STORAGE_KEYS.SCENARIO_CODEX(scenarioId), codexEntries).catch(e => {
        console.error("Failed to save codex to IndexedDB", e);
      });
    }
  }, [codexEntries, scenarioId, isLoaded]);

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
      } else {
        setError("No refinement received from AI. Check your API key.");
      }
    } catch (err: any) {
      console.error("Refinement Error:", err);
      setError(err.message || "Failed to refine input. Check your connection or API key.");
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
      } else {
        setError("No suggestion received from AI. Check your API key.");
      }
    } catch (err: any) {
      console.error("Suggestion Error:", err);
      setError(err.message || "Failed to get suggestion. Check your connection or API key.");
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
        let currentSummary = storySummary;
        let unsummarizedMessages = baseMessages.filter(m => !m.isSummarized);
        
        if (unsummarizedMessages.length > 10) {
          const toSummarize = unsummarizedMessages.slice(0, unsummarizedMessages.length - 10);
          const historyToSummarize = toSummarize.map(m => ({ role: m.role, parts: [{ text: m.text }] }));
          
          // Background summarization (we await it here to use it immediately, but could be detached)
          currentSummary = await summarizeHistory(historyToSummarize, currentSummary);
          setStorySummary(currentSummary);
          
          // Mark as summarized
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
        
        const stream = generateTextReplyStream(historyForAi, profile, editInput, codexEntries, currentSummary);
        
        for await (const chunk of stream) {
          fullReply += chunk;
          
          // Handle OOC tags for audio reading
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
          
          // Throttle state updates to every 100ms
          if (Date.now() - lastUpdateTime > 100) {
            setMessages(prev => prev.map(m => m.id === aiMessageId ? { ...m, text: fullReply } : m));
            lastUpdateTime = Date.now();
          }
        }
        
        // Final state update to ensure we have the complete text
        setMessages(prev => prev.map(m => m.id === aiMessageId ? { ...m, text: fullReply } : m));
        
        // Single TTS request for the entire response to save quota
        if (isAutoRead && sentenceBuffer.trim()) {
          handleReadAloud(sentenceBuffer);
        }
        
        // Auto-populate codex after a model response
        handleAutoPopulateCodex();
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
    setIsTyping(true);

    try {
      let currentSummary = storySummary;
      let unsummarizedMessages = historyBeforeUser.filter(m => !m.isSummarized);
      
      if (unsummarizedMessages.length > 10) {
        const toSummarize = unsummarizedMessages.slice(0, unsummarizedMessages.length - 10);
        const historyToSummarize = toSummarize.map(m => ({ role: m.role, parts: [{ text: m.text }] }));
        
        currentSummary = await summarizeHistory(historyToSummarize, currentSummary);
        setStorySummary(currentSummary);
        
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
      
      setMessages(prev => prev.map(m => m.id === aiMessageId ? { ...m, text: fullReply } : m));
      
      // Single TTS request for the entire response to save quota
      if (isAutoRead && sentenceBuffer.trim()) {
        handleReadAloud(sentenceBuffer);
      }

      handleAutoPopulateCodex();
    } catch (err) {
      console.error(err);
      setMessages(prev => [...prev, {
        id: generateId(),
        role: 'model',
        text: '*The narrative stream falters. Please try again.*',
        timestamp: Date.now(),
        provider: getSettings().activeTextProvider
      }]);
    } finally {
      setIsTyping(false);
    }
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
    const userMsg: Message = { id: generateId(), role: 'user', text: textToSend };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setDirectorNote('');
    
    setIsTyping(true);
    try {
      let currentSummary = storySummary;
      let unsummarizedMessages = messages.filter(m => !m.isSummarized);
      
      if (unsummarizedMessages.length > 10) {
        const toSummarize = unsummarizedMessages.slice(0, unsummarizedMessages.length - 10);
        const historyToSummarize = toSummarize.map(m => ({ role: m.role, parts: [{ text: m.text }] }));
        
        // Background summarization
        currentSummary = await summarizeHistory(historyToSummarize, currentSummary);
        setStorySummary(currentSummary);
        
        // Mark as summarized
        const summarizedIds = new Set(toSummarize.map(m => m.id));
        setMessages(prev => prev.map(m => summarizedIds.has(m.id) ? { ...m, isSummarized: true } : m));
        
        unsummarizedMessages = unsummarizedMessages.slice(-10);
      }

      const history = unsummarizedMessages.map(m => ({ role: m.role, parts: [{ text: m.text }] }));
      const aiMessageId = generateId();
      const aiMessage: Message = { id: aiMessageId, role: 'model', text: '', provider: getSettings().activeTextProvider };
      setMessages(prev => [...prev, aiMessage]);
      
      let fullReply = '';
      let sentenceBuffer = '';
      let isInsideOoc = false;
      let lastUpdateTime = Date.now();
      
      const stream = generateTextReplyStream(history, profile, userMsg.text, codexEntries, currentSummary);
      
      for await (const chunk of stream) {
        fullReply += chunk;

        // Handle OOC tags for audio reading
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
        
        // Throttle state updates to every 100ms
        if (Date.now() - lastUpdateTime > 100) {
          setMessages(prev => prev.map(m => m.id === aiMessageId ? { ...m, text: fullReply } : m));
          lastUpdateTime = Date.now();
        }
      }
      
      // Final state update to ensure we have the complete text
      setMessages(prev => prev.map(m => m.id === aiMessageId ? { ...m, text: fullReply } : m));
      
      // Single TTS request for the entire response to save quota
      if (isAutoRead && sentenceBuffer.trim()) {
        handleReadAloud(sentenceBuffer);
      }

      // Auto-populate codex after a model response
      handleAutoPopulateCodex();
    } catch (err) {
      console.error(err);
    } finally {
      setIsTyping(false);
    }
  };

  const handleReadAloud = async (text: string) => {
    try {
      const textWithoutOoc = text.replace(/<ooc>[\s\S]*?<\/ooc>/gi, '').trim();
      const cleanText = textWithoutOoc.replace(/[*#_~`]/g, '').trim();
      if (!cleanText) return;
      
      const settings = getSettings();
      
      // Helper for browser TTS fallback
      const speakWithBrowser = (txt: string) => {
        const utterance = new SpeechSynthesisUtterance(txt);
        if (profile.voiceSettings?.speed === 'Fast') utterance.rate = 1.2;
        else if (profile.voiceSettings?.speed === 'Slow') utterance.rate = 0.8;
        if (profile.voiceSettings?.pitch === 'High') utterance.pitch = 1.2;
        else if (profile.voiceSettings?.pitch === 'Low') utterance.pitch = 0.8;
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
      if (!isProcessingSpeech) {
        processSpeechQueue();
      }
    } catch (err) {
      console.error('Speech Error:', err);
    }
  };

  const processSpeechQueue = async () => {
    if (speechQueue.current.length === 0) {
      setIsProcessingSpeech(false);
      return;
    }

    setIsProcessingSpeech(true);
    const chunk = speechQueue.current.shift();
    if (!chunk) {
      processSpeechQueue();
      return;
    }

    try {
      const settings = getSettings();
      const voiceName = settings.premiumCustomVoices ? profile.voiceName : 'Kore';
      const voiceSettings = settings.premiumCustomVoices ? profile.voiceSettings : { pitch: 'Normal', speed: 'Normal', accent: 'None' };
      
      const cacheKey = `${chunk.trim()}_${voiceName}_${voiceSettings?.pitch}_${voiceSettings?.speed}`;
      let audioBase64 = audioCache.current.get(cacheKey);
      
      if (!audioBase64) {
        audioBase64 = await generateSpeech(chunk.trim(), voiceName, voiceSettings, profile.storyTone);
        if (audioBase64) {
          audioCache.current.set(cacheKey, audioBase64);
        }
      }

      if (audioBase64) {
        const buffer = await decodeAudioData(audioBase64);
        if (buffer) {
          setAudioQueue(prev => [...prev, buffer]);
        }
      }
    } catch (err) {
      console.error('Speech generation error:', err);
    }

    // Start processing next chunk immediately while current one might be playing
    processSpeechQueue();
  };

  const decodeAudioData = async (base64: string): Promise<AudioBuffer | null> => {
    try {
      const binaryString = window.atob(base64);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) bytes[i] = binaryString.charCodeAt(i);
      
      if (!playbackAudioContextRef.current) {
        playbackAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      
      const audioContext = playbackAudioContextRef.current;
      const float32Data = new Float32Array(bytes.length / 2);
      const view = new DataView(bytes.buffer);
      for (let i = 0; i < float32Data.length; i++) {
        float32Data[i] = view.getInt16(i * 2, true) / 32768.0;
      }
      
      const buffer = audioContext.createBuffer(1, float32Data.length, 24000);
      buffer.getChannelData(0).set(float32Data);
      return buffer;
    } catch (e) {
      console.error('Audio decoding error:', e);
      return null;
    }
  };

  const playNextInQueue = useCallback(() => {
    if (audioQueue.length === 0 || isManualPause) {
      setIsPlaying(false);
      return;
    }

    const nextBuffer = audioQueue[0];
    setAudioQueue(prev => prev.slice(1));
    
    if (!playbackAudioContextRef.current) {
      playbackAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    const audioContext = playbackAudioContextRef.current;

    const source = audioContext.createBufferSource();
    source.buffer = nextBuffer;
    
    const gainNode = audioContext.createGain();
    source.connect(gainNode);
    gainNode.connect(audioContext.destination);

    // Schedule start
    const now = audioContext.currentTime;
    const startTime = Math.max(now, nextStartTimeRef.current);
    
    // Fade in/out to prevent clicks
    const fadeTime = 0.005;
    gainNode.gain.setValueAtTime(0, startTime);
    gainNode.gain.linearRampToValueAtTime(1, startTime + fadeTime);
    gainNode.gain.setValueAtTime(1, startTime + nextBuffer.duration - fadeTime);
    gainNode.gain.linearRampToValueAtTime(0, startTime + nextBuffer.duration);

    source.start(startTime);
    nextStartTimeRef.current = startTime + nextBuffer.duration;
    
    setCurrentAudioSource(source);
    setIsPlaying(true);

    source.onended = () => {
      setIsPlaying(false);
      // The useEffect will trigger playNextInQueue if there's more
    };
  }, [audioQueue, isManualPause]);

  useEffect(() => {
    if (audioQueue.length > 0 && !isPlaying && !isManualPause) {
      playNextInQueue();
    }
  }, [audioQueue, isPlaying, isManualPause, playNextInQueue]);

  const stopAudio = () => {
    if (currentAudioSource) {
      try { currentAudioSource.stop(); } catch (e) {}
      setCurrentAudioSource(null);
    }
    setIsPlaying(false);
    nextStartTimeRef.current = 0;
    setAudioQueue([]);
    speechQueue.current = [];
  };

  const togglePlayPause = () => {
    if (isPlaying) {
      stopAudio();
      setIsManualPause(true);
    } else {
      setIsManualPause(false);
    }
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

  const handleAutoPopulateCodex = async (force = false) => {
    if (isAutoPopulatingCodex || messages.length < 2) return;
    if (!force && (!isAutoCodexEnabled || messages.length % 3 !== 0)) return;
    
    setIsAutoPopulatingCodex(true);
    try {
      const history = messages.map(m => ({ role: m.role, parts: [{ text: m.text }] }));
      const newEntries = await extractCodexEntries(history, profile, codexEntries);
      
      if (newEntries.length > 0) {
        const entriesWithIds: CodexEntry[] = newEntries.map(e => ({
          ...e,
          id: generateId(),
        } as CodexEntry));
        
        setCodexEntries(prev => [...prev, ...entriesWithIds]);
      }
    } catch (err) {
      console.error("Auto-populate codex failed", err);
    } finally {
      setIsAutoPopulatingCodex(false);
    }
  };

  const handleRefineCodexEntry = async () => {
    if (isRefiningCodexEntry || !newCodexEntry.title || !newCodexEntry.content) return;
    setIsRefiningCodexEntry(true);
    try {
      const refined = await refineCodexEntry(newCodexEntry, profile);
      setNewCodexEntry(refined);
    } catch (err) {
      console.error("Refine codex entry failed", err);
    } finally {
      setIsRefiningCodexEntry(false);
    }
  };

  const handleAddCodexEntry = () => {
    if (!newCodexEntry.title || !newCodexEntry.content) return;
    const entry: CodexEntry = {
      id: generateId(),
      title: newCodexEntry.title,
      content: newCodexEntry.content,
      category: newCodexEntry.category as any || 'Lore'
    };
    setCodexEntries(prev => [...prev, entry]);
    setNewCodexEntry({ category: 'Lore' });
    setIsAddingCodex(false);
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
            <div className="flex items-center gap-2 text-[8px] sm:text-[10px] uppercase tracking-[0.2em] font-bold text-zinc-500 mt-0.5">
              <span className="text-emerald-500/80">{profile.storyTone}</span>
              <span className="w-0.5 h-0.5 sm:w-1 sm:h-1 bg-zinc-800 rounded-full" />
              <span>{profile.relationship}</span>
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
        {/* Codex Sidebar */}
        <AnimatePresence>
          {showCodex && (
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="absolute right-0 top-0 bottom-0 w-80 glass-panel border-l border-white/10 z-40 flex flex-col shadow-2xl"
            >
              <div className="p-6 border-b border-white/5 flex items-center justify-between">
                <h3 className="text-lg font-serif font-bold text-white flex items-center gap-2">
                  <Book className="w-5 h-5 text-emerald-400" />
                  World Codex
                </h3>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => setIsAutoCodexEnabled(!isAutoCodexEnabled)}
                    className={`p-2 rounded-lg transition-all ${isAutoCodexEnabled ? 'text-blue-400 bg-blue-500/10' : 'text-zinc-500 hover:text-blue-400'}`}
                    title={isAutoCodexEnabled ? "Auto-scan enabled" : "Auto-scan disabled"}
                  >
                    <Repeat className={`w-4 h-4 ${isAutoCodexEnabled ? 'animate-spin-slow' : ''}`} />
                  </button>
                  <button 
                    onClick={() => handleAutoPopulateCodex(true)} 
                    disabled={isAutoPopulatingCodex || messages.length < 2}
                    className={`p-2 rounded-lg transition-all ${isAutoPopulatingCodex ? 'text-emerald-400 animate-pulse' : 'text-zinc-500 hover:text-emerald-400 hover:bg-white/5'}`}
                    title="Scan story for new entries"
                  >
                    {isAutoPopulatingCodex ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  </button>
                  <button onClick={() => setShowCodex(false)} className="text-zinc-500 hover:text-white">
                    <CloseIcon className="w-5 h-5" />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
                {isAddingCodex ? (
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4 p-4 rounded-2xl bg-white/5 border border-white/10">
                    <input
                      type="text"
                      placeholder="Entry Title"
                      value={newCodexEntry.title || ''}
                      onChange={e => setNewCodexEntry(prev => ({ ...prev, title: e.target.value }))}
                      className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                    <select
                      value={newCodexEntry.category}
                      onChange={e => setNewCodexEntry(prev => ({ ...prev, category: e.target.value as any }))}
                      className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    >
                      <option value="Lore">Lore</option>
                      <option value="Mechanics">Mechanics</option>
                      <option value="Location">Location</option>
                      <option value="Item">Item</option>
                    </select>
                    <textarea
                      placeholder="Description/Rules..."
                      value={newCodexEntry.content || ''}
                      onChange={e => setNewCodexEntry(prev => ({ ...prev, content: e.target.value }))}
                      rows={4}
                      className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-emerald-500 resize-none"
                    />
                    <div className="flex gap-2">
                      <button 
                        onClick={handleRefineCodexEntry} 
                        disabled={isRefiningCodexEntry || !newCodexEntry.title || !newCodexEntry.content}
                        className="flex-1 py-2 rounded-xl bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 text-[10px] font-bold uppercase tracking-widest border border-blue-500/20 flex items-center justify-center gap-2"
                      >
                        {isRefiningCodexEntry ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
                        Refine
                      </button>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => setIsAddingCodex(false)} className="flex-1 py-2 rounded-xl text-xs font-bold text-zinc-500 hover:text-white uppercase tracking-widest">Cancel</button>
                      <button onClick={handleAddCodexEntry} className="flex-1 py-2 rounded-xl bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30 text-xs font-bold uppercase tracking-widest border border-emerald-500/20">Save</button>
                    </div>
                  </motion.div>
                ) : (
                  <button
                    onClick={() => setIsAddingCodex(true)}
                    className="w-full py-4 rounded-2xl border border-dashed border-white/10 text-zinc-500 hover:text-emerald-400 hover:border-emerald-500/30 transition-all flex flex-col items-center justify-center gap-2 group"
                  >
                    <Plus className="w-5 h-5 group-hover:scale-110 transition-transform" />
                    <span className="text-[10px] font-bold uppercase tracking-widest">Add New Entry</span>
                  </button>
                )}

                <div className="space-y-4">
                  {codexEntries.map(entry => (
                    <div key={entry.id} className="group p-4 rounded-2xl bg-white/5 border border-white/5 hover:border-white/10 transition-all">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[8px] font-bold uppercase tracking-tighter px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          {entry.category}
                        </span>
                        <button 
                          onClick={() => setConfirmModal({
                            isOpen: true,
                            title: 'Delete Entry',
                            message: `Are you sure you want to delete "${entry.title}"?`,
                            type: 'delete',
                            targetId: entry.id
                          })} 
                          className="opacity-0 group-hover:opacity-100 p-1 text-zinc-600 hover:text-red-400 transition-all"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
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
                    onClick={togglePlayPause} 
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
                        localStorage.setItem('personaforge_settings', JSON.stringify(newSettings));
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
