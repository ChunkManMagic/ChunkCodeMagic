import { useState } from 'react';
import { CharacterProfile, generateAvatar } from '../lib/gemini';
import { Loader2, RotateCcw } from 'lucide-react';

interface CharacterEditorProps {
  profile: CharacterProfile;
  avatarBase64: string;
  isInitialReview?: boolean;
  onSave: (profile: CharacterProfile, avatarBase64: string) => void;
  onCancel: () => void;
}

export function CharacterEditor({ profile: initialProfile, avatarBase64: initialAvatar, isInitialReview: _isInitialReview, onSave, onCancel }: CharacterEditorProps) {
  const [profile, setProfile] = useState<CharacterProfile>(initialProfile);
  const [avatar, setAvatar] = useState<string>(initialAvatar);
  const [isRegenerating, setIsRegenerating] = useState(false);

  const handleSave = () => {
    onSave(profile, avatar);
  };

  const handleRegenerateAvatar = async () => {
    setIsRegenerating(true);
    try {
      const newAvatar = await generateAvatar(profile);
      setAvatar(newAvatar);
    } catch (err) {
      console.error("Failed to regenerate avatar", err);
    } finally {
      setIsRegenerating(false);
    }
  };

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <h2 className="text-4xl font-serif text-white">Refine Character</h2>
        <div className="flex gap-4">
          <button onClick={onCancel} className="px-6 py-3 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl font-medium transition-colors">
            Cancel
          </button>
          <button onClick={handleSave} className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-medium transition-colors shadow-lg shadow-emerald-900/20">
            Save & Continue
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
        <div className="lg:col-span-1 space-y-6">
          <div className="relative group aspect-square rounded-[2rem] overflow-hidden border border-white/10 bg-zinc-900 shadow-2xl">
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

          <div className="glass-panel p-6 rounded-[2rem] border border-white/5 space-y-6">
            <h3 className="text-xs font-bold text-emerald-400 uppercase tracking-widest">Avatar Customization</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1">Hair Style</label>
                <input
                  type="text"
                  value={profile.hairStyle || ''}
                  onChange={(e) => setProfile({ ...profile, hairStyle: e.target.value })}
                  className="w-full p-3 rounded-xl glass-input text-white text-sm"
                  placeholder="e.g., Long wavy"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1">Hair Color</label>
                <input
                  type="text"
                  value={profile.hairColor || ''}
                  onChange={(e) => setProfile({ ...profile, hairColor: e.target.value })}
                  className="w-full p-3 rounded-xl glass-input text-white text-sm"
                  placeholder="e.g., Raven black"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1">Eye Color</label>
                <input
                  type="text"
                  value={profile.eyeColor || ''}
                  onChange={(e) => setProfile({ ...profile, eyeColor: e.target.value })}
                  className="w-full p-3 rounded-xl glass-input text-white text-sm"
                  placeholder="e.g., Piercing blue"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1">Clothing</label>
                <input
                  type="text"
                  value={profile.clothing || ''}
                  onChange={(e) => setProfile({ ...profile, clothing: e.target.value })}
                  className="w-full p-3 rounded-xl glass-input text-white text-sm"
                  placeholder="e.g., Leather duster"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1">Accessories</label>
                <input
                  type="text"
                  value={profile.accessories || ''}
                  onChange={(e) => setProfile({ ...profile, accessories: e.target.value })}
                  className="w-full p-3 rounded-xl glass-input text-white text-sm"
                  placeholder="e.g., Silver monocle"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="lg:col-span-2 space-y-8">
          <div className="glass-panel p-8 rounded-[2rem] border border-white/5 space-y-6">
            <h3 className="text-xs font-bold text-blue-400 uppercase tracking-widest">Core Identity</h3>
            <div className="space-y-6">
              <div>
                <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2">Name</label>
                <input
                  type="text"
                  value={profile.name}
                  onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                  className="w-full p-4 rounded-2xl glass-input text-white text-lg font-medium"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2">Personality</label>
                <textarea
                  value={profile.personality}
                  onChange={(e) => setProfile({ ...profile, personality: e.target.value })}
                  className="w-full p-4 rounded-2xl glass-input text-white h-32 text-sm leading-relaxed resize-none"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2">Backstory</label>
                <textarea
                  value={profile.backstory}
                  onChange={(e) => setProfile({ ...profile, backstory: e.target.value })}
                  className="w-full p-4 rounded-2xl glass-input text-white h-48 text-sm leading-relaxed resize-none"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2">General Appearance</label>
                <textarea
                  value={profile.appearance}
                  onChange={(e) => setProfile({ ...profile, appearance: e.target.value })}
                  className="w-full p-4 rounded-2xl glass-input text-white h-32 text-sm leading-relaxed resize-none"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
