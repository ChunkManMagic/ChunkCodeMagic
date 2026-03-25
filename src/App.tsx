import { useState, useEffect, useMemo, Component, ErrorInfo, ReactNode } from 'react';
import { get, set, del } from 'idb-keyval';
import { motion, AnimatePresence } from 'motion/react';
import { Toaster, toast } from 'sonner';
import { CharacterCreator } from './components/CharacterCreator';
import { ChatInterface, Message } from './components/ChatInterface';
import { CharacterEditor } from './components/CharacterEditor';
import { ScenarioLibrary } from './components/ScenarioLibrary';
import { CharacterProfile, Scenario, generateId, CodexEntry } from './lib/gemini';
import { Library, AlertCircle, CheckCircle2, Settings } from 'lucide-react';
import { STORAGE_KEYS } from './constants';
import { SettingsModal } from './components/SettingsModal';
import { getSettings } from './lib/gemini';

// Custom Confirmation Modal
interface ConfirmationModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}

function ConfirmationModal({ isOpen, title, message, onConfirm, onCancel }: ConfirmationModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onCancel}
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="relative w-full max-w-md glass-panel p-8 rounded-[2rem] border border-white/10 shadow-2xl"
          >
            <h3 className="text-2xl font-serif text-white mb-2">{title}</h3>
            <p className="text-zinc-400 mb-8 leading-relaxed">{message}</p>
            <div className="flex gap-4">
              <button
                onClick={onCancel}
                className="flex-1 px-6 py-3 rounded-xl font-bold text-zinc-400 hover:text-white hover:bg-white/5 transition-all uppercase tracking-widest text-xs"
              >
                Cancel
              </button>
              <button
                onClick={onConfirm}
                className="flex-1 px-6 py-3 rounded-xl font-bold bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-all uppercase tracking-widest text-xs border border-red-500/20"
              >
                Confirm
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

