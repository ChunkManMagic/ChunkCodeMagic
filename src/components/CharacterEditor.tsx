import { useState } from 'react';
import { CharacterProfile } from '../lib/gemini';

interface CharacterEditorProps {
  profile: CharacterProfile;
  avatarBase64: string;
  isInitialReview?: boolean;
  onSave: (profile: CharacterProfile, avatarBase64: string) => void;
  onCancel: () => void;
}

export function CharacterEditor({ profile: initialProfile, avatarBase64, isInitialReview: _isInitialReview, onSave, onCancel }: CharacterEditorProps) {
  const [profile, setProfile] = useState<CharacterProfile>(initialProfile);

  const handleSave = () => {
    onSave(profile, avatarBase64);
  };

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h2 className="text-3xl font-serif mb-6">Edit Character</h2>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-zinc-400 mb-1">Name</label>
          <input
            type="text"
            value={profile.name}
            onChange={(e) => setProfile({ ...profile, name: e.target.value })}
            className="w-full p-3 rounded-xl glass-input text-white"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-zinc-400 mb-1">Personality</label>
          <textarea
            value={profile.personality}
            onChange={(e) => setProfile({ ...profile, personality: e.target.value })}
            className="w-full p-3 rounded-xl glass-input text-white h-32"
          />
        </div>
        <div className="flex gap-4 pt-4">
          <button onClick={handleSave} className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-medium transition-colors">
            Save Changes
          </button>
          <button onClick={onCancel} className="px-6 py-3 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl font-medium transition-colors">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
