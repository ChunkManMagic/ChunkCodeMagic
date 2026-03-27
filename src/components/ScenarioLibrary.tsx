import { motion } from 'motion/react';
import { Plus, User, Clock, Trash2, ArrowRight, Globe, Heart, Swords, Sparkles, Edit3 } from 'lucide-react';
import { AppMode } from '../lib/gemini';
import { Scenario } from '../lib/types';

interface ScenarioLibraryProps {
  scenarios: Scenario[];
  onSelect: (scenario: Scenario) => void;
  onEdit: (scenario: Scenario) => void;
  onDelete: (id: string) => void;
  onNew: () => void;
  hasDraft?: boolean;
  onRestoreDraft?: () => void;
}

export function ScenarioLibrary({ scenarios, onSelect, onEdit, onDelete, onNew, hasDraft, onRestoreDraft }: ScenarioLibraryProps) {
  return (
    <div className="w-full max-w-6xl mx-auto p-8">
      <div className="flex justify-between items-center mb-12">
        <div>
          <h2 className="text-4xl font-bold text-white font-serif tracking-tight">Scenario Library</h2>
          <p className="text-zinc-500 mt-2">Manage your characters and ongoing narratives.</p>
        </div>
        <div className="flex items-center gap-4">
          {hasDraft && onRestoreDraft && (
            <button
              onClick={onRestoreDraft}
              className="flex items-center gap-2 px-6 py-3 bg-blue-600/20 hover:bg-blue-600 text-blue-400 hover:text-white rounded-2xl font-bold border border-blue-500/30 transition-all group"
            >
              <Sparkles className="w-5 h-5 group-hover:scale-125 transition-transform" />
              Restore Unsaved Draft
            </button>
          )}
          <button
            onClick={onNew}
            className="flex items-center gap-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl font-bold shadow-xl shadow-emerald-900/20 transition-all group"
          >
            <Plus className="w-5 h-5 group-hover:rotate-90 transition-transform" />
            Forge New Narrative
          </button>
        </div>
      </div>

      {scenarios.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 glass-panel rounded-3xl border-dashed border-zinc-800">
          <div className="w-20 h-20 bg-zinc-900 rounded-full flex items-center justify-center mb-6">
            <User className="w-10 h-10 text-zinc-700" />
          </div>
          <h3 className="text-xl font-bold text-zinc-400">No narratives found</h3>
          <p className="text-zinc-600 mt-2 mb-8">Start by forging your first narrative.</p>
          <button
            onClick={onNew}
            className="px-8 py-3 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl font-bold transition-all"
          >
            Forge Narrative
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {scenarios.sort((a, b) => (b.lastUpdated || 0) - (a.lastUpdated || 0)).map((scenario) => (
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
                  <div>
                    <h3 className="text-xl font-bold text-white font-serif">{scenario.profile.name}</h3>
                    <p className="text-[10px] uppercase tracking-widest text-emerald-400 font-bold">{scenario.profile.storyTone}</p>
                  </div>
                  <div className="px-2 py-1 rounded-lg bg-black/40 backdrop-blur border border-white/10 flex items-center gap-1.5">
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
                      <Trash2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => onEdit(scenario)}
                      className="p-2 text-zinc-600 hover:text-emerald-400 transition-colors"
                      title="Edit Character"
                    >
                      <Edit3 className="w-4 h-4" />
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
