import { getSettings, WritingToneDims } from './types';

// Global "Tone Studio" — a persisted, multi-dimensional writing tone that is
// injected into every generative surface (chat replies, suggestions,
// refinements, quick-create, and live voice). Presets are one-tap shortcuts
// that set all seven dimensions at once; users can then fine-tune any slider.

export const TONE_DIM_LABELS: Record<keyof WritingToneDims, string> = {
  prose: 'Prose Density',
  humor: 'Humor',
  romance: 'Romance',
  darkness: 'Darkness',
  action: 'Action / Intensity',
  formality: 'Formality',
  pace: 'Pacing',
};

export interface TonePreset {
  label: string;
  description: string;
  dims: WritingToneDims;
}

export const TONE_PRESETS: Record<string, TonePreset> = {
  cinematic: {
    label: 'Cinematic',
    description: 'Vivid, sweeping and immersive like a film scene',
    dims: { prose: 75, humor: 30, romance: 45, darkness: 50, action: 70, formality: 50, pace: 55 },
  },
  cozy: {
    label: 'Cozy',
    description: 'Warm, gentle and comforting',
    dims: { prose: 55, humor: 70, romance: 45, darkness: 10, action: 20, formality: 20, pace: 35 },
  },
  gritty: {
    label: 'Gritty',
    description: 'Raw, blunt and hard-edged',
    dims: { prose: 50, humor: 15, romance: 20, darkness: 85, action: 75, formality: 20, pace: 55 },
  },
  whimsical: {
    label: 'Whimsical',
    description: 'Playful, imaginative and delightfully odd',
    dims: { prose: 70, humor: 70, romance: 35, darkness: 15, action: 35, formality: 15, pace: 50 },
  },
  poetic: {
    label: 'Poetic',
    description: 'Lyrical, sensory and emotionally charged',
    dims: { prose: 95, humor: 20, romance: 75, darkness: 45, action: 25, formality: 60, pace: 30 },
  },
  snappy: {
    label: 'Snappy',
    description: 'Fast, punchy and economical',
    dims: { prose: 25, humor: 45, romance: 30, darkness: 30, action: 75, formality: 15, pace: 90 },
  },
  literary: {
    label: 'Literary',
    description: 'Refined, measured and introspective',
    dims: { prose: 90, humor: 25, romance: 50, darkness: 60, action: 30, formality: 80, pace: 30 },
  },
  epic: {
    label: 'Epic',
    description: 'Grand, mythic and larger than life',
    dims: { prose: 80, humor: 15, romance: 40, darkness: 55, action: 90, formality: 75, pace: 50 },
  },
  romantic: {
    label: 'Romantic',
    description: 'Tender, intimate and charged with feeling',
    dims: { prose: 80, humor: 30, romance: 95, darkness: 25, action: 20, formality: 45, pace: 35 },
  },
  noir: {
    label: 'Noir',
    description: 'Moody, cynical and hard-boiled',
    dims: { prose: 60, humor: 15, romance: 35, darkness: 85, action: 45, formality: 40, pace: 45 },
  },
};

// Turn a 0-100 value into a qualitative descriptor for the directive.
function band(v: number, low: string, mid: string, high: string): string {
  if (v <= 20) return low;
  if (v >= 80) return high;
  if (v >= 45 && v <= 55) return mid;
  if (v < 45) return `${low} (leaning ${mid.toLowerCase()})`;
  return `${high} (leaning ${mid.toLowerCase()})`;
}

function describeDim(dim: keyof WritingToneDims, v: number): string {
  switch (dim) {
    case 'prose':
      return band(v, 'Sparse and economical prose', 'Balanced prose', 'Lavish, richly detailed prose');
    case 'humor':
      return band(v, 'Dry / barely any humor', 'Occasional wry humor', 'Frequent lighthearted humor');
    case 'romance':
      return band(v, 'Barely any romantic tension', 'Subtle romantic undercurrents', 'Strong romantic / sensual tension');
    case 'darkness':
      return band(v, 'Bright, hopeful tone', 'Balanced light and shadow', 'Dark, oppressive, unsettling tone');
    case 'action':
      return band(v, 'Slow, quiet, introspective moments', 'Moderate movement and intensity', 'Fast, kinetic, high-intensity action');
    case 'formality':
      return band(v, 'Casual, colloquial voice', 'Neutral, natural voice', 'Formal, elevated register');
    case 'pace':
      return band(v, 'Slow-burn, patient pacing', 'Even, natural pacing', 'Brisk, fast-moving pacing');
  }
}

// Builds the directive block that shapes generation. Free-text style
// instructions stay in the existing custom-instructions slot (passed
// separately) so the two never double up.
export function getToneDirective(): string {
  const s = getSettings();
  if (s.writingToneEnabled === false) return '';
  const dims: WritingToneDims = s.writingToneDims || {
    prose: 60,
    humor: 40,
    romance: 40,
    darkness: 40,
    action: 50,
    formality: 40,
    pace: 50,
  };
  const lines = (Object.keys(dims) as (keyof WritingToneDims)[]).map(
    (k) => `- ${TONE_DIM_LABELS[k]} (${dims[k]}/100): ${describeDim(k, dims[k])}`
  );
  return `\nGLOBAL TONE DIRECTIVE (Follow these strictly to shape the voice and pacing of the writing):
${lines.join('\n')}
`;
}

export function tonePresetLabel(presetId?: string): string {
  return (presetId && TONE_PRESETS[presetId]?.label) || 'Custom';
}

// Mature-content directive, appended to prompts when the user has enabled
// adult content. It permits mature, sensual, and erotic themes between adult
// characters while keeping a firm "everyone is 18+" boundary.
export function getMatureContentDirective(): string {
  const s = getSettings();
  if (!s.enableAdultContent) return '';
  return `\nMATURE CONTENT DIRECTIVE:
- Adult themes, sensual intimacy, and eroticism are permitted in this story when the player initiates or clearly welcomes them. Do not shy away from physicality, desire, or the body — write it vividly and tastefully, in keeping with the story's tone.
- All characters who appear in any romantic or sexual context are adults (18+). Never depict or reference a minor in any romantic or sexual situation, in any medium.
- Respect consent and the player's lead: escalate intimacy only as far as the player's own actions and words invite.
`;
}

// Safety-filter relaxation, applied only while adult content is enabled. The
// model provider still enforces its own hard limits; this simply lowers our
// app's own filter thresholds so mature fiction isn't blocked at the API edge.
export function getAdultSafetySettings():
  | { safetySettings: { category: string; threshold: string }[] }
  | undefined {
  const s = getSettings();
  if (!s.enableAdultContent) return undefined;
  return {
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
    ],
  };
}