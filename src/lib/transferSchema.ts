export const TRANSFER_SCHEMA_VERSION = 1;

export enum ExportGameMode {
  ROLEPLAY = 'ROLEPLAY',
  SCENARIO = 'SCENARIO',
  GAME = 'GAME',
  NARRATIVE = 'NARRATIVE'
}

export interface ExportInventoryItem {
  id: string;
  name: string;
  description: string;
  quantity: number;
  type?: 'Weapon' | 'Armor' | 'Consumable' | 'Quest' | 'Misc';
  rarity?: 'Common' | 'Uncommon' | 'Rare' | 'Epic' | 'Legendary';
  value?: string;
  imageUrl?: string;
  imageBase64?: string;
  acquiredAt?: number;
}

export interface ExportPlayerProfile {
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
  currentHP?: number;
  maxHP?: number;
  level?: number;
  xp?: number;
  playerClass?: string;
  playerRace?: string;
}

export interface ExportVoiceSettings {
  pitch: string;
  speed: string;
  accent: string;
}

export interface ExportAdditionalCharacter {
  id: string;
  name: string;
  description: string;
  personality?: string;
  appearance?: string;
  avatarBase64?: string;
  avatarImageBase64?: string;
}

export interface ExportCharacterProfile {
  mode?: ExportGameMode;
  name: string;
  personality: string;
  backstory: string;
  appearance: string;
  clothing?: string;
  accessories?: string;
  hairStyle?: string;
  hairColor?: string;
  eyeColor?: string;
  voiceName?: string;
  voiceSettings?: ExportVoiceSettings;
  traits?: Record<string, number>;
  storyTone?: string;
  relationship?: string;
  playerProfile?: ExportPlayerProfile;
  inventory?: ExportInventoryItem[];
  additionalCharacters?: ExportAdditionalCharacter[];
  characterFlaws?: string;
  secretMotive?: string;
  speechPattern?: string;
  likesAndDislikes?: string;
  coreBeliefs?: string;
  quirks?: string;
  worldAtmosphere?: string;
  keyLocations?: string;
  scenarioStakes?: string;
  scenarioConflict?: string;
  timePeriod?: string;
  factions?: string;
  magicOrTechnologyLevel?: string;
  incitingIncident?: string;
  gameSystem?: string;
  questObjective?: string;
  dungeonMasterStyle?: string;
  rulesComplexity?: string;
  difficultyLevel?: string;
  partyComposition?: string;
  startingEquipment?: string;
  currentCampaignArc?: string;
  currentMood?: string;
  avatarPrompt?: string;
  avatarImageBase64?: string;
  keyCharacters?: string[];
  currentPlot?: string;
  genre?: string;
  premise?: string;
  themes?: string[];
  suggestedPlayerName?: string;
  suggestedPlayerDescription?: string;
}

export interface ExportMessage {
  id: string;
  role?: 'user' | 'model';
  isFromUser?: boolean;
  text: string;
  isOoc?: boolean;
  timestamp?: number;
  versions?: string[];
  activeVersionIndex?: number;
  isPinned?: boolean;
  isSummarized?: boolean;
  alternatives?: string[];
  currentAlternativeIndex?: number;
}

export interface ExportCodexEntry {
  id: string;
  type: string;
  title?: string;
  name?: string;
  description: string;
  content?: string;
  category?: 'Lore' | 'Mechanics' | 'Location' | 'Item';
  imageUrl?: string;
  imageBase64?: string;
  firstMentionedMessageId?: string;
  affinity?: number;
  discoveredAt?: number;
}

export interface ExportScenario {
  id: string;
  userId?: string;
  name: string;
  mode?: ExportGameMode;
  characterProfile: ExportCharacterProfile;
  playerCharacterName?: string;
  playerCharacterDescription?: string;
  parentScenarioId?: string;
  createdAt?: number;
  lastUpdated?: number;
  avatarBase64?: string;
  avatarImageBase64?: string;
}

export interface PersonaForgeStoryExport {
  schemaVersion: number;
  exportedAt: number;
  sourceApp: 'web' | 'android';
  sourceVersion?: string;
  scenario: ExportScenario;
  messages: ExportMessage[];
  codex: ExportCodexEntry[];
  inventory: ExportInventoryItem[];
  summary?: string;
}

export function createExport(
  sourceApp: 'web' | 'android',
  scenario: ExportScenario,
  messages: ExportMessage[],
  codex: ExportCodexEntry[],
  inventory: ExportInventoryItem[],
  summary?: string
): PersonaForgeStoryExport {
  return {
    schemaVersion: TRANSFER_SCHEMA_VERSION,
    exportedAt: Date.now(),
    sourceApp,
    scenario,
    messages,
    codex,
    inventory,
    summary
  };
}

export function validateExport(data: unknown): data is PersonaForgeStoryExport {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  return (
    typeof d.schemaVersion === 'number' &&
    typeof d.exportedAt === 'number' &&
    (d.sourceApp === 'web' || d.sourceApp === 'android') &&
    typeof d.scenario === 'object' &&
    d.scenario !== null &&
    Array.isArray(d.messages) &&
    Array.isArray(d.codex) &&
    Array.isArray(d.inventory)
  );
}