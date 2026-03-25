import { useState, useEffect, useMemo, Component, ErrorInfo, ReactNode } from 'react';
import { get, set, del } from 'idb-keyval';
import { motion, AnimatePresence } from 'motion/react';
import { CharacterCreator } from './components/CharacterCreator';
import { ChatInterface } from './components/ChatInterface';
import { CharacterEditor } from './components/CharacterEditor';
import { ScenarioLibrary } from './components/ScenarioLibrary';
import { ScenarioCardSkeleton } from './components/Skeleton';
import { ToastContainer } from './components/ToastContainer';
import { OfflineBanner } from './components/OfflineBanner';
import type { CharacterProfile, Scenario, CodexEntry, Message } from './lib/types';
import { generateId, getSettings } from './lib/gemini';
import { Library, AlertCircle, CheckCircle2, Settings } from 'lucide-react';
import { STORAGE_KEYS } from './constants';
import { SettingsModal } from './components/SettingsModal';
import { useToast } from './hooks/useToast';
import { useOffline } from './hooks/useOffline';
import { useStaleDataCleanup } from './hooks/useStorage';

// ─────────────────────────────────────────────
// Confirmation modal (App-level: scenario delete / reset)
// ─────────────────────────────────────────────

interface ConfirmModalState {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
}

function ConfirmationModal({ state, onClose }: { state: ConfirmModalState; onClose: () => void }) {
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
// Error Boundary — wraps each major view independently
// ─────────────────────────────────────────────

interface EBState { hasError: boolean; error?: Error }

class ErrorBoundary extends Component<{ children: ReactNode; fallbackLabel?: string }, EBState> {
  constructor(props: { children: ReactNode; fallbackLabel?: string }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError(error: Error): EBState { return { hasError: true, error }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('[ErrorBoundary]', error, info); }
  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="min-h-[40vh] flex flex-col items-center justify-center p-8 text-center gap-6">
        <AlertCircle className="w-12 h-12 text-red-500 opacity-60" />
        <div>
          <h2 className="text-2xl font-serif text-white mb-2">Something went wrong</h2>
          <p className="text-zinc-500 max-w-md text-sm">{this.state.error?.message || 'An unexpected error occurred.'}</p>
        </div>
        <div className="flex gap-4">
          <button onClick={() => this.setState({ hasError: false })} className="px-6 py-2.5 bg-zinc-800 text-white rounded-xl text-sm hover:bg-zinc-700 transition-all">Try again</button>
          <button onClick={() => window.location.reload()} className="px-6 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-bold hover:bg-emerald-500 transition-all">Reload App</button>
        </div>
      </div>
    );
  }
}

// ─────────────────────────────────────────────
// App
// ─────────────────────────────────────────────

