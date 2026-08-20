// Small, dependency-free preset catalog shared by the ambient engine and the
// settings UI. Kept separate from ambientSound.ts so the settings modal only
// pulls in this tiny module instead of the whole WebAudio engine.

export type AmbientPresetId =
  | 'forest'
  | 'cave'
  | 'tavern'
  | 'space'
  | 'storm'
  | 'ocean'
  | 'city'
  | 'meadow'
  | 'desert'
  | 'mountain'
  | 'void';

export const AMBIENT_PRESETS: Record<AmbientPresetId, { label: string; description: string }> = {
  forest: { label: 'Forest', description: 'Wind through leaves, distant birdsong' },
  cave: { label: 'Cavern', description: 'Low wind, echoing drips, deep stone' },
  tavern: { label: 'Tavern', description: 'Crackling hearth, low murmur, clinking mugs' },
  space: { label: 'Space', description: 'Deep drone, console pings, silent void' },
  storm: { label: 'Storm', description: 'Driving rain with rolling thunder' },
  ocean: { label: 'Ocean', description: 'Slow waves rolling against the shore' },
  city: { label: 'City', description: 'Traffic hum with distant horns' },
  meadow: { label: 'Meadow', description: 'Soft breeze, crickets, birds' },
  desert: { label: 'Desert', description: 'Shifting wind, distant chimes' },
  mountain: { label: 'Mountain', description: 'High wind, rocky stillness, eagle cries' },
  void: { label: 'Void', description: 'Near-silent ominous low drone' },
};