// Error Boundary Component
class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean, error: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#050505] flex flex-col items-center justify-center p-8 text-center">
          <div className="w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center mb-8 border border-red-500/20">
            <AlertCircle className="w-10 h-10 text-red-500" />
          </div>
          <h2 className="text-3xl font-serif text-white mb-4">Something went wrong</h2>
          <p className="text-zinc-500 mb-4 max-w-md">The narrative engine encountered an unexpected error. Don't worry, your progress is likely safe in the library.</p>
          {this.state.error && (
            <div className="bg-red-500/5 border border-red-500/10 rounded-lg p-4 mb-8 max-w-xl w-full text-left overflow-auto max-h-40">
              <code className="text-xs text-red-400/70 font-mono whitespace-pre-wrap">
                {this.state.error.toString()}
              </code>
            </div>
          )}
          <div className="flex flex-col sm:flex-row gap-4">
            <button 
              onClick={() => window.location.reload()}
              className="px-8 py-3 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-500 transition-all shadow-lg shadow-emerald-900/20"
            >
              Reload Application
            </button>
            <button 
              onClick={async () => {
                try {
                  await del(STORAGE_KEYS.CURRENT_SCENARIO_ID);
                  window.location.href = '/';
                } catch (e) {
                  window.location.href = '/';
                }
              }}
              className="px-8 py-3 bg-white/5 text-zinc-400 rounded-xl font-bold hover:text-white hover:bg-white/10 transition-all"
            >
              Return to Library
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default function App() {
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [isScenariosLoaded, setIsScenariosLoaded] = useState(false);
  const [currentScenarioId, setCurrentScenarioId] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  
  // Modal State
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type: 'delete' | 'reset' | null;
    targetId: string | null;
  }>({
    isOpen: false,
    title: '',
    message: '',
    type: null,
    targetId: null,
  });

  // Load scenarios and current ID from IndexedDB
  useEffect(() => {
    const loadData = async () => {
      try {
        const [savedScenarios, savedId] = await Promise.all([
          get(STORAGE_KEYS.SCENARIOS),
          get(STORAGE_KEYS.CURRENT_SCENARIO_ID)
        ]);

        let initialScenarios: Scenario[] = savedScenarios || [];

        if (!savedScenarios) {
          // Migration from localStorage
          const oldLocal = localStorage.getItem(STORAGE_KEYS.SCENARIOS);
          if (oldLocal) {
            try {
              initialScenarios = JSON.parse(oldLocal);
              await set(STORAGE_KEYS.SCENARIOS, initialScenarios);
              localStorage.removeItem(STORAGE_KEYS.SCENARIOS);
            } catch (e) {
              console.error("Failed to migrate scenarios", e);
            }
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

        // Validate ID before setting state
        const isValidId = initialScenarios.some(s => s.id === initialId);
        
        setScenarios(initialScenarios);
        setCurrentScenarioId(isValidId ? initialId : null);
      } catch (e) {
        console.error("Failed to load data from IndexedDB", e);
      } finally {
        setIsScenariosLoaded(true);
      }
    };
    loadData();
  }, []);

  const [isCreating, setIsCreating] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [showDraft, setShowDraft] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState(getSettings());

  useEffect(() => {
    const draft = localStorage.getItem(STORAGE_KEYS.DRAFT_DATA);
    const idea = localStorage.getItem(STORAGE_KEYS.DRAFT_IDEA);
    if ((draft || idea) && !currentScenarioId) {
      setShowDraft(true);
    }
  }, [currentScenarioId]);

  // Optimize scenario lookup
  const scenarioMap = useMemo(() => {
    return new Map(scenarios.map(s => [s.id, s]));
  }, [scenarios]);

  const currentScenario = currentScenarioId ? scenarioMap.get(currentScenarioId) : null;

  const backgroundColors = useMemo(() => {
    const tone = currentScenario?.profile.storyTone || 'Dramatic';
    switch (tone) {
      case 'Gritty': return { primary: 'bg-zinc-500/5', secondary: 'bg-slate-500/5' };
      case 'Whimsical': return { primary: 'bg-amber-500/5', secondary: 'bg-pink-500/5' };
      case 'Horror': return { primary: 'bg-red-500/5', secondary: 'bg-purple-900/10' };
      case 'Romantic': return { primary: 'bg-rose-500/5', secondary: 'bg-pink-400/5' };
      case 'Cyberpunk': return { primary: 'bg-cyan-500/5', secondary: 'bg-fuchsia-500/5' };
      case 'Noir': return { primary: 'bg-zinc-800/5', secondary: 'bg-black/20' };
      case 'Adventure': return { primary: 'bg-orange-500/5', secondary: 'bg-teal-500/5' };
      case 'Dramatic':
      default: return { primary: 'bg-emerald-500/5', secondary: 'bg-blue-500/5' };
    }
  }, [currentScenario?.profile.storyTone]);

  // Debounced save to IndexedDB
  useEffect(() => {
    if (!isScenariosLoaded) return;

    setSaveStatus('saving');
    const timeoutId = setTimeout(() => {
      set(STORAGE_KEYS.SCENARIOS, scenarios)
        .then(() => setSaveStatus('saved'))
        .catch(e => {
          console.error("Failed to save scenarios to IndexedDB", e);
          setSaveStatus('error');
          toast.error("Failed to save your progress to local storage.");
        });
    }, 1000);

    return () => clearTimeout(timeoutId);
  }, [scenarios, isScenariosLoaded]);

  // Save ID to IndexedDB
  useEffect(() => {
    if (isScenariosLoaded) {
      if (currentScenarioId) {
        set(STORAGE_KEYS.CURRENT_SCENARIO_ID, currentScenarioId).catch(() => setSaveStatus('error'));
      } else {
        del(STORAGE_KEYS.CURRENT_SCENARIO_ID).catch(() => setSaveStatus('error'));
      }
    }
  }, [currentScenarioId, isScenariosLoaded]);

  // Assume key is present to avoid prompting the user
  useEffect(() => {
    setHasKey(true);
  }, []);

  const handleCreateNew = () => {
    setIsCreating(true);
    setCurrentScenarioId(null);
  };

  const handleSelectScenario = (scenario: Scenario) => {
    setCurrentScenarioId(scenario.id);
    setIsCreating(false);
    setIsEditing(false);
  };

  const handleEditScenario = (scenario: Scenario) => {
    setCurrentScenarioId(scenario.id);
    setIsEditing(true);
    setIsCreating(false);
  };

  const handleConfirmAction = async () => {
    const { type, targetId } = confirmModal;
    if (!type || !targetId) return;

    if (type === 'delete' || type === 'reset') {
      setScenarios(prev => prev.filter(s => s.id !== targetId));
      await del(STORAGE_KEYS.SCENARIO_MESSAGES(targetId));
      localStorage.removeItem(STORAGE_KEYS.SCENARIO_MESSAGES(targetId));
      
      if (type === 'reset') {
        setCurrentScenarioId(null);
      }
      toast.success(type === 'delete' ? "Scenario deleted" : "Scenario reset");
    }

    setConfirmModal(prev => ({ ...prev, isOpen: false, type: null, targetId: null }));
  };

  const handleDeleteScenario = (id: string) => {
    setConfirmModal({
      isOpen: true,
      title: 'Delete Scenario',
      message: 'Are you sure you want to delete this scenario and all its messages? This action cannot be undone.',
      type: 'delete',
      targetId: id,
    });
  };

  const handleCharacterCreated = (profile: CharacterProfile, avatarBase64: string) => {
    try {
      const newScenario: Scenario = {
        id: generateId(),
        profile,
        avatarBase64,
        lastUpdated: Date.now()
      };
      setScenarios(prev => [...prev, newScenario]);
      setCurrentScenarioId(newScenario.id);
      setIsCreating(false);
      setShowDraft(false);
      
      // Clear draft ONLY on successful creation
      localStorage.removeItem(STORAGE_KEYS.DRAFT_DATA);
      localStorage.removeItem(STORAGE_KEYS.DRAFT_MODE);
      localStorage.removeItem(STORAGE_KEYS.DRAFT_IDEA);
      localStorage.removeItem(STORAGE_KEYS.DRAFT_STEP);
      localStorage.removeItem(STORAGE_KEYS.DRAFT_SETUP_TYPE);
      // We keep the rescue backup for one more session just in case
      toast.success("Character created successfully!");
    } catch (e: any) {
      console.error("Failed to create character:", e);
      toast.error(`Failed to create character: ${e.message || 'Unknown error'}`);
    }
  };

  const handleSaveEdit = (profile: CharacterProfile, avatarBase64: string) => {
    if (!currentScenarioId) return;
    setScenarios(prev => prev.map(s => 
      s.id === currentScenarioId 
        ? { ...s, profile, avatarBase64, lastUpdated: Date.now() } 
        : s
    ));
    setIsEditing(false);
    toast.success("Character updated successfully!");
  };

  const handleCarryOver = (profile: CharacterProfile, avatarBase64: string) => {
    // Create a new scenario with the same character but new ID (empty messages)
    const newScenario: Scenario = {
      id: generateId(),
      profile: {
        ...profile,
        relationship: 'Strangers', // Reset relationship for new scenario
        storyTone: 'Dramatic' // Reset tone
      },
      avatarBase64,
      lastUpdated: Date.now()
    };
    setScenarios(prev => [...prev, newScenario]);
    setCurrentScenarioId(newScenario.id);
    setIsCreating(false);
    setIsEditing(false);
    toast.success("Character carried over to new scenario!");
  };

  const handleUpdateProfile = (profile: CharacterProfile) => {
    if (!currentScenarioId) return;
    setScenarios(prev => prev.map(s => 
      s.id === currentScenarioId 
        ? { ...s, profile, lastUpdated: Date.now() } 
        : s
    ));
  };

  const handleBranchScenario = async (slicedMessages: Message[], codexEntries: CodexEntry[], storySummary: string) => {
    if (!currentScenario) return;
    
    const newScenarioId = generateId();
    const newScenario: Scenario = {
      id: newScenarioId,
      profile: {
        ...currentScenario.profile,
        name: `${currentScenario.profile.name} (Alternate Timeline)`
      },
      avatarBase64: currentScenario.avatarBase64,
      lastUpdated: Date.now()
    };

    // Save the branched data to IndexedDB
    await set(STORAGE_KEYS.SCENARIO_MESSAGES(newScenarioId), slicedMessages);
    await set(STORAGE_KEYS.SCENARIO_CODEX(newScenarioId), codexEntries);
    await set(STORAGE_KEYS.SCENARIO_SUMMARY(newScenarioId), storySummary);

    setScenarios(prev => [...prev, newScenario]);
    setCurrentScenarioId(newScenarioId);
    toast.success("Scenario branched into alternate timeline!");
  };

  const handleSettingsClose = () => {
    setShowSettings(false);
    setSettings(getSettings());
  };

  if (hasKey === null) {
    return <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-zinc-500">Loading...</div>;
  }

  return (
    <ErrorBoundary>
      <Toaster 
        position="top-right" 
        toastOptions={{
          className: 'glass-panel border border-white/10 text-white rounded-2xl p-4 shadow-2xl',
          style: {
            background: 'rgba(10, 10, 10, 0.8)',
            backdropFilter: 'blur(12px)',
          }
        }}
      />
      <div className="min-h-screen bg-[#050505] text-zinc-100 p-4 md:p-8 flex flex-col selection:bg-emerald-500/30">
      {/* Background Ambience */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <motion.div 
          animate={{ backgroundColor: backgroundColors.primary.replace('bg-', '').split('/')[0] }}
          className={`absolute top-[-10%] left-[-10%] w-[40%] h-[40%] ${backgroundColors.primary} blur-[120px] rounded-full animate-float transition-colors duration-1000`} 
        />
        <motion.div 
          animate={{ backgroundColor: backgroundColors.secondary.replace('bg-', '').split('/')[0] }}
          className={`absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] ${backgroundColors.secondary} blur-[120px] rounded-full animate-float transition-colors duration-1000`} 
          style={{ animationDelay: '-3s' }} 
        />
      </div>

      <header className="mb-12 flex items-center justify-between relative z-10">
        <div className="w-32">
          {currentScenarioId && (
            <button
              onClick={() => setCurrentScenarioId(null)}
              className="flex items-center gap-2 text-[10px] font-bold text-zinc-500 hover:text-white uppercase tracking-widest transition-all"
            >
              <Library className="w-4 h-4" />
              Library
            </button>
          )}
        </div>
        <div className="text-center">
          <h1 className="text-4xl font-serif font-bold text-white tracking-tighter">PersonaForge</h1>
          <div className="flex items-center justify-center gap-2 mt-2">
            <p className="text-[10px] uppercase tracking-[0.4em] text-zinc-500 font-bold">Immersive Narrative Engine</p>
            <div className={`px-2 py-0.5 rounded-full text-[8px] font-bold uppercase tracking-widest border ${
              settings.activeTextProvider === 'Google' 
                ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' 
                : 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20'
            }`}>
              {settings.activeTextProvider}
            </div>
            <div className={`px-2 py-0.5 rounded-full text-[8px] font-bold uppercase tracking-widest border ${
              settings.voiceEngine === 'Cinematic'
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
            }`}>
              {settings.voiceEngine}
            </div>
          </div>
        </div>
        <div className="w-32 flex justify-end gap-4 items-center">
          <button
            onClick={() => setShowSettings(true)}
            className="text-zinc-500 hover:text-white transition-colors"
            title="Settings"
          >
            <Settings className="w-5 h-5" />
          </button>
          {currentScenario && (
            <button
              onClick={() => {
                setConfirmModal({
                  isOpen: true,
                  title: 'Reset System',
                  message: 'Are you sure you want to delete this character and all messages? This will wipe the current narrative state.',
                  type: 'reset',
                  targetId: currentScenarioId,
                });
              }}
              className="text-[10px] font-bold text-zinc-600 hover:text-red-400 transition-all uppercase tracking-widest"
            >
              Reset System
            </button>
          )}
        </div>
      </header>

      <ConfirmationModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        onConfirm={handleConfirmAction}
        onCancel={() => setConfirmModal(prev => ({ ...prev, isOpen: false, type: null, targetId: null }))}
      />

      {showSettings && <SettingsModal onClose={handleSettingsClose} />}

      <main className="flex-1 flex flex-col max-w-7xl mx-auto w-full relative z-10">
        {!currentScenarioId && !isCreating && !showDraft ? (
          <ScenarioLibrary 
            scenarios={scenarios} 
            onSelect={handleSelectScenario} 
            onEdit={handleEditScenario}
            onDelete={handleDeleteScenario} 
            onNew={handleCreateNew} 
            hasDraft={true} // We show the button if there's any draft data
            onRestoreDraft={() => setShowDraft(true)}
          />
        ) : (isCreating || showDraft) && !currentScenarioId ? (
          <div className="flex-1 flex items-center justify-center py-10">
            <CharacterCreator 
              onCharacterCreated={handleCharacterCreated} 
              onCancel={() => {
                setIsCreating(false);
                setShowDraft(false);
              }}
            />
          </div>
        ) : isEditing && currentScenario ? (
          <div className="flex-1 flex items-center justify-center py-10">
            <CharacterEditor
              profile={currentScenario.profile}
              avatarBase64={currentScenario.avatarBase64}
              onSave={handleSaveEdit}
              onCancel={() => setIsEditing(false)}
            />
          </div>
        ) : currentScenario ? (
          <div className="flex-1 h-[85vh]">
            <ChatInterface 
              profile={currentScenario.profile} 
              avatarBase64={currentScenario.avatarBase64} 
              scenarioId={currentScenario.id}
              onEditCharacter={() => setIsEditing(true)} 
              onCarryOver={() => handleCarryOver(currentScenario.profile, currentScenario.avatarBase64)}
              onUpdateProfile={handleUpdateProfile}
              onBranchScenario={handleBranchScenario}
            />
          </div>
        ) : null}
      </main>
      
      <footer className="mt-8 text-center relative z-10 flex flex-col items-center gap-4">
        <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10">
          {saveStatus === 'saving' && (
            <div className="flex items-center gap-2 text-[10px] text-zinc-500 uppercase tracking-widest">
              <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
              Saving...
            </div>
          )}
          {saveStatus === 'saved' && (
            <div className="flex items-center gap-2 text-[10px] text-emerald-500 uppercase tracking-widest">
              <CheckCircle2 className="w-3 h-3" />
              Saved
            </div>
          )}
          {saveStatus === 'error' && (
            <div className="flex items-center gap-2 text-[10px] text-red-500 uppercase tracking-widest">
              <AlertCircle className="w-3 h-3" />
              Save Error
            </div>
          )}
          {saveStatus === 'idle' && (
            <div className="text-[10px] text-zinc-600 uppercase tracking-widest">Ready</div>
          )}
        </div>
        <p className="text-[9px] uppercase tracking-[0.3em] text-zinc-700 font-bold">PersonaForge v2.0 • Immersive Roleplay Assistant</p>
      </footer>
    </div>
    </ErrorBoundary>
  );
}
