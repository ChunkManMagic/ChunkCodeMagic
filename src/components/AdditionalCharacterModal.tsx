import { useState } from 'react';
import { X, Wand2, Loader2, Image as ImageIcon, RotateCcw } from 'lucide-react';
import { AdditionalCharacter } from '../lib/types';
import { generateAdditionalCharacter, refineField, generateAvatar } from '../lib/gemini';
import { RefineButton } from './RefineButton';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSave: (character: AdditionalCharacter) => void;
  appMode: string;
}

export function AdditionalCharacterModal({ isOpen, onClose, onSave, appMode }: Props) {
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isGeneratingAvatar, setIsGeneratingAvatar] = useState(false);
  const [isRefiningField, setIsRefiningField] = useState<string | null>(null);
  const [character, setCharacter] = useState<AdditionalCharacter>({
    id: '',
    name: '',
    description: '',
    personality: '',
    appearance: '',
    avatarBase64: ''
  });

  if (!isOpen) return null;

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    setIsGenerating(true);
    try {
      const generated = await generateAdditionalCharacter(prompt, appMode);
      const newChar = {
        ...character,
        ...generated,
        id: character.id || Math.random().toString(36).substr(2, 9)
      };
      
      // Also trigger avatar generation
      setIsGeneratingAvatar(true);
      try {
        const avatar = await generateAvatar(newChar as any);
        newChar.avatarBase64 = avatar;
      } catch (err) {
        console.error("Avatar generation failed for NPC", err);
      } finally {
        setIsGeneratingAvatar(false);
      }

      setCharacter(newChar);
    } catch (error) {
      console.error(error);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRefineField = async (field: string, guidance?: string) => {
    setIsRefiningField(field);
    try {
      const refined = await refineField(field as any, { ...character, mode: appMode } as any, guidance);
      setCharacter(prev => ({ ...prev, [field]: refined }));
    } catch (err) {
      console.error("Refine field error:", err);
    } finally {
      setIsRefiningField(null);
    }
  };

  const handleRegenerateAvatar = async () => {
    if (isGeneratingAvatar || !character.appearance) return;
    setIsGeneratingAvatar(true);
    try {
      const avatar = await generateAvatar(character as any);
      setCharacter(prev => ({ ...prev, avatarBase64: avatar }));
    } catch (err) {
      console.error("Manual avatar generation failed", err);
    } finally {
      setIsGeneratingAvatar(false);
    }
  };

  const handleSave = () => {
    if (!character.name || !character.description) return;
    onSave({
      ...character,
      id: character.id || Math.random().toString(36).substr(2, 9)
    });
    setCharacter({ id: '', name: '', description: '', personality: '', appearance: '', avatarBase64: '' });
    setPrompt('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-zinc-900 border border-white/10 rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        <div className="p-6 border-b border-white/5 flex justify-between items-center bg-zinc-900/50">
          <h3 className="text-xl font-bold text-white font-serif">Add Character / NPC</h3>
          <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-6 overflow-y-auto space-y-6">
          {/* Avatar Section */}
          <div className="flex flex-col items-center gap-4">
            <div className="relative group">
              <div className="w-32 h-32 rounded-3xl overflow-hidden glass-panel border border-white/10 shadow-2xl bg-zinc-800 flex items-center justify-center">
                {isGeneratingAvatar ? (
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 className="w-8 h-8 text-emerald-400 animate-spin" />
                    <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Imaging...</span>
                  </div>
                ) : character.avatarBase64 ? (
                  <img 
                    src={character.avatarBase64} 
                    alt={character.name} 
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <ImageIcon className="w-10 h-10 text-zinc-700" />
                )}
              </div>
              
              <button
                onClick={handleRegenerateAvatar}
                disabled={isGeneratingAvatar || !character.appearance}
                className="absolute -bottom-2 -right-2 p-2 bg-emerald-500 text-black rounded-xl shadow-lg hover:scale-110 active:scale-95 transition-all disabled:opacity-0"
                title="Regenerate Avatar"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            </div>
            {!character.avatarBase64 && !isGeneratingAvatar && (
              <p className="text-[10px] text-zinc-600 font-bold uppercase tracking-widest text-center">
                Fill Appearance to Generate Face
              </p>
            )}
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-bold text-zinc-500 uppercase tracking-widest">Quick Generate</label>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="e.g., A grumpy dwarven blacksmith..."
                className="flex-1 px-4 py-2 glass-input rounded-xl text-white text-sm"
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleGenerate()}
              />
              <button
                onClick={handleGenerate}
                disabled={isGenerating || !prompt.trim()}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-white rounded-xl font-bold transition-all flex items-center gap-2"
              >
                {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                Generate
              </button>
            </div>
          </div>

          <div className="space-y-4 pt-4 border-t border-white/5">
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="block text-xs font-bold text-zinc-500 uppercase tracking-widest">Name</label>
                <RefineButton 
                  onRefine={(guidance) => handleRefineField('name', guidance)}
                  isRefining={isRefiningField === 'name'}
                />
              </div>
              <input
                type="text"
                className="w-full px-4 py-2 glass-input rounded-xl text-white text-sm"
                value={character.name}
                onChange={e => setCharacter({ ...character, name: e.target.value })}
              />
            </div>
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="block text-xs font-bold text-zinc-500 uppercase tracking-widest">Role / Description</label>
                <RefineButton 
                  onRefine={(guidance) => handleRefineField('description', guidance)}
                  isRefining={isRefiningField === 'description'}
                />
              </div>
              <input
                type="text"
                className="w-full px-4 py-2 glass-input rounded-xl text-white text-sm"
                value={character.description}
                onChange={e => setCharacter({ ...character, description: e.target.value })}
                placeholder="e.g., Blacksmith, Rival, Guide"
              />
            </div>
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="block text-xs font-bold text-zinc-500 uppercase tracking-widest">Personality</label>
                <RefineButton 
                  onRefine={(guidance) => handleRefineField('personality', guidance)}
                  isRefining={isRefiningField === 'personality'}
                />
              </div>
              <textarea
                rows={2}
                className="w-full px-4 py-2 glass-input rounded-xl text-white text-sm resize-none"
                value={character.personality}
                onChange={e => setCharacter({ ...character, personality: e.target.value })}
              />
            </div>
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="block text-xs font-bold text-zinc-500 uppercase tracking-widest">Appearance</label>
                <RefineButton 
                  onRefine={(guidance) => handleRefineField('appearance', guidance)}
                  isRefining={isRefiningField === 'appearance'}
                />
              </div>
              <textarea
                rows={2}
                className="w-full px-4 py-2 glass-input rounded-xl text-white text-sm resize-none"
                value={character.appearance}
                onChange={e => setCharacter({ ...character, appearance: e.target.value })}
              />
            </div>
          </div>
        </div>

        <div className="p-6 border-t border-white/5 bg-zinc-900/50 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-6 py-2 rounded-xl text-sm font-bold text-zinc-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!character.name || !character.description}
            className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-white rounded-xl text-sm font-bold shadow-lg shadow-emerald-900/20 transition-all"
          >
            Save Character
          </button>
        </div>
      </div>
    </div>
  );
}
