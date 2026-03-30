import { useState } from 'react';
import { useToast } from '../hooks/useToast';
import { CharacterProfile, generateAvatar, AppMode, refineField, refineTraits, refinePlayerProfile, generateSpeech } from '../lib/gemini';
import { Loader2, RotateCcw, Wand2, Globe, Heart, Swords, Settings2, Volume2 } from 'lucide-react';

interface CharacterEditorProps {
  profile: CharacterProfile;
  avatarBase64: string;
  isInitialReview?: boolean;
  onSave: (profile: CharacterProfile, avatarBase64: string) => void;
  onCancel: () => void;
}

export function CharacterEditor({ profile: initialProfile, avatarBase64: initialAvatar, isInitialReview, onSave, onCancel }: CharacterEditorProps) {
  const [profile, setProfile] = useState<CharacterProfile>(initialProfile);
  const [avatar, setAvatar] = useState<string>(initialAvatar);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [isRefiningField, setIsRefiningField] = useState<string | null>(null);
  const [isPreviewingVoice, setIsPreviewingVoice] = useState(false);
  const { toastSuccess, toastError } = useToast();

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

  const handleRefineField = async (field: keyof CharacterProfile | string) => {
    setIsRefiningField(field);
    try {
      let refined = "";
      if (field.startsWith('player_')) {
        const playerField = field.replace('player_', '');
        refined = await refinePlayerProfile(playerField, profile);
      } else {
        refined = await refineField(field as any, profile);
      }
      
      setProfile(prev => {
        if (field.startsWith('player_')) {
          const playerField = field.replace('player_', '');
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

  return (
    <div className="p-4 sm:p-8 max-w-6xl mx-auto w-full">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8 gap-4">
        <div>
          <h2 className="text-3xl sm:text-4xl font-serif text-white">{isInitialReview ? 'Review Character' : 'Customize Character'}</h2>
          <p className="text-zinc-500 text-sm mt-1">Refine the details of your narrative persona.</p>
        </div>
        <div className="flex gap-3 w-full sm:w-auto">
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
              {[
                { label: 'Hair Style', field: 'hairStyle', placeholder: 'e.g., Long wavy' },
                { label: 'Hair Color', field: 'hairColor', placeholder: 'e.g., Raven black' },
                { label: 'Eye Color', field: 'eyeColor', placeholder: 'e.g., Piercing blue' },
                { label: 'Clothing', field: 'clothing', placeholder: 'e.g., Leather duster' },
                { label: 'Accessories', field: 'accessories', placeholder: 'e.g., Silver monocle' }
              ].map(item => (
                <div key={item.field}>
                  <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1.5">{item.label}</label>
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
                Core Identity
              </h3>
              <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20">
                <span className="text-[9px] font-bold text-blue-400 uppercase tracking-widest">{profile.mode} Mode</span>
              </div>
            </div>

            <div className="space-y-6">
              <div>
                <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2">Name</label>
                <input
                  type="text"
                  value={profile.name}
                  onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                  className="w-full p-4 rounded-2xl glass-input text-white text-xl font-medium focus:ring-2 focus:ring-blue-500/30 transition-all"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {[
                  { label: 'Personality', field: 'personality', rows: 4 },
                  { label: 'Backstory', field: 'backstory', rows: 4 },
                  { label: 'Appearance', field: 'appearance', rows: 4 },
                  { label: 'Relationship', field: 'relationship', rows: 4 }
                ].map(item => (
                  <div key={item.field}>
                    <div className="flex justify-between items-center mb-2">
                      <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest">{item.label}</label>
                      <button 
                        onClick={() => handleRefineField(item.field as any)}
                        disabled={isRefiningField !== null}
                        className="text-[9px] font-bold text-emerald-500 hover:text-emerald-400 flex items-center gap-1 disabled:opacity-50"
                      >
                        {isRefiningField === item.field ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <Wand2 className="w-2.5 h-2.5" />}
                        REFINE
                      </button>
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
                  <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2">Story Tone</label>
                  <select 
                    className="w-full px-4 py-3 glass-input rounded-xl text-white text-sm"
                    value={profile.storyTone}
                    onChange={e => setProfile({...profile, storyTone: e.target.value})}
                  >
                    {['Dramatic', 'Gritty', 'Whimsical', 'Horror', 'Romantic', 'Cyberpunk', 'Noir', 'Adventure'].map(t => (
                      <option key={t} value={t} className="bg-zinc-900">{t}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-3">
                    <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Personality Traits</label>
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
                          <button 
                            onClick={() => handleRefineField(item.field as any)}
                            disabled={isRefiningField !== null}
                            className="text-[9px] font-bold text-purple-500 hover:text-purple-400 flex items-center gap-1 disabled:opacity-50"
                          >
                            {isRefiningField === item.field ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <Wand2 className="w-2.5 h-2.5" />}
                            REFINE
                          </button>
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
                          <button 
                            onClick={() => handleRefineField(item.field as any)}
                            disabled={isRefiningField !== null}
                            className="text-[9px] font-bold text-blue-500 hover:text-blue-400 flex items-center gap-1 disabled:opacity-50"
                          >
                            {isRefiningField === item.field ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <Wand2 className="w-2.5 h-2.5" />}
                            REFINE
                          </button>
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
                          <button 
                            onClick={() => handleRefineField(item.field as any)}
                            disabled={isRefiningField !== null}
                            className="text-[9px] font-bold text-purple-500 hover:text-purple-400 flex items-center gap-1 disabled:opacity-50"
                          >
                            {isRefiningField === item.field ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <Wand2 className="w-2.5 h-2.5" />}
                            REFINE
                          </button>
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

          {/* Player Profile */}
          <div className="glass-panel p-8 rounded-[2.5rem] border border-white/5 space-y-8">
            <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-2">
              <Settings2 className="w-3 h-3" />
              Player Persona (You)
            </h3>
            
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Your Name</label>
                    <button 
                      onClick={() => handleRefineField('player_name')}
                      disabled={isRefiningField !== null}
                      className="text-[9px] font-bold text-zinc-500 hover:text-white flex items-center gap-1 disabled:opacity-50"
                    >
                      {isRefiningField === 'player_name' ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <Wand2 className="w-2.5 h-2.5" />}
                      REFINE
                    </button>
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
                    <button 
                      onClick={() => handleRefineField('player_description')}
                      disabled={isRefiningField !== null}
                      className="text-[9px] font-bold text-zinc-500 hover:text-white flex items-center gap-1 disabled:opacity-50"
                    >
                      {isRefiningField === 'player_description' ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <Wand2 className="w-2.5 h-2.5" />}
                      REFINE
                    </button>
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
                      <button 
                        onClick={() => handleRefineField(`player_${item.field}`)}
                        disabled={isRefiningField !== null}
                        className="text-[9px] font-bold text-zinc-500 hover:text-white flex items-center gap-1 disabled:opacity-50"
                      >
                        {isRefiningField === `player_${item.field}` ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <Wand2 className="w-2.5 h-2.5" />}
                        REFINE
                      </button>
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
        </div>
      </div>
    </div>
  );
}

