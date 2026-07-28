import { useState, useRef, useMemo } from 'react';
import { motion } from 'motion/react';
import { Plus, User, Clock, Trash2, ArrowRight, Globe, Heart, Swords, Sparkles, Edit3, Copy, Search, Filter, Upload } from 'lucide-react';
import { AppMode } from '../lib/gemini';
import { Scenario } from '../lib/types';
import { useToast } from '../hooks/useToast';

interface ScenarioLibraryProps {
  scenarios: Scenario[];
  onSelect: (scenario: Scenario) => void;
  onEdit: (scenario: Scenario) => void;
  onDuplicate: (scenario: Scenario) => void;
  onDelete: (id: string) => void;
  onNew: () => void;
  hasDraft?: boolean;
  onRestoreDraft?: () => void;
  onImport?: (scenarioData: any) => void;
}

const getVibeTags = (scenario: Scenario) => {
  const tags: string[] = [];
  if (scenario.profile.storyTone) tags.push(scenario.profile.storyTone);
  
  // Extract keywords from backstory/personality
  const content = (scenario.profile.backstory + ' ' + scenario.profile.personality).toLowerCase();
  const commonGenres = ['noir', 'cyberpunk', 'steampunk', 'fantasy', 'horror', 'sci-fi', 'romance', 'mystery', 'medieval', 'western', 'apocalyptic', 'space'];
  
  commonGenres.forEach(genre => {
    if (content.includes(genre)) tags.push(genre.charAt(0).toUpperCase() + genre.slice(1));
  });

  // Mood Tags
  const traits = scenario.profile.traits;
  if (traits.danger && traits.danger > 70) tags.push('Hostile');
  if (traits.mystery && traits.mystery > 70) tags.push('Cryptic');
  if (traits.lethality && traits.lethality > 70) tags.push('Deadly');
  
  return [...new Set(tags)].slice(0, 3);
};

