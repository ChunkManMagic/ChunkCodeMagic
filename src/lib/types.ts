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

export interface AppSettings {
  activeTextProvider: 'Google' | 'OpenRouter';
  activeModel: string;
  openRouterApiKey?: string;
  openRouterModel?: string;
  openRouterModels?: OpenRouterModel[];
  voiceEngine: 'Cinematic' | 'Fast Browser';
  activeTTSModel: string;
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
  activeModel: 'gemini-flash-latest',
  openRouterModel: 'meta-llama/llama-3-8b-instruct:free',
  voiceEngine: 'Cinematic',
  activeTTSModel: 'gemini-flash-latest',
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
