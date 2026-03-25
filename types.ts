// ─────────────────────────────────────────────
// Core domain types — no API imports here
// ─────────────────────────────────────────────

export enum AppMode {
  SCENARIO = 'Scenario',
  ROLEPLAY = 'Roleplay',
  GAME = 'Game',
}

export interface VoiceSettings {
  pitch: 'Low' | 'Normal' | 'High';
  speed: 'Slow' | 'Normal' | 'Fast';
  accent: string;
}

export interface CharacterProfile {
  mode: AppMode;
  name: string;
  personality: string;
  backstory: string;
  appearance: string;
  clothing?: string;
  accessories?: string;
  hairStyle?: string;
  hairColor?: string;
  eyeColor?: string;
  voiceName: string;
  voiceSettings: VoiceSettings;
  traits: {
    friendliness?: number;
    assertiveness?: number;
    empathy?: number;
    danger?: number;
    mystery?: number;
    supernatural?: number;
    strictness?: number;
    generosity?: number;
    lethality?: number;
    [key: string]: number | undefined;
  };
  storyTone: string;
  relationship: string;
  playerProfile: {
    name: string;
    description: string;
  };
  worldAtmosphere?: string;
  keyLocations?: string;
  characterFlaws?: string;
  secretMotive?: string;
  gameSystem?: string;
  questObjective?: string;
}

export interface Scenario {
  id: string;
  profile: CharacterProfile;
  avatarBase64: string;
  lastUpdated: number;
}

export interface CodexEntry {
  id: string;
  title: string;
  content: string;
  category: 'Lore' | 'Mechanics' | 'Location' | 'Item';
}

export interface AppSettings {
  activeTextProvider: 'Google' | 'OpenRouter';
  activeModel: string;
  voiceEngine: 'Cinematic' | 'Fast Browser' | 'ElevenLabs' | 'OpenAI';
  elevenLabsVoiceId?: string;
  elevenLabsAgentId?: string;
  elevenLabsApiKey?: string;
  openAiVoiceId?: string;
  customRefineInstructions?: string;
  premiumCustomVoices?: boolean;
  premiumContextAnimations?: boolean;
  /** Increment when the schema changes to trigger migration */
  schemaVersion?: number;
}

export interface Message {
  id: string;
  role: 'user' | 'model';
  text: string;
  isSummarized?: boolean;
  provider?: string;
}

// ─────────────────────────────────────────────
// Settings helpers (no side effects)
// ─────────────────────────────────────────────

export const CURRENT_SCHEMA_VERSION = 1;

export const defaultSettings: AppSettings = {
  activeTextProvider: 'Google',
  activeModel: 'gemini-2.5-flash-preview-05-20',
  voiceEngine: 'Cinematic',
  premiumCustomVoices: true,
  premiumContextAnimations: true,
  schemaVersion: CURRENT_SCHEMA_VERSION,
};

export function getSettings(): AppSettings {
  try {
    const stored = localStorage.getItem('personaforge_settings');
    if (stored) {
      const parsed: AppSettings = JSON.parse(stored);
      // Schema migration: fill in any fields added after initial release
      const migrated = { ...defaultSettings, ...parsed, schemaVersion: CURRENT_SCHEMA_VERSION };
      return migrated;
    }
  } catch {
    // Corrupted storage — fall through to defaults
  }
  return { ...defaultSettings };
}

export function saveSettings(settings: AppSettings): void {
  localStorage.setItem(
    'personaforge_settings',
    JSON.stringify({ ...settings, schemaVersion: CURRENT_SCHEMA_VERSION }),
  );
}
