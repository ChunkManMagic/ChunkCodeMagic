import { useState, useEffect } from 'react';
import { X, Save, Sparkles, Crown, CheckCircle, ArrowRight, Loader2, Trash2 } from 'lucide-react';
import { AppSettings, getSettings, saveSettings, defaultSettings } from '../lib/gemini';
import { db } from '../firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { useClearAllData } from '../hooks/useStorage';

interface SettingsModalProps {
  onClose: () => void;
}

export function SettingsModal({ onClose }: SettingsModalProps) {
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [showWaitlist, setShowWaitlist] = useState(false);
  const [waitlistEmail, setWaitlistEmail] = useState('');
  const [waitlistGenre, setWaitlistGenre] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const clearAllData = useClearAllData();

  useEffect(() => { setSettings(getSettings()); }, []);

  const handleChange = (field: keyof AppSettings, value: any) => {
    setSettings(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = () => {
    saveSettings(settings);
    onClose();
  };

  const handleWaitlistSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!waitlistEmail || !waitlistGenre) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await addDoc(collection(db, 'premium_waitlist'), {
        email: waitlistEmail,
        genre: waitlistGenre,
        timestamp: serverTimestamp(),
        userAgent: navigator.userAgent,
      });
      setSubmitted(true);
    } catch (err: any) {
      setError('Failed to join waitlist. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetAllData = async () => {
    setIsResetting(true);
    await clearAllData();
    setIsResetting(false);
    setShowResetConfirm(false);
    window.location.reload();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-zinc-900 border border-white/10 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col">
        <div className="p-4 border-b border-white/10 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Settings</h2>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        <div className="p-6 space-y-6 overflow-y-auto max-h-[70vh]">

          {/* Text Provider */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider">Preferences</h3>

            <div className="space-y-2">
              <label className="text-sm text-gray-300">Active Text Provider</label>
              <select value={settings.activeTextProvider} onChange={e => handleChange('activeTextProvider', e.target.value as any)} className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-indigo-500">
                <option value="Google">Google (Gemini)</option>
                <option value="OpenRouter">OpenRouter</option>
              </select>
            </div>

            {settings.activeTextProvider === 'OpenRouter' && (
              <div className="space-y-2">
                <label className="text-sm text-gray-300">OpenRouter Model</label>
                <input type="text" value={settings.activeModel || ''} onChange={e => handleChange('activeModel', e.target.value)} placeholder="e.g. anthropic/claude-3-5-haiku" className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-indigo-500" />
              </div>
            )}

            {/* Voice engine */}
            <div className="space-y-2">
              <label className="text-sm text-gray-300">Voice Engine</label>
              <select value={settings.voiceEngine} onChange={e => handleChange('voiceEngine', e.target.value as any)} className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-indigo-500">
                <option value="Cinematic">Cinematic (Gemini TTS)</option>
                <option value="Fast Browser">Fast Browser TTS</option>
                <option value="ElevenLabs">ElevenLabs Conversational AI</option>
                <option value="OpenAI">OpenAI TTS</option>
              </select>
            </div>

            {/* ElevenLabs config */}
            {settings.voiceEngine === 'ElevenLabs' && (
              <div className="space-y-3 p-3 rounded-xl bg-white/5 border border-white/10">
                <div className="space-y-2">
                  <label className="text-xs text-gray-400">ElevenLabs Agent ID</label>
                  <input type="text" value={settings.elevenLabsAgentId || ''} onChange={e => handleChange('elevenLabsAgentId', e.target.value)} placeholder="agent_..." className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-2 text-white text-sm focus:outline-none focus:border-indigo-500" />
                </div>
                <div className="space-y-2">
                  <label className="text-xs text-gray-400">ElevenLabs API Key</label>
                  <input type="password" value={settings.elevenLabsApiKey || ''} onChange={e => handleChange('elevenLabsApiKey', e.target.value)} placeholder="sk_..." className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-2 text-white text-sm focus:outline-none focus:border-indigo-500" />
                </div>
              </div>
            )}

            {/* Custom refine instructions */}
            <div className="space-y-2">
              <label className="text-sm text-gray-300">Default Refine Instructions</label>
              <textarea value={settings.customRefineInstructions || ''} onChange={e => handleChange('customRefineInstructions', e.target.value)} placeholder="e.g. 'Make it more poetic', 'Use a darker tone'" rows={3} className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-2 text-white text-sm focus:outline-none focus:border-indigo-500 resize-none" />
            </div>
          </div>

          {/* Premium */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider flex items-center gap-2"><Crown className="w-4 h-4 text-amber-400" /> Premium Features</h3>
            <div className="p-4 rounded-xl bg-gradient-to-br from-amber-500/10 to-orange-500/10 border border-amber-500/20 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-white">Custom Voice Personas</p>
                  <p className="text-xs text-zinc-400">Unique voices per character</p>
                </div>
                <div className={`w-10 h-5 rounded-full transition-colors ${settings.premiumCustomVoices ? 'bg-amber-500' : 'bg-zinc-700'}`} onClick={() => handleChange('premiumCustomVoices', !settings.premiumCustomVoices)} style={{ cursor: 'pointer' }}>
                  <div className={`w-4 h-4 bg-white rounded-full mt-0.5 transition-transform ${settings.premiumCustomVoices ? 'translate-x-5' : 'translate-x-0.5'}`} />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-white">Context Animations</p>
                  <p className="text-xs text-zinc-400">Visual cues during generation</p>
                </div>
                <div className={`w-10 h-5 rounded-full transition-colors ${settings.premiumContextAnimations ? 'bg-amber-500' : 'bg-zinc-700'}`} onClick={() => handleChange('premiumContextAnimations', !settings.premiumContextAnimations)} style={{ cursor: 'pointer' }}>
                  <div className={`w-4 h-4 bg-white rounded-full mt-0.5 transition-transform ${settings.premiumContextAnimations ? 'translate-x-5' : 'translate-x-0.5'}`} />
                </div>
              </div>
              {!submitted ? (
                <button onClick={() => setShowWaitlist(!showWaitlist)} className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 transition-all text-sm font-medium">
                  <span className="flex items-center gap-2"><Sparkles className="w-4 h-4" /> Join Premium Waitlist</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              ) : (
                <div className="flex items-center gap-2 text-emerald-400 text-sm"><CheckCircle className="w-4 h-4" /><span>You're on the waitlist!</span></div>
              )}
              {showWaitlist && !submitted && (
                <form onSubmit={handleWaitlistSubmit} className="space-y-3">
                  <input type="email" value={waitlistEmail} onChange={e => setWaitlistEmail(e.target.value)} placeholder="your@email.com" required className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-2 text-white text-sm focus:outline-none focus:border-amber-500/50" />
                  <input type="text" value={waitlistGenre} onChange={e => setWaitlistGenre(e.target.value)} placeholder="Preferred genre (e.g. Fantasy, Sci-fi)" required className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-2 text-white text-sm focus:outline-none focus:border-amber-500/50" />
                  {error && <p className="text-xs text-red-400">{error}</p>}
                  <button type="submit" disabled={isSubmitting} className="w-full py-2 rounded-xl bg-amber-500/30 text-amber-300 hover:bg-amber-500/40 transition-all text-sm font-medium flex items-center justify-center gap-2">
                    {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Join Waitlist
                  </button>
                </form>
              )}
            </div>
          </div>

          {/* Data management */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider">Data</h3>
            {!showResetConfirm ? (
              <button onClick={() => setShowResetConfirm(true)} className="w-full flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-all text-sm border border-red-500/20">
                <Trash2 className="w-4 h-4" /> Clear All App Data
              </button>
            ) : (
              <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 space-y-3">
                <p className="text-sm text-red-300">This will permanently delete all scenarios, messages, and settings. This cannot be undone.</p>
                <div className="flex gap-3">
                  <button onClick={() => setShowResetConfirm(false)} className="flex-1 py-2 rounded-xl text-xs font-bold text-zinc-400 hover:text-white uppercase tracking-widest">Cancel</button>
                  <button onClick={handleResetAllData} disabled={isResetting} className="flex-1 py-2 rounded-xl bg-red-500/30 text-red-300 text-xs font-bold uppercase tracking-widest flex items-center justify-center gap-2">
                    {isResetting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />} Confirm Reset
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="p-4 border-t border-white/10 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-zinc-400 hover:text-white transition-colors">Cancel</button>
          <button onClick={handleSave} className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-xl flex items-center gap-2 transition-colors">
            <Save className="w-4 h-4" /> Save
          </button>
        </div>
      </div>
    </div>
  );
}
