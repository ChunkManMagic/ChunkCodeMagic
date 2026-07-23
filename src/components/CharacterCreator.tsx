import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, Loader2, User, Image as ImageIcon, Globe, Heart, Swords, ArrowLeft, ArrowRight, Settings2, RotateCcw, Volume2 } from 'lucide-react';
import { useToast } from '../hooks/useToast';
import { getSmartSuggestions, generateCharacterProfile, generateAvatar, CharacterProfile, refineField, refineTraits, AppMode, refinePlayerProfile, InventoryItem, generateSpeech, refineText, refineProfile } from '../lib/gemini';
import { CharacterEditor } from './CharacterEditor';
import { AdditionalCharacterModal } from './AdditionalCharacterModal';
import { RefineButton } from './RefineButton';
import { Scenario } from '../lib/types';

import { STORAGE_KEYS } from '../constants';

interface CharacterCreatorProps {
  onCharacterCreated: (profile: CharacterProfile, avatarBase64: string) => void;
  onCancel: () => void;
  scenarios?: Scenario[];
}

function SuggestionPills({ field, profile, onSelect }: { field: string, profile: Partial<CharacterProfile>, onSelect: (val: string) => void }) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchSuggestions = async () => {
    setIsLoading(true);
    try {
      const res = await getSmartSuggestions(field, profile);
      setSuggestions(res);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-wrap gap-2 mt-2">
      {suggestions.map((s, i) => (
        <button
          key={i}
          onClick={() => onSelect(s)}
          className="px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[10px] text-zinc-500 hover:text-emerald-400 hover:border-emerald-500/30 transition-all font-bold uppercase tracking-wider"
        >
          {s}
        </button>
      ))}
      <button
        onClick={fetchSuggestions}
        disabled={isLoading}
        className="p-1 px-2 rounded-full bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 text-[10px] font-bold border border-emerald-500/20 transition-all flex items-center gap-1"
      >
        {isLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
        {suggestions.length > 0 ? "Refresh Suggestions" : "Get Suggestions"}
      </button>
    </div>
  );
}

type CreatorStep = 'mode' | 'idle' | 'profile' | 'avatar' | 'review';

const DEFAULT_PROFILE: CharacterProfile = {
  mode: AppMode.ROLEPLAY,
  name: '',
  personality: '',
  backstory: '',
  appearance: '',
  clothing: '',
  accessories: '',
  hairStyle: '',
  hairColor: '',
  eyeColor: '',
  voiceName: 'Kore',
  voiceSettings: {
    pitch: 'Normal',
    speed: 'Normal',
    accent: 'None'
  },
  traits: {
    friendliness: 50,
    assertiveness: 50,
    empathy: 50
  },
  storyTone: 'Dramatic',
  relationship: 'Strangers',
  playerProfile: {
    name: 'The Protagonist',
    description: 'A mysterious traveler.',
    personality: '',
    backstory: '',
    appearance: '',
    clothing: '',
    accessories: '',
    hairStyle: '',
    hairColor: '',
    eyeColor: ''
  },
  inventory: [],
  worldAtmosphere: '',
  keyLocations: '',
  characterFlaws: '',
  secretMotive: '',
  speechPattern: '',
  likesAndDislikes: '',
  coreBeliefs: '',
  quirks: '',
  gameSystem: '',
  questObjective: '',
  scenarioStakes: '',
  scenarioConflict: '',
  timePeriod: '',
  factions: '',
  magicOrTechnologyLevel: '',
  incitingIncident: '',
  dungeonMasterStyle: '',
  rulesComplexity: '',
  difficultyLevel: '',
  partyComposition: '',
  startingEquipment: '',
  currentCampaignArc: ''
};

export function CharacterCreator({ onCharacterCreated, onCancel, scenarios = [] }: CharacterCreatorProps) {
  const [step, setStep] = useState<CreatorStep>('mode');
  const [appMode, setAppMode] = useState<AppMode>(AppMode.ROLEPLAY);
  const [setupType, setSetupType] = useState<'quick' | 'detailed'>('quick');
  const { toastSuccess, toastError } = useToast();
  const [idea, setIdea] = useState('');
  const [detailedProfile, setDetailedProfile] = useState<CharacterProfile>(DEFAULT_PROFILE);

  const firstCharacter = scenarios.length > 0 ? scenarios[0] : null;

  const handleUseExisting = (scenario: Scenario) => {
    setIdea(`A new story with ${scenario.profile.name}, who is ${scenario.profile.personality}.`);
    setSetupType('detailed');
    setDetailedProfile({
      ...scenario.profile,
      mode: appMode, // Keep the current mode
      inventory: [], // Reset inventory for new narrative
    });
    setStep('profile');
    toastSuccess(`Using ${scenario.profile.name} as template`);
  };

  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draftProfile, setDraftProfile] = useState<CharacterProfile | null>(null);
  const [draftAvatar, setDraftAvatar] = useState<string | null>(null);
  const [isRefiningField, setIsRefiningField] = useState<string | null>(null);
  const [isRefiningAll, setIsRefiningAll] = useState(false);
  const [isPreviewingVoice, setIsPreviewingVoice] = useState(false);
  const [isAddingCharacter, setIsAddingCharacter] = useState(false);

  const isFirstRender = useRef(true);

  const handlePreviewVoice = async () => {
    if (isPreviewingVoice) return;
    setIsPreviewingVoice(true);
    try {
      const text = `Hello there! I am ${detailedProfile.name || 'your character'}. This is how my voice sounds.`;
      const base64Audio = await generateSpeech(text, detailedProfile.voiceName || 'Kore', detailedProfile.voiceSettings, detailedProfile.storyTone || 'Neutral');
      if (base64Audio) {
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const binaryString = window.atob(base64Audio);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        
        // Decode 16-bit PCM
        const int16Array = new Int16Array(bytes.buffer);
        const audioBuffer = ctx.createBuffer(1, int16Array.length, 24000);
        const channelData = audioBuffer.getChannelData(0);
        for (let i = 0; i < int16Array.length; i++) {
          channelData[i] = int16Array[i] / 32768.0;
        }

        const source = ctx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(ctx.destination);
        
        source.onended = () => {
          setIsPreviewingVoice(false);
          ctx.close();
        };
        
        source.start(0);
      } else {
        setIsPreviewingVoice(false);
        toastError("Failed to generate voice preview");
      }
    } catch (err: any) {
      console.error("Voice preview error:", err);
      toastError(`Voice preview failed: ${err.message || 'Unknown error'}`);
      setIsPreviewingVoice(false);
    }
  };

  // Consolidated loading logic
  useEffect(() => {
    console.log("CharacterCreator: Initializing draft loading...");
    const loadDraft = () => {
      try {
        console.log("CharacterCreator: loadDraft called.");
        const validSteps: CreatorStep[] = ['mode', 'idle', 'profile', 'avatar', 'review'];
        const validModes = [AppMode.ROLEPLAY, AppMode.SCENARIO, AppMode.GAME];
        const validTypes: ('quick' | 'detailed')[] = ['quick', 'detailed'];

        const savedStep = localStorage.getItem(STORAGE_KEYS.DRAFT_STEP);
        const savedMode = localStorage.getItem(STORAGE_KEYS.DRAFT_MODE);
        const savedType = localStorage.getItem(STORAGE_KEYS.DRAFT_SETUP_TYPE);
        const savedIdea = localStorage.getItem(STORAGE_KEYS.DRAFT_IDEA);
        const savedData = localStorage.getItem(STORAGE_KEYS.DRAFT_DATA);
        const rescue = localStorage.getItem(STORAGE_KEYS.RESCUE_BACKUP);
        
        console.log("CharacterCreator: Loaded from localStorage:", { savedStep, savedMode, savedType, savedIdea, hasData: !!savedData, hasRescue: !!rescue });

        let initialStep: CreatorStep = 'mode';
        let initialMode: AppMode = AppMode.ROLEPLAY;
        let initialType: 'quick' | 'detailed' = 'quick';
        let initialIdea = '';
        let initialProfile = DEFAULT_PROFILE;

        // Try rescue first if regular draft is missing or we want to be safe
        if (rescue) {
          try {
            const data = JSON.parse(rescue);
            if (data.step && validSteps.includes(data.step)) initialStep = data.step;
            if (data.appMode && validModes.includes(data.appMode)) initialMode = data.appMode;
            if (data.setupType && validTypes.includes(data.setupType)) initialType = data.setupType;
            if (data.idea) initialIdea = data.idea;
            if (data.detailedProfile) initialProfile = data.detailedProfile;
          } catch (e) {
            console.error("CharacterCreator: Failed to parse rescue backup", e);
          }
        }

        // Regular draft overrides rescue if present
        if (savedStep && validSteps.includes(savedStep as CreatorStep)) initialStep = savedStep as CreatorStep;
        if (savedMode && validModes.includes(savedMode as AppMode)) initialMode = savedMode as AppMode;
        if (savedType && validTypes.includes(savedType as 'quick' | 'detailed')) initialType = savedType as 'quick' | 'detailed';
        if (savedIdea) initialIdea = savedIdea;
        if (savedData) {
          try {
            const data = JSON.parse(savedData);
            initialProfile = {
              ...DEFAULT_PROFILE,
              ...data,
              traits: { ...DEFAULT_PROFILE.traits, ...(data.traits || {}) },
              voiceSettings: { ...DEFAULT_PROFILE.voiceSettings, ...(data.voiceSettings || {}) },
              playerProfile: { ...DEFAULT_PROFILE.playerProfile, ...(data.playerProfile || {}) }
            };
          } catch (e) {
            console.error("CharacterCreator: Failed to parse savedData", e);
          }
        }

        // Reset volatile steps
        if (['profile', 'avatar', 'review'].includes(initialStep)) {
          initialStep = 'idle';
        }

        console.log("CharacterCreator: Setting initial state:", { initialStep, initialMode, initialType });
        setStep(initialStep);
        setAppMode(initialMode);
        setSetupType(initialType);
        setIdea(initialIdea);
        setDetailedProfile(initialProfile);
      } catch (e) {
        console.error("CharacterCreator: Failed to load draft", e);
      }
    };

    loadDraft();
  }, []);

  // Auto-save basic draft with a debounce delay to prevent thread-blocking localStorage writes on every keystroke
  useEffect(() => {
    // Skip the very first render if we are just initializing with defaults
    // to avoid overwriting a potentially valid draft that is still loading
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    const timer = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEYS.DRAFT_MODE, appMode);
        localStorage.setItem(STORAGE_KEYS.DRAFT_IDEA, idea);
        localStorage.setItem(STORAGE_KEYS.DRAFT_STEP, step);
        localStorage.setItem(STORAGE_KEYS.DRAFT_SETUP_TYPE, setupType);
        localStorage.setItem(STORAGE_KEYS.DRAFT_DATA, JSON.stringify(detailedProfile));

        // Create a secondary "Rescue" backup every time we save
        localStorage.setItem(STORAGE_KEYS.RESCUE_BACKUP, JSON.stringify({
          appMode, idea, step, setupType, detailedProfile, timestamp: Date.now()
        }));
      } catch (e) {
        console.warn("Failed to save draft to localStorage (quota exceeded?)", e);
      }
    }, 1000); // 1-second debounce delay to bundle multiple rapid keystrokes

    return () => clearTimeout(timer);
  }, [appMode, idea, step, setupType, detailedProfile]);

  const handleRescue = () => {
    try {
      const rescue = localStorage.getItem(STORAGE_KEYS.RESCUE_BACKUP);
      if (rescue && rescue !== 'null' && rescue !== 'undefined') {
        const data = JSON.parse(rescue);
        const validModes = [AppMode.ROLEPLAY, AppMode.SCENARIO, AppMode.GAME];
        if (data.appMode && validModes.includes(data.appMode as AppMode)) setAppMode(data.appMode);
        if (data.idea && data.idea !== 'null' && data.idea !== 'undefined') setIdea(data.idea);
        const validSteps = ['mode', 'idle', 'profile', 'avatar', 'review'];
        if (data.step && validSteps.includes(data.step)) {
          if (data.step === 'profile' || data.step === 'avatar' || data.step === 'review') {
            setStep('idle');
          } else {
            setStep(data.step);
          }
        }
        const validTypes = ['quick', 'detailed'];
        if (data.setupType && validTypes.includes(data.setupType)) setSetupType(data.setupType);
        if (data.detailedProfile) setDetailedProfile(data.detailedProfile);
        toastSuccess("Rescue successful! Your progress has been restored.");
      } else {
        toastError("No rescue backup found.");
      }
    } catch (e) {
      console.error("Rescue failed", e);
    }
  };

  const handleQuickGenerate = async () => {
    if (!idea.trim()) return;
    setIsGenerating(true);
    setError(null);
    console.log("Quick Forge: Starting generation for idea:", idea);
    try {
      setStep('profile');
      console.log("Quick Forge: Generating profile...");
      const profile = await generateCharacterProfile(idea, appMode);
      console.log("Quick Forge: Profile generated.");
      setDraftProfile(profile);
      toastSuccess("Character profile generated!");
      
      setStep('avatar');
      console.log("Quick Forge: Generating avatar...");
      const avatarBase64 = await generateAvatar(profile);
      console.log("Quick Forge: Avatar generated.");
      setDraftAvatar(avatarBase64);
      toastSuccess("Avatar generated!");
      
      setStep('review');
    } catch (err: any) {
      console.error("Quick Forge Error:", err);
      setError(err.message || "Failed to generate character. Please try again.");
      toastError(`Generation failed: ${err.message || 'Unknown error'}`);
      setStep('idle');
    } finally {
      setIsGenerating(false);
      console.log("Quick Forge: Generation finished.");
    }
  };

  const getModeTraits = (mode: AppMode) => {
    switch (mode) {
      case AppMode.SCENARIO:
        return [
          { id: 'danger', label: 'Danger Level' },
          { id: 'mystery', label: 'Mystery' },
          { id: 'supernatural', label: 'Supernatural' }
        ];
      case AppMode.GAME:
        return [
          { id: 'strictness', label: 'Strictness' },
          { id: 'generosity', label: 'Generosity' },
          { id: 'lethality', label: 'Lethality' }
        ];
      default:
        return [
          { id: 'friendliness', label: 'Friendliness' },
          { id: 'assertiveness', label: 'Assertiveness' },
          { id: 'empathy', label: 'Empathy' }
        ];
    }
  };

  const handleToneChange = (tone: string) => {
    setDetailedProfile({ ...detailedProfile, storyTone: tone });
  };

  const handleRefineTraits = async (guidance?: string) => {
    setIsRefiningField('traits');
    try {
      const refinedTraits = await refineTraits(detailedProfile, guidance);
      setDetailedProfile(prev => ({ ...prev, traits: refinedTraits }));
      toastSuccess("Traits refined");
    } catch (err: any) {
      console.error("Refine traits error:", err);
      toastError(`Refinement failed: ${err.message || 'Unknown error'}`);
    } finally {
      setIsRefiningField(null);
    }
  };

  const handleDetailedGenerate = async () => {
    // Basic validation
    if (!detailedProfile.name || !detailedProfile.appearance) {
      setError("Name and Appearance are required for detailed setup.");
      return;
    }

    setIsGenerating(true);
    setError(null);
    try {
      setStep('avatar');
      const avatarBase64 = await generateAvatar(detailedProfile);
      setDraftAvatar(avatarBase64);
      setDraftProfile({ ...detailedProfile, mode: appMode });
      toastSuccess("Avatar generated!");
      setStep('review');
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to generate avatar. Please try again.");
      toastError(`Avatar generation failed: ${err.message || 'Unknown error'}`);
      setStep('idle');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRefineField = async (field: string, guidance?: string) => {
    setIsRefiningField(field);
    try {
      let refined = '';
      if (field.startsWith('player_')) {
        const playerField = field.replace('player_', '');
        refined = await refinePlayerProfile(playerField, detailedProfile, guidance);
        setDetailedProfile(prev => ({
          ...prev,
          playerProfile: {
            ...(prev.playerProfile || {}),
            [playerField]: refined
          } as any
        }));
      } else if (field.includes('.')) {
        const [parent, child] = field.split('.');
        refined = await refineField(field as any, detailedProfile, guidance);
        setDetailedProfile(prev => ({
          ...prev,
          [parent]: {
            ...(prev[parent as keyof CharacterProfile] as any),
            [child]: refined
          }
        }));
      } else {
        refined = await refineField(field as any, detailedProfile, guidance);
        setDetailedProfile(prev => ({ ...prev, [field]: refined }));
      }
      toastSuccess(`${field.replace('player_', '').replace('voiceSettings.', '')} refined`);
    } catch (err: any) {
      console.error("Refine field error:", err);
      toastError(`Refinement failed: ${err.message || 'Unknown error'}`);
    } finally {
      setIsRefiningField(null);
    }
  };

  const handleOverallRefinement = async () => {
    if (isRefiningAll) return;
    setIsRefiningAll(true);
    try {
      const refined = await refineProfile(detailedProfile);
      setDetailedProfile(refined);
      toastSuccess("Profile refined and blanks filled!");
    } catch (err: any) {
      console.error("Overall refinement error:", err);
      toastError(`Refinement failed: ${err.message || 'Unknown error'}`);
    } finally {
      setIsRefiningAll(false);
    }
  };

  if (step === 'review' && draftProfile) {
    return (
      <CharacterEditor
        profile={draftProfile}
        avatarBase64={draftAvatar || ""}
        isInitialReview={true}
        onSave={(finalProfile, finalAvatar) => {
          onCharacterCreated(finalProfile, finalAvatar);
        }}
        onCancel={() => {
          setStep('idle');
          setDraftProfile(null);
          setDraftAvatar(null);
        }}
        scenarios={scenarios}
      />
    );
  }

  const getCoreIdentityFieldLabel = (mode: AppMode, field: string) => {
    if (mode === AppMode.SCENARIO) {
      if (field === 'personality') return 'Narrative Tone';
      if (field === 'backstory') return 'Scenario Premise';
      if (field === 'appearance') return 'Visual Aesthetic';
    } else if (mode === AppMode.GAME) {
      if (field === 'personality') return 'DM Style';
      if (field === 'backstory') return 'Campaign Setting';
      if (field === 'appearance') return 'World Description';
    }
    return field === 'appearance' ? 'Appearance' : field;
  };

  const getRelationshipLabel = (mode: AppMode) => {
    if (mode === AppMode.SCENARIO) return 'Protagonist\'s Role';
    if (mode === AppMode.GAME) return 'Party\'s Reputation';
    return 'Relationship';
  };

  const getNameLabel = (mode: AppMode) => {
    if (mode === AppMode.SCENARIO) return 'Scenario Title';
    if (mode === AppMode.GAME) return 'Campaign Name';
    return 'Narrative Identity Name';
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full max-w-4xl mx-auto p-6 sm:p-10 glass-panel rounded-[2.5rem] shadow-2xl relative overflow-y-auto max-h-[90vh] border border-white/5 custom-scrollbar"
    >
      {/* Background Glows */}
      <div className="absolute -top-24 -right-24 w-96 h-96 bg-emerald-500/5 blur-[120px] rounded-full" />
      <div className="absolute -bottom-24 -left-24 w-96 h-96 bg-blue-500/5 blur-[120px] rounded-full" />

      <AnimatePresence mode="wait">
        {step === 'mode' && (
          <motion.div
            key="mode-selection"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-12 relative"
          >
            <div className="flex items-center justify-between">
              <button onClick={onCancel} className="flex items-center gap-2 text-zinc-500 hover:text-white transition-colors group">
                <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
                <span className="text-[10px] font-bold uppercase tracking-widest">Back to Library</span>
              </button>
              <button 
                onClick={handleRescue}
                className="px-4 py-2 bg-blue-600/20 hover:bg-blue-600 text-blue-400 hover:text-white rounded-xl font-bold border border-blue-500/30 transition-all flex items-center gap-2 group"
                title="If your data is missing, click this to pull from the emergency backup."
              >
                <RotateCcw className="w-4 h-4 group-hover:rotate-180 transition-transform duration-500" />
                <span className="text-[10px] uppercase tracking-widest">Emergency Rescue</span>
              </button>
              <h2 className="text-5xl font-bold text-white font-serif tracking-tight">Choose Your Experience</h2>
              <div className="w-24" /> {/* Spacer */}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[
                { id: AppMode.SCENARIO, label: 'Scenario', icon: Globe, desc: 'AI narrates a living world. You explore, choose, and shape the story.', color: 'emerald' },
                { id: AppMode.ROLEPLAY, label: 'Roleplay', icon: Heart, desc: 'Deep one-on-one character interaction driven by personality and emotion.', color: 'blue' },
                { id: AppMode.GAME, label: 'Game', icon: Swords, desc: 'AI is your Dungeon Master — dice, combat, quests, and consequences.', color: 'purple' }
              ].map(m => (
                <button
                  key={m.id}
                  onClick={() => { setAppMode(m.id); setStep('idle'); }}
                  className={`p-8 rounded-[2rem] border-2 transition-all duration-300 text-left group relative overflow-hidden ${
                    appMode === m.id ? 'border-emerald-500 bg-emerald-500/10 shadow-[0_0_30px_rgba(16,185,129,0.3)]' : 'border-white/5 bg-white/5 hover:border-white/30 hover:bg-white/10 hover:shadow-[0_0_20px_rgba(255,255,255,0.1)]'
                  }`}
                >
                  <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-6 transition-transform group-hover:scale-110 ${
                    appMode === m.id ? 'bg-emerald-500 text-white' : 'bg-zinc-800 text-zinc-400'
                  }`}>
                    <m.icon className="w-8 h-8" />
                  </div>
                  <h3 className="text-2xl font-bold text-white mb-2">{m.label}</h3>
                  <p className="text-sm text-zinc-500 leading-relaxed">{m.desc}</p>
                </button>
              ))}
            </div>
          </motion.div>
        )}

        {step === 'idle' && (
          <motion.div 
            key="idle"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-10 relative"
          >
            <div className="flex items-center justify-between">
              <button onClick={() => setStep('mode')} className="flex items-center gap-2 text-zinc-500 hover:text-white transition-colors group">
                <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
                <span className="text-[10px] font-bold uppercase tracking-widest">Back to Modes</span>
              </button>
              <button 
                onClick={handleRescue}
                className="px-4 py-2 bg-blue-600/20 hover:bg-blue-600 text-blue-400 hover:text-white rounded-xl font-bold border border-blue-500/30 transition-all flex items-center gap-2 group"
                title="If your data is missing, click this to pull from the emergency backup."
              >
                <RotateCcw className="w-4 h-4 group-hover:rotate-180 transition-transform duration-500" />
                <span className="text-[10px] uppercase tracking-widest">Emergency Rescue</span>
              </button>
              <div className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest">Auto-Saving Progress</span>
              </div>
              <div className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest">{appMode} Mode</span>
              </div>
            </div>

            <div className="text-center space-y-4">
              <h2 className="text-5xl font-bold text-white font-serif tracking-tight">Forge Your Narrative</h2>
              <p className="text-zinc-500 text-lg">Describe a character, a setting, or a quest idea.</p>
            </div>

            <div className="flex justify-center gap-4">
              <button 
                onClick={() => setSetupType('quick')}
                className={`px-8 py-3 rounded-2xl text-sm font-bold transition-all flex items-center gap-2 ${setupType === 'quick' ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-900/20' : 'glass-input text-zinc-500 hover:text-zinc-300'}`}
              >
                <Sparkles className="w-4 h-4" />
                Quick Forge
              </button>
              <button 
                onClick={() => setSetupType('detailed')}
                className={`px-8 py-3 rounded-2xl text-sm font-bold transition-all flex items-center gap-2 ${setupType === 'detailed' ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-900/20' : 'glass-input text-zinc-500 hover:text-zinc-300'}`}
              >
                <Settings2 className="w-4 h-4" />
                Guided Refinement
              </button>
            </div>

            {setupType === 'quick' ? (
              <div className="space-y-6">
                <div className="flex justify-between items-center">
                  <h3 className="text-sm font-bold text-zinc-500 uppercase tracking-widest">Your Idea</h3>
                </div>
                <div className="relative group">
                  <div className="absolute -top-10 right-0">
                    <RefineButton 
                      onRefine={async (guidance) => {
                        if (isGenerating) return;
                        setIsGenerating(true);
                        try {
                          const refined = await refineText(idea, `This is an idea for a ${appMode} narrative.`, guidance);
                          setIdea(refined);
                          toastSuccess("Idea refined");
                        } catch (err) {
                          toastError("Failed to refine idea");
                        } finally {
                          setIsGenerating(false);
                        }
                      }}
                      isRefining={isGenerating}
                    />
                  </div>
                  <textarea
                    value={idea}
                    onChange={(e) => setIdea(e.target.value)}
                    placeholder={
                      appMode === AppMode.GAME ? "e.g., A dark fantasy quest to retrieve a lost crown..." :
                      appMode === AppMode.SCENARIO ? "e.g., A floating city above a toxic wasteland..." :
                      "e.g., A cynical detective in a neon-drenched future..."
                    }
                    className="w-full h-48 glass-input rounded-[2rem] p-8 text-white text-xl placeholder-zinc-700 focus:ring-2 focus:ring-emerald-500/30 transition-all resize-none"
                  />
                  <div className="absolute bottom-6 right-6 flex items-center gap-2">
                    <button
                      onClick={() => setSetupType('detailed')}
                      className="px-4 py-2 bg-white/5 hover:bg-white/10 text-white rounded-xl text-[10px] font-bold uppercase tracking-widest border border-white/10 transition-all"
                    >
                      Custom Generation
                    </button>
                    <button
                      onClick={handleQuickGenerate}
                      disabled={!idea.trim() || isGenerating}
                      className="p-5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-white rounded-2xl shadow-[0_0_20px_rgba(16,185,129,0.3)] hover:shadow-[0_0_40px_rgba(16,185,129,0.5)] transition-all group"
                    >
                      {isGenerating ? <Loader2 className="w-6 h-6 animate-spin" /> : <ArrowRight className="w-6 h-6 group-hover:translate-x-1 transition-transform" />}
                    </button>
                  </div>
                </div>

                {firstCharacter && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="glass-panel p-6 rounded-[2rem] border border-white/5 space-y-4"
                  >
                    <div className="flex items-center justify-between">
                      <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">Quick Start with Existing Character</h3>
                      <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 text-[8px] font-bold uppercase tracking-widest border border-emerald-500/20">Worthy Character</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="w-16 h-16 rounded-2xl overflow-hidden border border-white/10 shrink-0">
                        <img src={firstCharacter.avatarBase64} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="text-white font-serif font-bold truncate">{firstCharacter.profile.name}</h4>
                        <p className="text-xs text-zinc-500 line-clamp-1">{firstCharacter.profile.personality}</p>
                      </div>
                      <button 
                        onClick={() => handleUseExisting(firstCharacter)}
                        className="px-4 py-2 bg-emerald-600/10 hover:bg-emerald-600 text-emerald-400 hover:text-white rounded-xl text-xs font-bold transition-all flex items-center gap-2"
                      >
                        Use as Template
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    </div>
                  </motion.div>
                )}

                <div className="flex flex-wrap gap-2 justify-center">
                  {[
                    "Cyberpunk Outlaw", "Ancient Guardian", "Rogue AI", "Gothic Vampire", "Space Explorer"
                  ].map(suggestion => (
                    <button
                      key={suggestion}
                      onClick={() => setIdea(suggestion)}
                      className="px-4 py-2 rounded-xl glass-input text-xs text-zinc-500 hover:text-emerald-400 hover:border-emerald-500/30 transition-all"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-8"
              >
                <div className="flex justify-between items-center mb-8">
                  <h3 className="text-xl font-bold text-white flex items-center gap-2">
                    <Settings2 className="w-5 h-5 text-emerald-400" />
                    Refine {appMode === AppMode.SCENARIO ? 'Scenario' : appMode === AppMode.GAME ? 'Campaign' : 'Profile'}
                  </h3>
                  <button
                    onClick={handleOverallRefinement}
                    disabled={isRefiningAll || isRefiningField !== null}
                    className="px-6 py-2 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black font-bold rounded-xl flex items-center gap-2 transition-all shadow-lg shadow-emerald-500/20"
                  >
                    {isRefiningAll ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Sparkles className="w-4 h-4" />
                    )}
                    Fill Blanks & Refine All
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-6">
                    <div>
                      <div className="flex justify-between items-center mb-2">
                        <label className="block text-xs font-bold text-zinc-500 uppercase tracking-widest mb-3">{getNameLabel(appMode)}</label>
                        <RefineButton 
                          onRefine={(guidance) => handleRefineField('name', guidance)}
                          isRefining={isRefiningField === 'name'}
                        />
                      </div>
                      <input 
                        type="text" 
                        className="w-full px-6 py-4 glass-input rounded-2xl text-white text-sm focus:ring-2 focus:ring-emerald-500/30 transition-all"
                        value={detailedProfile.name}
                        onChange={e => setDetailedProfile({...detailedProfile, name: e.target.value})}
                        placeholder={appMode === AppMode.SCENARIO ? "Scenario Title" : appMode === AppMode.GAME ? "Campaign Name" : "Character Name"}
                      />
                    </div>
                    {['personality', 'backstory', 'appearance'].map((field) => (
                      <div key={field}>
                        <div className="flex justify-between items-center mb-2">
                          <label className="block text-xs font-bold text-zinc-500 uppercase tracking-widest">
                            {getCoreIdentityFieldLabel(appMode, field)}
                          </label>
                          <RefineButton 
                            onRefine={(guidance) => handleRefineField(field, guidance)}
                            isRefining={isRefiningField === field}
                          />
                        </div>
                        <textarea 
                          rows={3}
                          className="w-full px-6 py-4 glass-input rounded-2xl text-white text-sm focus:ring-2 focus:ring-emerald-500/30 transition-all resize-none"
                          value={detailedProfile[field as keyof CharacterProfile] as string}
                          onChange={e => setDetailedProfile({...detailedProfile, [field]: e.target.value})}
                          placeholder={`Describe ${field}...`}
                        />
                        <SuggestionPills 
                          field={field} 
                          profile={detailedProfile} 
                          onSelect={(val) => {
                            const current = detailedProfile[field as keyof CharacterProfile] as string || '';
                            const newVal = current ? `${current}\n${val}` : val;
                            setDetailedProfile({...detailedProfile, [field]: newVal});
                          }} 
                        />
                      </div>
                    ))}

                    {appMode === AppMode.ROLEPLAY && (
                      <div className="space-y-6 pt-4 border-t border-white/5">
                        <h4 className="text-xs font-bold text-emerald-400 uppercase tracking-widest">Avatar Customization</h4>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <div className="flex justify-between items-center mb-2">
                              <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Hair Style</label>
                              <RefineButton 
                                onRefine={(guidance) => handleRefineField('hairStyle', guidance)}
                                isRefining={isRefiningField === 'hairStyle'}
                              />
                            </div>
                            <input 
                              type="text"
                              className="w-full px-4 py-3 glass-input rounded-xl text-white text-sm"
                              value={detailedProfile.hairStyle}
                              onChange={e => setDetailedProfile({...detailedProfile, hairStyle: e.target.value})}
                              placeholder="e.g., Long wavy, buzz cut..."
                            />
                          </div>
                          <div>
                            <div className="flex justify-between items-center mb-2">
                              <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Hair Color</label>
                              <RefineButton 
                                onRefine={(guidance) => handleRefineField('hairColor', guidance)}
                                isRefining={isRefiningField === 'hairColor'}
                              />
                            </div>
                            <input 
                              type="text"
                              className="w-full px-4 py-3 glass-input rounded-xl text-white text-sm"
                              value={detailedProfile.hairColor}
                              onChange={e => setDetailedProfile({...detailedProfile, hairColor: e.target.value})}
                              placeholder="e.g., Raven black, silver..."
                            />
                          </div>
                          <div>
                            <div className="flex justify-between items-center mb-2">
                              <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Eye Color</label>
                              <RefineButton 
                                onRefine={(guidance) => handleRefineField('eyeColor', guidance)}
                                isRefining={isRefiningField === 'eyeColor'}
                              />
                            </div>
                            <input 
                              type="text"
                              className="w-full px-4 py-3 glass-input rounded-xl text-white text-sm"
                              value={detailedProfile.eyeColor}
                              onChange={e => setDetailedProfile({...detailedProfile, eyeColor: e.target.value})}
                              placeholder="e.g., Piercing blue, hazel..."
                            />
                          </div>
                          <div>
                            <div className="flex justify-between items-center mb-2">
                              <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Clothing</label>
                              <RefineButton 
                                onRefine={(guidance) => handleRefineField('clothing', guidance)}
                                isRefining={isRefiningField === 'clothing'}
                              />
                            </div>
                            <input 
                              type="text"
                              className="w-full px-4 py-3 glass-input rounded-xl text-white text-sm"
                              value={detailedProfile.clothing}
                              onChange={e => setDetailedProfile({...detailedProfile, clothing: e.target.value})}
                              placeholder="e.g., Leather duster, silk robe..."
                            />
                          </div>
                        </div>
                        <div>
                          <div className="flex justify-between items-center mb-2">
                            <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Accessories</label>
                            <RefineButton 
                              onRefine={(guidance) => handleRefineField('accessories', guidance)}
                              isRefining={isRefiningField === 'accessories'}
                            />
                          </div>
                          <input 
                            type="text"
                            className="w-full px-4 py-3 glass-input rounded-xl text-white text-sm"
                            value={detailedProfile.accessories}
                            onChange={e => setDetailedProfile({...detailedProfile, accessories: e.target.value})}
                            placeholder="e.g., Silver monocle, scar on left eye..."
                          />
                        </div>
                      </div>
                    )}

                    {/* Mode Specific Fields */}
                    {appMode === AppMode.SCENARIO && (
                      <div className="space-y-6 pt-4 border-t border-white/5">
                        <h4 className="text-xs font-bold text-emerald-400 uppercase tracking-widest">World Details</h4>
                        <div>
                          <div className="flex justify-between items-center mb-2">
                            <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest">World Atmosphere</label>
                            <RefineButton 
                              onRefine={(guidance) => handleRefineField('worldAtmosphere', guidance)}
                              isRefining={isRefiningField === 'worldAtmosphere'}
                            />
                          </div>
                          <textarea 
                            rows={2}
                            className="w-full px-6 py-4 glass-input rounded-2xl text-white text-sm"
                            value={detailedProfile.worldAtmosphere}
                            onChange={e => setDetailedProfile({...detailedProfile, worldAtmosphere: e.target.value})}
                            placeholder="e.g., Heavy smog, neon flickers, constant rain..."
                          />
                        </div>
                        <div>
                          <div className="flex justify-between items-center mb-2">
                            <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Key Locations</label>
                            <RefineButton 
                              onRefine={(guidance) => handleRefineField('keyLocations', guidance)}
                              isRefining={isRefiningField === 'keyLocations'}
                            />
                          </div>
                          <textarea 
                            rows={2}
                            className="w-full px-6 py-4 glass-input rounded-2xl text-white text-sm"
                            value={detailedProfile.keyLocations}
                            onChange={e => setDetailedProfile({...detailedProfile, keyLocations: e.target.value})}
                            placeholder="e.g., The Spire, The Underbelly, Neon Market..."
                          />
                        </div>
                        <div>
                          <div className="flex justify-between items-center mb-2">
                            <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Scenario Stakes</label>
                            <RefineButton 
                              onRefine={(guidance) => handleRefineField('scenarioStakes', guidance)}
                              isRefining={isRefiningField === 'scenarioStakes'}
                            />
                          </div>
                          <textarea 
                            rows={2}
                            className="w-full px-6 py-4 glass-input rounded-2xl text-white text-sm"
                            value={detailedProfile.scenarioStakes}
                            onChange={e => setDetailedProfile({...detailedProfile, scenarioStakes: e.target.value})}
                            placeholder="e.g., The survival of the last human colony..."
                          />
                        </div>
                        <div>
                          <div className="flex justify-between items-center mb-2">
                            <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Core Conflict</label>
                            <RefineButton 
                              onRefine={(guidance) => handleRefineField('scenarioConflict', guidance)}
                              isRefining={isRefiningField === 'scenarioConflict'}
                            />
                          </div>
                          <textarea 
                            rows={2}
                            className="w-full px-6 py-4 glass-input rounded-2xl text-white text-sm"
                            value={detailedProfile.scenarioConflict}
                            onChange={e => setDetailedProfile({...detailedProfile, scenarioConflict: e.target.value})}
                            placeholder="e.g., Man vs Machine, Survival against the elements..."
                          />
                        </div>
                        <div>
                          <div className="flex justify-between items-center mb-2">
                            <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Time Period</label>
                            <RefineButton 
                              onRefine={(guidance) => handleRefineField('timePeriod', guidance)}
                              isRefining={isRefiningField === 'timePeriod'}
                            />
                          </div>
                          <input 
                            type="text"
                            className="w-full px-6 py-4 glass-input rounded-2xl text-white text-sm"
                            value={detailedProfile.timePeriod}
                            onChange={e => setDetailedProfile({...detailedProfile, timePeriod: e.target.value})}
                            placeholder="e.g., Neo-Victorian 2099, High Fantasy Medieval..."
                          />
                        </div>
                        <div>
                          <div className="flex justify-between items-center mb-2">
                            <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Factions</label>
                            <RefineButton 
                              onRefine={(guidance) => handleRefineField('factions', guidance)}
                              isRefining={isRefiningField === 'factions'}
                            />
                          </div>
                          <textarea 
                            rows={2}
                            className="w-full px-6 py-4 glass-input rounded-2xl text-white text-sm"
                            value={detailedProfile.factions}
                            onChange={e => setDetailedProfile({...detailedProfile, factions: e.target.value})}
                            placeholder="e.g., The Crimson Syndicate, The Iron Guard..."
                          />
                        </div>
                        <div>
                          <div className="flex justify-between items-center mb-2">
                            <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Magic / Tech Level</label>
                            <RefineButton 
                              onRefine={(guidance) => handleRefineField('magicOrTechnologyLevel', guidance)}
                              isRefining={isRefiningField === 'magicOrTechnologyLevel'}
                            />
                          </div>
                          <input 
                            type="text"
                            className="w-full px-6 py-4 glass-input rounded-2xl text-white text-sm"
                            value={detailedProfile.magicOrTechnologyLevel}
                            onChange={e => setDetailedProfile({...detailedProfile, magicOrTechnologyLevel: e.target.value})}
                            placeholder="e.g., Low magic, high steampunk technology..."
                          />
                        </div>
                        <div>
                          <div className="flex justify-between items-center mb-2">
                            <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Inciting Incident</label>
                            <RefineButton 
                              onRefine={(guidance) => handleRefineField('incitingIncident', guidance)}
                              isRefining={isRefiningField === 'incitingIncident'}
                            />
                          </div>
                          <textarea 
                            rows={2}
                            className="w-full px-6 py-4 glass-input rounded-2xl text-white text-sm"
                            value={detailedProfile.incitingIncident}
                            onChange={e => setDetailedProfile({...detailedProfile, incitingIncident: e.target.value})}
                            placeholder="e.g., The king was assassinated yesterday..."
                          />
                        </div>
                      </div>
                    )}

                    {appMode === AppMode.ROLEPLAY && (
                      <div className="space-y-6 pt-4 border-t border-white/5">
                        <h4 className="text-xs font-bold text-blue-400 uppercase tracking-widest">Character Depth</h4>
                        <div>
                          <div className="flex justify-between items-center mb-2">
                            <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Character Flaws</label>
                            <RefineButton 
                              onRefine={(guidance) => handleRefineField('characterFlaws', guidance)}
                              isRefining={isRefiningField === 'characterFlaws'}
                            />
                          </div>
                          <textarea 
                            rows={2}
                            className="w-full px-6 py-4 glass-input rounded-2xl text-white text-sm"
                            value={detailedProfile.characterFlaws}
                            onChange={e => setDetailedProfile({...detailedProfile, characterFlaws: e.target.value})}
                            placeholder="e.g., Deeply distrustful, gambling addiction..."
                          />
                        </div>
                        <div>
                          <div className="flex justify-between items-center mb-2">
                            <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Secret Motive</label>
                            <RefineButton 
                              onRefine={(guidance) => handleRefineField('secretMotive', guidance)}
                              isRefining={isRefiningField === 'secretMotive'}
                            />
                          </div>
                          <textarea 
                            rows={2}
                            className="w-full px-6 py-4 glass-input rounded-2xl text-white text-sm"
                            value={detailedProfile.secretMotive}
                            onChange={e => setDetailedProfile({...detailedProfile, secretMotive: e.target.value})}
                            placeholder="e.g., Seeking revenge for a lost sibling..."
                          />
                        </div>
                        <div>
                          <div className="flex justify-between items-center mb-2">
                            <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Speech Pattern</label>
                            <RefineButton 
                              onRefine={(guidance) => handleRefineField('speechPattern', guidance)}
                              isRefining={isRefiningField === 'speechPattern'}
                            />
                          </div>
                          <input 
                            type="text"
                            className="w-full px-6 py-4 glass-input rounded-2xl text-white text-sm"
                            value={detailedProfile.speechPattern}
                            onChange={e => setDetailedProfile({...detailedProfile, speechPattern: e.target.value})}
                            placeholder="e.g., Uses archaic words, stutters when nervous..."
                          />
                        </div>
                        <div>
                          <div className="flex justify-between items-center mb-2">
                            <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Likes & Dislikes</label>
                            <RefineButton 
                              onRefine={(guidance) => handleRefineField('likesAndDislikes', guidance)}
                              isRefining={isRefiningField === 'likesAndDislikes'}
                            />
                          </div>
                          <textarea 
                            rows={2}
                            className="w-full px-6 py-4 glass-input rounded-2xl text-white text-sm"
                            value={detailedProfile.likesAndDislikes}
                            onChange={e => setDetailedProfile({...detailedProfile, likesAndDislikes: e.target.value})}
                            placeholder="e.g., Loves sweet tea, hates loud noises..."
                          />
                        </div>
                        <div>
                          <div className="flex justify-between items-center mb-2">
                            <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Core Beliefs</label>
                            <RefineButton 
                              onRefine={(guidance) => handleRefineField('coreBeliefs', guidance)}
                              isRefining={isRefiningField === 'coreBeliefs'}
                            />
                          </div>
                          <textarea 
                            rows={2}
                            className="w-full px-6 py-4 glass-input rounded-2xl text-white text-sm"
                            value={detailedProfile.coreBeliefs}
                            onChange={e => setDetailedProfile({...detailedProfile, coreBeliefs: e.target.value})}
                            placeholder="e.g., The strong must protect the weak..."
                          />
                        </div>
                        <div>
                          <div className="flex justify-between items-center mb-2">
                            <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Quirks</label>
                            <RefineButton 
                              onRefine={(guidance) => handleRefineField('quirks', guidance)}
                              isRefining={isRefiningField === 'quirks'}
                            />
                          </div>
                          <input 
                            type="text"
                            className="w-full px-6 py-4 glass-input rounded-2xl text-white text-sm"
                            value={detailedProfile.quirks}
                            onChange={e => setDetailedProfile({...detailedProfile, quirks: e.target.value})}
                            placeholder="e.g., Always flips a coin before making a decision..."
                          />
                        </div>
                      </div>
                    )}

                    {appMode === AppMode.GAME && (
                      <div className="space-y-6 pt-4 border-t border-white/5">
                        <h4 className="text-xs font-bold text-purple-400 uppercase tracking-widest">Game Mechanics</h4>
                        <div>
                          <div className="flex justify-between items-center mb-2">
                            <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Game System</label>
                            <RefineButton 
                              onRefine={(guidance) => handleRefineField('gameSystem', guidance)}
                              isRefining={isRefiningField === 'gameSystem'}
                            />
                          </div>
                          <input 
                            type="text"
                            className="w-full px-6 py-4 glass-input rounded-2xl text-white text-sm"
                            value={detailedProfile.gameSystem}
                            onChange={e => setDetailedProfile({...detailedProfile, gameSystem: e.target.value})}
                            placeholder="e.g., D&D 5e, Cyberpunk RED, Custom Lite..."
                          />
                        </div>
                        <div>
                          <div className="flex justify-between items-center mb-2">
                            <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Quest Objective</label>
                            <RefineButton 
                              onRefine={(guidance) => handleRefineField('questObjective', guidance)}
                              isRefining={isRefiningField === 'questObjective'}
                            />
                          </div>
                          <textarea 
                            rows={2}
                            className="w-full px-6 py-4 glass-input rounded-2xl text-white text-sm"
                            value={detailedProfile.questObjective}
                            onChange={e => setDetailedProfile({...detailedProfile, questObjective: e.target.value})}
                            placeholder="e.g., Retrieve the Crystal of Aethelgard..."
                          />
                        </div>
                        <div>
                          <div className="flex justify-between items-center mb-2">
                            <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest">DM Style</label>
                            <RefineButton 
                              onRefine={(guidance) => handleRefineField('dungeonMasterStyle', guidance)}
                              isRefining={isRefiningField === 'dungeonMasterStyle'}
                            />
                          </div>
                          <input 
                            type="text"
                            className="w-full px-6 py-4 glass-input rounded-2xl text-white text-sm"
                            value={detailedProfile.dungeonMasterStyle}
                            onChange={e => setDetailedProfile({...detailedProfile, dungeonMasterStyle: e.target.value})}
                            placeholder="e.g., Ruthless, Narrative-focused, Rule-of-Cool..."
                          />
                        </div>
                        <div>
                          <div className="flex justify-between items-center mb-2">
                            <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Rules Complexity</label>
                            <RefineButton 
                              onRefine={(guidance) => handleRefineField('rulesComplexity', guidance)}
                              isRefining={isRefiningField === 'rulesComplexity'}
                            />
                          </div>
                          <input 
                            type="text"
                            className="w-full px-6 py-4 glass-input rounded-2xl text-white text-sm"
                            value={detailedProfile.rulesComplexity}
                            onChange={e => setDetailedProfile({...detailedProfile, rulesComplexity: e.target.value})}
                            placeholder="e.g., Simple, Moderate, Hardcore Simulation..."
                          />
                        </div>
                        <div>
                          <div className="flex justify-between items-center mb-2">
                            <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Difficulty Level</label>
                            <RefineButton 
                              onRefine={(guidance) => handleRefineField('difficultyLevel', guidance)}
                              isRefining={isRefiningField === 'difficultyLevel'}
                            />
                          </div>
                          <input 
                            type="text"
                            className="w-full px-6 py-4 glass-input rounded-2xl text-white text-sm"
                            value={detailedProfile.difficultyLevel}
                            onChange={e => setDetailedProfile({...detailedProfile, difficultyLevel: e.target.value})}
                            placeholder="e.g., Forgiving, Brutal, Balanced..."
                          />
                        </div>
                        <div>
                          <div className="flex justify-between items-center mb-2">
                            <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Party Composition</label>
                            <RefineButton 
                              onRefine={(guidance) => handleRefineField('partyComposition', guidance)}
                              isRefining={isRefiningField === 'partyComposition'}
                            />
                          </div>
                          <input 
                            type="text"
                            className="w-full px-6 py-4 glass-input rounded-2xl text-white text-sm"
                            value={detailedProfile.partyComposition}
                            onChange={e => setDetailedProfile({...detailedProfile, partyComposition: e.target.value})}
                            placeholder="e.g., Solo rogue, Paladin and Wizard duo..."
                          />
                        </div>
                        <div>
                          <div className="flex justify-between items-center mb-2">
                            <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Starting Equipment</label>
                            <RefineButton 
                              onRefine={(guidance) => handleRefineField('startingEquipment', guidance)}
                              isRefining={isRefiningField === 'startingEquipment'}
                            />
                          </div>
                          <textarea 
                            rows={2}
                            className="w-full px-6 py-4 glass-input rounded-2xl text-white text-sm"
                            value={detailedProfile.startingEquipment}
                            onChange={e => setDetailedProfile({...detailedProfile, startingEquipment: e.target.value})}
                            placeholder="e.g., Basic adventuring gear, 50 gold..."
                          />
                        </div>
                        <div>
                          <div className="flex justify-between items-center mb-2">
                            <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Current Campaign Arc</label>
                            <RefineButton 
                              onRefine={(guidance) => handleRefineField('currentCampaignArc', guidance)}
                              isRefining={isRefiningField === 'currentCampaignArc'}
                            />
                          </div>
                          <textarea 
                            rows={2}
                            className="w-full px-6 py-4 glass-input rounded-2xl text-white text-sm"
                            value={detailedProfile.currentCampaignArc}
                            onChange={e => setDetailedProfile({...detailedProfile, currentCampaignArc: e.target.value})}
                            placeholder="e.g., The Search for the Lost Artifact..."
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="space-y-6">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2">
                          {appMode === AppMode.SCENARIO ? "Scenario Tone" : appMode === AppMode.GAME ? "Campaign Tone" : "Story Tone"}
                        </label>
                        <select 
                          className="w-full px-4 py-3 glass-input rounded-xl text-white text-sm mb-2"
                          value={['Dramatic', 'Gritty', 'Whimsical', 'Horror', 'Romantic', 'Cyberpunk', 'Noir', 'Adventure'].includes(detailedProfile.storyTone) ? detailedProfile.storyTone : 'Custom'}
                          onChange={e => {
                            const val = e.target.value;
                            if (val === 'Custom') {
                              setDetailedProfile({...detailedProfile, storyTone: 'Mysterious / Intriguing'});
                            } else {
                              handleToneChange(val);
                            }
                          }}
                        >
                          {['Dramatic', 'Gritty', 'Whimsical', 'Horror', 'Romantic', 'Cyberpunk', 'Noir', 'Adventure'].map(t => (
                            <option key={t} value={t} className="bg-zinc-900">{t}</option>
                          ))}
                          <option value="Custom" className="bg-zinc-900">Custom...</option>
                        </select>
                        {!['Dramatic', 'Gritty', 'Whimsical', 'Horror', 'Romantic', 'Cyberpunk', 'Noir', 'Adventure'].includes(detailedProfile.storyTone) && (
                          <motion.div 
                            initial={{ opacity: 0, y: -5 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="space-y-1"
                          >
                            <input 
                              type="text"
                              className="w-full px-4 py-2 bg-black/40 border border-white/10 rounded-xl text-white text-xs placeholder-zinc-600 focus:outline-none focus:border-emerald-500"
                              placeholder="Type custom tone (e.g., Cozy Comedy, Mythic Thriller)..."
                              value={detailedProfile.storyTone}
                              onChange={e => setDetailedProfile({...detailedProfile, storyTone: e.target.value})}
                            />
                          </motion.div>
                        )}
                      </div>
                      <div>
                        <div className="flex justify-between items-center mb-2">
                          <label className="block text-xs font-bold text-zinc-500 uppercase tracking-widest">{getRelationshipLabel(appMode)}</label>
                          <RefineButton 
                            onRefine={(guidance) => handleRefineField('relationship', guidance)}
                            isRefining={isRefiningField === 'relationship'}
                          />
                        </div>
                        <input 
                          type="text" 
                          className="w-full px-4 py-3 glass-input rounded-xl text-white text-sm"
                          value={detailedProfile.relationship}
                          onChange={e => setDetailedProfile({...detailedProfile, relationship: e.target.value})}
                          placeholder="e.g., Rivals"
                        />
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between items-center mb-2">
                        <label className="block text-xs font-bold text-zinc-500 uppercase tracking-widest">
                          {appMode === AppMode.SCENARIO ? "Scenario Elements" : appMode === AppMode.GAME ? "DM Characteristics" : "Personality Traits"}
                        </label>
                        <RefineButton 
                          onRefine={(guidance) => handleRefineTraits(guidance)}
                          isRefining={isRefiningField === 'traits'}
                        />
                      </div>
                      <div className="space-y-4 glass-input p-4 rounded-xl">
                        {getModeTraits(appMode).map(trait => (
                          <div key={trait.id} className="space-y-1">
                            <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest">
                              <span className="text-zinc-400">{trait.label}</span>
                              <span className="text-white">{detailedProfile.traits[trait.id as keyof typeof detailedProfile.traits] ?? 50}%</span>
                            </div>
                            <input 
                              type="range" 
                              min="0" 
                              max="100" 
                              value={detailedProfile.traits[trait.id as keyof typeof detailedProfile.traits] ?? 50}
                              onChange={e => setDetailedProfile({
                                ...detailedProfile, 
                                traits: { ...detailedProfile.traits, [trait.id]: parseInt(e.target.value) }
                              })}
                              className={`w-full h-1.5 rounded-full appearance-none bg-zinc-800 cursor-pointer accent-emerald-500`}
                            />
                          </div>
                        ))}
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between items-center mb-2">
                        <label className="block text-xs font-bold text-zinc-500 uppercase tracking-widest">Voice Persona</label>
                        <button
                          onClick={handlePreviewVoice}
                          disabled={isPreviewingVoice}
                          className="text-[10px] font-bold text-blue-400 hover:text-blue-300 flex items-center gap-1 disabled:opacity-50"
                        >
                          {isPreviewingVoice ? <Loader2 className="w-3 h-3 animate-spin" /> : <Volume2 className="w-3 h-3" />}
                          PREVIEW
                        </button>
                      </div>
                      <div className="grid grid-cols-5 gap-2 mb-4">
                        {['Puck', 'Charon', 'Kore', 'Fenrir', 'Zephyr'].map(v => (
                          <button
                            key={v}
                            onClick={() => setDetailedProfile({...detailedProfile, voiceName: v})}
                            className={`py-2 rounded-lg text-[10px] font-bold border transition-all ${
                              detailedProfile.voiceName === v ? 'bg-emerald-500 border-emerald-400 text-white' : 'glass-input text-zinc-500 border-transparent hover:border-zinc-700'
                            }`}
                          >
                            {v}
                          </button>
                        ))}
                      </div>
                      
                      <div className="grid grid-cols-3 gap-3">
                        <div>
                          <div className="flex justify-between items-center mb-1">
                            <label className="block text-[8px] font-bold text-zinc-600 uppercase tracking-widest">Pitch</label>
                            <RefineButton 
                              onRefine={(guidance) => handleRefineField('voiceSettings.pitch', guidance)}
                              isRefining={isRefiningField === 'voiceSettings.pitch'}
                            />
                          </div>
                          <input 
                            type="text" 
                            className="w-full px-2 py-1.5 glass-input rounded-lg text-white text-[10px]"
                            value={detailedProfile.voiceSettings.pitch}
                            onChange={e => setDetailedProfile({...detailedProfile, voiceSettings: {...detailedProfile.voiceSettings, pitch: e.target.value}})}
                            placeholder="High, Deep..."
                          />
                        </div>
                        <div>
                          <div className="flex justify-between items-center mb-1">
                            <label className="block text-[8px] font-bold text-zinc-600 uppercase tracking-widest">Speed</label>
                            <RefineButton 
                              onRefine={(guidance) => handleRefineField('voiceSettings.speed', guidance)}
                              isRefining={isRefiningField === 'voiceSettings.speed'}
                            />
                          </div>
                          <input 
                            type="text" 
                            className="w-full px-2 py-1.5 glass-input rounded-lg text-white text-[10px]"
                            value={detailedProfile.voiceSettings.speed}
                            onChange={e => setDetailedProfile({...detailedProfile, voiceSettings: {...detailedProfile.voiceSettings, speed: e.target.value}})}
                            placeholder="Fast, Slow..."
                          />
                        </div>
                        <div>
                          <div className="flex justify-between items-center mb-1">
                            <label className="block text-[8px] font-bold text-zinc-600 uppercase tracking-widest">Accent</label>
                            <RefineButton 
                              onRefine={(guidance) => handleRefineField('voiceSettings.accent', guidance)}
                              isRefining={isRefiningField === 'voiceSettings.accent'}
                            />
                          </div>
                          <input 
                            type="text" 
                            className="w-full px-2 py-1.5 glass-input rounded-lg text-white text-[10px]"
                            value={detailedProfile.voiceSettings.accent}
                            onChange={e => setDetailedProfile({...detailedProfile, voiceSettings: {...detailedProfile.voiceSettings, accent: e.target.value}})}
                            placeholder="British..."
                          />
                        </div>
                      </div>
                    </div>

                    <div className="pt-4 border-t border-zinc-800/50">
                      <h4 className="text-sm font-bold text-zinc-300 mb-4">Player Character</h4>
                      <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <div className="flex justify-between items-center mb-2">
                              <label className="block text-xs font-bold text-zinc-500 uppercase tracking-widest">Your Name</label>
                              <RefineButton 
                                onRefine={(guidance) => handleRefineField('player_name', guidance)}
                                isRefining={isRefiningField === 'player_name'}
                              />
                            </div>
                            <input 
                              type="text" 
                              className="w-full px-4 py-3 glass-input rounded-xl text-white text-sm"
                              value={detailedProfile.playerProfile?.name || ''}
                              onChange={e => setDetailedProfile({...detailedProfile, playerProfile: {...(detailedProfile.playerProfile || {}), name: e.target.value}})}
                            />
                          </div>
                          <div>
                            <div className="flex justify-between items-center mb-2">
                              <label className="block text-xs font-bold text-zinc-500 uppercase tracking-widest">Personality</label>
                              <RefineButton 
                                onRefine={(guidance) => handleRefineField('player_personality', guidance)}
                                isRefining={isRefiningField === 'player_personality'}
                              />
                            </div>
                            <input 
                              type="text" 
                              className="w-full px-4 py-3 glass-input rounded-xl text-white text-sm"
                              value={detailedProfile.playerProfile?.personality || ''}
                              onChange={e => setDetailedProfile({...detailedProfile, playerProfile: {...(detailedProfile.playerProfile || {}), personality: e.target.value}})}
                            />
                          </div>
                        </div>

                        <div>
                          <div className="flex justify-between items-center mb-2">
                            <label className="block text-xs font-bold text-zinc-500 uppercase tracking-widest">Your Backstory</label>
                            <RefineButton 
                              onRefine={(guidance) => handleRefineField('player_backstory', guidance)}
                              isRefining={isRefiningField === 'player_backstory'}
                            />
                          </div>
                          <textarea 
                            rows={2}
                            className="w-full px-4 py-3 glass-input rounded-xl text-white text-sm resize-none"
                            value={detailedProfile.playerProfile?.backstory || ''}
                            onChange={e => setDetailedProfile({...detailedProfile, playerProfile: {...(detailedProfile.playerProfile || {}), backstory: e.target.value}})}
                          />
                        </div>

                        <div className="grid grid-cols-3 gap-3">
                          <div>
                            <div className="flex justify-between items-center mb-1">
                              <label className="block text-[8px] font-bold text-zinc-600 uppercase tracking-widest">Hair Style</label>
                              <RefineButton 
                                onRefine={(guidance) => handleRefineField('player_hairStyle', guidance)}
                                isRefining={isRefiningField === 'player_hairStyle'}
                              />
                            </div>
                            <input 
                              type="text" 
                              className="w-full px-2 py-1.5 glass-input rounded-lg text-white text-[10px]"
                              value={detailedProfile.playerProfile?.hairStyle || ''}
                              onChange={e => setDetailedProfile({...detailedProfile, playerProfile: {...(detailedProfile.playerProfile || {}), hairStyle: e.target.value}})}
                            />
                          </div>
                          <div>
                            <div className="flex justify-between items-center mb-1">
                              <label className="block text-[8px] font-bold text-zinc-600 uppercase tracking-widest">Hair Color</label>
                              <RefineButton 
                                onRefine={(guidance) => handleRefineField('player_hairColor', guidance)}
                                isRefining={isRefiningField === 'player_hairColor'}
                              />
                            </div>
                            <input 
                              type="text" 
                              className="w-full px-2 py-1.5 glass-input rounded-lg text-white text-[10px]"
                              value={detailedProfile.playerProfile?.hairColor || ''}
                              onChange={e => setDetailedProfile({...detailedProfile, playerProfile: {...(detailedProfile.playerProfile || {}), hairColor: e.target.value}})}
                            />
                          </div>
                          <div>
                            <div className="flex justify-between items-center mb-1">
                              <label className="block text-[8px] font-bold text-zinc-600 uppercase tracking-widest">Eye Color</label>
                              <RefineButton 
                                onRefine={(guidance) => handleRefineField('player_eyeColor', guidance)}
                                isRefining={isRefiningField === 'player_eyeColor'}
                              />
                            </div>
                            <input 
                              type="text" 
                              className="w-full px-2 py-1.5 glass-input rounded-lg text-white text-[10px]"
                              value={detailedProfile.playerProfile?.eyeColor || ''}
                              onChange={e => setDetailedProfile({...detailedProfile, playerProfile: {...(detailedProfile.playerProfile || {}), eyeColor: e.target.value}})}
                            />
                          </div>
                        </div>

                        {appMode === AppMode.GAME && (
                          <div className="grid grid-cols-4 gap-3">
                            <div>
                              <div className="flex justify-between items-center mb-1">
                                <label className="block text-[8px] font-bold text-zinc-600 uppercase tracking-widest">Class</label>
                                <RefineButton 
                                  onRefine={(guidance) => handleRefineField('player_playerClass', guidance)}
                                  isRefining={isRefiningField === 'player_playerClass'}
                                />
                              </div>
                              <input 
                                type="text" 
                                className="w-full px-2 py-1.5 glass-input rounded-lg text-white text-[10px]"
                                value={detailedProfile.playerProfile?.playerClass || ''}
                                onChange={e => setDetailedProfile({...detailedProfile, playerProfile: {...(detailedProfile.playerProfile || {}), playerClass: e.target.value}})}
                                placeholder="e.g., Rogue"
                              />
                            </div>
                            <div>
                              <div className="flex justify-between items-center mb-1">
                                <label className="block text-[8px] font-bold text-zinc-600 uppercase tracking-widest">Race</label>
                                <RefineButton 
                                  onRefine={(guidance) => handleRefineField('player_playerRace', guidance)}
                                  isRefining={isRefiningField === 'player_playerRace'}
                                />
                              </div>
                              <input 
                                type="text" 
                                className="w-full px-2 py-1.5 glass-input rounded-lg text-white text-[10px]"
                                value={detailedProfile.playerProfile?.playerRace || ''}
                                onChange={e => setDetailedProfile({...detailedProfile, playerProfile: {...(detailedProfile.playerProfile || {}), playerRace: e.target.value}})}
                                placeholder="e.g., Elf"
                              />
                            </div>
                            <div>
                              <label className="block text-[8px] font-bold text-zinc-600 uppercase tracking-widest mb-1">Current HP</label>
                              <input 
                                type="number" 
                                className="w-full px-2 py-1.5 glass-input rounded-lg text-white text-[10px]"
                                value={detailedProfile.playerProfile?.currentHP || ''}
                                onChange={e => setDetailedProfile({...detailedProfile, playerProfile: {...(detailedProfile.playerProfile || {}), currentHP: parseInt(e.target.value) || 0}})}
                              />
                            </div>
                            <div>
                              <label className="block text-[8px] font-bold text-zinc-600 uppercase tracking-widest mb-1">Max HP</label>
                              <input 
                                type="number" 
                                className="w-full px-2 py-1.5 glass-input rounded-lg text-white text-[10px]"
                                value={detailedProfile.playerProfile?.maxHP || ''}
                                onChange={e => setDetailedProfile({...detailedProfile, playerProfile: {...(detailedProfile.playerProfile || {}), maxHP: parseInt(e.target.value) || 0}})}
                              />
                            </div>
                          </div>
                        )}

                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <div className="flex justify-between items-center mb-2">
                              <label className="block text-xs font-bold text-zinc-500 uppercase tracking-widest">Appearance</label>
                              <RefineButton 
                                onRefine={(guidance) => handleRefineField('player_appearance', guidance)}
                                isRefining={isRefiningField === 'player_appearance'}
                              />
                            </div>
                            <input 
                              type="text" 
                              className="w-full px-4 py-3 glass-input rounded-xl text-white text-sm"
                              value={detailedProfile.playerProfile?.appearance || ''}
                              onChange={e => setDetailedProfile({...detailedProfile, playerProfile: {...(detailedProfile.playerProfile || {}), appearance: e.target.value}})}
                            />
                          </div>
                          <div>
                            <div className="flex justify-between items-center mb-1">
                              <label className="block text-[8px] font-bold text-zinc-600 uppercase tracking-widest">Clothing</label>
                              <RefineButton 
                                onRefine={(guidance) => handleRefineField('player_clothing', guidance)}
                                isRefining={isRefiningField === 'player_clothing'}
                              />
                            </div>
                            <input 
                              type="text" 
                              className="w-full px-2 py-1.5 glass-input rounded-lg text-white text-[10px]"
                              value={detailedProfile.playerProfile?.clothing || ''}
                              onChange={e => setDetailedProfile({...detailedProfile, playerProfile: {...(detailedProfile.playerProfile || {}), clothing: e.target.value}})}
                            />
                          </div>
                          <div>
                            <div className="flex justify-between items-center mb-1">
                              <label className="block text-[8px] font-bold text-zinc-600 uppercase tracking-widest">Accessories</label>
                              <RefineButton 
                                onRefine={(guidance) => handleRefineField('player_accessories', guidance)}
                                isRefining={isRefiningField === 'player_accessories'}
                              />
                            </div>
                            <input 
                              type="text" 
                              className="w-full px-2 py-1.5 glass-input rounded-lg text-white text-[10px]"
                              value={detailedProfile.playerProfile?.accessories || ''}
                              onChange={e => setDetailedProfile({...detailedProfile, playerProfile: {...(detailedProfile.playerProfile || {}), accessories: e.target.value}})}
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    {appMode === AppMode.GAME && (
                      <div className="pt-4 border-t border-zinc-800/50">
                        <div className="flex justify-between items-center mb-4">
                          <h4 className="text-sm font-bold text-zinc-300">Starting Inventory</h4>
                          <button 
                            onClick={() => {
                              const newItem: InventoryItem = {
                                id: Math.random().toString(36).substr(2, 9),
                                name: 'New Item',
                                description: 'Item description...',
                                quantity: 1,
                                type: 'Misc'
                              };
                              setDetailedProfile({
                                ...detailedProfile,
                                inventory: [...(detailedProfile.inventory || []), newItem]
                              });
                            }}
                            className="text-[10px] font-bold text-emerald-500 hover:text-emerald-400 flex items-center gap-1"
                          >
                            + ADD ITEM
                          </button>
                        </div>
                        <div className="space-y-2">
                          {(detailedProfile.inventory || []).map((item, idx) => (
                            <div key={item.id} className="p-3 bg-zinc-900/50 border border-zinc-800 rounded-xl space-y-2">
                              <div className="flex gap-2">
                                <input 
                                  type="text" 
                                  className="flex-1 bg-transparent border-none text-white text-xs font-bold focus:ring-0 p-0"
                                  value={item.name}
                                  onChange={e => {
                                    const newInv = [...(detailedProfile.inventory || [])];
                                    newInv[idx].name = e.target.value;
                                    setDetailedProfile({...detailedProfile, inventory: newInv});
                                  }}
                                />
                                <select 
                                  className="bg-zinc-800 text-[10px] text-zinc-400 border-none rounded px-1 focus:ring-0"
                                  value={item.type}
                                  onChange={e => {
                                    const newInv = [...(detailedProfile.inventory || [])];
                                    newInv[idx].type = e.target.value as any;
                                    setDetailedProfile({...detailedProfile, inventory: newInv});
                                  }}
                                >
                                  <option>Weapon</option>
                                  <option>Armor</option>
                                  <option>Consumable</option>
                                  <option>Quest</option>
                                  <option>Misc</option>
                                </select>
                                <button 
                                  onClick={() => {
                                    const newInv = detailedProfile.inventory?.filter(i => i.id !== item.id);
                                    setDetailedProfile({...detailedProfile, inventory: newInv});
                                  }}
                                  className="text-red-500 hover:text-red-400"
                                >
                                  ×
                                </button>
                              </div>
                              <textarea 
                                rows={1}
                                className="w-full bg-transparent border-none text-zinc-500 text-[10px] focus:ring-0 p-0 resize-none"
                                value={item.description}
                                onChange={e => {
                                  const newInv = [...(detailedProfile.inventory || [])];
                                  newInv[idx].description = e.target.value;
                                  setDetailedProfile({...detailedProfile, inventory: newInv});
                                }}
                              />
                            </div>
                          ))}
                          {(detailedProfile.inventory || []).length === 0 && (
                            <div className="text-center py-4 border-2 border-dashed border-zinc-800 rounded-xl text-zinc-600 text-[10px] uppercase tracking-widest">
                              No items in inventory
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {appMode !== AppMode.ROLEPLAY && (
                      <div className="pt-4 border-t border-zinc-800/50">
                        <div className="flex justify-between items-center mb-4">
                          <h4 className="text-sm font-bold text-zinc-300">Additional Characters / NPCs</h4>
                          <button 
                            onClick={() => setIsAddingCharacter(true)}
                            className="text-[10px] font-bold text-emerald-500 hover:text-emerald-400 flex items-center gap-1"
                          >
                            + ADD CHARACTER
                          </button>
                        </div>
                        <div className="space-y-2">
                          {(detailedProfile.additionalCharacters || []).map((char) => (
                            <div key={char.id} className="p-3 bg-zinc-900/50 border border-zinc-800 rounded-xl space-y-2">
                              <div className="flex justify-between items-start gap-2">
                                <div>
                                  <h5 className="text-xs font-bold text-white">{char.name}</h5>
                                  <p className="text-[10px] text-zinc-400">{char.description}</p>
                                </div>
                                <button 
                                  onClick={() => {
                                    const newChars = detailedProfile.additionalCharacters?.filter(c => c.id !== char.id);
                                    setDetailedProfile({...detailedProfile, additionalCharacters: newChars});
                                  }}
                                  className="text-red-500 hover:text-red-400 p-1"
                                >
                                  ×
                                </button>
                              </div>
                            </div>
                          ))}
                          {(detailedProfile.additionalCharacters || []).length === 0 && (
                            <div className="text-center py-4 border-2 border-dashed border-zinc-800 rounded-xl text-zinc-600 text-[10px] uppercase tracking-widest">
                              No additional characters
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {error && (
                  <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-400 text-sm">
                    {error}
                  </div>
                )}

                <button
                  onClick={handleDetailedGenerate}
                  disabled={isGenerating}
                  className="w-full py-5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-white rounded-2xl font-bold text-lg shadow-[0_0_30px_rgba(16,185,129,0.4)] hover:shadow-[0_0_50px_rgba(16,185,129,0.6)] transition-all flex items-center justify-center gap-3 group"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="w-6 h-6 animate-spin" />
                      <span className="animate-pulse">Finalizing Forge...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-6 h-6 group-hover:scale-125 transition-transform" />
                      Finalize & Forge
                    </>
                  )}
                </button>
              </motion.div>
            )}
          </motion.div>
        )}

        {(step === 'profile' || step === 'avatar') && (
          <motion.div
            key="generating"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.05 }}
            className="flex flex-col items-center justify-center py-20 space-y-8"
          >
            <div className="relative">
              <div className="absolute inset-0 bg-emerald-500/20 blur-3xl rounded-full animate-pulse" />
              <div className="relative w-32 h-32 bg-zinc-900 rounded-[2.5rem] border border-white/10 flex items-center justify-center shadow-2xl">
                {step === 'profile' ? (
                  <User className="w-12 h-12 text-emerald-400" />
                ) : (
                  <ImageIcon className="w-12 h-12 text-blue-400" />
                )}
                <div className="absolute inset-0 rounded-[2.5rem] border-2 border-emerald-500/30 border-t-emerald-500 animate-spin" />
              </div>
            </div>
            
            <div className="text-center space-y-2">
              <h3 className="text-3xl font-bold text-white font-serif tracking-tight">
                {step === 'profile' ? 'Forging Identity...' : 'Visualizing Presence...'}
              </h3>
              <p className="text-zinc-500 font-medium">
                {step === 'profile' 
                  ? 'Dreaming up backstory, personality, and world lore.' 
                  : 'Generating a high-fidelity avatar based on the character\'s description.'}
              </p>
            </div>

            <div className="flex gap-2">
              <div className={`w-2 h-2 rounded-full ${step === 'profile' ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]' : 'bg-zinc-800'}`} />
              <div className={`w-2 h-2 rounded-full ${step === 'avatar' ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]' : 'bg-zinc-800'}`} />
              <div className="w-2 h-2 rounded-full bg-zinc-800" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AdditionalCharacterModal
        isOpen={isAddingCharacter}
        onClose={() => setIsAddingCharacter(false)}
        appMode={appMode}
        onSave={(character) => {
          setDetailedProfile({
            ...detailedProfile,
            additionalCharacters: [...(detailedProfile.additionalCharacters || []), character]
          });
        }}
      />

      {isGenerating && setupType === 'quick' && (
        <div className="mt-10 space-y-4 relative">
          <div className="flex items-center gap-6 text-zinc-500">
            <div className={`p-3 rounded-2xl transition-all duration-500 ${step === 'profile' ? 'bg-emerald-500/20 text-emerald-400 scale-110 shadow-lg shadow-emerald-500/10' : 'bg-zinc-800'}`}>
              <User className="w-6 h-6" />
            </div>
            <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
              <motion.div 
                className="h-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]"
                initial={{ width: "0%" }}
                animate={{ width: step === 'profile' ? "50%" : "100%" }}
                transition={{ duration: 0.5 }}
              />
            </div>
            <div className={`p-3 rounded-2xl transition-all duration-500 ${step === 'avatar' ? 'bg-emerald-500/20 text-emerald-400 scale-110 shadow-lg shadow-emerald-500/10' : 'bg-zinc-800'}`}>
              <ImageIcon className="w-6 h-6" />
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}
