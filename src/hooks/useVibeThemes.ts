import { useMemo } from 'react';

export interface VibeThemeConfig {
  backgroundClass: string;
  accentClass: string;
  accentTextClass: string;
  borderClass: string;
  glowClass: string;
  badgeClass: string;
  accentColor: string; // Hex color code for canvas or inline styling
}

export function useVibeThemes(vibeTags: string[] = []): VibeThemeConfig {
  return useMemo(() => {
    const tags = vibeTags.map(t => t.toLowerCase());

    const isCyberpunk = tags.some(t => t.includes('cyber') || t.includes('neon') || t.includes('scifi') || t.includes('sci-fi'));
    const isFantasy = tags.some(t => t.includes('fantasy') || t.includes('medieval') || t.includes('magic') || t.includes('parchment'));
    const isHorror = tags.some(t => t.includes('horror') || t.includes('gothic') || t.includes('dark') || t.includes('blood'));

    if (isCyberpunk) {
      return {
        backgroundClass: 'bg-gradient-to-b from-[#09090b] to-[#020204]',
        accentClass: 'bg-purple-600 hover:bg-purple-500',
        accentTextClass: 'text-purple-400',
        borderClass: 'border-purple-500/20 hover:border-purple-500/40',
        glowClass: 'shadow-[0_0_20px_rgba(139,92,246,0.15)]',
        badgeClass: 'bg-purple-500/10 border-purple-500/30 text-purple-300',
        accentColor: '#8b5cf6',
      };
    }

    if (isFantasy) {
      return {
        backgroundClass: 'bg-gradient-to-b from-[#110c08] to-[#070402]',
        accentClass: 'bg-amber-600 hover:bg-amber-500',
        accentTextClass: 'text-amber-400',
        borderClass: 'border-amber-500/20 hover:border-amber-500/40',
        glowClass: 'shadow-[0_0_20px_rgba(245,158,11,0.15)]',
        badgeClass: 'bg-amber-500/10 border-amber-500/30 text-amber-300',
        accentColor: '#f59e0b',
      };
    }

    if (isHorror) {
      return {
        backgroundClass: 'bg-gradient-to-b from-[#0c0202] to-[#030101]',
        accentClass: 'bg-red-600 hover:bg-red-500',
        accentTextClass: 'text-red-400',
        borderClass: 'border-red-500/20 hover:border-red-500/40',
        glowClass: 'shadow-[0_0_20px_rgba(239,68,68,0.15)]',
        badgeClass: 'bg-red-500/10 border-red-500/30 text-red-300',
        accentColor: '#ef4444',
      };
    }

    // Default Emerald Theme
    return {
      backgroundClass: 'bg-gradient-to-b from-[#061c15] to-[#020d08]',
      accentClass: 'bg-emerald-600 hover:bg-emerald-500',
      accentTextClass: 'text-emerald-400',
      borderClass: 'border-emerald-500/20 hover:border-emerald-500/40',
      glowClass: 'shadow-[0_0_20px_rgba(16,185,129,0.15)]',
      badgeClass: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300',
      accentColor: '#10b981',
    };
  }, [vibeTags]);
}
