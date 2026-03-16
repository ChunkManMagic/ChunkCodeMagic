import { useState, useEffect, Component, ErrorInfo, ReactNode } from 'react';
import { get, set, del } from 'idb-keyval';
import { motion, AnimatePresence } from 'motion/react';
import { CharacterCreator } from './components/CharacterCreator';
import { ChatInterface } from './components/ChatInterface';
import { CharacterEditor } from './components/CharacterEditor';
import { ScenarioLibrary } from './components/ScenarioLibrary';
import { CharacterProfile, Scenario, generateId } from './lib/gemini';
import { Library } from 'lucide-react';

// Declare global window properties for AI Studio
declare global {
  interface Window {
    aistudio?: {
      hasSelectedApiKey: () => Promise<boolean>;
      openSelectKey: () => Promise<void>;
    };
  }
}

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
class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(_: Error) {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#050505] flex flex-col items-center justify-center p-8 text-center">
          <h2 className="text-3xl font-serif text-white mb-4">Something went wrong</h2>
          <p className="text-zinc-500 mb-8 max-w-md">The narrative engine encountered an unexpected error. Don't worry, your progress is likely safe in the library.</p>
          <button 
            onClick={() => window.location.reload()}
            className="px-8 py-3 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-500 transition-all"
          >
            Reload Application
          </button>
          <button 
            onClick={async () => {
              await del('personaforge_current_scenario_id');
              window.location.href = '/';
            }}
            className="mt-4 text-zinc-500 hover:text-white text-sm underline"
          >
            Return to Library
          </button>
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
  
  // Modal State
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  // Load scenarios and current ID from IndexedDB
  useEffect(() => {
    const loadData = async () => {
      try {
        const [savedScenarios, savedId] = await Promise.all([
          get('personaforge_scenarios'),
          get('personaforge_current_scenario_id')
        ]);

        if (savedScenarios) {
          setScenarios(savedScenarios);
        } else {
          // Migration
          const oldLocal = localStorage.getItem('personaforge_scenarios');
          if (oldLocal) {
            try {
              const parsed = JSON.parse(oldLocal);
              setScenarios(parsed);
              await set('personaforge_scenarios', parsed);
              localStorage.removeItem('personaforge_scenarios');
            } catch (e) {}
          }
        }

        if (savedId) {
          setCurrentScenarioId(savedId);
        } else {
          const oldId = localStorage.getItem('personaforge_current_scenario_id');
          if (oldId) {
            setCurrentScenarioId(oldId);
            await set('personaforge_current_scenario_id', oldId);
            localStorage.removeItem('personaforge_current_scenario_id');
          }
        }
      } catch (e) {
        console.error("Failed to load data from IndexedDB", e);
      } finally {
        setIsScenariosLoaded(true);
      }
    };
    loadData();
  }, []);

  // Safety check: wait for scenarios to load before validating ID
  useEffect(() => {
    if (isScenariosLoaded && currentScenarioId && !scenarios.find(s => s.id === currentScenarioId)) {
      setCurrentScenarioId(null);
    }
  }, [scenarios, currentScenarioId, isScenariosLoaded]);

  const [isCreating, setIsCreating] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [showDraft, setShowDraft] = useState(false);

  useEffect(() => {
    const draft = localStorage.getItem('personaforge_draft_profile');
    const idea = localStorage.getItem('personaforge_draft_idea');
    if ((draft || idea) && !currentScenarioId) {
      setShowDraft(true);
    }
  }, [currentScenarioId]);

  const currentScenario = scenarios.find(s => s.id === currentScenarioId);

  // Save to IndexedDB
  useEffect(() => {
    if (isScenariosLoaded) {
      set('personaforge_scenarios', scenarios).catch(e => {
        console.error("Failed to save scenarios to IndexedDB", e);
      });
    }
  }, [scenarios, isScenariosLoaded]);

  // Save ID to IndexedDB
  useEffect(() => {
    if (isScenariosLoaded) {
      if (currentScenarioId) {
        set('personaforge_current_scenario_id', currentScenarioId);
      } else {
        del('personaforge_current_scenario_id');
      }
    }
  }, [currentScenarioId, isScenariosLoaded]);

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

  const handleDeleteScenario = (id: string) => {
    setConfirmModal({
      isOpen: true,
      title: 'Delete Scenario',
      message: 'Are you sure you want to delete this scenario and all its messages? This action cannot be undone.',
      onConfirm: async () => {
        setScenarios(prev => prev.filter(s => s.id !== id));
        await del(`personaforge_messages_${id}`);
        localStorage.removeItem(`personaforge_messages_${id}`);
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
      }
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
      localStorage.removeItem('personaforge_draft_profile');
      localStorage.removeItem('personaforge_draft_mode');
      localStorage.removeItem('personaforge_draft_idea');
      localStorage.removeItem('personaforge_draft_step');
      localStorage.removeItem('personaforge_draft_setup_type');
      // We keep the rescue backup for one more session just in case
    } catch (e) {
      console.error("Failed to create character:", e);
      alert("There was an error saving your character. Please try again.");
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
  };

  const handleUpdateProfile = (profile: CharacterProfile) => {
    if (!currentScenarioId) return;
    setScenarios(prev => prev.map(s => 
      s.id === currentScenarioId 
        ? { ...s, profile, lastUpdated: Date.now() } 
        : s
    ));
  };

  if (hasKey === null) {
    return <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-zinc-500">Loading...</div>;
  }

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-[#050505] text-zinc-100 p-4 md:p-8 flex flex-col selection:bg-emerald-500/30">
      {/* Background Ambience */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-emerald-500/5 blur-[120px] rounded-full animate-float" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-500/5 blur-[120px] rounded-full animate-float" style={{ animationDelay: '-3s' }} />
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
          <p className="text-[10px] uppercase tracking-[0.4em] text-zinc-500 mt-2 font-bold">Immersive Narrative Engine</p>
        </div>
        <div className="w-32 flex justify-end">
          {currentScenario && (
            <button
              onClick={() => {
                setConfirmModal({
                  isOpen: true,
                  title: 'Reset System',
                  message: 'Are you sure you want to delete this character and all messages? This will wipe the current narrative state.',
                  onConfirm: () => {
                    handleDeleteScenario(currentScenarioId!);
                    setCurrentScenarioId(null);
                    setConfirmModal(prev => ({ ...prev, isOpen: false }));
                  }
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
        onConfirm={confirmModal.onConfirm}
        onCancel={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
      />

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
            />
          </div>
        ) : null}
      </main>
      
      <footer className="mt-8 text-center relative z-10">
        <p className="text-[9px] uppercase tracking-[0.3em] text-zinc-700 font-bold">PersonaForge v2.0 • Immersive Roleplay Assistant</p>
      </footer>
    </div>
    </ErrorBoundary>
  );
}
