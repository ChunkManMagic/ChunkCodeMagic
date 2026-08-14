import { useState, useMemo } from 'react';
import { X, Search, User, Image as ImageIcon } from 'lucide-react';
import { Scenario } from '../lib/types';
import { motion } from 'motion/react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  scenarios: Scenario[];
  onSelect: (char: any) => void;
}

export function CharacterLibraryModal({ isOpen, onClose, scenarios, onSelect }: Props) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'ALL' | 'MAIN' | 'PLAYER' | 'NPC'>('ALL');

  const libraryCharacters = useMemo(() => {
    const chars: any[] = [];
    const seenNames = new Set<string>();

    scenarios.forEach(s => {
      // Main Character
      if (s.profile.name && !seenNames.has(s.profile.name)) {
        chars.push({
          type: 'MAIN',
          sourceScenario: s.profile.name,
          name: s.profile.name,
          description: s.profile.backstory || '',
          personality: s.profile.personality || '',
          appearance: s.profile.appearance || '',
          clothing: s.profile.clothing || '',
          accessories: s.profile.accessories || '',
          hairStyle: s.profile.hairStyle || '',
          hairColor: s.profile.hairColor || '',
          eyeColor: s.profile.eyeColor || '',
          avatarBase64: s.avatarBase64
        });
        seenNames.add(s.profile.name);
      }

      // Player Profile
      if (s.profile.playerProfile && s.profile.playerProfile.name && s.profile.playerProfile.name !== 'The Protagonist') {
        if (!seenNames.has(s.profile.playerProfile.name)) {
          chars.push({
            type: 'PLAYER',
            sourceScenario: s.profile.name,
            name: s.profile.playerProfile.name,
            description: s.profile.playerProfile.description || s.profile.playerProfile.backstory || '',
            personality: s.profile.playerProfile.personality || '',
            appearance: s.profile.playerProfile.appearance || '',
            clothing: s.profile.playerProfile.clothing || '',
            accessories: s.profile.playerProfile.accessories || '',
            hairStyle: s.profile.playerProfile.hairStyle || '',
            hairColor: s.profile.playerProfile.hairColor || '',
            eyeColor: s.profile.playerProfile.eyeColor || '',
          });
          seenNames.add(s.profile.playerProfile.name);
        }
      }

      // NPCs
      if (s.profile.additionalCharacters) {
        s.profile.additionalCharacters.forEach(npc => {
          if (npc.name && !seenNames.has(npc.name)) {
            chars.push({
              type: 'NPC',
              sourceScenario: s.profile.name,
              name: npc.name,
              description: npc.description || '',
              personality: npc.personality || '',
              appearance: npc.appearance || '',
              avatarBase64: npc.avatarBase64
            });
            seenNames.add(npc.name);
          }
        });
      }
    });

    return chars;
  }, [scenarios]);

  const filteredCharacters = useMemo(() => {
    return libraryCharacters.filter(c => {
      const matchesSearch = c.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                            c.description.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesType = filterType === 'ALL' || c.type === filterType;
      return matchesSearch && matchesType;
    });
  }, [libraryCharacters, searchQuery, filterType]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="relative w-full max-w-4xl max-h-[85vh] bg-[#0A0A0A] border border-white/10 rounded-2xl shadow-2xl flex flex-col"
      >
        <div className="p-6 border-b border-white/10 flex justify-between items-center bg-white/5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400">
              <User className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-light text-white tracking-wide">Character Library</h2>
              <p className="text-xs text-zinc-400">Import a character from your previous scenarios</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors text-zinc-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 border-b border-white/5 flex gap-4 bg-black/20">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <input 
              type="text"
              placeholder="Search characters by name or description..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl py-2 pl-10 pr-4 text-sm text-white focus:outline-none focus:border-emerald-500/50 transition-colors"
            />
          </div>
          <select 
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as any)}
            className="bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:border-emerald-500/50"
          >
            <option value="ALL">All Types</option>
            <option value="MAIN">Main Characters</option>
            <option value="PLAYER">Player Profiles</option>
            <option value="NPC">NPCs</option>
          </select>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {filteredCharacters.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-zinc-500">
              <User className="w-8 h-8 mb-2 opacity-20" />
              <p>No characters found in library.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredCharacters.map((char, i) => (
                <div 
                  key={i} 
                  className="bg-white/5 border border-white/10 hover:border-emerald-500/50 rounded-xl p-4 cursor-pointer transition-all hover:bg-white/10 flex flex-col group"
                  onClick={() => {
                    onSelect(char);
                    onClose();
                  }}
                >
                  <div className="flex items-start gap-4 mb-3">
                    {char.avatarBase64 ? (
                      <img src={char.avatarBase64} alt={char.name} className="w-12 h-12 rounded-full object-cover border border-white/10" />
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center border border-white/10">
                        <ImageIcon className="w-5 h-5 text-zinc-500" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <h4 className="text-white font-medium truncate">{char.name}</h4>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full inline-block mt-1">
                        {char.type} • {char.sourceScenario}
                      </span>
                    </div>
                  </div>
                  <p className="text-xs text-zinc-400 line-clamp-3 mb-2 flex-1">{char.description || char.personality}</p>
                  <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mt-auto group-hover:text-emerald-400 transition-colors">
                    Click to Import →
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
