import { useState, useEffect } from 'react';
import { X, Save } from 'lucide-react';
import { AppSettings, getSettings, defaultSettings } from '../lib/gemini';

interface SettingsModalProps {
  onClose: () => void;
}

export function SettingsModal({ onClose }: SettingsModalProps) {
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);

  useEffect(() => {
    setSettings(getSettings());
  }, []);

  const handleChange = (field: keyof AppSettings, value: string) => {
    setSettings(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = () => {
    localStorage.setItem('personaforge_settings', JSON.stringify(settings));
    onClose();
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
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider">Preferences</h3>
            
            <div className="space-y-2">
              <label className="text-sm text-gray-300">Active Text Provider</label>
              <select 
                value={settings.activeTextProvider}
                onChange={e => handleChange('activeTextProvider', e.target.value as any)}
                className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-indigo-500"
              >
                <option value="Google">Google (Gemini)</option>
                <option value="OpenRouter">OpenRouter</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm text-gray-300">Active Model</label>
              <select 
                value={settings.activeModel}
                onChange={e => handleChange('activeModel', e.target.value)}
                className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-indigo-500"
              >
                <option value="gemini-3-flash-preview">gemini-3-flash-preview (Free)</option>
                <option value="google/gemini-flash-1.5-8b">google/gemini-flash-1.5-8b (Free)</option>
                <option value="meta-llama/llama-3-8b-instruct:free">meta-llama/llama-3-8b-instruct:free</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm text-gray-300">Voice Engine</label>
              <select 
                value={settings.voiceEngine}
                onChange={e => handleChange('voiceEngine', e.target.value as any)}
                className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-indigo-500"
              >
                <option value="Cinematic">Cinematic (Gemini TTS)</option>
                <option value="Fast Browser">Fast Browser (Web Speech API)</option>
                <option value="ElevenLabs">ElevenLabs (High Quality)</option>
                <option value="OpenAI">OpenAI (Studio Quality)</option>
              </select>
            </div>

            {settings.voiceEngine === 'ElevenLabs' && (
              <>
                <div className="space-y-2">
                  <label className="text-sm text-gray-300">ElevenLabs Voice ID</label>
                  <input 
                    type="text" 
                    value={settings.elevenLabsVoiceId || ''}
                    onChange={e => handleChange('elevenLabsVoiceId', e.target.value)}
                    placeholder="pNInz6obpg8nEByWQX7d"
                    className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm text-gray-300">ElevenLabs Agent ID (for Conversational AI)</label>
                  <input 
                    type="text" 
                    value={settings.elevenLabsAgentId || ''}
                    onChange={e => handleChange('elevenLabsAgentId', e.target.value)}
                    placeholder="Agent ID from ElevenLabs Dashboard"
                    className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </>
            )}

            {settings.voiceEngine === 'OpenAI' && (
              <div className="space-y-2">
                <label className="text-sm text-gray-300">OpenAI Voice</label>
                <select 
                  value={settings.openAiVoiceId || 'alloy'}
                  onChange={e => handleChange('openAiVoiceId', e.target.value)}
                  className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="alloy">Alloy</option>
                  <option value="echo">Echo</option>
                  <option value="fable">Fable</option>
                  <option value="onyx">Onyx</option>
                  <option value="nova">Nova</option>
                  <option value="shimmer">Shimmer</option>
                </select>
              </div>
            )}
            <div className="space-y-2">
              <label className="text-sm text-gray-300">Custom Writing Style Instructions</label>
              <textarea 
                value={settings.customRefineInstructions || ''}
                onChange={e => handleChange('customRefineInstructions', e.target.value)}
                placeholder="e.g. 'Make it more poetic', 'Keep it concise', 'Use a darker tone'"
                className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-indigo-500 min-h-[80px] resize-y"
              />
              <p className="text-xs text-gray-500">These instructions will be used when you click the "REFINE" button in chat.</p>
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-white/10 flex justify-end">
          <button 
            onClick={handleSave}
            className="flex items-center gap-2 px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition-colors font-medium"
          >
            <Save className="w-4 h-4" />
            Save Settings
          </button>
        </div>
      </div>
    </div>
  );
}
