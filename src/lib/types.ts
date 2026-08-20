export enum AppMode {
  SCENARIO = 'Scenario',
  ROLEPLAY = 'Roleplay',
  GAME = 'Game'
}

export interface InventoryItem {
  id: string;
  name: string;
  description: string;
  quantity: number;
  type: 'Weapon' | 'Armor' | 'Consumable' | 'Quest' | 'Misc';
  rarity?: 'Common' | 'Uncommon' | 'Rare' | 'Epic' | 'Legendary';
  value?: string;
  imageUrl?: string;
}

export interface PlayerProfile {
  name: string;
  description: string;
  personality?: string;
  backstory?: string;
  appearance?: string;
  clothing?: string;
  accessories?: string;
  hairStyle?: string;
  hairColor?: string;
  eyeColor?: string;
  // GAME MODE tracking (optional — only populated in Game mode sessions)
  currentHP?: number;
  maxHP?: number;
  level?: number;
  xp?: number;
  playerClass?: string;
  playerRace?: string;
}

export interface VoiceSettings {
  pitch: string;
  speed: string;
  accent: string;
}

export interface AdditionalCharacter {
  id: string;
  name: string;
  description: string;
  personality?: string;
  appearance?: string;
  avatarBase64?: string;
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
  playerProfile: PlayerProfile;
  inventory?: InventoryItem[];
  additionalCharacters?: AdditionalCharacter[];
  // ROLEPLAY MODE
  characterFlaws?: string;
  secretMotive?: string;
  speechPattern?: string;
  likesAndDislikes?: string;
  coreBeliefs?: string;
  quirks?: string;

  // SCENARIO MODE
  worldAtmosphere?: string;
  keyLocations?: string;
  scenarioStakes?: string;
  scenarioConflict?: string;
  timePeriod?: string;
  factions?: string;
  magicOrTechnologyLevel?: string;
  incitingIncident?: string;

  // GAME MODE
  gameSystem?: string;
  questObjective?: string;
  dungeonMasterStyle?: string;
  rulesComplexity?: string;
  difficultyLevel?: string;
  partyComposition?: string;
  startingEquipment?: string;
  currentCampaignArc?: string;

  // DYNAMIC STATE
  currentMood?: string;
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
  imageUrl?: string;
}

export interface OpenRouterModel {
  id: string;
  name: string;
  description?: string;
  pricing?: {
    prompt: string;
    completion: string;
  };
  context_length?: number;
}

export type ThemeAccent = 'emerald' | 'amethyst' | 'cyan' | 'crimson' | 'amber' | 'slate';
export type FontFamilyOption = 'sans' | 'serif' | 'mono';
export type ChatDensityOption = 'compact' | 'comfy' | 'cinematic';

export interface AppSettings {
  activeTextProvider: 'Google' | 'OpenRouter';
  activeModel: string;
  openRouterApiKey?: string;
  openRouterModel?: string;
  openRouterModels?: OpenRouterModel[];
  voiceEngine: 'Cinematic' | 'Fast Browser';
  activeTTSModel: string;
  liveVoiceModel: string;
  liveVoiceName: string;
  liveVoiceTemperature?: number;
  liveVoiceMicDeviceId?: string;
  liveVoiceOutputDeviceId?: string;
  liveVoiceOutputVolume?: number;
  themeAccent?: ThemeAccent;
  fontFamily?: FontFamilyOption;
  chatDensity?: ChatDensityOption;
  enableAmbientGlow?: boolean;
  customRefineInstructions?: string;
  premiumCustomVoices?: boolean;
  premiumContextAnimations?: boolean;
  premiumAutoAvatar?: boolean;
  schemaVersion?: number;
}

export interface Message {
  id: string;
  role: 'user' | 'model';
  text: string;
  isSummarized?: boolean;
  timestamp?: number;
  versions?: string[]; // Multiple drafts for this message
  activeVersionIndex?: number;
  isPinned?: boolean;
}

