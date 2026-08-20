import { useState, useEffect, useMemo, useCallback, Component, ErrorInfo, ReactNode, lazy, Suspense } from 'react';
import { get, set, del } from 'idb-keyval';
import { motion, AnimatePresence } from 'motion/react';
import { CharacterProfile, generateId } from './lib/gemini';
import { Scenario, getSettings, Message, CodexEntry } from './lib/types';
import { importStory, exportStory, downloadExport, PersonaForgeStoryExport } from './lib/transfer';
import { Library, AlertCircle, CheckCircle2, Settings, LogIn, User as UserIcon } from 'lucide-react';
import { STORAGE_KEYS } from './constants';
import { useStaleDataCleanup } from './hooks/useStorage';
import { ToastContainer } from './components/ToastContainer';
import { OfflineBanner } from './components/OfflineBanner';
import { useToast } from './hooks/useToast';
import { useFirestoreSync } from './hooks/useFirestoreSync';
import { SyncConflictModal } from './components/SyncConflictModal';
import { collection, getDocs } from 'firebase/firestore';
import { db, auth } from './firebase';
import { signInWithPopup, GoogleAuthProvider, signOut } from 'firebase/auth';

// Heavy screens are code-split so the app shell loads fast; each screen only
// downloads when it's actually opened. Components use named exports, so map
// them to the default shape React.lazy expects.
const CharacterCreator = lazy(() =>
  import('./components/CharacterCreator').then((m) => ({ default: m.CharacterCreator }))
);
const CharacterEditor = lazy(() =>
  import('./components/CharacterEditor').then((m) => ({ default: m.CharacterEditor }))
);
const ScenarioLibrary = lazy(() =>
  import('./components/ScenarioLibrary').then((m) => ({ default: m.ScenarioLibrary }))
);
const ChatInterface = lazy(() =>
  import('./components/ChatInterface').then((m) => ({ default: m.ChatInterface }))
);
const SettingsModal = lazy(() =>
  import('./components/SettingsModal').then((m) => ({ default: m.SettingsModal }))
);

const ScreenLoader = () => (
  <div className="flex-1 flex items-center justify-center py-20">
    <div className="w-9 h-9 border-2 border-emerald-500/30 border-t-emerald-400 rounded-full animate-spin" />
  </div>
);

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

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center p-8 text-center bg-zinc-900/50 rounded-3xl border border-red-500/20 backdrop-blur-sm min-h-[400px]">
          <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mb-6 border border-red-500/20">
            <AlertCircle className="w-8 h-8 text-red-500" />
          </div>
          <h2 className="text-2xl font-serif text-white mb-3">View Error</h2>
          <p className="text-zinc-400 mb-6 max-w-md text-sm">This component encountered an unexpected error. You can try resetting this view or reloading the entire app.</p>
          
          <div className="flex flex-col sm:flex-row gap-3">
            <button 
              onClick={this.handleReset}
              className="px-6 py-2.5 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-500 transition-all text-sm"
            >
              Try again
            </button>
            <button 
              onClick={() => window.location.reload()}
              className="px-6 py-2.5 bg-white/5 text-zinc-400 rounded-xl font-bold hover:text-white hover:bg-white/10 transition-all text-sm"
            >
              Reload App
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}