export function ScenarioLibrary({ scenarios, onSelect, onEdit, onDuplicate, onDelete, onNew, hasDraft, onRestoreDraft, onImport }: ScenarioLibraryProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<AppMode | 'ALL'>('ALL');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toastError, toastSuccess } = useToast();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        if (json && json.scenario && json.scenario.id) {
          if (onImport) {
            onImport(json);
            toastSuccess("Scenario imported successfully!");
          }
        } else {
          toastError("Invalid scenario file format.");
        }
      } catch (err) {
        console.error("Import error:", err);
        toastError("Failed to parse scenario file.");
      }
    };
    reader.readAsText(file);
    
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Pre-compute vibe tags to prevent repeated calculations during rendering and filtering
  const scenariosWithTags = useMemo(() => {
    return scenarios.map(s => {
      const tags = getVibeTags(s);
      return {
        scenario: s,
        vibeTags: tags,
        vibeTagsLower: tags.join(' ').toLowerCase()
      };
    });
  }, [scenarios]);

  // Memoize and sort filtered scenarios to prevent re-filtering/re-sorting on every render
  const filteredScenariosWithTags = useMemo(() => {
    const searchLower = searchQuery.toLowerCase();
    return scenariosWithTags
      .filter(({ scenario: s, vibeTagsLower }) => {
        const matchesSearch = s.profile.name.toLowerCase().includes(searchLower) ||
                              s.profile.storyTone.toLowerCase().includes(searchLower) ||
                              vibeTagsLower.includes(searchLower);
        const matchesFilter = filterMode === 'ALL' || s.profile.mode === filterMode;
        return matchesSearch && matchesFilter;
      })
      .sort((a, b) => (b.scenario.lastUpdated || 0) - (a.scenario.lastUpdated || 0));
  }, [scenariosWithTags, searchQuery, filterMode]);

  return (
    <div className="w-full max-w-7xl mx-auto p-4 sm:p-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-12 gap-6">
        <div className="space-y-1">
          <h2 className="text-4xl sm:text-5xl font-bold text-white font-serif tracking-tight">Timeline Archive</h2>
          <p className="text-zinc-500 text-lg">Your multiverse of characters and unfolding narratives.</p>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <input 
            type="file" 
            accept=".json" 
            className="hidden" 
            ref={fileInputRef}
            onChange={handleFileChange}
          />
          {onImport && (
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 px-4 py-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-2xl font-bold transition-all"
              title="Import Scenario"
            >
              <Upload className="w-5 h-5" />
            </button>
          )}
          {hasDraft && onRestoreDraft && (
            <button
              onClick={onRestoreDraft}
              className="flex items-center gap-2 px-6 py-3 bg-blue-600/20 hover:bg-blue-600 text-blue-400 hover:text-white rounded-2xl font-bold border border-blue-500/30 transition-all group"
            >
              <Sparkles className="w-5 h-5 group-hover:scale-125 transition-transform" />
              Restore Draft
            </button>
          )}
          <button
            onClick={onNew}
            className="flex items-center gap-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl font-bold shadow-xl shadow-emerald-900/20 transition-all group"
          >
            <Plus className="w-5 h-5 group-hover:rotate-90 transition-transform" />
            Forge Narrative
          </button>
        </div>
      </div>

      {scenarios.length > 0 && (
        <div className="flex flex-col sm:flex-row gap-4 mb-8 items-center justify-between bg-zinc-900/50 p-4 rounded-2xl border border-white/5">
          <div className="relative w-full sm:w-96">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
            <input 
              type="text"
              placeholder="Search characters or tones..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full bg-black/50 border border-white/10 rounded-xl pl-10 pr-4 py-2 text-white focus:outline-none focus:border-emerald-500/50 transition-colors"
            />
          </div>
          <div className="flex items-center gap-2 overflow-x-auto w-full sm:w-auto pb-2 sm:pb-0 hide-scrollbar">
            <Filter className="w-4 h-4 text-zinc-500 mr-2 shrink-0" />
            {(['ALL', AppMode.ROLEPLAY, AppMode.SCENARIO, AppMode.GAME] as const).map(mode => (
              <button
                key={mode}
                onClick={() => setFilterMode(mode)}
                className={`px-4 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all ${
                  filterMode === mode 
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' 
                    : 'bg-black/30 text-zinc-500 border border-white/5 hover:text-zinc-300'
                }`}
              >
                {mode}
              </button>
            ))}
          </div>
        </div>
      )}

      {filteredScenariosWithTags.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 glass-panel rounded-3xl border-dashed border-zinc-800">
          <div className="w-20 h-20 bg-zinc-900 rounded-full flex items-center justify-center mb-6">
            <User className="w-10 h-10 text-zinc-700" />
          </div>
          <h3 className="text-xl font-bold text-zinc-400">
            {scenarios.length === 0 ? "No narratives found" : "No matches found"}
          </h3>
          <p className="text-zinc-600 mt-2 mb-8">
            {scenarios.length === 0 ? "Start by forging your first narrative." : "Try adjusting your search or filters."}
          </p>
          {scenarios.length === 0 && (
            <button
              onClick={onNew}
              className="px-8 py-3 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl font-bold transition-all"
            >
              Forge Narrative
            </button>
          )}
          
          {scenarios.length === 0 && (
            <div className="flex flex-col sm:flex-row gap-4 mt-8 w-full max-w-2xl px-4">
              <div className="glass-panel rounded-2xl p-4 flex-1 border border-white/5 flex flex-col items-center text-center">
                <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center mb-3">
                  <Heart className="w-5 h-5 text-emerald-400" />
                </div>
                <span className="font-bold text-sm text-zinc-200 mb-1">Roleplay</span>
                <span className="text-xs text-zinc-500">Deep one-on-one character interaction</span>
              </div>
              <div className="glass-panel rounded-2xl p-4 flex-1 border border-white/5 flex flex-col items-center text-center">
                <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center mb-3">
                  <Globe className="w-5 h-5 text-blue-400" />
                </div>
                <span className="font-bold text-sm text-zinc-200 mb-1">Scenario</span>
                <span className="text-xs text-zinc-500">Branching narrative with a world narrator</span>
              </div>
              <div className="glass-panel rounded-2xl p-4 flex-1 border border-white/5 flex flex-col items-center text-center">
                <div className="w-10 h-10 rounded-full bg-purple-500/10 flex items-center justify-center mb-3">
                  <Swords className="w-5 h-5 text-purple-400" />
                </div>
                <span className="font-bold text-sm text-zinc-200 mb-1">Game</span>
                <span className="text-xs text-zinc-500">Full tabletop RPG with a Dungeon Master</span>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredScenariosWithTags.map(({ scenario, vibeTags }) => (
            <motion.div
              key={scenario.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="group glass-panel rounded-3xl overflow-hidden border border-white/5 hover:border-emerald-500/30 transition-all"
            >
              <div className="relative h-48 overflow-hidden">
                <img 
                  src={scenario.avatarBase64} 
                  alt={scenario.profile.name} 
                  className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                  referrerPolicy="no-referrer"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                  <div className="absolute bottom-4 left-4 right-4 flex items-end justify-between">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-2xl font-bold text-white font-serif truncate drop-shadow-lg">{scenario.profile.name}</h3>
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {vibeTags.map(tag => (
                          <span key={tag} className="text-[8px] font-bold uppercase tracking-wider bg-black/60 backdrop-blur-md text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-500/20">
                            #{tag}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="px-2 py-1 rounded-lg bg-black/40 backdrop-blur border border-white/10 flex items-center gap-1.5 shrink-0 ml-4">
                      {scenario.profile.mode === AppMode.SCENARIO ? <Globe className="w-3 h-3 text-blue-400" /> :
                       scenario.profile.mode === AppMode.GAME ? <Swords className="w-3 h-3 text-purple-400" /> :
                       <Heart className="w-3 h-3 text-pink-400" />}
                      <span className="text-[8px] font-bold text-white uppercase tracking-tighter">{scenario.profile.mode}</span>
                    </div>
                  </div>
              </div>
              
              <div className="p-6 space-y-4">
                <div className="flex items-center gap-4 text-xs text-zinc-500">
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5" />
                    {new Date(scenario.lastUpdated).toLocaleDateString()}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5" />
                    {scenario.profile.relationship}
                  </div>
                </div>
                
                <p className="text-sm text-zinc-400 line-clamp-2 italic font-serif">
                  "{scenario.profile.personality}"
                </p>
                
                <div className="pt-4 flex items-center justify-between border-t border-white/5">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => onDelete(scenario.id)}
                      className="p-2 text-zinc-600 hover:text-red-400 transition-colors"
                      title="Delete Scenario"
                    >
                      <Trash2 className="w-4 h-4" /><span className="hidden lg:inline ml-1 text-[10px] font-bold uppercase tracking-wider">Delete</span>
                    </button>
                    <button
                      onClick={() => onEdit(scenario)}
                      className="p-2 text-zinc-600 hover:text-emerald-400 transition-colors"
                      title="Edit Character"
                    >
                      <Edit3 className="w-4 h-4" /><span className="hidden lg:inline ml-1 text-[10px] font-bold uppercase tracking-wider">Edit</span>
                    </button>
                    <button
                      onClick={() => onDuplicate(scenario)}
                      className="p-2 text-zinc-600 hover:text-blue-400 transition-colors"
                      title="Duplicate & Start New Narrative"
                    >
                      <Copy className="w-4 h-4" /><span className="hidden lg:inline ml-1 text-[10px] font-bold uppercase tracking-wider">Clone</span>
                    </button>
                  </div>
                  <button
                    onClick={() => onSelect(scenario)}
                    className="flex items-center gap-2 px-4 py-2 bg-emerald-600/10 hover:bg-emerald-600 text-emerald-400 hover:text-white rounded-xl text-sm font-bold transition-all"
                  >
                    Continue
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
