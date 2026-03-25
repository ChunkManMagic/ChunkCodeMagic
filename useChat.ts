import { useState, useEffect, useCallback } from 'react';
import { get, set } from 'idb-keyval';
import {
  generateTextReplyStream,
  summarizeHistory,
  refineInput,
  suggestNextAction,
  generateId,
  getSettings,
} from '../lib/gemini';
import type { CharacterProfile, CodexEntry, Message } from '../lib/types';
import { processUserInput } from '../lib/sanitize';
import { STORAGE_KEYS } from '../constants';

interface UseChatOptions {
  profile: CharacterProfile;
  scenarioId: string;
  codexEntries: CodexEntry[];
  onAutoPopulateCodex?: () => void;
}

export function useChat({
  profile,
  scenarioId,
  codexEntries,
  onAutoPopulateCodex,
}: UseChatOptions) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [storySummary, setStorySummary] = useState('');
  const [isLoaded, setIsLoaded] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Load persisted data ──────────────────────────────────
  useEffect(() => {
    setIsLoaded(false);
    const loadData = async () => {
      try {
        // Messages
        let saved = await get<Message[]>(STORAGE_KEYS.SCENARIO_MESSAGES(scenarioId));
        if (!saved) {
          const local = localStorage.getItem(STORAGE_KEYS.SCENARIO_MESSAGES(scenarioId));
          if (local) {
            saved = JSON.parse(local);
            await set(STORAGE_KEYS.SCENARIO_MESSAGES(scenarioId), saved);
          }
        }
        if (saved) {
          const seen = new Set<string>();
          const clean = saved.filter(m => {
            if (!m.id || seen.has(m.id)) return false;
            seen.add(m.id);
            return true;
          });
          setMessages(clean);
        }

        // Summary
        const summary = await get<string>(STORAGE_KEYS.SCENARIO_SUMMARY(scenarioId));
        if (summary) setStorySummary(summary);
      } catch (e) {
        console.error('[useChat] Failed to load data', e);
      } finally {
        setIsLoaded(true);
      }
    };
    loadData();
  }, [scenarioId]);

  // ── Persist messages & summary ───────────────────────────
  useEffect(() => {
    if (!isLoaded) return;
    set(STORAGE_KEYS.SCENARIO_MESSAGES(scenarioId), messages).catch(() => {});
    try {
      localStorage.setItem(
        STORAGE_KEYS.SCENARIO_MESSAGES(scenarioId),
        JSON.stringify(messages.slice(-50)),
      );
    } catch { /* quota exceeded — ignore */ }
  }, [messages, scenarioId, isLoaded]);

  useEffect(() => {
    if (!isLoaded) return;
    set(STORAGE_KEYS.SCENARIO_SUMMARY(scenarioId), storySummary).catch(() => {});
  }, [storySummary, scenarioId, isLoaded]);

  // ── Shared streaming logic ───────────────────────────────
  const streamReply = useCallback(
    async (
      historyMessages: Message[],
      userInput: string,
      onChunk: (chunk: string, full: string) => void,
      onDone: (full: string, ttsText: string) => void,
    ) => {
      let currentSummary = storySummary;
      let unsummarized = historyMessages.filter(m => !m.isSummarized);

      if (unsummarized.length > 10) {
        const toSummarize = unsummarized.slice(0, unsummarized.length - 10);
        const histForSummary = toSummarize.map(m => ({ role: m.role, text: m.text }));
        currentSummary = await summarizeHistory(histForSummary, currentSummary);
        setStorySummary(currentSummary);
        const summarizedIds = new Set(toSummarize.map(m => m.id));
        setMessages(prev =>
          prev.map(m => (summarizedIds.has(m.id) ? { ...m, isSummarized: true } : m)),
        );
        unsummarized = unsummarized.slice(-10);
      }

      const history = unsummarized.map(m => ({ role: m.role, text: m.text }));
      const stream = generateTextReplyStream(
        history,
        profile,
        userInput,
        codexEntries,
        currentSummary,
      );

      let fullReply = '';
      let ttsBuffer = '';
      let insideOoc = false;
      let lastUpdate = Date.now();

      for await (const chunk of stream) {
        fullReply += chunk;

        // Strip OOC sections from TTS buffer
        let ttsChunk = chunk;
        if (fullReply.includes('<ooc>') && !fullReply.includes('</ooc>')) {
          insideOoc = true;
          ttsChunk = '';
        } else if (fullReply.includes('</ooc>') && insideOoc) {
          insideOoc = false;
          ttsChunk = '';
        } else if (insideOoc) {
          ttsChunk = '';
        }
        ttsBuffer += ttsChunk;

        // Throttle React state updates to ~100ms
        if (Date.now() - lastUpdate > 100) {
          onChunk(chunk, fullReply);
          lastUpdate = Date.now();
        }
      }

      onDone(fullReply, ttsBuffer);
    },
    [profile, codexEntries, storySummary],
  );

  // ── Send a new message ───────────────────────────────────
  const sendMessage = useCallback(
    async (
      rawText: string,
      directorNote: string,
      onReadAloud?: (text: string) => void,
    ) => {
      let textToSend = processUserInput(rawText);
      if (directorNote.trim()) {
        textToSend = textToSend.trim()
          ? `${textToSend}\n\n[Director's Note: ${directorNote.trim()}]`
          : `[Director's Note: ${directorNote.trim()}]`;
      }
      if (!textToSend.trim() || isTyping) return;

      const userMsg: Message = { id: generateId(), role: 'user', text: textToSend };
      setMessages(prev => [...prev, userMsg]);
      setIsTyping(true);
      setError(null);

      const aiMessageId = generateId();
      const aiMessage: Message = {
        id: aiMessageId,
        role: 'model',
        text: '',
        provider: getSettings().activeTextProvider,
      };
      setMessages(prev => [...prev, aiMessage]);

      try {
        const snapshot = [...messages, userMsg];
        await streamReply(
          snapshot,
          textToSend,
          (_chunk, full) => {
            setMessages(prev =>
              prev.map(m => (m.id === aiMessageId ? { ...m, text: full } : m)),
            );
          },
          (full, tts) => {
            setMessages(prev =>
              prev.map(m => (m.id === aiMessageId ? { ...m, text: full } : m)),
            );
            if (tts.trim()) onReadAloud?.(tts);
            onAutoPopulateCodex?.();
          },
        );
      } catch (err: any) {
        setError(err.message || 'Failed to generate reply.');
        setMessages(prev =>
          prev.map(m =>
            m.id === aiMessageId
              ? { ...m, text: '*The narrative stream falters. Please try again.*' }
              : m,
          ),
        );
      } finally {
        setIsTyping(false);
      }
    },
    [messages, isTyping, streamReply, onAutoPopulateCodex],
  );

  // ── Edit + regenerate ────────────────────────────────────
  const editAndRegenerate = useCallback(
    async (
      messageId: string,
      newText: string,
      onReadAloud?: (text: string) => void,
    ) => {
      if (isTyping) return;
      const index = messages.findIndex(m => m.id === messageId);
      if (index === -1) return;
      const message = messages[index];

      if (message.role !== 'user') {
        setMessages(prev =>
          prev.map((m, i) => (i === index ? { ...m, text: newText } : m)),
        );
        return;
      }

      const base = messages.slice(0, index);
      const updatedUser: Message = { ...message, text: processUserInput(newText) };
      setMessages([...base, updatedUser]);
      setIsTyping(true);
      setError(null);

      const aiMessageId = generateId();
      setMessages(prev => [
        ...prev,
        { id: aiMessageId, role: 'model', text: '', provider: getSettings().activeTextProvider },
      ]);

      try {
        await streamReply(
          [...base, updatedUser],
          updatedUser.text,
          (_c, full) => {
            setMessages(prev =>
              prev.map(m => (m.id === aiMessageId ? { ...m, text: full } : m)),
            );
          },
          (full, tts) => {
            setMessages(prev =>
              prev.map(m => (m.id === aiMessageId ? { ...m, text: full } : m)),
            );
            if (tts.trim()) onReadAloud?.(tts);
            onAutoPopulateCodex?.();
          },
        );
      } catch (err: any) {
        setError(err.message || 'Failed to regenerate reply.');
      } finally {
        setIsTyping(false);
      }
    },
    [messages, isTyping, streamReply, onAutoPopulateCodex],
  );

  // ── Regenerate AI message ────────────────────────────────
  const regenerateMessage = useCallback(
    async (
      messageId: string,
      guidance: string,
      onReadAloud?: (text: string) => void,
    ) => {
      if (isTyping) return;
      const index = messages.findIndex(m => m.id === messageId);
      if (index === -1) return;

      const slicedHistory = messages.slice(0, index);
      const lastUserIndex = slicedHistory.map(m => m.role).lastIndexOf('user');
      if (lastUserIndex === -1) return;

      const historyBeforeUser = slicedHistory.slice(0, lastUserIndex);
      const lastUser = slicedHistory[lastUserIndex];
      const userInput = guidance.trim()
        ? `${lastUser.text}\n\n[Director's Note for AI: ${guidance.trim()}]`
        : lastUser.text;

      setMessages(slicedHistory);
      setIsTyping(true);
      setError(null);

      const aiMessageId = generateId();
      setMessages(prev => [
        ...prev,
        { id: aiMessageId, role: 'model', text: '', provider: getSettings().activeTextProvider },
      ]);

      try {
        await streamReply(
          [...historyBeforeUser, lastUser],
          userInput,
          (_c, full) => {
            setMessages(prev =>
              prev.map(m => (m.id === aiMessageId ? { ...m, text: full } : m)),
            );
          },
          (full, tts) => {
            setMessages(prev =>
              prev.map(m => (m.id === aiMessageId ? { ...m, text: full } : m)),
            );
            if (tts.trim()) onReadAloud?.(tts);
            onAutoPopulateCodex?.();
          },
        );
      } catch (err: any) {
        setError(err.message || 'Failed to regenerate reply.');
      } finally {
        setIsTyping(false);
      }
    },
    [messages, isTyping, streamReply, onAutoPopulateCodex],
  );

  // ── Refine / suggest input ───────────────────────────────
  const refineUserInput = useCallback(
    async (input: string): Promise<string> => {
      const settings = getSettings();
      const history = messages.map(m => ({ role: m.role, text: m.text }));
      return refineInput(input, profile, history, settings.customRefineInstructions);
    },
    [messages, profile],
  );

  const suggestInput = useCallback(async (): Promise<string> => {
    const history = messages.map(m => ({ role: m.role, text: m.text }));
    return suggestNextAction(history, profile);
  }, [messages, profile]);

  // ── Rewind / reset ───────────────────────────────────────
  const rewindTo = useCallback((messageId: string) => {
    const index = messages.findIndex(m => m.id === messageId);
    if (index !== -1) setMessages(messages.slice(0, index));
  }, [messages]);

  const resetChat = useCallback(() => {
    setMessages([]);
    setStorySummary('');
  }, []);

  return {
    messages,
    setMessages,
    storySummary,
    isLoaded,
    isTyping,
    error,
    setError,
    sendMessage,
    editAndRegenerate,
    regenerateMessage,
    refineUserInput,
    suggestInput,
    rewindTo,
    resetChat,
  };
}