export default function App() {
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [isScenariosLoaded, setIsScenariosLoaded] = useState(false);
  const [currentScenarioId, setCurrentScenarioId] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [isCreating, setIsCreating] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [showDraft, setShowDraft] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState(getSettings());
  const [confirmModal, setConfirmModal] = useState<ConfirmModalState>({
    isOpen: false, title: '', message: '', onConfirm: () => {},
  });

  const { toasts, success, error: toastError, info, dismiss } = useToast();
  const isOffline = useOffline();
  useStaleDataCleanup(scenarios);

  // ── Load initial data ──────────────────────────────────────
  useEffect(() => {
    const loadData = async () => {
      try {
        const [savedScenarios, savedId] = await Promise.all([
          get<Scenario[]>(STORAGE_KEYS.SCENARIOS),
          get<string>(STORAGE_KEYS.CURRENT_SCENARIO_ID),
        ]);

        let initialScenarios: Scenario[] = savedScenarios || [];

        if (!savedScenarios) {
          const oldLocal = localStorage.getItem(STORAGE_KEYS.SCENARIOS);
          if (oldLocal) {
            try {
              initialScenarios = JSON.parse(oldLocal);
              await set(STORAGE_KEYS.SCENARIOS, initialScenarios);
              localStorage.removeItem(STORAGE_KEYS.SCENARIOS);
            } catch { /* corrupted — skip */ }
          }
        }

        let initialId = savedId || null;
        if (!savedId) {
          const oldId = localStorage.getItem(STORAGE_KEYS.CURRENT_SCENARIO_ID);
          if (oldId) {
            initialId = oldId;
            await set(STORAGE_KEYS.CURRENT_SCENARIO_ID, oldId);
            localStorage.removeItem(STORAGE_KEYS.CURRENT_SCENARIO_ID);
          }
        }

        const isValidId = initialScenarios.some(s => s.id === initialId);
        setScenarios(initialScenarios);
        setCurrentScenarioId(isValidId ? initialId : null);
      } catch (e) {
        console.error('[App] Failed to load data from IndexedDB', e);
        toastError('Failed to load your scenarios. Storage may be unavailable.');
      } finally {
        setIsScenariosLoaded(true);
      }
    };
    loadData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Show draft banner ──────────────────────────────────────
  useEffect(() => {
    const draft = localStorage.getItem(STORAGE_KEYS.DRAFT_DATA);
    const idea = localStorage.getItem(STORAGE_KEYS.DRAFT_IDEA);
    if ((draft || idea) && !currentScenarioId) setShowDraft(true);
  }, [currentScenarioId]);

  // ── Debounced scenario persistence ────────────────────────
  useEffect(() => {
    if (!isScenariosLoaded) return;
    setSaveStatus('saving');
    const id = setTimeout(() => {
      set(STORAGE_KEYS.SCENARIOS, scenarios)
        .then(() => setSaveStatus('saved'))
        .catch(() => setSaveStatus('error'));
    }, 1000);
    return () => clearTimeout(id);
  }, [scenarios, isScenariosLoaded]);

  useEffect(() => {
    if (!isScenariosLoaded) return;
    if (currentScenarioId) {
      set(STORAGE_KEYS.CURRENT_SCENARIO_ID, currentScenarioId).catch(() => setSaveStatus('error'));
    } else {
      del(STORAGE_KEYS.CURRENT_SCENARIO_ID).catch(() => {});
    }
  }, [currentScenarioId, isScenariosLoaded]);

  // ── Memos ──────────────────────────────────────────────────
  const scenarioMap = useMemo(() => new Map(scenarios.map(s => [s.id, s])), [scenarios]);
  const currentScenario = currentScenarioId ? scenarioMap.get(currentScenarioId) ?? null : null;

  // ── Handlers ───────────────────────────────────────────────
  const handleDeleteScenario = (id: string) => {
    setConfirmModal({
      isOpen: true,
      title: 'Delete Scenario',
      message: 'Delete this scenario and all its messages? This cannot be undone.',
      onConfirm: async () => {
        setScenarios(prev => prev.filter(s => s.id !== id));
        await del(STORAGE_KEYS.SCENARIO_MESSAGES(id));
        await del(STORAGE_KEYS.SCENARIO_CODEX(id));
        await del(STORAGE_KEYS.SCENARIO_SUMMARY(id));
        localStorage.removeItem(STORAGE_KEYS.SCENARIO_MESSAGES(id));
        success('Scenario deleted.');
      },
    });
  };

  const handleCharacterCreated = (profile: CharacterProfile, avatarBase64: string) => {
    try {
      const newScenario: Scenario = { id: generateId(), profile, avatarBase64, lastUpdated: Date.now() };
      setScenarios(prev => [...prev, newScenario]);
      setCurrentScenarioId(newScenario.id);
      setIsCreating(false);
      setShowDraft(false);
      localStorage.removeItem(STORAGE_KEYS.DRAFT_DATA);
      localStorage.removeItem(STORAGE_KEYS.DRAFT_MODE);
      localStorage.removeItem(STORAGE_KEYS.DRAFT_IDEA);
      localStorage.removeItem(STORAGE_KEYS.DRAFT_STEP);
      localStorage.removeItem(STORAGE_KEYS.DRAFT_SETUP_TYPE);
      success(`${profile.name} is ready to meet you.`);
    } catch (e) {
      toastError('Failed to save character. Please try again.');
    }
  };

  const handleSaveEdit = (profile: CharacterProfile, avatarBase64: string) => {
    if (!currentScenarioId) return;
    setScenarios(prev => prev.map(s => s.id === currentScenarioId ? { ...s, profile, avatarBase64, lastUpdated: Date.now() } : s));
    setIsEditing(false);
    success('Character updated.');
  };

  const handleCarryOver = (profile: CharacterProfile, avatarBase64: string) => {
    const newScenario: Scenario = {
      id: generateId(),
      profile: { ...profile, relationship: 'Strangers', storyTone: 'Dramatic' },
      avatarBase64,
      lastUpdated: Date.now(),
    };
    setScenarios(prev => [...prev, newScenario]);
    setCurrentScenarioId(newScenario.id);
    setIsCreating(false);
    setIsEditing(false);
    info(`New timeline started with ${profile.name}.`);
  };

  const handleUpdateProfile = (profile: CharacterProfile) => {
    if (!currentScenarioId) return;
    setScenarios(prev => prev.map(s => s.id === currentScenarioId ? { ...s, profile, lastUpdated: Date.now() } : s));
  };

  const handleBranchScenario = async (slicedMessages: Message[], codexEntries: CodexEntry[], storySummary: string) => {
    if (!currentScenario) return;
    const newId = generateId();
    const newScenario: Scenario = {
      id: newId,
      profile: { ...currentScenario.profile, name: `${currentScenario.profile.name} (Alt. Timeline)` },
      avatarBase64: currentScenario.avatarBase64,
      lastUpdated: Date.now(),
    };
    await set(STORAGE_KEYS.SCENARIO_MESSAGES(newId), slicedMessages);
    await set(STORAGE_KEYS.SCENARIO_CODEX(newId), codexEntries);
    await set(STORAGE_KEYS.SCENARIO_SUMMARY(newId), storySummary);
    setScenarios(prev => [...prev, newScenario]);
    setCurrentScenarioId(newId);
    info('Branch created — alternate timeline started.');
  };

  const handleSettingsClose = () => {
    setShowSettings(false);
    setSettings(getSettings());
  };

  // ─────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#050505] text-zinc-100 p-4 md:p-8 flex flex-col selection:bg-emerald-500/30">
      <OfflineBanner isOffline={isOffline} />
      <ToastContainer toasts={toasts} onDismiss={dismiss} />

      {/* Background ambience */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-emerald-500/5 blur-[120px] rounded-full animate-float" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-500/5 blur-[120px] rounded-full animate-float" style={{ animationDelay: '-3s' }} />
      </div>

      {/* Header */}
      <header className="mb-12 flex items-center justify-between relative z-10">
        <div className="w-32">
          {currentScenarioId && (
            <button onClick={() => setCurrentScenarioId(null)} className="flex items-center gap-2 text-[10px] font-bold text-zinc-500 hover:text-white uppercase tracking-widest transition-all">
              <Library className="w-4 h-4" /> Library
            </button>
          )}
        </div>
        <div className="text-center">
          <h1 className="text-4xl font-serif font-bold text-white tracking-tighter">PersonaForge</h1>
          <div className="flex items-center justify-center gap-2 mt-2">
            <p className="text-[10px] uppercase tracking-[0.4em] text-zinc-500 font-bold">Immersive Narrative Engine</p>
            <div className={`px-2 py-0.5 rounded-full text-[8px] font-bold uppercase tracking-widest border ${settings.activeTextProvider === 'Google' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' : 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20'}`}>{settings.activeTextProvider}</div>
            <div className={`px-2 py-0.5 rounded-full text-[8px] font-bold uppercase tracking-widest border ${settings.voiceEngine === 'Cinematic' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-amber-500/10 text-amber-400 border-amber-500/20'}`}>{settings.voiceEngine}</div>
          </div>
        </div>
        <div className="w-32 flex justify-end gap-4 items-center">
          <button onClick={() => setShowSettings(true)} className="text-zinc-500 hover:text-white transition-colors" title="Settings"><Settings className="w-5 h-5" /></button>
          {currentScenario && (
            <button
              onClick={() => setConfirmModal({
                isOpen: true,
                title: 'Reset System',
                message: 'Delete this character and all messages?',
                onConfirm: async () => {
                  await del(STORAGE_KEYS.SCENARIO_MESSAGES(currentScenarioId!));
                  await del(STORAGE_KEYS.SCENARIO_CODEX(currentScenarioId!));
                  await del(STORAGE_KEYS.SCENARIO_SUMMARY(currentScenarioId!));
                  setScenarios(prev => prev.filter(s => s.id !== currentScenarioId));
                  setCurrentScenarioId(null);
                  info('Scenario reset.');
                },
              })}
              className="text-[10px] font-bold text-zinc-600 hover:text-red-400 transition-all uppercase tracking-widest"
            >
              Reset
            </button>
          )}
        </div>
      </header>

      <ConfirmationModal state={confirmModal} onClose={() => setConfirmModal(s => ({ ...s, isOpen: false }))} />
      {showSettings && <SettingsModal onClose={handleSettingsClose} />}

      {/* Main */}
      <main className="flex-1 flex flex-col max-w-7xl mx-auto w-full relative z-10">
        {!currentScenarioId && !isCreating && !showDraft ? (
          !isScenariosLoaded ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3].map(i => <ScenarioCardSkeleton key={i} />)}
            </div>
          ) : (
            <ErrorBoundary fallbackLabel="Scenario Library">
              <ScenarioLibrary
                scenarios={scenarios}
                onSelect={s => { setCurrentScenarioId(s.id); setIsCreating(false); setIsEditing(false); }}
                onEdit={s => { setCurrentScenarioId(s.id); setIsEditing(true); setIsCreating(false); }}
                onDelete={handleDeleteScenario}
                onNew={() => { setIsCreating(true); setCurrentScenarioId(null); }}
                hasDraft={true}
                onRestoreDraft={() => setShowDraft(true)}
              />
            </ErrorBoundary>
          )
        ) : (isCreating || showDraft) && !currentScenarioId ? (
          <div className="flex-1 flex items-center justify-center py-10">
            <ErrorBoundary fallbackLabel="Character Creator">
              <CharacterCreator
                onCharacterCreated={handleCharacterCreated}
                onCancel={() => { setIsCreating(false); setShowDraft(false); }}
              />
            </ErrorBoundary>
          </div>
        ) : isEditing && currentScenario ? (
          <div className="flex-1 flex items-center justify-center py-10">
            <ErrorBoundary fallbackLabel="Character Editor">
              <CharacterEditor
                profile={currentScenario.profile}
                avatarBase64={currentScenario.avatarBase64}
                onSave={handleSaveEdit}
                onCancel={() => setIsEditing(false)}
              />
            </ErrorBoundary>
          </div>
        ) : currentScenario ? (
          <div className="flex-1 h-[85vh]">
            <ErrorBoundary fallbackLabel="Chat Interface">
              <ChatInterface
                profile={currentScenario.profile}
                avatarBase64={currentScenario.avatarBase64}
                scenarioId={currentScenario.id}
                onEditCharacter={() => setIsEditing(true)}
                onCarryOver={() => handleCarryOver(currentScenario.profile, currentScenario.avatarBase64)}
                onUpdateProfile={handleUpdateProfile}
                onBranchScenario={handleBranchScenario}
              />
            </ErrorBoundary>
          </div>
        ) : null}
      </main>

      {/* Footer save status */}
      <footer className="mt-8 text-center relative z-10 flex flex-col items-center gap-4">
        <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10">
          {saveStatus === 'saving' && <div className="flex items-center gap-2 text-[10px] text-zinc-500 uppercase tracking-widest"><div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" /> Saving...</div>}
          {saveStatus === 'saved' && <div className="flex items-center gap-2 text-[10px] text-emerald-500 uppercase tracking-widest"><CheckCircle2 className="w-3 h-3" /> Saved</div>}
          {saveStatus === 'error' && <div className="flex items-center gap-2 text-[10px] text-red-500 uppercase tracking-widest"><AlertCircle className="w-3 h-3" /> Save Error</div>}
          {saveStatus === 'idle' && <div className="text-[10px] text-zinc-600 uppercase tracking-widest">Ready</div>}
        </div>
        <p className="text-[9px] uppercase tracking-[0.3em] text-zinc-700 font-bold">PersonaForge v2.0 • Immersive Roleplay Assistant</p>
      </footer>
    </div>
  );
}
