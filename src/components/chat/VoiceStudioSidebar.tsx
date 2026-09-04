import { useState } from 'react';
import { motion } from 'motion/react';
import { Volume2, Sliders, Sparkles, X, Check, Play, Square, Mic, Compass } from 'lucide-react';
import { CharacterProfile } from '../../lib/types';
import { ALL_VOICES, ROLEPLAY_VOICES, NARRATOR_VOICES, BRIGHT_VOICES } from '../../lib/ttsEngine';

interface VoiceStudioSidebarProps {
  profile: CharacterProfile;
  isOpen: boolean;
  onClose: () => void;
  onUpdateVoice: (updates: Partial<CharacterProfile>) => void;
  onPreview: (text: string, voiceName?: string) => void;
}

const VOICE_PRESETS = [
  { name: 'Warm Companion', voice: 'Aoede', pitch: 'Normal', speed: 'Normal', tone: 'warm, friendly, and supportive' },
  { name: 'Dark Overlord', voice: 'Fenrir', pitch: 'Low', speed: 'Slow', tone: 'commanding, cold, and calculating' },
  { name: 'Playful Rogue', voice: 'Puck', pitch: 'Normal', speed: 'Fast', tone: 'clever, mischievous, and sarcastic' },
  { name: 'Wise Oracle', voice: 'Charon', pitch: 'Low', speed: 'Slow', tone: 'mystical, solemn, and deliberate' },
  { name: 'Heroic Knight', voice: 'Zephyr', pitch: 'Normal', speed: 'Normal', tone: 'brave, earnest, and resolute' },
  { name: 'Cyber Hacker', voice: 'Kore', pitch: 'High', speed: 'Fast', tone: 'snappy, technical, and rebellious' },
];

