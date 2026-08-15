import { useState } from 'react';
import { motion } from 'motion/react';
import { useToast } from '../hooks/useToast';
import { CharacterProfile, generateAvatar, AppMode, refineField, refineTraits, refinePlayerProfile, generateSpeech, refineProfile, applyGlobalEdit } from '../lib/gemini';
import { Loader2, RotateCcw, BookOpen, Wand2, Globe, Heart, Swords, Settings2, Volume2, Plus, Trash2, Sparkles } from 'lucide-react';
import { RefineButton } from './RefineButton';
import { AdditionalCharacterModal } from './AdditionalCharacterModal';
import { CharacterLibraryModal } from './CharacterLibraryModal';

interface CharacterEditorProps {
  profile: CharacterProfile;
  avatarBase64: string;
  isInitialReview?: boolean;
  onSave: (profile: CharacterProfile, avatarBase64: string) => void;
  onCancel: () => void;
  scenarios?: any[];
}

export function CharacterEditor({ profile: initialProfile, avatarBase64: initialAvatar, isInitialReview, onSave, onCancel, scenarios = [] }: CharacterEditorProps) {
  const [profile, setProfile] = useState<CharacterProfile>(initialProfile);
  const [avatar, setAvatar] = useState<string>(initialAvatar);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [isRefiningField, setIsRefiningField] = useState<string | null>(null);
  const [isRefiningAll, setIsRefiningAll] = useState(false);
  const [globalEditPrompt, setGlobalEditPrompt] = useState("");
  const [isGlobalEditing, setIsGlobalEditing] = useState(false);
  const [isPreviewingVoice, setIsPreviewingVoice] = useState(false);
  const [showAddCharacter, setShowAddCharacter] = useState(false);
  const [showLibraryModal, setShowLibraryModal] = useState(false);
  const [libraryImportTarget, setLibraryImportTarget] = useState<'main' | 'player'>('main');
  const { toastSuccess, toastError } = useToast();

  const handleLibrarySelect = (char: any) => {
    if (libraryImportTarget === 'player') {
      setProfile((prev) => ({
        ...prev,
        playerProfile: {
          ...prev.playerProfile,
          name: char.name,
          description: char.description || char.personality || '',
          personality: char.personality,
          backstory: char.backstory,
          appearance: char.appearance,
          clothing: char.clothing,
          accessories: char.accessories,
          hairStyle: char.hairStyle,
          hairColor: char.hairColor,
          eyeColor: char.eyeColor,
        },
      }));
    } else {
      setProfile((prev) => ({
        ...prev,
        name: char.name,
        personality: char.personality || prev.personality,
        backstory: char.backstory || char.description || prev.backstory,
        appearance: char.appearance || prev.appearance,
        clothing: char.clothing,
        accessories: char.accessories,
        hairStyle: char.hairStyle,
        hairColor: char.hairColor,
        eyeColor: char.eyeColor,
      }));
      if (char.avatarBase64) setAvatar(char.avatarBase64);
    }
  };

  const handleGlobalEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!globalEditPrompt.trim() || isGlobalEditing) return;
    setIsGlobalEditing(true);
    try {
      const updatedProfile = await applyGlobalEdit(profile, globalEditPrompt);
      setProfile(updatedProfile);
      setGlobalEditPrompt("");
      toastSuccess("Profile updated based on your request!");
    } catch (err: any) {
      console.error("Global edit error:", err);
      toastError(`Edit failed: ${err.message || 'Unknown error'}`);
    } finally {
      setIsGlobalEditing(false);
    }
  };

  const handleOverallRefinement = async () => {
    if (isRefiningAll) return;
    setIsRefiningAll(true);
    try {
      const refined = await refineProfile(profile);
      setProfile(refined);
      toastSuccess("Profile refined and blanks filled!");
    } catch (err: any) {
      console.error("Overall refinement error:", err);
      toastError(`Refinement failed: ${err.message || 'Unknown error'}`);
    } finally {
      setIsRefiningAll(false);
    }
  };

  const handlePreviewVoice = async () => {
    if (isPreviewingVoice) return;
    setIsPreviewingVoice(true);
    try {
      const text = `Hello there! I am ${profile.name || 'your character'}. This is how my voice sounds.`;
      const base64Audio = await generateSpeech(text, profile.voiceName || 'Kore', profile.voiceSettings, profile.storyTone || 'Neutral');
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

  const handleSave = () => {
    onSave(profile, avatar);
  };

  const handleRegenerateAvatar = async () => {
    setIsRegenerating(true);
    try {
      const newAvatar = await generateAvatar(profile);
      setAvatar(newAvatar);
      toastSuccess("Avatar regenerated!");
    } catch (err: any) {
      console.error("Failed to regenerate avatar", err);
      toastError(`Failed to regenerate avatar: ${err.message || 'Unknown error'}`);
    } finally {
      setIsRegenerating(false);
    }
  };

  const handleRefineField = async (field: keyof CharacterProfile | string, guidance?: string) => {
    setIsRefiningField(field);
    try {
      let refined = "";
      if (field.toString().startsWith('player_')) {
        const playerField = field.toString().replace('player_', '');
        refined = await refinePlayerProfile(playerField, profile, guidance);
      } else {
        refined = await refineField(field as any, profile, guidance);
      }
      
      setProfile(prev => {
        if (field.toString().startsWith('player_')) {
          const playerField = field.toString().replace('player_', '');
          return { ...prev, playerProfile: { ...(prev.playerProfile || {}), [playerField]: refined } };
        }
        return { ...prev, [field]: refined };
      });
      toastSuccess(`${field.toString().replace('player_', '')} refined`);
    } catch (err: any) {
      console.error("Refine field error:", err);
      toastError(`Refinement failed: ${err.message || 'Unknown error'}`);
    } finally {
      setIsRefiningField(null);
    }
  };

  const handleRefineTraits = async () => {
    setIsRefiningField('traits');
    try {
      const refinedTraits = await refineTraits(profile);
      setProfile(prev => ({ ...prev, traits: refinedTraits }));
      toastSuccess("Traits refined");
    } catch (err: any) {
      console.error("Refine traits error:", err);
      toastError(`Refinement failed: ${err.message || 'Unknown error'}`);
    } finally {
      setIsRefiningField(null);
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

  const getVisualDetailsFields = (mode: AppMode) => {
    switch (mode) {
      case AppMode.SCENARIO:
        return [
          { label: 'Environment Type', field: 'clothing', placeholder: 'e.g., Cyberpunk City, Fantasy Forest' },
          { label: 'Lighting / Weather', field: 'accessories', placeholder: 'e.g., Neon glow, Moonlit' },
          { label: 'Primary Color', field: 'hairStyle', placeholder: 'e.g., Cool blues' },
          { label: 'Secondary Color', field: 'hairColor', placeholder: 'e.g., Gritty browns' },
          { label: 'Key Landmark', field: 'eyeColor', placeholder: 'e.g., Giant glowing tree' }
        ];
      case AppMode.GAME:
        return [
          { label: 'Setting Type', field: 'clothing', placeholder: 'e.g., Dungeon, Tavern, Map' },
          { label: 'Key Elements', field: 'accessories', placeholder: 'e.g., Dragons, Dice, Swords' },
          { label: 'Atmosphere', field: 'hairStyle', placeholder: 'e.g., Dark fantasy, High magic' },
          { label: 'Color Theme', field: 'hairColor', placeholder: 'e.g., Crimson and gold' },
          { label: 'Art Style', field: 'eyeColor', placeholder: 'e.g., Oil painting, Sketch' }
        ];
      default:
        return [
          { label: 'Hair Style', field: 'hairStyle', placeholder: 'e.g., Long wavy' },
          { label: 'Hair Color', field: 'hairColor', placeholder: 'e.g., Raven black' },
          { label: 'Eye Color', field: 'eyeColor', placeholder: 'e.g., Piercing blue' },
          { label: 'Clothing', field: 'clothing', placeholder: 'e.g., Leather duster' },
          { label: 'Accessories', field: 'accessories', placeholder: 'e.g., Silver monocle' }
        ];
    }
  };

  const getCoreIdentityFields = (mode: AppMode) => {
    switch (mode) {
      case AppMode.SCENARIO:
        return [
          { label: 'Narrative Tone', field: 'personality', rows: 4 },
          { label: 'Scenario Premise', field: 'backstory', rows: 4 },
          { label: 'Visual Aesthetic', field: 'appearance', rows: 4 },
          { label: 'Protagonist\'s Role', field: 'relationship', rows: 4 }
        ];
      case AppMode.GAME:
        return [
          { label: 'DM Style', field: 'personality', rows: 4 },
          { label: 'Campaign Setting', field: 'backstory', rows: 4 },
          { label: 'World Description', field: 'appearance', rows: 4 },
          { label: 'Party\'s Reputation', field: 'relationship', rows: 4 }
        ];
      default:
        return [
          { label: 'Personality', field: 'personality', rows: 4 },
          { label: 'Backstory', field: 'backstory', rows: 4 },
          { label: 'Appearance', field: 'appearance', rows: 4 },
          { label: 'Relationship', field: 'relationship', rows: 4 }
        ];
    }
  };

  const getNameLabel = (mode: AppMode) => {
    switch (mode) {
      case AppMode.SCENARIO: return 'Scenario Title';
      case AppMode.GAME: return 'Campaign Name';
      default: return 'Name';
    }
  };

  const getCoreIdentityTitle = (mode: AppMode) => {
    switch (mode) {
      case AppMode.SCENARIO: return 'Scenario Overview';
      case AppMode.GAME: return 'Campaign Overview';
      default: return 'Core Identity';
    }
  };

  const getPlayerSectionTitle = (mode: AppMode) => {
    switch (mode) {
      case AppMode.SCENARIO: return 'Protagonist Profile (You)';
      case AppMode.GAME: return 'Player Character (You)';
      default: return 'Player Persona (You)';
    }
  };

  const getPageTitle = (mode: AppMode, isReview: boolean) => {
    switch (mode) {
      case AppMode.SCENARIO: return isReview ? 'Review Scenario' : 'Customize Scenario';
      case AppMode.GAME: return isReview ? 'Review Campaign' : 'Customize Campaign';
      default: return isReview ? 'Review Character' : 'Customize Character';
    }
  };

  const getPageSubtitle = (mode: AppMode) => {
    switch (mode) {
      case AppMode.SCENARIO: return 'Refine the details of your world and narrative.';
      case AppMode.GAME: return 'Refine the details of your tabletop adventure.';
      default: return 'Refine the details of your narrative persona.';
    }
  };

  return (
    <div className="p-4 sm:p-8 max-w-6xl mx-auto w-full max-h-[90vh] overflow-y-auto custom-scrollbar">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8 gap-4">
        <div>
          <h2 className="text-3xl sm:text-4xl font-serif text-white">{getPageTitle(profile.mode, !!isInitialReview)}</h2>
          <p className="text-zinc-500 text-sm mt-1">{getPageSubtitle(profile.mode)}</p>
        </div>
        <div className="flex flex-wrap gap-3 w-full sm:w-auto">
          <button
            onClick={handleOverallRefinement}
            disabled={isRefiningAll || isRefiningField !== null}
            className="flex-1 sm:flex-none px-6 py-3 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 disabled:opacity-50 rounded-xl font-bold text-xs uppercase tracking-widest transition-colors flex items-center justify-center gap-2 border border-emerald-500/30"
          >
            {isRefiningAll ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            Fill Blanks & Refine All
          </button>
          <button onClick={onCancel} className="flex-1 sm:flex-none px-6 py-3 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl font-bold text-xs uppercase tracking-widest transition-colors">
            Cancel
          </button>
          <button onClick={handleSave} className="flex-1 sm:flex-none px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold text-xs uppercase tracking-widest transition-colors shadow-lg shadow-emerald-900/20">
            Save Changes
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Avatar & Visuals */}
        <div className="lg:col-span-4 space-y-8">
          {/* Global Quick Edit */}
          <div className="bg-zinc-900/50 border border-white/10 rounded-[2.5rem] p-6 backdrop-blur-sm shadow-2xl">
            <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
              <Wand2 className="w-4 h-4 text-emerald-400" />
              Magic Edit
            </h3>
            <form onSubmit={handleGlobalEditSubmit} className="flex flex-col gap-3">
              <textarea
                value={globalEditPrompt}
                onChange={(e) => setGlobalEditPrompt(e.target.value)}
                placeholder="e.g. 'Make them a vampire', 'Change the setting to cyberpunk', 'Make them more aggressive'"
                className="w-full bg-black/50 border border-white/10 rounded-2xl p-4 text-white text-sm focus:outline-none focus:border-emerald-500/50 transition-colors resize-none min-h-[100px]"
                disabled={isGlobalEditing}
              />
              <button
                type="submit"
                disabled={!globalEditPrompt.trim() || isGlobalEditing}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-white rounded-xl font-bold text-xs uppercase tracking-widest transition-colors flex items-center justify-center gap-2"
              >
                {isGlobalEditing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                Apply Changes
              </button>
            </form>
          </div>

          <div className="relative group aspect-square rounded-[2.5rem] overflow-hidden border border-white/10 bg-zinc-900 shadow-2xl">
            {avatar ? (
              <img src={avatar} alt="Avatar" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-zinc-700">No Image</div>
            )}
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <button 
                onClick={handleRegenerateAvatar}
                disabled={isRegenerating}
                className="p-4 bg-white/10 backdrop-blur-md rounded-2xl text-white hover:bg-white/20 transition-all flex items-center gap-2"
              >
                {isRegenerating ? <Loader2 className="w-6 h-6 animate-spin" /> : <RotateCcw className="w-6 h-6" />}
                <span className="font-bold text-xs uppercase tracking-widest">Regenerate Avatar</span>
              </button>
            </div>
          </div>

          {/* Avatar Customization */}
          <div className="glass-panel p-6 rounded-[2rem] border border-white/5 space-y-6">
            <h3 className="text-xs font-bold text-emerald-400 uppercase tracking-widest flex items-center gap-2">
              <Settings2 className="w-3 h-3" />
              Visual Details
            </h3>
            <div className="grid grid-cols-1 gap-4">
              {getVisualDetailsFields(profile.mode).map(item => (
                <div key={item.field}>
                  <div className="flex justify-between items-center mb-1.5">
                    <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest">{item.label}</label>
                    <RefineButton 
                      onRefine={(guidance) => handleRefineField(item.field, guidance)}
                      isRefining={isRefiningField === item.field}
                    />
                  </div>
                  <input
                    type="text"
                    value={(profile as any)[item.field] || ''}
                    onChange={(e) => setProfile({ ...profile, [item.field]: e.target.value })}
                    className="w-full p-3 rounded-xl glass-input text-white text-sm focus:ring-2 focus:ring-emerald-500/30 transition-all"
                    placeholder={item.placeholder}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Voice Settings */}
          <div className="glass-panel p-6 rounded-[2rem] border border-white/5 space-y-6">
            <div className="flex justify-between items-center">
              <h3 className="text-xs font-bold text-blue-400 uppercase tracking-widest flex items-center gap-2">
                <RotateCcw className="w-3 h-3" />
                Voice Persona
              </h3>
              <button
                onClick={handlePreviewVoice}
                disabled={isPreviewingVoice}
                className="text-[10px] font-bold text-blue-400 hover:text-blue-300 flex items-center gap-1 disabled:opacity-50"
              >
                {isPreviewingVoice ? <Loader2 className="w-3 h-3 animate-spin" /> : <Volume2 className="w-3 h-3" />}
                PREVIEW
              </button>
            </div>
            <div className="grid grid-cols-5 gap-1.5">
              {['Puck', 'Charon', 'Kore', 'Fenrir', 'Zephyr'].map(v => (
                <button
                  key={v}
                  onClick={() => setProfile({...profile, voiceName: v})}
                  className={`py-2 rounded-lg text-[9px] font-bold border transition-all ${
                    profile.voiceName === v ? 'bg-emerald-500 border-emerald-400 text-white' : 'glass-input text-zinc-500 border-transparent hover:border-zinc-700'
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'Pitch', field: 'pitch' },
                { label: 'Speed', field: 'speed' },
                { label: 'Accent', field: 'accent' }
              ].map(item => (
                <div key={item.field}>
                  <label className="block text-[8px] font-bold text-zinc-600 uppercase tracking-widest mb-1">{item.label}</label>
                  <input 
                    type="text" 
                    className="w-full px-2 py-2 glass-input rounded-lg text-white text-[10px]"
                    value={(profile.voiceSettings as any)[item.field]}
                    onChange={e => setProfile({...profile, voiceSettings: {...profile.voiceSettings, [item.field]: e.target.value}})}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: Narrative & Stats */}
        <div className="lg:col-span-8 space-y-8">
          {/* Core Identity */}
          <div className="glass-panel p-8 rounded-[2.5rem] border border-white/5 space-y-8">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-blue-400 uppercase tracking-widest flex items-center gap-2">
                <Heart className="w-3 h-3" />
                {getCoreIdentityTitle(profile.mode)}
              </h3>
              <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20">
                <span className="text-[9px] font-bold text-blue-400 uppercase tracking-widest">{profile.mode} Mode</span>
              </div>
            </div>

            <div className="space-y-6">
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest">{getNameLabel(profile.mode)}</label>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => { setLibraryImportTarget('main'); setShowLibraryModal(true); }}
                      className="flex items-center gap-1.5 px-3 py-1 bg-white/5 hover:bg-blue-500/20 text-zinc-400 hover:text-blue-400 text-[10px] font-bold uppercase tracking-widest rounded-full transition-colors border border-white/10"
                    >
                      <BookOpen className="w-3 h-3" />
                      Import Library
                    </button>
                    <RefineButton 
                      onRefine={(guidance) => handleRefineField('name', guidance)}
                      isRefining={isRefiningField === 'name'}
                    />
                  </div>
                </div>
                <input
                  type="text"
                  value={profile.name}
                  onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                  className="w-full p-4 rounded-2xl glass-input text-white text-xl font-medium focus:ring-2 focus:ring-blue-500/30 transition-all"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {getCoreIdentityFields(profile.mode).map(item => (
                  <div key={item.field}>
                    <div className="flex justify-between items-center mb-2">
                      <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest">{item.label}</label>
                      <RefineButton 
                        onRefine={(guidance) => handleRefineField(item.field as any, guidance)}
                        isRefining={isRefiningField === item.field}
                        label="REFINE"
                      />
                    </div>
                    <textarea
                      value={(profile as any)[item.field]}
                      onChange={(e) => setProfile({ ...profile, [item.field]: e.target.value })}
                      className="w-full p-4 rounded-2xl glass-input text-white text-sm leading-relaxed resize-none focus:ring-2 focus:ring-blue-500/30 transition-all"
                      rows={item.rows}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Mode Specific Settings */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Traits & Tone */}
            <div className="glass-panel p-8 rounded-[2.5rem] border border-white/5 space-y-6">
              <h3 className="text-xs font-bold text-emerald-400 uppercase tracking-widest flex items-center gap-2">
                <Swords className="w-3 h-3" />
                Traits & Tone
              </h3>
              
              <div className="space-y-6">
                <div>
                  <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2">
                    {profile.mode === AppMode.SCENARIO ? "Scenario Tone" : profile.mode === AppMode.GAME ? "Campaign Tone" : "Story Tone"}
                  </label>
                  <select 
                    className="w-full px-4 py-3 glass-input rounded-xl text-white text-sm mb-2"
                    value={['Dramatic', 'Gritty', 'Whimsical', 'Horror', 'Romantic', 'Cyberpunk', 'Noir', 'Adventure'].includes(profile.storyTone) ? profile.storyTone : 'Custom'}
                    onChange={e => {
                      const val = e.target.value;
                      if (val === 'Custom') {
                        setProfile({...profile, storyTone: 'Mysterious / Intriguing'});
                      } else {
                        setProfile({...profile, storyTone: val});
                      }
                    }}
                  >
                    {['Dramatic', 'Gritty', 'Whimsical', 'Horror', 'Romantic', 'Cyberpunk', 'Noir', 'Adventure'].map(t => (
                      <option key={t} value={t} className="bg-zinc-900">{t}</option>
                    ))}
                    <option value="Custom" className="bg-zinc-900">Custom...</option>
                  </select>
                  {!['Dramatic', 'Gritty', 'Whimsical', 'Horror', 'Romantic', 'Cyberpunk', 'Noir', 'Adventure'].includes(profile.storyTone) && (
                    <motion.div 
                      initial={{ opacity: 0, y: -5 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="space-y-1"
                    >
                      <input 
                        type="text"
                        className="w-full px-4 py-2 bg-black/40 border border-white/10 rounded-xl text-white text-xs placeholder-zinc-600 focus:outline-none focus:border-emerald-500"
                        placeholder="Type custom tone (e.g., Cozy Comedy, Mythic Thriller)..."
                        value={profile.storyTone}
                        onChange={e => setProfile({...profile, storyTone: e.target.value})}
                      />
                    </motion.div>
                  )}
                </div>

                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Current Mood</label>
                    <RefineButton 
                      onRefine={(guidance) => handleRefineField('currentMood', guidance)}
                      isRefining={isRefiningField === 'currentMood'}
                    />
                  </div>
                  <input 
                    type="text"
                    className="w-full px-4 py-3 glass-input rounded-xl text-white text-sm"
                    placeholder="e.g. Neutral, Suspicious, Joyful..."
                    value={profile.currentMood || ''}
                    onChange={e => setProfile({...profile, currentMood: e.target.value})}
                  />
                </div>

                <div>
                  <div className="flex justify-between items-center mb-3">
                    <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
                      {profile.mode === AppMode.SCENARIO ? "Scenario Elements" : profile.mode === AppMode.GAME ? "DM Characteristics" : "Personality Traits"}
                    </label>
                    <button 
                      onClick={handleRefineTraits}
                      disabled={isRefiningField !== null}
                      className="text-[9px] font-bold text-emerald-500 hover:text-emerald-400 flex items-center gap-1 disabled:opacity-50"
                    >
                      {isRefiningField === 'traits' ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <Wand2 className="w-2.5 h-2.5" />}
                      REFINE
                    </button>
                  </div>
                  <div className="space-y-4 glass-input p-4 rounded-xl">
                    {getModeTraits(profile.mode).map(trait => (
                      <div key={trait.id} className="space-y-1.5">
                        <div className="flex justify-between text-[9px] font-bold uppercase tracking-widest">
                          <span className="text-zinc-500">{trait.label}</span>
                          <span className="text-white">{profile.traits[trait.id] ?? 50}%</span>
                        </div>
                        <input 
                          type="range" 
                          min="0" 
                          max="100" 
                          value={profile.traits[trait.id] ?? 50}
                          onChange={e => setProfile({
                            ...profile, 
                            traits: { ...profile.traits, [trait.id]: parseInt(e.target.value) }
                          })}
                          className="w-full h-1.5 rounded-full appearance-none bg-zinc-800 cursor-pointer accent-emerald-500"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Mode Specific Details */}
            <div className="glass-panel p-8 rounded-[2.5rem] border border-white/5 space-y-6">
              <h3 className="text-xs font-bold text-purple-400 uppercase tracking-widest flex items-center gap-2">
                <Globe className="w-3 h-3" />
                {profile.mode} Details
              </h3>

              <div className="space-y-6">
                {profile.mode === AppMode.SCENARIO && (
                  <>
                    {[
                      { label: 'World Atmosphere', field: 'worldAtmosphere' },
                      { label: 'Key Locations', field: 'keyLocations' },
                      { label: 'Scenario Stakes', field: 'scenarioStakes' },
                      { label: 'Core Conflict', field: 'scenarioConflict' },
                      { label: 'Time Period', field: 'timePeriod' },
                      { label: 'Factions', field: 'factions' },
                      { label: 'Magic / Tech Level', field: 'magicOrTechnologyLevel' },
                      { label: 'Inciting Incident', field: 'incitingIncident' }
                    ].map(item => (
                      <div key={item.field}>
                        <div className="flex justify-between items-center mb-2">
                          <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest">{item.label}</label>
                          <RefineButton 
                            onRefine={(guidance) => handleRefineField(item.field as any, guidance)}
                            isRefining={isRefiningField === item.field}
                            label="REFINE"
                          />
                        </div>
                        <textarea 
                          rows={3}
                          className="w-full px-4 py-3 glass-input rounded-xl text-white text-sm resize-none"
                          value={(profile as any)[item.field]}
                          onChange={e => setProfile({...profile, [item.field]: e.target.value})}
                        />
                      </div>
                    ))}
                  </>
                )}

                {profile.mode === AppMode.ROLEPLAY && (
                  <>
                    {[
                      { label: 'Character Flaws', field: 'characterFlaws' },
                      { label: 'Secret Motive', field: 'secretMotive' },
                      { label: 'Speech Pattern', field: 'speechPattern' },
                      { label: 'Likes & Dislikes', field: 'likesAndDislikes' },
                      { label: 'Core Beliefs', field: 'coreBeliefs' },
                      { label: 'Quirks', field: 'quirks' }
                    ].map(item => (
                      <div key={item.field}>
                        <div className="flex justify-between items-center mb-2">
                          <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest">{item.label}</label>
                          <RefineButton 
                            onRefine={(guidance) => handleRefineField(item.field as any, guidance)}
                            isRefining={isRefiningField === item.field}
                            label="REFINE"
                          />
                        </div>
                        <textarea 
                          rows={3}
                          className="w-full px-4 py-3 glass-input rounded-xl text-white text-sm resize-none"
                          value={(profile as any)[item.field]}
                          onChange={e => setProfile({...profile, [item.field]: e.target.value})}
                        />
                      </div>
                    ))}
                  </>
                )}

                {profile.mode === AppMode.GAME && (
                  <>
                    {[
                      { label: 'Game System', field: 'gameSystem' },
                      { label: 'Quest Objective', field: 'questObjective' },
                      { label: 'DM Style', field: 'dungeonMasterStyle' },
                      { label: 'Rules Complexity', field: 'rulesComplexity' },
                      { label: 'Difficulty Level', field: 'difficultyLevel' },
                      { label: 'Party Composition', field: 'partyComposition' },
                      { label: 'Starting Equipment', field: 'startingEquipment' },
                      { label: 'Current Campaign Arc', field: 'currentCampaignArc' }
                    ].map(item => (
                      <div key={item.field}>
                        <div className="flex justify-between items-center mb-2">
                          <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest">{item.label}</label>
                          <RefineButton 
                            onRefine={(guidance) => handleRefineField(item.field as any, guidance)}
                            isRefining={isRefiningField === item.field}
                            label="REFINE"
                          />
                        </div>
                        <textarea 
                          rows={3}
                          className="w-full px-4 py-3 glass-input rounded-xl text-white text-sm resize-none"
                          value={(profile as any)[item.field]}
                          onChange={e => setProfile({...profile, [item.field]: e.target.value})}
                        />
                      </div>
                    ))}
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Additional Characters */}
          <div className="glass-panel p-8 rounded-[2.5rem] border border-white/5 space-y-8">
            <div className="flex justify-between items-center">
              <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-2">
                <Settings2 className="w-3 h-3" />
                Additional Characters
              </h3>
              <button
                onClick={() => setShowAddCharacter(true)}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-2"
              >
                <Plus className="w-3 h-3" />
                Add Character
              </button>
            </div>
            
            <div className="space-y-4">
              {(profile.additionalCharacters || []).map((char, index) => (
                <div key={char.id} className="flex items-center justify-between p-4 glass-input rounded-2xl">
                  <div>
                    <h4 className="text-sm font-bold text-white">{char.name}</h4>
                    <p className="text-xs text-zinc-500">{char.description}</p>
                  </div>
                  <button
                    onClick={() => setProfile({
                      ...profile,
                      additionalCharacters: profile.additionalCharacters?.filter((_, i) => i !== index)
                    })}
                    className="p-2 text-zinc-600 hover:text-red-400 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Player Profile */}
          <div className="glass-panel p-8 rounded-[2.5rem] border border-white/5 space-y-8">
            <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-2">
              <Settings2 className="w-3 h-3" />
              {getPlayerSectionTitle(profile.mode)}
            </h3>
            
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Your Name</label>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => { setLibraryImportTarget('player'); setShowLibraryModal(true); }}
                        className="flex items-center gap-1.5 px-3 py-1 bg-white/5 hover:bg-emerald-500/20 text-zinc-400 hover:text-emerald-400 text-[10px] font-bold uppercase tracking-widest rounded-full transition-colors border border-white/10"
                      >
                        <BookOpen className="w-3 h-3" />
                        Import Library
                      </button>
                      <RefineButton 
                        onRefine={(guidance) => handleRefineField('player_name', guidance)}
                        isRefining={isRefiningField === 'player_name'}
                        label="REFINE"
                      />
                    </div>
                  </div>
                  <input
                    type="text"
                    value={profile.playerProfile?.name || ''}
                    onChange={(e) => setProfile({ ...profile, playerProfile: { ...(profile.playerProfile || {}), name: e.target.value } })}
                    className="w-full p-4 rounded-2xl glass-input text-white text-sm focus:ring-2 focus:ring-zinc-500/30 transition-all"
                  />
                </div>
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Your Description</label>
                    <RefineButton 
                      onRefine={(guidance) => handleRefineField('player_description', guidance)}
                      isRefining={isRefiningField === 'player_description'}
                      label="REFINE"
                    />
                  </div>
                  <textarea
                    value={profile.playerProfile?.description || ''}
                    onChange={(e) => setProfile({ ...profile, playerProfile: { ...(profile.playerProfile || {}), description: e.target.value } })}
                    className="w-full p-4 rounded-2xl glass-input text-white text-sm leading-relaxed resize-none focus:ring-2 focus:ring-zinc-500/30 transition-all"
                    rows={1}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {[
                  { label: 'Personality', field: 'personality' },
                  { label: 'Backstory', field: 'backstory' },
                  { label: 'Appearance', field: 'appearance' },
                  { label: 'Clothing', field: 'clothing' },
                  { label: 'Accessories', field: 'accessories' },
                  { label: 'Hair Style', field: 'hairStyle' },
                  { label: 'Hair Color', field: 'hairColor' },
                  { label: 'Eye Color', field: 'eyeColor' }
                ].map(item => (
                  <div key={item.field}>
                    <div className="flex justify-between items-center mb-2">
                      <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest">{item.label}</label>
                      <RefineButton 
                        onRefine={(guidance) => handleRefineField(`player_${item.field}`, guidance)}
                        isRefining={isRefiningField === `player_${item.field}`}
                        label="REFINE"
                      />
                    </div>
                    <textarea
                      value={(profile.playerProfile as any)?.[item.field] || ''}
                      onChange={(e) => setProfile({ ...profile, playerProfile: { ...(profile.playerProfile || {}), [item.field]: e.target.value } })}
                      className="w-full p-4 rounded-2xl glass-input text-white text-sm leading-relaxed resize-none focus:ring-2 focus:ring-zinc-500/30 transition-all"
                      rows={2}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
          <AdditionalCharacterModal
            isOpen={showAddCharacter}
            onClose={() => setShowAddCharacter(false)}
            onSave={(character) => {
              setProfile({
                ...profile,
                additionalCharacters: [...(profile.additionalCharacters || []), character]
              });
              setShowAddCharacter(false);
            }}
            appMode={profile.mode}
          />
          <CharacterLibraryModal
            isOpen={showLibraryModal}
            onClose={() => setShowLibraryModal(false)}
            scenarios={scenarios}
            onSelect={handleLibrarySelect}
          />
        </div>
      </div>
    </div>
  );
}