export default function App() {
  const { 
    user, 
    isAuthReady, 
    isSyncing,
    syncScenarios, 
    saveScenario, 
    deleteScenario 
  } = useFirestoreSync();
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [isScenariosLoaded, setIsScenariosLoaded] = useState(false);
  const [currentScenarioId, setCurrentScenarioId] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [conflict, setConflict] = useState<{ local: Scenario, remote: Scenario } | null>(null);
  const [conflictQueue, setConflictQueue] = useState<{ local: Scenario, remote: Scenario }[]>([]);
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type: 'delete' | 'reset' | 'rewind' | null;
    targetId: string | null;
  }>({ isOpen: false, title: '', message: '', type: null, targetId: null });
  
  useStaleDataCleanup(scenarios, isScenariosLoaded);
  
  // Sync scenarios from Firestore when user is logged in
  useEffect(() => {
    if (isAuthReady && user) {
      // Migrate local scenarios to Firestore
      const migrateToFirestore = async () => {
        try {
          const migratedFlag = localStorage.getItem(`migrated_to_firestore_${user.uid}`);
          if (migratedFlag) return;

          const localScenarios: Scenario[] = await get(STORAGE_KEYS.SCENARIOS) || [];
          const localScenariosStr = localStorage.getItem(STORAGE_KEYS.SCENARIOS);
          if (localScenariosStr) {
            try {
              const ls = JSON.parse(localScenariosStr);
              if (Array.isArray(ls)) {
                // Merge and deduplicate
                const seenIds = new Set(localScenarios.map(s => s.id));
                for (const s of ls) {
                  if (!seenIds.has(s.id)) {
                    localScenarios.push(s);
                    seenIds.add(s.id);
                  }
                }
              }
            } catch (e) {}
          }

          if (localScenarios.length > 0) {
            console.log("Checking for sync conflicts...");
            
            // Get current remote scenarios
            const remoteSnap = await getDocs(collection(db, 'users', user.uid, 'scenarios'));
            const remoteScenariosMap = new Map(remoteSnap.docs.map(doc => [doc.id, doc.data() as Scenario]));
            
            const conflicts: { local: Scenario, remote: Scenario }[] = [];
            const freshMigrates: Scenario[] = [];

            for (const local of localScenarios) {
              const remote = remoteScenariosMap.get(local.id);
              if (remote) {
                // Potential conflict if they differ significantly (e.g. timestamps or name)
                const isDifferent = Math.abs(local.lastUpdated - remote.lastUpdated) > 5000 || 
                                   local.profile.name !== remote.profile.name;
                
                if (isDifferent) {
                  conflicts.push({ local, remote });
                }
              } else {
                freshMigrates.push(local);
              }
            }

            // Save non-conflicting ones
            for (const scenario of freshMigrates) {
              await saveScenario(scenario);
            }

            if (conflicts.length > 0) {
              setConflictQueue(conflicts.slice(1));
              setConflict(conflicts[0]);
            } else {
              localStorage.setItem(`migrated_to_firestore_${user.uid}`, 'true');
            }
          } else {
            localStorage.setItem(`migrated_to_firestore_${user.uid}`, 'true');
          }
        } catch (e) {
          console.error("Migration to Firestore failed", e);
        }
      };

      migrateToFirestore();

      const unsubscribe = syncScenarios((syncedScenarios) => {
        setScenarios(syncedScenarios);
        setIsScenariosLoaded(true);
      });
      return () => unsubscribe();
    } else if (isAuthReady && !user) {
      // If not logged in, we could load from IndexedDB or show login
      const loadLocal = async () => {
        let savedScenarios = await get(STORAGE_KEYS.SCENARIOS);
        
        // Migration: Check if scenarios exist in localStorage (from older versions)
        try {
          const localScenariosStr = localStorage.getItem(STORAGE_KEYS.SCENARIOS);
          if (localScenariosStr) {
            const localScenarios = JSON.parse(localScenariosStr);
            if (Array.isArray(localScenarios) && localScenarios.length > 0) {
              // Merge localScenarios with savedScenarios
              if (!savedScenarios) savedScenarios = [];
              
              const existingIds = new Set(savedScenarios.map((s: any) => s.id));
              let migrated = false;
              
              for (const ls of localScenarios) {
                if (!existingIds.has(ls.id)) {
                  savedScenarios.push(ls);
                  migrated = true;
                }
              }
              
              if (migrated) {
                console.log("Migrated scenarios from localStorage to IndexedDB");
                await set(STORAGE_KEYS.SCENARIOS, savedScenarios);
              }
            }
          }
        } catch (e) {
          console.error("Failed to migrate scenarios from localStorage", e);
        }

        setScenarios(savedScenarios || []);
        setIsScenariosLoaded(true);
      };
      loadLocal();
    }
  }, [isAuthReady, user, syncScenarios, saveScenario]);

  // Load current ID from IndexedDB
  useEffect(() => {
    const loadId = async () => {
      const savedId = await get(STORAGE_KEYS.CURRENT_SCENARIO_ID);
      if (savedId) {
        setCurrentScenarioId(savedId);
      }
    };
    loadId();
  }, []);

  const [isCreating, setIsCreating] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [showDraft, setShowDraft] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState(getSettings());
  const { toastSuccess, toastError } = useToast();

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

  // Debounced save to IndexedDB (and Firestore if logged in)
  useEffect(() => {
    if (!isScenariosLoaded) return;

    setSaveStatus('saving');
    const timeoutId = setTimeout(() => {
      // Local save
      set(STORAGE_KEYS.SCENARIOS, scenarios)
        .then(() => setSaveStatus('saved'))
        .catch(e => {
          console.error("Failed to save scenarios to IndexedDB", e);
          setSaveStatus('error');
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

  const handleLogin = useCallback(async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
      toastSuccess("Successfully signed in!");
    } catch (error: any) {
      console.error("Login Error:", error);
      toastError(`Login failed: ${error.message}`);
    }
  }, [toastSuccess, toastError]);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      toastSuccess("Successfully signed out!");
      setCurrentScenarioId(null);
    } catch (error: any) {
      console.error("Logout Error:", error);
      toastError("Logout failed");
    }
  };

  const handleCreateNew = useCallback(() => {
    if (!user) {
      handleLogin();
      return;
    }
    setIsCreating(true);
    setCurrentScenarioId(null);
  }, [user, handleLogin]);

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

  const handleDuplicateScenario = (scenario: Scenario) => {
    localStorage.setItem(STORAGE_KEYS.DRAFT_DATA, JSON.stringify(scenario.profile));
    localStorage.setItem(STORAGE_KEYS.DRAFT_MODE, scenario.profile.mode);
    localStorage.setItem(STORAGE_KEYS.DRAFT_SETUP_TYPE, 'detailed');
    localStorage.setItem(STORAGE_KEYS.DRAFT_STEP, 'idle');
    localStorage.setItem(STORAGE_KEYS.DRAFT_IDEA, '');
    
    // Also save a rescue backup just in case
    localStorage.setItem(STORAGE_KEYS.RESCUE_BACKUP, JSON.stringify({
      step: 'idle',
      appMode: scenario.profile.mode,
      setupType: 'detailed',
      idea: '',
      detailedProfile: scenario.profile
    }));

    setCurrentScenarioId(null);
    setIsCreating(true);
    setShowDraft(true);
  };

  const handleConfirmAction = async () => {
    const { type, targetId } = confirmModal;
    if (!type || !targetId) return;

    if (type === 'delete' || type === 'reset') {
      if (user) {
        await deleteScenario(targetId);
      }
      setScenarios(prev => prev.filter(s => s.id !== targetId));
      await del(STORAGE_KEYS.SCENARIO_MESSAGES(targetId));
      localStorage.removeItem(STORAGE_KEYS.SCENARIO_MESSAGES(targetId));
      
      if (type === 'reset') {
        setCurrentScenarioId(null);
      }
      toastSuccess(type === 'delete' ? "Scenario deleted" : "Scenario reset");
    }

    setConfirmModal(prev => ({ ...prev, isOpen: false, type: null, targetId: null }));
  };

  const handleResolveConflict = async (choice: 'local' | 'remote' | 'branch' | 'delete-local' | 'delete-remote') => {
    if (!conflict || !user) return;
    const { local, remote } = conflict;

    try {
      switch (choice) {
        case 'local': {
          await saveScenario(local);
          toastSuccess(`Updated cloud with local version of "${local.profile.name}"`);
          break;
        }
        case 'remote': {
          toastSuccess(`Using cloud version of "${remote.profile.name}"`);
          break;
        }
        case 'branch': {
          const newId = generateId();
          const branched: Scenario = { 
            ...local, 
            id: newId, 
            profile: { ...local.profile, name: `${local.profile.name} (Local Copy)` },
            lastUpdated: Date.now()
          };
          
          await saveScenario(branched);
          
          // Copy messages/data
          const msgs = await get(STORAGE_KEYS.SCENARIO_MESSAGES(local.id)) || [];
          if (msgs.length > 0) {
            await set(STORAGE_KEYS.SCENARIO_MESSAGES(newId), msgs);
          }
          const codex = await get(STORAGE_KEYS.SCENARIO_CODEX(local.id)) || [];
          if (codex.length > 0) {
            await set(STORAGE_KEYS.SCENARIO_CODEX(newId), codex);
          }
          const summary = await get(STORAGE_KEYS.SCENARIO_SUMMARY(local.id)) || "";
          if (summary) {
            await set(STORAGE_KEYS.SCENARIO_SUMMARY(newId), summary);
          }
          
          toastSuccess(`Branched "${local.profile.name}" into new scenario`);
          break;
        }
        case 'delete-local': {
          // Handled by just closing and not saving local
          toastSuccess(`Local version of "${local.profile.name}" discarded`);
          break;
        }
        case 'delete-remote': {
          await deleteScenario(remote.id);
          await saveScenario(local);
          toastSuccess(`Cloud version of "${remote.profile.name}" deleted and replaced with local`);
          break;
        }
      }
    } catch (err) {
      console.error("Conflict resolution error:", err);
      toastError("Failed to resolve conflict");
    } finally {
      setConflict(null);
      if (conflictQueue.length > 0) {
        setTimeout(() => {
          setConflict(conflictQueue[0]);
          setConflictQueue(prev => prev.slice(1));
        }, 300);
      } else {
        localStorage.setItem(`migrated_to_firestore_${user.uid}`, 'true');
      }
    }
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

  const handleImportScenario = async (importedData: PersonaForgeStoryExport) => {
    try {
      const imported = importStory(importedData);
      if (!imported) {
        toastError("Invalid export file format.");
        return;
      }

      const newScenarioId = generateId();
      const newScenario: Scenario = {
        ...imported.scenario,
        id: newScenarioId,
        lastUpdated: Date.now()
      };

      if (user) {
        await saveScenario(newScenario);
      }
      
      if (imported.messages.length > 0) {
        await set(STORAGE_KEYS.SCENARIO_MESSAGES(newScenarioId), imported.messages);
      }
      if (imported.codex.length > 0) {
        await set(STORAGE_KEYS.SCENARIO_CODEX(newScenarioId), imported.codex);
      }
      if (imported.inventory.length > 0) {
        await set(STORAGE_KEYS.SCENARIO_INVENTORY(newScenarioId), imported.inventory);
      }
      if (imported.summary) {
        await set(STORAGE_KEYS.SCENARIO_SUMMARY(newScenarioId), imported.summary);
      }

      setScenarios(prev => [...prev, newScenario]);
    } catch (err) {
      console.error("Import error:", err);
      toastError("Failed to import story data.");
    }
  };

  const handleExportScenario = async (scenario: Scenario) => {
    try {
      const messages = await get(STORAGE_KEYS.SCENARIO_MESSAGES(scenario.id)) || [];
      const codex = await get(STORAGE_KEYS.SCENARIO_CODEX(scenario.id)) || [];
      const inventory = await get(STORAGE_KEYS.SCENARIO_INVENTORY(scenario.id)) || [];
      const summary = await get(STORAGE_KEYS.SCENARIO_SUMMARY(scenario.id)) || undefined;
      
      const exportData = exportStory(scenario, messages, codex, inventory, summary);
      downloadExport(exportData, `personaforge-${scenario.profile.name}-${Date.now()}.json`);
    } catch (err) {
      console.error("Export error:", err);
      toastError("Failed to export story.");
    }
  };

  const [branchData, setBranchData] = useState<{ messages: Message[], codex: CodexEntry[], summary: string, defaultName: string } | null>(null);
  const [branchName, setBranchName] = useState("");

  const handleCharacterCreated = async (profile: CharacterProfile, avatarBase64: string) => {
    try {
      let newScenario: Scenario = {
        id: generateId(),
        profile,
        avatarBase64,
        lastUpdated: Date.now()
      };

      if (user) {
        newScenario = await saveScenario(newScenario);
      }

      setScenarios(prev => [...prev, newScenario]);
      setCurrentScenarioId(newScenario.id);
      setIsCreating(false);
      setShowDraft(false);
      
      localStorage.removeItem(STORAGE_KEYS.DRAFT_DATA);
      localStorage.removeItem(STORAGE_KEYS.DRAFT_MODE);
      localStorage.removeItem(STORAGE_KEYS.DRAFT_IDEA);
      localStorage.removeItem(STORAGE_KEYS.DRAFT_STEP);
      localStorage.removeItem(STORAGE_KEYS.DRAFT_SETUP_TYPE);
      localStorage.removeItem(STORAGE_KEYS.RESCUE_BACKUP);
      toastSuccess("Character created successfully!");
    } catch (e: any) {
      console.error("Failed to create character:", e);
      toastError(`Failed to create character: ${e.message || 'Unknown error'}`);
    }
  };

  const handleSaveEdit = async (profile: CharacterProfile, avatarBase64: string) => {
    if (!currentScenarioId) return;
    let updatedScenario = {
      ...currentScenario!,
      profile,
      avatarBase64,
      lastUpdated: Date.now()
    };

    if (user) {
      updatedScenario = await saveScenario(updatedScenario);
    }

    setScenarios(prev => prev.map(s => 
      s.id === currentScenarioId ? updatedScenario : s
    ));
    setIsEditing(false);
    toastSuccess("Character updated successfully!");
  };

  const handleCarryOver = async (profile: CharacterProfile, avatarBase64: string) => {
    // Create a new scenario with the same character but new ID (empty messages)
    let newScenario: Scenario = {
      id: generateId(),
      profile: {
        ...profile,
        relationship: 'Strangers', // Reset relationship for new scenario
        storyTone: 'Dramatic', // Reset tone
        currentMood: 'Neutral' // Reset mood
      },
      avatarBase64,
      lastUpdated: Date.now()
    };

    if (user) {
      newScenario = await saveScenario(newScenario);
    }

    setScenarios(prev => [...prev, newScenario]);
    setCurrentScenarioId(newScenario.id);
    setIsCreating(false);
    setIsEditing(false);
    toastSuccess("Character carried over to new scenario!");
  };

  const handleUpdateProfile = async (profile: CharacterProfile) => {
    if (!currentScenarioId) return;
    let updatedScenario = {
      ...currentScenario!,
      profile,
      lastUpdated: Date.now()
    };

    if (user) {
      updatedScenario = await saveScenario(updatedScenario);
    }

    setScenarios(prev => prev.map(s => 
      s.id === currentScenarioId ? updatedScenario : s
    ));
  };
  
  const handleUpdateAvatar = async (avatarBase64: string) => {
    if (!currentScenarioId) return;
    let updatedScenario = {
      ...currentScenario!,
      avatarBase64,
      lastUpdated: Date.now()
    };

    if (user) {
      updatedScenario = await saveScenario(updatedScenario);
    }

    setScenarios(prev => prev.map(s => 
      s.id === currentScenarioId ? updatedScenario : s
    ));
  };

  const handleBranchScenario = async (slicedMessages: Message[], codexEntries: CodexEntry[], storySummary: string) => {
    if (!currentScenario) return;
    setBranchData({
      messages: slicedMessages,
      codex: codexEntries,
      summary: storySummary,
      defaultName: `${currentScenario.profile.name} (Branch)`
    });
    setBranchName(`${currentScenario.profile.name} (Branch)`);
  };

  const confirmBranchScenario = async () => {
    if (!currentScenario || !branchData) return;
    
    const newScenarioId = generateId();
    let newScenario: Scenario = {
      id: newScenarioId,
      profile: {
        ...currentScenario.profile,
        name: branchName.trim() || branchData.defaultName
      },
      avatarBase64: currentScenario.avatarBase64,
      lastUpdated: Date.now()
    };

    if (user) {
      newScenario = await saveScenario(newScenario);
    }

    // Save the branched data to IndexedDB
    await set(STORAGE_KEYS.SCENARIO_MESSAGES(newScenarioId), branchData.messages);
    await set(STORAGE_KEYS.SCENARIO_CODEX(newScenarioId), branchData.codex);
    await set(STORAGE_KEYS.SCENARIO_SUMMARY(newScenarioId), branchData.summary);

    setScenarios(prev => [...prev, newScenario]);
    setCurrentScenarioId(newScenarioId);
    setBranchData(null);
    toastSuccess("Scenario branched into alternate timeline!");
  };

  const handleSettingsClose = () => {
    setShowSettings(false);
    setSettings(getSettings());
  };

  useEffect(() => {
    const handleConfirm = () => setCurrentScenarioId(null);
    window.addEventListener('confirm-navigate-library', handleConfirm);
    return () => window.removeEventListener('confirm-navigate-library', handleConfirm);
  }, []);

  const handleLibraryClick = useCallback(() => {
    if (currentScenarioId) {
      window.dispatchEvent(new CustomEvent('request-navigate-library'));
    } else {
      setCurrentScenarioId(null);
    }
  }, [currentScenarioId]);

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        if (e.key === 'Escape') {
          target.blur();
        }
        return;
      }

      // Global Shortcuts
      if (e.altKey) {
        switch (e.key.toLowerCase()) {
          case 's':
            e.preventDefault();
            setShowSettings(prev => !prev);
            break;
          case 'n':
            e.preventDefault();
            handleCreateNew();
            break;
          case 'l':
            e.preventDefault();
            handleLibraryClick();
            break;
        }
      }

      // Escape to close modals or go back
      if (e.key === 'Escape') {
        if (showSettings) {
          handleSettingsClose();
        } else if (confirmModal.isOpen) {
          setConfirmModal(prev => ({ ...prev, isOpen: false, type: null, targetId: null }));
        } else if (isCreating || showDraft) {
          setIsCreating(false);
          setShowDraft(false);
        } else if (isEditing) {
          setIsEditing(false);
        } else if (currentScenarioId) {
          handleLibraryClick();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showSettings, confirmModal.isOpen, isCreating, showDraft, isEditing, currentScenarioId, handleCreateNew, handleLibraryClick]);

  if (!isAuthReady) {
    return <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-zinc-500">Initializing Engine...</div>;
  }

    const fontClass = settings.fontFamily === 'serif' ? 'font-serif' : settings.fontFamily === 'mono' ? 'font-mono' : 'font-sans';

    return (
      <>
        <ToastContainer />
        <OfflineBanner isSyncing={isSyncing} />
        <div className={`min-h-screen animated-bg text-zinc-100 p-4 md:p-8 flex flex-col selection:bg-emerald-500/30 ${fontClass}`}>
        {/* Background Ambience */}
        {settings.enableAmbientGlow !== false && (
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
        )}

      <header className="mb-12 flex items-center justify-between relative z-10">
        <div className="w-32">
          {currentScenarioId && (
            <button
              onClick={handleLibraryClick}
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
          {user ? (
            <div className="flex items-center gap-3">
              <div className="flex flex-col items-end">
                <span className="text-[8px] text-zinc-500 uppercase tracking-widest font-bold">{user.displayName}</span>
                <button 
                  onClick={handleLogout}
                  className="text-[8px] text-zinc-600 hover:text-white uppercase tracking-widest font-bold"
                >
                  Sign Out
                </button>
              </div>
              {user.photoURL ? (
                <img src={user.photoURL} alt="" className="w-8 h-8 rounded-full border border-white/10" referrerPolicy="no-referrer" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
                  <UserIcon className="w-4 h-4 text-zinc-500" />
                </div>
              )}
            </div>
          ) : (
            <button
              onClick={handleLogin}
              className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 text-[10px] font-bold text-zinc-400 hover:text-white hover:bg-white/10 transition-all uppercase tracking-widest"
            >
              <LogIn className="w-3 h-3" />
              Sign In
            </button>
          )}
          <button
            onClick={() => setShowSettings(true)}
            className="text-zinc-500 hover:text-white transition-colors"
            title="Settings"
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </header>

      <ConfirmationModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        onConfirm={handleConfirmAction}
        onCancel={() => setConfirmModal(prev => ({ ...prev, isOpen: false, type: null, targetId: null }))}
      />

      {showSettings && (
        <Suspense fallback={null}>
          <SettingsModal onClose={handleSettingsClose} />
        </Suspense>
      )}

      {conflict && (
        <SyncConflictModal 
          localScenario={conflict.local} 
          remoteScenario={conflict.remote} 
          onResolve={handleResolveConflict} 
        />
      )}

      <main className="flex-1 flex flex-col max-w-7xl mx-auto w-full relative z-10">
        {!currentScenarioId && !isCreating && !showDraft ? (
          <ErrorBoundary>
            <Suspense fallback={<ScreenLoader />}>
              <ScenarioLibrary 
                scenarios={Array.from(new Map(scenarios.map(s => [s.id, s])).values())} 
                onSelect={handleSelectScenario} 
                onEdit={handleEditScenario}
                onDuplicate={handleDuplicateScenario}
                onDelete={handleDeleteScenario} 
                onNew={handleCreateNew} 
                hasDraft={!!(localStorage.getItem(STORAGE_KEYS.DRAFT_DATA) || localStorage.getItem(STORAGE_KEYS.DRAFT_IDEA))}
                onRestoreDraft={() => setShowDraft(true)}
                onImport={handleImportScenario}
                onExport={handleExportScenario}
              />
            </Suspense>
          </ErrorBoundary>
        ) : (isCreating || showDraft) && !currentScenarioId ? (
          <div className="flex-1 flex items-center justify-center py-10">
            <ErrorBoundary>
              <Suspense fallback={<ScreenLoader />}>
                <CharacterCreator 
                  scenarios={scenarios}
                  onCharacterCreated={handleCharacterCreated} 
                  onCancel={() => {
                    setIsCreating(false);
                    setShowDraft(false);
                  }}
                />
              </Suspense>
            </ErrorBoundary>
          </div>
        ) : isEditing && currentScenario ? (
          <div className="flex-1 flex items-center justify-center py-10">
            <ErrorBoundary>
              <Suspense fallback={<ScreenLoader />}>
                <CharacterEditor
                  profile={currentScenario.profile}
                  avatarBase64={currentScenario.avatarBase64}
                  onSave={handleSaveEdit}
                  onCancel={() => setIsEditing(false)}
                  scenarios={scenarios}
                />
              </Suspense>
            </ErrorBoundary>
          </div>
        ) : currentScenario ? (
          <div className="flex-1 min-h-0">
            <ErrorBoundary>
              <Suspense fallback={<ScreenLoader />}>
                <ChatInterface 
                  profile={currentScenario.profile} 
                  avatarBase64={currentScenario.avatarBase64} 
                  scenarioId={currentScenario.id}
                  onEditCharacter={() => setIsEditing(true)} 
                  onCarryOver={() => handleCarryOver(currentScenario.profile, currentScenario.avatarBase64)}
                  onUpdateProfile={handleUpdateProfile}
                  onUpdateAvatar={handleUpdateAvatar}
                  onBranchScenario={handleBranchScenario}
                />
              </Suspense>
            </ErrorBoundary>
          </div>
        ) : null}
      </main>

      {branchData && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-white/10 rounded-2xl p-6 max-w-md w-full shadow-2xl">
            <h3 className="text-xl font-bold text-white mb-4">Name this alternate timeline:</h3>
            <input
              type="text"
              value={branchName}
              onChange={(e) => setBranchName(e.target.value)}
              className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500 mb-6"
              placeholder={branchData.defaultName}
              autoFocus
            />
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setBranchData(null)}
                className="px-4 py-2 text-zinc-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmBranchScenario}
                className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold transition-colors"
              >
                Branch Timeline
              </button>
            </div>
          </div>
        </div>
      )}
      
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
    </>
  );
}
