import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, Loader2, User, Image as ImageIcon, Wand2, Globe, Heart, Swords, ArrowLeft, ArrowRight, Settings2, RotateCcw } from 'lucide-react';
import { generateCharacterProfile, generateAvatar, CharacterProfile, refineField, refineTraits, AppMode } from '../lib/gemini';
import { CharacterEditor } from './CharacterEditor';

interface CharacterCreatorProps {
  onCharacterCreated: (profile: CharacterProfile, avatarBase64: string) => void;
  onCancel: () => void;
}

type CreatorStep = 'mode' | 'idle' | 'profile' | 'avatar' | 'review';

const DEFAULT_PROFILE: CharacterProfile = {
  mode: AppMode.ROLEPLAY,
  name: '',
  personality: '',
  backstory: '',
  appearance: '',
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
    description: 'A mysterious traveler.'
  },
  worldAtmosphere: '',
  keyLocations: '',
  characterFlaws: '',
  secretMotive: '',
  gameSystem: '',
  questObjective: ''
};

export function CharacterCreator({ onCharacterCreated, onCancel }: CharacterCreatorProps) {
  const [step, setStep] = useState<CreatorStep>(() => {
    const validSteps = ['mode', 'idle', 'profile', 'avatar', 'review'];
    const saved = localStorage.getItem('personaforge_draft_step');
    let initialStep = 'mode';
    if (saved && validSteps.includes(saved)) {
      initialStep = saved;
    } else {
      const rescue = localStorage.getItem('personaforge_rescue_backup');
      if (rescue && rescue !== 'null' && rescue !== 'undefined') {
        try {
          const data = JSON.parse(rescue);
          if (data.step && validSteps.includes(data.step)) {
            initialStep = data.step;
          }
        } catch (e) {}
      }
    }
    // If we were in the middle of generating or reviewing, reset to idle since generation state/avatar is lost
    if (initialStep === 'profile' || initialStep === 'avatar' || initialStep === 'review') {
      return 'idle';
    }
    return initialStep as CreatorStep;
  });
  const [appMode, setAppMode] = useState<AppMode>(() => {
    const validModes = [AppMode.ROLEPLAY, AppMode.SCENARIO, AppMode.GAME];
    const saved = localStorage.getItem('personaforge_draft_mode');
    if (saved && validModes.includes(saved as AppMode)) return saved as AppMode;
    const rescue = localStorage.getItem('personaforge_rescue_backup');
    if (rescue && rescue !== 'null' && rescue !== 'undefined') {
      try {
        const data = JSON.parse(rescue);
        if (data.appMode && validModes.includes(data.appMode as AppMode)) return data.appMode as AppMode;
      } catch (e) {}
    }
    return AppMode.ROLEPLAY;
  });
  const [setupType, setSetupType] = useState<'quick' | 'detailed'>(() => {
    const validTypes = ['quick', 'detailed'];
    const saved = localStorage.getItem('personaforge_draft_setup_type');
    if (saved && validTypes.includes(saved)) return saved as 'quick' | 'detailed';
    const rescue = localStorage.getItem('personaforge_rescue_backup');
    if (rescue && rescue !== 'null' && rescue !== 'undefined') {
      try {
        const data = JSON.parse(rescue);
        if (data.setupType && validTypes.includes(data.setupType)) return data.setupType as 'quick' | 'detailed';
      } catch (e) {}
    }
    return 'quick';
  });
  const [idea, setIdea] = useState(() => {
    const saved = localStorage.getItem('personaforge_draft_idea');
    if (saved && saved !== 'null' && saved !== 'undefined') return saved;
    const rescue = localStorage.getItem('personaforge_rescue_backup');
    if (rescue && rescue !== 'null' && rescue !== 'undefined') {
      try {
        const data = JSON.parse(rescue);
        if (data.idea) return data.idea;
      } catch (e) {}
    }
    return '';
  });

  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draftProfile, setDraftProfile] = useState<CharacterProfile | null>(null);
  const [draftAvatar, setDraftAvatar] = useState<string | null>(null);
  const [isRefiningField, setIsRefiningField] = useState<string | null>(null);

  // Detailed form state
  const [detailedProfile, setDetailedProfile] = useState<CharacterProfile>(() => {
    try {
      const draft = localStorage.getItem('personaforge_draft_profile');
      const rescue = localStorage.getItem('personaforge_rescue_backup');
      
      let dataToUse = null;
      if (draft) {
        dataToUse = JSON.parse(draft);
      } else if (rescue) {
        const rescueData = JSON.parse(rescue);
        if (rescueData.detailedProfile) {
          dataToUse = rescueData.detailedProfile;
        }
      }

      if (dataToUse) {
        // Deep merge with defaults to prevent crashes
        return {
          ...DEFAULT_PROFILE,
          ...dataToUse,
          traits: { ...DEFAULT_PROFILE.traits, ...(dataToUse.traits || {}) },
          voiceSettings: { ...DEFAULT_PROFILE.voiceSettings, ...(dataToUse.voiceSettings || {}) },
          playerProfile: { ...DEFAULT_PROFILE.playerProfile, ...(dataToUse.playerProfile || {}) }
        };
      }
    } catch (e) {
      console.error("Failed to load draft", e);
    }
    return DEFAULT_PROFILE;
  });

  const isFirstRender = useRef(true);

  // Auto-save basic draft
  useEffect(() => {
    // Skip the very first render if we are just initializing with defaults
    // to avoid overwriting a potentially valid draft that is still loading
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    try {
      localStorage.setItem('personaforge_draft_mode', appMode);
      localStorage.setItem('personaforge_draft_idea', idea);
      localStorage.setItem('personaforge_draft_step', step);
      localStorage.setItem('personaforge_draft_setup_type', setupType);
      localStorage.setItem('personaforge_draft_profile', JSON.stringify(detailedProfile));
      
      // Create a secondary "Rescue" backup every time we save
      localStorage.setItem('personaforge_rescue_backup', JSON.stringify({
        appMode, idea, step, setupType, detailedProfile, timestamp: Date.now()
      }));
    } catch (e) {
      console.warn("Failed to save draft to localStorage (quota exceeded?)", e);
    }
  }, [appMode, idea, step, setupType, detailedProfile]);

  const handleRescue = () => {
    try {
      const rescue = localStorage.getItem('personaforge_rescue_backup');
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
        alert("Rescue successful! Your last known progress has been restored.");
      } else {
        alert("No rescue backup found.");
      }
    } catch (e) {
      console.error("Rescue failed", e);
    }
  };

  const handleQuickGenerate = async () => {
    if (!idea.trim()) return;
    setIsGenerating(true);
    setError(null);
    try {
      setStep('profile');
      const profile = await generateCharacterProfile(idea, appMode);
      setDraftProfile(profile);
      setStep('avatar');
      const avatarBase64 = await generateAvatar(profile.appearance);
      setDraftAvatar(avatarBase64);
      setStep('review');
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to generate character. Please try again.");
      setStep('idle');
    } finally {
      setIsGenerating(false);
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

  const handleRefineTraits = async () => {
    setIsRefiningField('traits');
    try {
      const refinedTraits = await refineTraits(detailedProfile);
      setDetailedProfile(prev => ({ ...prev, traits: refinedTraits }));
    } catch (err) {
      console.error("Refine traits error:", err);
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
      const avatarBase64 = await generateAvatar(detailedProfile.appearance);
      setDraftAvatar(avatarBase64);
      setDraftProfile({ ...detailedProfile, mode: appMode });
      setStep('review');
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to generate avatar. Please try again.");
      setStep('idle');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRefineField = async (field: keyof CharacterProfile | 'player_name' | 'player_desc') => {
    setIsRefiningField(field);
    try {
      const refined = await refineField(field as any, detailedProfile);
      setDetailedProfile(prev => {
        if (field === 'player_name') return { ...prev, playerProfile: { ...prev.playerProfile, name: refined } };
        if (field === 'player_desc') return { ...prev, playerProfile: { ...prev.playerProfile, description: refined } };
        return { ...prev, [field]: refined };
      });
    } catch (err) {
      console.error("Refine field error:", err);
    } finally {
      setIsRefiningField(null);
    }
  };

  if (step === 'review' && draftProfile && draftAvatar) {
    return (
      <CharacterEditor
        profile={draftProfile}
        avatarBase64={draftAvatar}
        isInitialReview={true}
        onSave={(finalProfile, finalAvatar) => {
          onCharacterCreated(finalProfile, finalAvatar);
        }}
        onCancel={() => {
          setStep('idle');
          setDraftProfile(null);
          setDraftAvatar(null);
        }}
      />
    );
  }

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full max-w-4xl mx-auto p-10 glass-panel rounded-[2.5rem] shadow-2xl relative overflow-hidden border border-white/5"
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
                { id: AppMode.SCENARIO, label: 'Scenario', icon: Globe, desc: 'Focus on world-building and environment.', color: 'emerald' },
                { id: AppMode.ROLEPLAY, label: 'Roleplay', icon: Heart, desc: 'Focus on deep character interaction.', color: 'blue' },
                { id: AppMode.GAME, label: 'Game', icon: Swords, desc: 'AI acts as a Dungeon Master.', color: 'purple' }
              ].map(m => (
                <button
                  key={m.id}
                  onClick={() => { setAppMode(m.id); setStep('idle'); }}
                  className={`p-8 rounded-[2rem] border-2 transition-all text-left group relative overflow-hidden ${
                    appMode === m.id ? 'border-emerald-500 bg-emerald-500/5' : 'border-white/5 bg-white/5 hover:border-white/20'
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
                Detailed Forge
              </button>
            </div>

            {setupType === 'quick' ? (
              <div className="space-y-6">
                <div className="relative group">
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
                  <div className="absolute bottom-6 right-6">
                    <button
                      onClick={handleQuickGenerate}
                      disabled={!idea.trim() || isGenerating}
                      className="p-5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-white rounded-2xl shadow-xl transition-all group"
                    >
                      {isGenerating ? <Loader2 className="w-6 h-6 animate-spin" /> : <ArrowRight className="w-6 h-6 group-hover:translate-x-1 transition-transform" />}
                    </button>
                  </div>
                </div>
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
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-6">
                    <div>
                      <label className="block text-xs font-bold text-zinc-500 uppercase tracking-widest mb-3">Narrative Identity Name</label>
                      <input 
                        type="text" 
                        className="w-full px-6 py-4 glass-input rounded-2xl text-white text-sm focus:ring-2 focus:ring-emerald-500/30 transition-all"
                        value={detailedProfile.name}
                        onChange={e => setDetailedProfile({...detailedProfile, name: e.target.value})}
                        placeholder={appMode === AppMode.GAME ? "Dungeon Master Name" : "Character Name"}
                      />
                    </div>
                    {['personality', 'backstory', 'appearance'].map((field) => (
                      <div key={field}>
                        <div className="flex justify-between items-center mb-2">
                          <label className="block text-xs font-bold text-zinc-500 uppercase tracking-widest">
                            {field === 'appearance' && appMode === AppMode.SCENARIO ? 'Setting / Appearance' : field}
                          </label>
                          <button 
                            onClick={() => handleRefineField(field as any)}
                            disabled={isRefiningField !== null}
                            className="text-[10px] font-bold text-emerald-500 hover:text-emerald-400 flex items-center gap-1 disabled:opacity-50"
                          >
                            {isRefiningField === field ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
                            MAGIC REFINE
                          </button>
                        </div>
                        <textarea 
                          rows={3}
                          className="w-full px-6 py-4 glass-input rounded-2xl text-white text-sm focus:ring-2 focus:ring-emerald-500/30 transition-all resize-none"
                          value={detailedProfile[field as keyof CharacterProfile] as string}
                          onChange={e => setDetailedProfile({...detailedProfile, [field]: e.target.value})}
                          placeholder={`Describe ${field}...`}
                        />
                      </div>
                    ))}

                    {/* Mode Specific Fields */}
                    {appMode === AppMode.SCENARIO && (
                      <div className="space-y-6 pt-4 border-t border-white/5">
                        <h4 className="text-xs font-bold text-emerald-400 uppercase tracking-widest">World Details</h4>
                        <div>
                          <div className="flex justify-between items-center mb-2">
                            <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest">World Atmosphere</label>
                            <button 
                              onClick={() => handleRefineField('worldAtmosphere')}
                              disabled={isRefiningField !== null}
                              className="text-[10px] font-bold text-emerald-500 hover:text-emerald-400 flex items-center gap-1 disabled:opacity-50"
                            >
                              {isRefiningField === 'worldAtmosphere' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
                              MAGIC REFINE
                            </button>
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
                            <button 
                              onClick={() => handleRefineField('keyLocations')}
                              disabled={isRefiningField !== null}
                              className="text-[10px] font-bold text-emerald-500 hover:text-emerald-400 flex items-center gap-1 disabled:opacity-50"
                            >
                              {isRefiningField === 'keyLocations' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
                              MAGIC REFINE
                            </button>
                          </div>
                          <textarea 
                            rows={2}
                            className="w-full px-6 py-4 glass-input rounded-2xl text-white text-sm"
                            value={detailedProfile.keyLocations}
                            onChange={e => setDetailedProfile({...detailedProfile, keyLocations: e.target.value})}
                            placeholder="e.g., The Spire, The Underbelly, Neon Market..."
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
                            <button 
                              onClick={() => handleRefineField('characterFlaws')}
                              disabled={isRefiningField !== null}
                              className="text-[10px] font-bold text-blue-500 hover:text-blue-400 flex items-center gap-1 disabled:opacity-50"
                            >
                              {isRefiningField === 'characterFlaws' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
                              MAGIC REFINE
                            </button>
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
                            <button 
                              onClick={() => handleRefineField('secretMotive')}
                              disabled={isRefiningField !== null}
                              className="text-[10px] font-bold text-blue-500 hover:text-blue-400 flex items-center gap-1 disabled:opacity-50"
                            >
                              {isRefiningField === 'secretMotive' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
                              MAGIC REFINE
                            </button>
                          </div>
                          <textarea 
                            rows={2}
                            className="w-full px-6 py-4 glass-input rounded-2xl text-white text-sm"
                            value={detailedProfile.secretMotive}
                            onChange={e => setDetailedProfile({...detailedProfile, secretMotive: e.target.value})}
                            placeholder="e.g., Seeking revenge for a lost sibling..."
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
                            <button 
                              onClick={() => handleRefineField('gameSystem')}
                              disabled={isRefiningField !== null}
                              className="text-[10px] font-bold text-purple-500 hover:text-purple-400 flex items-center gap-1 disabled:opacity-50"
                            >
                              {isRefiningField === 'gameSystem' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
                              MAGIC REFINE
                            </button>
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
                            <button 
                              onClick={() => handleRefineField('questObjective')}
                              disabled={isRefiningField !== null}
                              className="text-[10px] font-bold text-purple-500 hover:text-purple-400 flex items-center gap-1 disabled:opacity-50"
                            >
                              {isRefiningField === 'questObjective' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
                              MAGIC REFINE
                            </button>
                          </div>
                          <textarea 
                            rows={2}
                            className="w-full px-6 py-4 glass-input rounded-2xl text-white text-sm"
                            value={detailedProfile.questObjective}
                            onChange={e => setDetailedProfile({...detailedProfile, questObjective: e.target.value})}
                            placeholder="e.g., Retrieve the Crystal of Aethelgard..."
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="space-y-6">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2">Story Tone</label>
                        <select 
                          className="w-full px-4 py-3 glass-input rounded-xl text-white text-sm"
                          value={detailedProfile.storyTone}
                          onChange={e => handleToneChange(e.target.value)}
                        >
                          {['Dramatic', 'Gritty', 'Whimsical', 'Horror', 'Romantic', 'Cyberpunk', 'Noir', 'Adventure'].map(t => (
                            <option key={t} value={t} className="bg-zinc-900">{t}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2">Relationship</label>
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
                        <label className="block text-xs font-bold text-zinc-500 uppercase tracking-widest">Personality Traits</label>
                        <button 
                          onClick={handleRefineTraits}
                          disabled={isRefiningField !== null}
                          className="text-[10px] font-bold text-emerald-500 hover:text-emerald-400 flex items-center gap-1 disabled:opacity-50"
                        >
                          {isRefiningField === 'traits' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
                          MAGIC REFINE
                        </button>
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
                      <label className="block text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2">Voice Persona</label>
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
                          <label className="block text-[8px] font-bold text-zinc-600 uppercase tracking-widest mb-1">Pitch</label>
                          <input 
                            type="text" 
                            className="w-full px-2 py-1.5 glass-input rounded-lg text-white text-[10px]"
                            value={detailedProfile.voiceSettings.pitch}
                            onChange={e => setDetailedProfile({...detailedProfile, voiceSettings: {...detailedProfile.voiceSettings, pitch: e.target.value}})}
                            placeholder="High, Deep..."
                          />
                        </div>
                        <div>
                          <label className="block text-[8px] font-bold text-zinc-600 uppercase tracking-widest mb-1">Speed</label>
                          <input 
                            type="text" 
                            className="w-full px-2 py-1.5 glass-input rounded-lg text-white text-[10px]"
                            value={detailedProfile.voiceSettings.speed}
                            onChange={e => setDetailedProfile({...detailedProfile, voiceSettings: {...detailedProfile.voiceSettings, speed: e.target.value}})}
                            placeholder="Fast, Slow..."
                          />
                        </div>
                        <div>
                          <label className="block text-[8px] font-bold text-zinc-600 uppercase tracking-widest mb-1">Accent</label>
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
                        <div>
                          <label className="block text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2">Your Name</label>
                          <input 
                            type="text" 
                            className="w-full px-4 py-3 glass-input rounded-xl text-white text-sm"
                            value={detailedProfile.playerProfile.name}
                            onChange={e => setDetailedProfile({...detailedProfile, playerProfile: {...detailedProfile.playerProfile, name: e.target.value}})}
                          />
                        </div>
                        <div>
                          <div className="flex justify-between items-center mb-2">
                            <label className="block text-xs font-bold text-zinc-500 uppercase tracking-widest">Your Description</label>
                            <button 
                              onClick={() => handleRefineField('player_desc')}
                              disabled={isRefiningField !== null}
                              className="text-[10px] font-bold text-emerald-500 hover:text-emerald-400 flex items-center gap-1 disabled:opacity-50"
                            >
                              {isRefiningField === 'player_desc' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
                              MAGIC REFINE
                            </button>
                          </div>
                          <textarea 
                            rows={2}
                            className="w-full px-4 py-3 glass-input rounded-xl text-white text-sm resize-none"
                            value={detailedProfile.playerProfile.description}
                            onChange={e => setDetailedProfile({...detailedProfile, playerProfile: {...detailedProfile.playerProfile, description: e.target.value}})}
                          />
                        </div>
                      </div>
                    </div>
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
                  className="w-full py-5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-white rounded-2xl font-bold text-lg shadow-xl shadow-emerald-900/20 transition-all flex items-center justify-center gap-3 group"
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
      </AnimatePresence>

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