declare global {
  interface Window {
    aistudio?: {
      hasSelectedApiKey: () => Promise<boolean>;
      openSelectKey: () => Promise<void>;
    };
  }
}

export const CURRENT_SCHEMA_VERSION = 1;

export const defaultSettings: AppSettings = {
  activeTextProvider: 'Google',
  activeModel: 'gemini-3.6-flash',
  openRouterModel: 'meta-llama/llama-3-8b-instruct:free',
  voiceEngine: 'Cinematic',
  activeTTSModel: 'gemini-3.1-flash-tts-preview',
  liveVoiceModel: 'gemini-3.1-flash-live-preview',
  liveVoiceName: 'Kore',
  liveVoiceTemperature: 1.0,
  liveVoiceOutputVolume: 1,
  themeAccent: 'emerald',
  fontFamily: 'sans',
  chatDensity: 'comfy',
  enableAmbientGlow: true,
  premiumCustomVoices: true,
  premiumContextAnimations: true,
  premiumAutoAvatar: true,
  schemaVersion: CURRENT_SCHEMA_VERSION
};

export function getSettings(): AppSettings {
  try {
    const stored = localStorage.getItem('personaforge_settings');
    if (stored) {
      const parsed = JSON.parse(stored);
      // Migrate deprecated and legacy models to modern Google models
      if (
        !parsed.activeModel ||
        parsed.activeModel === 'gemini-3.5-flash' || 
        parsed.activeModel === 'gemini-1.5-flash' || 
        parsed.activeModel === 'gemini-2.0-flash-exp' ||
        parsed.activeModel === 'gemini-2.5-flash' ||
        parsed.activeModel === 'gemini-2.5-flash-lite'
      ) {
        parsed.activeModel = 'gemini-3.6-flash';
      } else if (parsed.activeModel === 'gemini-pro-latest' || parsed.activeModel === 'gemini-1.5-pro' || parsed.activeModel === 'gemini-2.5-pro') {
        parsed.activeModel = 'gemini-3.1-pro-preview';
      }
      
      if (
        !parsed.activeTTSModel ||
        parsed.activeTTSModel === 'gemini-3.5-flash' ||
        parsed.activeTTSModel === 'gemini-1.5-flash'
      ) {
        parsed.activeTTSModel = 'gemini-3.1-flash-tts-preview';
      } else if (parsed.activeTTSModel === 'gemini-1.5-pro' || parsed.activeTTSModel === 'gemini-pro-latest') {
        parsed.activeTTSModel = 'gemini-3.1-pro-preview';
      }
      if (!parsed.liveVoiceModel) {
        parsed.liveVoiceModel = 'gemini-3.1-flash-live-preview';
      }
      if (!parsed.liveVoiceName) {
        parsed.liveVoiceName = 'Kore';
      }
      if (parsed.liveVoiceTemperature === undefined) {
        parsed.liveVoiceTemperature = 1.0;
      }
      if (parsed.liveVoiceOutputVolume === undefined) {
        parsed.liveVoiceOutputVolume = 1;
      }
      if (!parsed.themeAccent) {
        parsed.themeAccent = 'emerald';
      }
      if (!parsed.fontFamily) {
        parsed.fontFamily = 'sans';
      }
      if (!parsed.chatDensity) {
        parsed.chatDensity = 'comfy';
      }
      if (parsed.enableAmbientGlow === undefined) {
        parsed.enableAmbientGlow = true;
      }
      return { ...defaultSettings, ...parsed };
    }
  } catch (e) {
    console.error('Failed to load settings', e);
  }
  return defaultSettings;
}

export function saveSettings(settings: AppSettings): void {
  try {
    localStorage.setItem('personaforge_settings', JSON.stringify({ ...settings, schemaVersion: CURRENT_SCHEMA_VERSION }));
  } catch (e) {
    console.error('Failed to save settings', e);
  }
}