export function VoiceStudioSidebar({ profile, isOpen, onClose, onUpdateVoice, onPreview }: VoiceStudioSidebarProps) {
  const [activeTab, setActiveTab] = useState<'voices' | 'acting' | 'tone'>('voices');
  const [previewingVoice, setPreviewingVoice] = useState<string | null>(null);

  if (!isOpen) return null;

  const currentVoice = profile.voiceName || 'Kore';

  const handleAudition = (voiceName: string) => {
    setPreviewingVoice(voiceName);
    const desc = ALL_VOICES.find(v => v.name === voiceName)?.character || 'expressive';
    onPreview(`Greetings! I am ${voiceName}, with a ${desc} delivery. How shall our story unfold?`, voiceName);
    setTimeout(() => {
      setPreviewingVoice(null);
    }, 4500);
  };

  return (
    <motion.aside
      initial={{ opacity: 0, x: 340 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 340 }}
      transition={{ type: 'spring', damping: 25, stiffness: 220 }}
      className="absolute right-0 top-0 bottom-0 w-full sm:w-[480px] bg-zinc-950/95 backdrop-blur-2xl border-l border-white/10 z-50 flex flex-col shadow-2xl"
    >
      {/* Top Header */}
      <div className="p-4 border-b border-white/10 flex items-center justify-between bg-white/[0.02]">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
            <Volume2 className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white tracking-wide">Voice & Tone Studio</h3>
            <p className="text-[10px] text-zinc-400">Custom voice audition, acting directives & story tone</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
          title="Close Studio"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Tabs */}
      <div className="grid grid-cols-3 border-b border-white/10 bg-black/40 text-xs font-bold">
        <button
          onClick={() => setActiveTab('voices')}
          className={`py-2.5 text-center transition-all flex items-center justify-center gap-1.5 border-b-2 ${
            activeTab === 'voices'
              ? 'border-emerald-500 text-emerald-400 bg-emerald-500/10'
              : 'border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <Mic className="w-3.5 h-3.5" />
          <span>Voices (30)</span>
        </button>
        <button
          onClick={() => setActiveTab('acting')}
          className={`py-2.5 text-center transition-all flex items-center justify-center gap-1.5 border-b-2 ${
            activeTab === 'acting'
              ? 'border-emerald-500 text-emerald-400 bg-emerald-500/10'
              : 'border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <Compass className="w-3.5 h-3.5" />
          <span>Actor Profile</span>
        </button>
        <button
          onClick={() => setActiveTab('tone')}
          className={`py-2.5 text-center transition-all flex items-center justify-center gap-1.5 border-b-2 ${
            activeTab === 'tone'
              ? 'border-emerald-500 text-emerald-400 bg-emerald-500/10'
              : 'border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <Sliders className="w-3.5 h-3.5" />
          <span>Tone Studio</span>
        </button>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5 custom-scrollbar">
        {activeTab === 'voices' && (
          <div className="space-y-4">
            {/* Quick Cinematic Presets */}
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-1.5">
                <Sparkles className="w-3 h-3 text-emerald-400" />
                Quick Cinematic Presets
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {VOICE_PRESETS.map((preset) => {
                  const isMatch = profile.voiceName === preset.voice;
                  return (
                    <button
                      key={preset.name}
                      type="button"
                      onClick={() => {
                        onUpdateVoice({
                          voiceName: preset.voice,
                          voiceSettings: {
                            ...profile.voiceSettings,
                            pitch: preset.pitch,
                            speed: preset.speed,
                          },
                          storyTone: preset.tone,
                        });
                      }}
                      className={`p-2.5 rounded-xl border text-left transition-all ${
                        isMatch
                          ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300 shadow-md shadow-emerald-500/10'
                          : 'bg-white/5 border-white/5 hover:border-white/20 text-zinc-300'
                      }`}
                    >
                      <div className="text-xs font-bold">{preset.name}</div>
                      <div className="text-[10px] text-zinc-400">{preset.voice} · {preset.pitch}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Pitch & Speed Controls */}
            <div className="grid grid-cols-2 gap-3 p-3 rounded-2xl bg-white/[0.03] border border-white/5">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
                  Pitch: {profile.voiceSettings?.pitch || 'Normal'}
                </label>
                <div className="flex gap-1">
                  {['Low', 'Normal', 'High'].map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => onUpdateVoice({ voiceSettings: { ...profile.voiceSettings, pitch: p } })}
                      className={`flex-1 py-1 rounded-lg text-xs font-bold transition-all ${
                        (profile.voiceSettings?.pitch || 'Normal') === p
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                          : 'bg-black/30 text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
                  Speed: {profile.voiceSettings?.speed || 'Normal'}
                </label>
                <div className="flex gap-1">
                  {['Slow', 'Normal', 'Fast'].map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => onUpdateVoice({ voiceSettings: { ...profile.voiceSettings, speed: s } })}
                      className={`flex-1 py-1 rounded-lg text-xs font-bold transition-all ${
                        (profile.voiceSettings?.speed || 'Normal') === s
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                          : 'bg-black/30 text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Categorized Gemini Voices */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
                  Gemini Voice Library (30 Voices)
                </label>
                <span className="text-[10px] text-zinc-500">Tap play to audition sample</span>
              </div>

              {[
                { label: 'Roleplay & Cinematic', voices: ROLEPLAY_VOICES },
                { label: 'Narration & Audiobook', voices: NARRATOR_VOICES },
                { label: 'Bright & Companion', voices: BRIGHT_VOICES },
                {
                  label: 'All Other Voices',
                  voices: ALL_VOICES.map(v => v.name).filter(
                    n => !ROLEPLAY_VOICES.includes(n) && !NARRATOR_VOICES.includes(n) && !BRIGHT_VOICES.includes(n)
                  ),
                },
              ].map(group => (
                <div key={group.label} className="space-y-1.5">
                  <h5 className="text-[9px] font-bold uppercase tracking-wider text-emerald-400/80 px-1">
                    {group.label}
                  </h5>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {group.voices.map(voiceName => {
                      const isSelected = currentVoice === voiceName;
                      const isAuditioning = previewingVoice === voiceName;
                      const voiceDef = ALL_VOICES.find(v => v.name === voiceName);
                      const character = voiceDef?.character || '';

                      return (
                        <div
                          key={voiceName}
                          className={`p-2 rounded-xl border flex items-center justify-between gap-2 transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-emerald-500/20 border-emerald-500/50 shadow-sm shadow-emerald-500/20'
                              : 'bg-white/5 border-white/5 hover:border-white/15'
                          }`}
                          onClick={() => onUpdateVoice({ voiceName })}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-bold text-white">{voiceName}</span>
                              {isSelected && <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
                            </div>
                            <p className="text-[10px] text-zinc-400 truncate">{character}</p>
                          </div>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleAudition(voiceName);
                            }}
                            className={`p-1.5 rounded-lg border transition-all shrink-0 ${
                              isAuditioning
                                ? 'bg-emerald-500 text-black border-emerald-400 animate-pulse'
                                : 'bg-black/40 text-zinc-300 border-white/10 hover:text-white hover:border-white/30'
                            }`}
                            title={`Audition sample for ${voiceName}`}
                          >
                            {isAuditioning ? <Square className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'acting' && (
          <div className="space-y-4">
            <div className="p-3 rounded-2xl bg-white/[0.02] border border-white/5 space-y-1">
              <h4 className="text-xs font-bold text-white">Voice Performance Directives</h4>
              <p className="text-[11px] text-zinc-400 leading-relaxed">
                Direct how the AI acts this character in Live Voice and Turn-Based TTS audio.
              </p>
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
                  Voice Archetype
                </label>
                <input
                  type="text"
                  value={profile.voiceArchetype || ''}
                  onChange={(e) => onUpdateVoice({ voiceArchetype: e.target.value })}
                  placeholder="e.g. Ancient vampire lord, Cynical detective, Chipper bard"
                  className="w-full glass-input rounded-xl px-3 py-2 text-xs text-white placeholder-zinc-600 focus:ring-1 focus:ring-emerald-500/40"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
                  Voice Style & Delivery Tone
                </label>
                <textarea
                  rows={2}
                  value={profile.voiceStyle || ''}
                  onChange={(e) => onUpdateVoice({ voiceStyle: e.target.value })}
                  placeholder="e.g. Low, raspy whisper with theatrical dramatic pauses"
                  className="w-full glass-input rounded-xl px-3 py-2 text-xs text-white placeholder-zinc-600 focus:ring-1 focus:ring-emerald-500/40 resize-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
                  Pacing & Rhythm
                </label>
                <input
                  type="text"
                  value={profile.voicePacing || ''}
                  onChange={(e) => onUpdateVoice({ voicePacing: e.target.value })}
                  placeholder="e.g. Fast, rapid-fire staccato or Measured, solemn cadence"
                  className="w-full glass-input rounded-xl px-3 py-2 text-xs text-white placeholder-zinc-600 focus:ring-1 focus:ring-emerald-500/40"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
                  Accent & Dialect
                </label>
                <select
                  value={profile.voiceAccent || profile.voiceSettings?.accent || 'Natural'}
                  onChange={(e) => {
                    const acc = e.target.value;
                    onUpdateVoice({
                      voiceAccent: acc,
                      voiceSettings: { ...profile.voiceSettings, accent: acc },
                    });
                  }}
                  className="w-full glass-input rounded-xl px-3 py-2 text-xs text-white bg-black/40 focus:ring-1 focus:ring-emerald-500/40"
                >
                  <option value="Natural">Natural / Neutral Accent</option>
                  <option value="British RP">British RP (Refined / Victorian)</option>
                  <option value="Northern English">Northern English / Cockney</option>
                  <option value="Transatlantic Classic">Transatlantic Classic</option>
                  <option value="Scottish / Celtic">Scottish / Celtic</option>
                  <option value="Irish Lilt">Irish Lilt</option>
                  <option value="French Lilt">French Lilt</option>
                  <option value="Southern Drawl">Southern US Drawl</option>
                  <option value="Eastern European">Eastern European / Slavic</option>
                  <option value="Fantasy Melodic">Fantasy Melodic / Elven</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'tone' && (
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
                Narrative Tone Flavor
              </label>
              <div className="flex flex-wrap gap-1.5">
                {['Dramatic', 'Suspenseful', 'Noir', 'Romantic', 'Playful', 'Dark Fantasy', 'Gothic', 'Cozy', 'Poetic'].map(
                  (toneTag) => {
                    const isActive = profile.storyTone?.includes(toneTag);
                    return (
                      <button
                        key={toneTag}
                        type="button"
                        onClick={() => onUpdateVoice({ storyTone: toneTag })}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all border ${
                          isActive
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-sm'
                            : 'bg-white/5 text-zinc-400 border-white/5 hover:text-white'
                        }`}
                      >
                        {toneTag}
                      </button>
                    );
                  }
                )}
              </div>
              <input
                type="text"
                value={profile.storyTone || ''}
                onChange={(e) => onUpdateVoice({ storyTone: e.target.value })}
                placeholder="e.g. Dramatic, Epic, Whispered, Sarcastic..."
                className="w-full glass-input rounded-xl px-3 py-2 text-xs text-white placeholder-zinc-600 focus:ring-1 focus:ring-emerald-500/40"
              />
            </div>
          </div>
        )}
      </div>

      {/* Footer Preview Bar */}
      <div className="p-3 border-t border-white/10 bg-black/50 flex items-center justify-between">
        <div className="text-[11px] text-zinc-400">
          Active Voice: <span className="text-emerald-400 font-bold">{currentVoice}</span>
        </div>
        <button
          type="button"
          onClick={() => onPreview(`Greetings! This is ${profile.name}. Voice configured and ready.`, currentVoice)}
          className="px-3 py-1.5 rounded-xl bg-emerald-500 text-black font-bold text-xs flex items-center gap-1.5 hover:bg-emerald-400 transition-all shadow-md shadow-emerald-500/20"
        >
          <Play className="w-3.5 h-3.5" />
          <span>Audition Now</span>
        </button>
      </div>
    </motion.aside>
  );
}
