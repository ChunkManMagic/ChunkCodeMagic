import { useState, useEffect } from 'react';
import { X, Save, Sparkles, Crown, CheckCircle, ArrowRight, Loader2, Trash2, RefreshCw, Keyboard, Check, AlertCircle } from 'lucide-react';
import { useToast } from '../hooks/useToast';
import { AppSettings, getSettings, defaultSettings, saveSettings, OpenRouterModel } from '../lib/types';
import { db } from '../firebase';
import { refineText, fetchOpenRouterModels, validateOpenRouterKey } from '../lib/gemini';
import { RefineButton } from './RefineButton';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { clear } from 'idb-keyval';

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
  const [isRefining, setIsRefining] = useState(false);
  const [isFetchingModels, setIsFetchingModels] = useState(false);
  const [isValidatingKey, setIsValidatingKey] = useState(false);
  const [keyValidationStatus, setKeyValidationStatus] = useState<'none' | 'valid' | 'invalid'>('none');
  const [showOnlyFree, setShowOnlyFree] = useState(true);
  const [modelSearch, setModelSearch] = useState('');
  const { toastSuccess, toastError } = useToast();

  useEffect(() => {
    setSettings(getSettings());
  }, []);

  const handleChange = (field: keyof AppSettings, value: any) => {
    setSettings(prev => ({ ...prev, [field]: value }));
  };

  const handleWaitlistSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!waitlistEmail || !waitlistGenre) return;
    
    setIsSubmitting(true);
    setError(null);
    try {
      if (!db) return;
      await addDoc(collection(db, 'premium_waitlist'), {
        email: waitlistEmail,
        genre: waitlistGenre,
        timestamp: serverTimestamp(),
        userAgent: navigator.userAgent
      });
      setSubmitted(true);
      toastSuccess("You've been added to the waitlist!");
    } catch (err: any) {
      console.error('Waitlist Error:', err);
      setError('Failed to join waitlist. Please try again.');
      toastError("Failed to join waitlist. Please check your connection.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRefineInstructions = async (guidance?: string) => {
    if (isRefining) return;
    setIsRefining(true);
    try {
      const refined = await refineText(
        settings.customRefineInstructions || '',
        "These are custom writing style instructions for an AI roleplay assistant.",
        guidance
      );
      setSettings(prev => ({ ...prev, customRefineInstructions: refined }));
      toastSuccess("Instructions refined");
    } catch (err: any) {
      console.error("Refine error:", err);
      toastError("Failed to refine instructions");
    } finally {
      setIsRefining(false);
    }
  };

  const handleRefreshModels = async () => {
    setIsFetchingModels(true);
    try {
      const models = await fetchOpenRouterModels();
      if (models && models.length > 0) {
        handleChange('openRouterModels', models);
        toastSuccess(`Fetched ${models.length} models from OpenRouter`);
      } else {
        toastError("No models returned from OpenRouter");
      }
    } catch (err) {
      console.error("Failed to fetch models:", err);
      toastError("Failed to fetch OpenRouter models");
    } finally {
      setIsFetchingModels(false);
    }
  };

  const handleTestKey = async () => {
    if (!settings.openRouterApiKey || isValidatingKey) return;
    setIsValidatingKey(true);
    setKeyValidationStatus('none');
    try {
      const isValid = await validateOpenRouterKey(settings.openRouterApiKey);
      setKeyValidationStatus(isValid ? 'valid' : 'invalid');
      if (isValid) {
        toastSuccess("OpenRouter API key is valid!");
      } else {
        toastError("Invalid OpenRouter API key.");
      }
    } catch (err) {
      setKeyValidationStatus('invalid');
      toastError("Failed to test API key");
    } finally {
      setIsValidatingKey(false);
    }
  };

  const handleSave = () => {
    saveSettings(settings);
    toastSuccess("Settings saved");
    onClose();
  };

  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const handleClearData = async () => {
    try {
      await clear();
      localStorage.clear();
      toastSuccess("All data cleared. Reloading...");
      setTimeout(() => window.location.reload(), 1500);
    } catch (e) {
      console.error("Failed to clear data", e);
      toastError("Failed to clear data");
    }
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
        
        <div className="p-6 space-y-6 overflow-y-auto max-h-[85vh] custom-scrollbar">
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider">Preferences</h3>
            
            <div className="space-y-2">
              <label className="text-sm text-gray-300">Active Text Provider</label>
              <select 
                value={settings.activeTextProvider || 'Google'}
                onChange={e => handleChange('activeTextProvider', e.target.value as any)}
                className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-indigo-500"
              >
                <option value="Google">Google (Gemini)</option>
                <option value="OpenRouter">OpenRouter</option>
              </select>
            </div>

            {settings.activeTextProvider === 'Google' ? (
              <div className="space-y-2">
                <label className="text-sm text-gray-300">Active Model</label>
                <select 
                  value={settings.activeModel}
                  onChange={e => handleChange('activeModel', e.target.value)}
                  className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-indigo-500"
                >
                  <optgroup label="Free Models">
                    <option value="gemini-3.5-flash">Gemini 3.5 Flash (Recommended)</option>
                    <option value="gemini-3.1-flash-lite">Gemini 3.1 Flash-Lite</option>
                    <option value="gemini-3-flash-preview">Gemini 3 Flash Preview</option>
                    <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
                    <option value="gemini-2.5-flash-lite">Gemini 2.5 Flash-lite</option>
                  </optgroup>
                  <optgroup label="Premium Models (Requires Paid API Key)">
                    <option value="gemini-3.1-pro-preview">Gemini 3.1 Pro Preview</option>
                    <option value="gemini-2.5-pro">Gemini 2.5 Pro</option>
                  </optgroup>
                  <optgroup label="Agents (Interactions API)">
                    <option value="antigravity-preview-05-2026">Antigravity Preview</option>
                    <option value="deep-research-preview-04-2026">Deep Research Preview</option>
                    <option value="deep-research-max-preview-04-2026">Deep Research Max Preview</option>
                  </optgroup>
                  <optgroup label="Gemma Models">
                    <option value="gemma-4-31b-it">Gemma 4 31B IT</option>
                    <option value="gemma-4-26b-a4b-it">Gemma 4 26B MoE IT</option>
                  </optgroup>
                </select>
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <label className="text-sm text-gray-300">OpenRouter API Key</label>
                    <button
                      onClick={handleTestKey}
                      disabled={!settings.openRouterApiKey || isValidatingKey}
                      className={`text-[10px] font-bold px-3 py-1 rounded-lg border transition-all flex items-center gap-1.5 ${
                        keyValidationStatus === 'valid' 
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' 
                          : keyValidationStatus === 'invalid'
                          ? 'bg-red-500/10 text-red-400 border-red-500/30'
                          : 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30 hover:bg-indigo-500/20'
                      } disabled:opacity-50`}
                    >
                      {isValidatingKey ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : keyValidationStatus === 'valid' ? (
                        <Check className="w-3 h-3" />
                      ) : keyValidationStatus === 'invalid' ? (
                        <AlertCircle className="w-3 h-3" />
                      ) : (
                        <Sparkles className="w-3 h-3" />
                      )}
                      {isValidatingKey ? 'Testing...' : keyValidationStatus === 'valid' ? 'Valid' : keyValidationStatus === 'invalid' ? 'Invalid' : 'Test Key'}
                    </button>
                  </div>
                  <input 
                    type="password"
                    value={settings.openRouterApiKey || ''}
                    onChange={e => {
                      handleChange('openRouterApiKey', e.target.value);
                      if (keyValidationStatus !== 'none') setKeyValidationStatus('none');
                    }}
                    placeholder="sk-or-v1-..."
                    className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <label className="text-sm text-gray-300">OpenRouter Model</label>
                    <div className="flex items-center gap-3">
                      <button 
                        type="button"
                        onClick={() => setShowOnlyFree(!showOnlyFree)}
                        className={`text-[10px] px-2 py-0.5 rounded-full transition-colors ${showOnlyFree ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30' : 'bg-zinc-800 text-zinc-500 border border-white/5'}`}
                      >
                        {showOnlyFree ? 'Free Only' : 'All Models'}
                      </button>
                      <button 
                        type="button"
                        onClick={handleRefreshModels}
                        disabled={isFetchingModels}
                        className="text-[10px] flex items-center gap-1 text-indigo-400 hover:text-indigo-300 disabled:opacity-50"
                      >
                        <RefreshCw className={`w-3 h-3 ${isFetchingModels ? 'animate-spin' : ''}`} />
                        Refresh
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <input 
                      type="text"
                      value={modelSearch}
                      onChange={e => setModelSearch(e.target.value)}
                      placeholder="Search models..."
                      className="w-full bg-black/30 border border-white/10 rounded-t-xl px-4 py-2 text-xs text-gray-300 focus:outline-none focus:border-indigo-500/50"
                    />
                    <select 
                      value={settings.openRouterModel || 'meta-llama/llama-3-8b-instruct:free'}
                      onChange={e => handleChange('openRouterModel', e.target.value)}
                      className="w-full bg-black/50 border border-white/10 border-t-0 rounded-b-xl px-4 py-2 text-white focus:outline-none focus:border-indigo-500"
                    >
                      {settings.openRouterModels && settings.openRouterModels.length > 0 ? (
                        <>
                          <optgroup label="Free Models">
                            {settings.openRouterModels
                              .filter((m: OpenRouterModel) => {
                                const isFreeById = m.id.toLowerCase().includes(':free');
                                const isFreeByPricing = m.pricing && 
                                  parseFloat(m.pricing.prompt) === 0 && 
                                  parseFloat(m.pricing.completion) === 0;
                                const isFree = isFreeById || isFreeByPricing;
                                if (!isFree) return false;
                                
                                if (!modelSearch) return true;
                                return m.name.toLowerCase().includes(modelSearch.toLowerCase()) || 
                                       m.id.toLowerCase().includes(modelSearch.toLowerCase());
                              })
                              .map((m: OpenRouterModel) => (
                                <option key={m.id} value={m.id}>{m.name} ({m.id}) (Free)</option>
                              ))
                            }
                          </optgroup>
                          {!showOnlyFree && (
                            <optgroup label="Paid Models">
                              {settings.openRouterModels
                                .filter((m: OpenRouterModel) => {
                                  const isFreeById = m.id.toLowerCase().includes(':free');
                                  const isFreeByPricing = m.pricing && 
                                    parseFloat(m.pricing.prompt) === 0 && 
                                    parseFloat(m.pricing.completion) === 0;
                                  const isFree = isFreeById || isFreeByPricing;
                                  if (isFree) return false;
                                  
                                  if (!modelSearch) return true;
                                  return m.name.toLowerCase().includes(modelSearch.toLowerCase()) || 
                                         m.id.toLowerCase().includes(modelSearch.toLowerCase());
                                })
                                .map((m: OpenRouterModel) => {
                                  const isFreeById = m.id.toLowerCase().includes(':free');
                                  const isFreeByPricing = m.pricing && 
                                    parseFloat(m.pricing.prompt) === 0 && 
                                    parseFloat(m.pricing.completion) === 0;
                                  const isFree = isFreeById || isFreeByPricing;
                                  
                                  const price = m.pricing ? (parseFloat(m.pricing.prompt) * 1000000).toFixed(2) : '??';
                                  const priceLabel = isFree ? '(Free)' : `($${price}/1M tokens)`;

                                  return (
                                    <option key={m.id} value={m.id}>
                                      {m.name} ({m.id}) {priceLabel}
                                    </option>
                                  );
                                })
                              }
                            </optgroup>
                          )}
                        </>
                      ) : (
                        <>
                          <option value="meta-llama/llama-3-8b-instruct:free">Llama 3 8B (Free)</option>
                          <option value="meta-llama/llama-3.1-70b-instruct">Llama 3.1 70B (Paid)</option>
                          <option value="mistralai/mistral-7b-instruct:free">Mistral 7B (Free)</option>
                          <option value="microsoft/phi-3-mini-128k-instruct:free">Phi-3 Mini (Free)</option>
                          <option value="google/gemma-2-9b-it:free">Gemma 2 9B (Free)</option>
                          <option value="anthropic/claude-3-haiku">Claude 3 Haiku (Paid)</option>
                          <option value="openai/gpt-4o-mini">GPT-4o Mini (Paid)</option>
                          <option value="nousresearch/hermes-3-llama-3.1-405b">Hermes 3 405B (Paid)</option>
                        </>
                      )}
                    </select>
                  </div>
                </div>
              </>
            )}

            <div className="space-y-2">
              <label className="text-sm text-gray-300">Voice Engine</label>
              <select 
                value={settings.voiceEngine}
                onChange={e => handleChange('voiceEngine', e.target.value as any)}
                className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-indigo-500"
              >
                <option value="Cinematic">Cinematic (Gemini TTS)</option>
                <option value="Fast Browser">Fast Browser (Web Speech API)</option>
              </select>
            </div>

            {settings.voiceEngine === 'Cinematic' && (
              <div className="space-y-2 animate-in fade-in slide-in-from-top-1">
                <label className="text-sm text-gray-300">Active TTS Model</label>
                <select 
                  value={settings.activeTTSModel}
                  onChange={e => handleChange('activeTTSModel', e.target.value)}
                  className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="gemini-3.1-flash-tts-preview">Gemini 3.1 TTS Preview (Recommended)</option>
                  <option value="lyria-3-clip-preview">Lyria 3 Clip Preview</option>
                  <option value="lyria-3-pro-preview">Lyria 3 Pro Preview</option>
                  <option value="gemini-3.5-flash">Gemini 3.5 Flash</option>
                  <option value="gemini-3.1-pro-preview">Gemini 3.1 Pro Preview</option>
                </select>
                <p className="text-[10px] text-gray-500">TTS preview models are specialized for audio generation.</p>
              </div>
            )}

            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <label className="text-sm text-gray-300">Global Writing Style Instructions</label>
                <RefineButton 
                  onRefine={handleRefineInstructions}
                  isRefining={isRefining}
                />
              </div>
              <textarea 
                value={settings.customRefineInstructions || ''}
                onChange={e => handleChange('customRefineInstructions', e.target.value)}
                placeholder="e.g. 'Make it more poetic', 'Keep it concise', 'Use a darker tone'"
                className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-indigo-500 min-h-[80px] resize-y"
              />
              <p className="text-xs text-gray-500">These instructions affect all AI responses, suggestions, and refinements.</p>
            </div>

            <div className="pt-4 space-y-4">
              <div className="flex items-center gap-2">
                <Keyboard className="w-4 h-4 text-zinc-400" />
                <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider">Keyboard Shortcuts</h3>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="flex justify-between items-center bg-white/5 px-3 py-2 rounded-xl border border-white/5">
                  <span className="text-[10px] text-zinc-400 uppercase tracking-wider">Settings</span>
                  <kbd className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 text-[10px] font-mono border border-white/10">Alt+S</kbd>
                </div>
                <div className="flex justify-between items-center bg-white/5 px-3 py-2 rounded-xl border border-white/5">
                  <span className="text-[10px] text-zinc-400 uppercase tracking-wider">New Character</span>
                  <kbd className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 text-[10px] font-mono border border-white/10">Alt+N</kbd>
                </div>
                <div className="flex justify-between items-center bg-white/5 px-3 py-2 rounded-xl border border-white/5">
                  <span className="text-[10px] text-zinc-400 uppercase tracking-wider">Library</span>
                  <kbd className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 text-[10px] font-mono border border-white/10">Alt+L</kbd>
                </div>
                <div className="flex justify-between items-center bg-white/5 px-3 py-2 rounded-xl border border-white/5">
                  <span className="text-[10px] text-zinc-400 uppercase tracking-wider">World Codex</span>
                  <kbd className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 text-[10px] font-mono border border-white/10">Alt+C</kbd>
                </div>
                <div className="flex justify-between items-center bg-white/5 px-3 py-2 rounded-xl border border-white/5">
                  <span className="text-[10px] text-zinc-400 uppercase tracking-wider">Inventory</span>
                  <kbd className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 text-[10px] font-mono border border-white/10">Alt+I</kbd>
                </div>
                <div className="flex justify-between items-center bg-white/5 px-3 py-2 rounded-xl border border-white/5">
                  <span className="text-[10px] text-zinc-400 uppercase tracking-wider">Voice/Mic</span>
                  <kbd className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 text-[10px] font-mono border border-white/10">Alt+V</kbd>
                </div>
                <div className="flex justify-between items-center bg-white/5 px-3 py-2 rounded-xl border border-white/5">
                  <span className="text-[10px] text-zinc-400 uppercase tracking-wider">Refine Input</span>
                  <kbd className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 text-[10px] font-mono border border-white/10">Alt+R</kbd>
                </div>
                <div className="flex justify-between items-center bg-white/5 px-3 py-2 rounded-xl border border-white/5">
                  <span className="text-[10px] text-zinc-400 uppercase tracking-wider">AI Suggestion</span>
                  <kbd className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 text-[10px] font-mono border border-white/10">Alt+G</kbd>
                </div>
                <div className="flex justify-between items-center bg-white/5 px-3 py-2 rounded-xl border border-white/5">
                  <span className="text-[10px] text-zinc-400 uppercase tracking-wider">Send Msg</span>
                  <kbd className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 text-[10px] font-mono border border-white/10">Ctrl+Ent</kbd>
                </div>
                <div className="flex justify-between items-center bg-white/5 px-3 py-2 rounded-xl border border-white/5">
                  <span className="text-[10px] text-zinc-400 uppercase tracking-wider">Close/Back</span>
                  <kbd className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 text-[10px] font-mono border border-white/10">Esc</kbd>
                </div>
              </div>
            </div>

            {/* Premium Features Section */}
            <div className="pt-4 space-y-4">
              <div className="flex items-center gap-2">
                <Crown className="w-4 h-4 text-amber-400" />
                <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider">Premium Features (Free during Beta)</h3>
              </div>
              
              <div className="space-y-3">
                <div className="bg-white/5 border border-white/10 rounded-2xl p-4 backdrop-blur-md">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-white">Custom Character Voices & TTS</span>
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-gradient-to-r from-amber-400 to-orange-500 text-black uppercase">Premium</span>
                      </div>
                      <p className="text-xs text-gray-400">Use character-specific voice settings instead of default.</p>
                    </div>
                    <button 
                      onClick={() => handleChange('premiumCustomVoices', !settings.premiumCustomVoices)}
                      className={`w-10 h-5 rounded-full transition-colors relative ${settings.premiumCustomVoices ? 'bg-indigo-600' : 'bg-zinc-700'}`}
                    >
                      <div className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-all ${settings.premiumCustomVoices ? 'left-6' : 'left-1'}`} />
                    </button>
                  </div>
                </div>

                <div className="bg-white/5 border border-white/10 rounded-2xl p-4 backdrop-blur-md">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-white">Context-Aware Avatar Animations</span>
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-gradient-to-r from-amber-400 to-orange-500 text-black uppercase">Premium</span>
                      </div>
                      <p className="text-xs text-gray-400">Avatars react dynamically to the emotional tone of the story.</p>
                    </div>
                    <button 
                      onClick={() => handleChange('premiumContextAnimations', !settings.premiumContextAnimations)}
                      className={`w-10 h-5 rounded-full transition-colors relative ${settings.premiumContextAnimations ? 'bg-indigo-600' : 'bg-zinc-700'}`}
                    >
                      <div className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-all ${settings.premiumContextAnimations ? 'left-6' : 'left-1'}`} />
                    </button>
                  </div>
                </div>

                <div className="bg-white/5 border border-white/10 rounded-2xl p-4 backdrop-blur-md">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-white">Auto-Updating Contextual Avatar</span>
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-gradient-to-r from-amber-400 to-orange-500 text-black uppercase">Premium</span>
                      </div>
                      <p className="text-xs text-gray-400">Avatar updates automatically based on story context (emotions, background, etc.).</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <button 
                        onClick={() => {
                          window.dispatchEvent(new CustomEvent('force-avatar-update'));
                          onClose();
                          toastSuccess("Avatar update triggered!");
                        }}
                        className="p-2 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 rounded-lg transition-colors"
                        title="Force Update Avatar Now"
                      >
                        <RefreshCw className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => handleChange('premiumAutoAvatar', !settings.premiumAutoAvatar)}
                        className={`w-10 h-5 rounded-full transition-colors relative ${settings.premiumAutoAvatar ? 'bg-indigo-600' : 'bg-zinc-700'}`}
                      >
                        <div className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-all ${settings.premiumAutoAvatar ? 'left-6' : 'left-1'}`} />
                      </button>
                    </div>
                  </div>
                </div>

                {!showWaitlist ? (
                  <button 
                    onClick={() => setShowWaitlist(true)}
                    className="w-full flex items-center justify-between p-4 bg-gradient-to-r from-indigo-600/20 to-purple-600/20 border border-indigo-500/30 rounded-2xl hover:from-indigo-600/30 hover:to-purple-600/30 transition-all group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-indigo-500/20 rounded-lg">
                        <Sparkles className="w-4 h-4 text-indigo-400" />
                      </div>
                      <div className="text-left">
                        <div className="text-sm font-medium text-white">Join Premium Waitlist</div>
                        <div className="text-[10px] text-indigo-300">Get early access pricing when Premium launches</div>
                      </div>
                    </div>
                    <ArrowRight className="w-4 h-4 text-indigo-400 group-hover:translate-x-1 transition-transform" />
                  </button>
                ) : (
                  <div className="bg-indigo-900/20 border border-indigo-500/30 rounded-2xl p-4 space-y-4 animate-in fade-in slide-in-from-top-2">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-medium text-white">Premium Waitlist</h4>
                      <button onClick={() => setShowWaitlist(false)} className="text-xs text-gray-400 hover:text-white">Cancel</button>
                    </div>
                    
                    {submitted ? (
                      <div className="flex flex-col items-center py-4 text-center space-y-2">
                        <div className="p-2 bg-emerald-500/20 rounded-full">
                          <CheckCircle className="w-6 h-6 text-emerald-400" />
                        </div>
                        <p className="text-sm text-white font-medium">You're on the list!</p>
                        <p className="text-xs text-gray-400">We'll notify you when Premium launches.</p>
                      </div>
                    ) : (
                      <form onSubmit={handleWaitlistSubmit} className="space-y-3">
                        <div className="space-y-1">
                          <label className="text-[10px] text-gray-400 uppercase">Email Address</label>
                          <input 
                            type="email" 
                            required
                            value={waitlistEmail}
                            onChange={e => setWaitlistEmail(e.target.value)}
                            placeholder="your@email.com"
                            className="w-full bg-black/50 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] text-gray-400 uppercase">Preferred Genre</label>
                          <select 
                            required
                            value={waitlistGenre}
                            onChange={e => setWaitlistGenre(e.target.value)}
                            className="w-full bg-black/50 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                          >
                            <option value="">Select a genre...</option>
                            <option value="Fantasy">Fantasy</option>
                            <option value="Sci-Fi">Sci-Fi</option>
                            <option value="Cyberpunk">Cyberpunk</option>
                            <option value="Horror">Horror</option>
                            <option value="Romance">Romance</option>
                            <option value="Other">Other</option>
                          </select>
                        </div>
                        {error && <p className="text-[10px] text-red-400">{error}</p>}
                        <button 
                          disabled={isSubmitting}
                          type="submit"
                          className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-600/50 text-white rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-2"
                        >
                          {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Join Waitlist'}
                        </button>
                      </form>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-white/10 flex flex-col gap-4">
          {showClearConfirm ? (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 flex flex-col gap-3">
              <p className="text-sm text-red-400">Are you sure you want to clear ALL app data? This will delete all your scenarios, characters, and settings. This cannot be undone.</p>
              <div className="flex justify-end gap-2">
                <button 
                  onClick={() => setShowClearConfirm(false)}
                  className="px-4 py-2 text-zinc-400 hover:text-white transition-colors text-sm"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleClearData}
                  className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg transition-colors text-sm font-medium"
                >
                  Confirm Delete
                </button>
              </div>
            </div>
          ) : (
            <div className="flex justify-between items-center">
              <button 
                onClick={() => setShowClearConfirm(true)}
                className="flex items-center gap-2 px-4 py-2 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-xl transition-colors text-sm font-medium"
              >
                <Trash2 className="w-4 h-4" />
                Clear Data
              </button>
              <button 
                onClick={handleSave}
                className="flex items-center gap-2 px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition-colors font-medium"
              >
                <Save className="w-4 h-4" />
                Save Settings
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
