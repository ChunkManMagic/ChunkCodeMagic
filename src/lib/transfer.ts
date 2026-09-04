import {
  ExportGameMode,
  ExportScenario,
  ExportCharacterProfile,
  ExportMessage,
  ExportCodexEntry,
  ExportInventoryItem,
  ExportPlayerProfile,
  ExportAdditionalCharacter,
  PersonaForgeStoryExport,
  createExport,
  validateExport,
  TRANSFER_SCHEMA_VERSION
} from './transferSchema';
export type { PersonaForgeStoryExport } from './transferSchema';
import {
  AppMode,
  Scenario,
  CharacterProfile,
  Message,
  CodexEntry,
  InventoryItem,
  PlayerProfile,
  AdditionalCharacter
} from './types';

function toExportGameMode(mode: AppMode): ExportGameMode {
  switch (mode) {
    case AppMode.ROLEPLAY: return ExportGameMode.ROLEPLAY;
    case AppMode.SCENARIO: return ExportGameMode.SCENARIO;
    case AppMode.GAME: return ExportGameMode.GAME;
    case AppMode.NARRATIVE: return ExportGameMode.NARRATIVE;
  }
}

function fromExportGameMode(mode?: ExportGameMode): AppMode {
  if (!mode) return AppMode.ROLEPLAY;
  switch (mode) {
    case ExportGameMode.ROLEPLAY: return AppMode.ROLEPLAY;
    case ExportGameMode.SCENARIO: return AppMode.SCENARIO;
    case ExportGameMode.GAME: return AppMode.GAME;
    case ExportGameMode.NARRATIVE: return AppMode.NARRATIVE;
    default: return AppMode.ROLEPLAY;
  }
}

function toExportCharacterProfile(profile: CharacterProfile): ExportCharacterProfile {
  const traitsRecord: Record<string, number> = {};
  if (profile.traits) {
    Object.entries(profile.traits).forEach(([k, v]) => {
      if (typeof v === 'number') traitsRecord[k] = v;
    });
  }
  
  return {
    mode: toExportGameMode(profile.mode),
    name: profile.name,
    personality: profile.personality,
    backstory: profile.backstory,
    appearance: profile.appearance,
    clothing: profile.clothing,
    accessories: profile.accessories,
    hairStyle: profile.hairStyle,
    hairColor: profile.hairColor,
    eyeColor: profile.eyeColor,
    voiceName: profile.voiceName,
    voiceSettings: profile.voiceSettings ? {
      pitch: profile.voiceSettings.pitch,
      speed: profile.voiceSettings.speed,
      accent: profile.voiceSettings.accent
    } : undefined,
    traits: traitsRecord,
    storyTone: profile.storyTone,
    relationship: profile.relationship,
    playerProfile: profile.playerProfile ? toExportPlayerProfile(profile.playerProfile) : undefined,
    inventory: profile.inventory?.map(toExportInventoryItem),
    additionalCharacters: profile.additionalCharacters?.map(toExportAdditionalCharacter),
    characterFlaws: profile.characterFlaws,
    secretMotive: profile.secretMotive,
    speechPattern: profile.speechPattern,
    likesAndDislikes: profile.likesAndDislikes,
    coreBeliefs: profile.coreBeliefs,
    quirks: profile.quirks,
    worldAtmosphere: profile.worldAtmosphere,
    keyLocations: profile.keyLocations,
    scenarioStakes: profile.scenarioStakes,
    scenarioConflict: profile.scenarioConflict,
    timePeriod: profile.timePeriod,
    factions: profile.factions,
    magicOrTechnologyLevel: profile.magicOrTechnologyLevel,
    incitingIncident: profile.incitingIncident,
    gameSystem: profile.gameSystem,
    questObjective: profile.questObjective,
    dungeonMasterStyle: profile.dungeonMasterStyle,
    rulesComplexity: profile.rulesComplexity,
    difficultyLevel: profile.difficultyLevel,
    partyComposition: profile.partyComposition,
    startingEquipment: profile.startingEquipment,
    currentCampaignArc: profile.currentCampaignArc,
    currentMood: profile.currentMood,
    worldSetting: profile.worldSetting,
    flaws: profile.flaws,
    keyCharacters: profile.keyCharacters,
    currentPlot: profile.currentPlot,
    genre: profile.genre,
    premise: profile.premise,
    themes: profile.themes,
    suggestedPlayerName: profile.suggestedPlayerName,
    suggestedPlayerDescription: profile.suggestedPlayerDescription
  };
}

function toExportPlayerProfile(profile: PlayerProfile): ExportPlayerProfile {
  return {
    name: profile.name,
    description: profile.description,
    personality: profile.personality,
    backstory: profile.backstory,
    appearance: profile.appearance,
    clothing: profile.clothing,
    accessories: profile.accessories,
    hairStyle: profile.hairStyle,
    hairColor: profile.hairColor,
    eyeColor: profile.eyeColor,
    currentHP: profile.currentHP,
    maxHP: profile.maxHP,
    level: profile.level,
    xp: profile.xp,
    playerClass: profile.playerClass,
    playerRace: profile.playerRace
  };
}

function toExportAdditionalCharacter(char: AdditionalCharacter): ExportAdditionalCharacter {
  return {
    id: char.id,
    name: char.name,
    description: char.description,
    personality: char.personality,
    appearance: char.appearance,
    avatarBase64: char.avatarBase64
  };
}

function toExportInventoryItem(item: InventoryItem): ExportInventoryItem {
  return {
    id: item.id,
    name: item.name,
    description: item.description,
    quantity: item.quantity,
    type: item.type,
    rarity: item.rarity,
    value: item.value,
    imageUrl: item.imageUrl,
    imageBase64: undefined
  };
}

function toExportMessage(msg: Message): ExportMessage {
  return {
    id: msg.id,
    role: msg.role,
    text: msg.text,
    isSummarized: msg.isSummarized,
    timestamp: msg.timestamp,
    versions: msg.versions,
    activeVersionIndex: msg.activeVersionIndex,
    isPinned: msg.isPinned
  };
}

function toExportCodexEntry(entry: CodexEntry): ExportCodexEntry {
  return {
    id: entry.id,
    type: entry.category,
    title: entry.title,
    name: entry.title,
    description: entry.content,
    content: entry.content,
    category: entry.category,
    imageUrl: entry.imageUrl,
    imageBase64: undefined
  };
}

function toExportScenario(scenario: Scenario): ExportScenario {
  return {
    id: scenario.id,
    name: scenario.profile.name,
    mode: toExportGameMode(scenario.profile.mode),
    characterProfile: toExportCharacterProfile(scenario.profile),
    createdAt: scenario.lastUpdated,
    lastUpdated: scenario.lastUpdated,
    avatarBase64: scenario.avatarBase64,
    avatarImageBase64: scenario.avatarBase64
  };
}

export function exportStory(
  scenario: Scenario,
  messages: Message[],
  codex: CodexEntry[],
  inventory: InventoryItem[],
  summary?: string
): PersonaForgeStoryExport {
  return createExport(
    'web',
    toExportScenario(scenario),
    messages.map(toExportMessage),
    codex.map(toExportCodexEntry),
    inventory.map(toExportInventoryItem),
    summary
  );
}

function fromExportCharacterProfile(exported: ExportCharacterProfile): CharacterProfile {
  const traits: Record<string, number | undefined> = {};
  if (exported.traits) {
    Object.entries(exported.traits).forEach(([k, v]) => {
      traits[k] = v;
    });
  }
  
  return {
    mode: fromExportGameMode(exported.mode),
    name: exported.name,
    personality: exported.personality,
    backstory: exported.backstory,
    appearance: exported.appearance,
    clothing: exported.clothing,
    accessories: exported.accessories,
    hairStyle: exported.hairStyle,
    hairColor: exported.hairColor,
    eyeColor: exported.eyeColor,
    voiceName: exported.voiceName || 'en-US-Standard-A',
    voiceSettings: exported.voiceSettings ? {
      pitch: exported.voiceSettings.pitch || '0',
      speed: exported.voiceSettings.speed || '1.0',
      accent: exported.voiceSettings.accent || 'none'
    } : { pitch: '0', speed: '1.0', accent: 'none' },
    traits,
    storyTone: exported.storyTone || '',
    relationship: exported.relationship || '',
    playerProfile: exported.playerProfile ? fromExportPlayerProfile(exported.playerProfile) : { name: '', description: '' },
    inventory: exported.inventory?.map(fromExportInventoryItem),
    additionalCharacters: exported.additionalCharacters?.map(fromExportAdditionalCharacter),
    characterFlaws: exported.characterFlaws,
    secretMotive: exported.secretMotive,
    speechPattern: exported.speechPattern,
    likesAndDislikes: exported.likesAndDislikes,
    coreBeliefs: exported.coreBeliefs,
    quirks: Array.isArray(exported.quirks) ? exported.quirks.join(', ') : exported.quirks,
    worldAtmosphere: exported.worldAtmosphere,
    keyLocations: exported.keyLocations,
    scenarioStakes: exported.scenarioStakes,
    scenarioConflict: exported.scenarioConflict,
    timePeriod: exported.timePeriod,
    factions: exported.factions,
    magicOrTechnologyLevel: exported.magicOrTechnologyLevel,
    incitingIncident: exported.incitingIncident,
    gameSystem: exported.gameSystem,
    questObjective: exported.questObjective,
    dungeonMasterStyle: exported.dungeonMasterStyle,
    rulesComplexity: exported.rulesComplexity,
    difficultyLevel: exported.difficultyLevel,
    partyComposition: exported.partyComposition,
    startingEquipment: exported.startingEquipment,
    currentCampaignArc: exported.currentCampaignArc,
    currentMood: exported.currentMood,
    worldSetting: exported.worldSetting,
    flaws: typeof exported.flaws === 'string' ? exported.flaws : Array.isArray(exported.flaws) ? exported.flaws.join(', ') : undefined,
    keyCharacters: exported.keyCharacters,
    currentPlot: exported.currentPlot,
    genre: exported.genre,
    premise: exported.premise,
    themes: exported.themes,
    suggestedPlayerName: exported.suggestedPlayerName,
    suggestedPlayerDescription: exported.suggestedPlayerDescription
  };
}

function fromExportPlayerProfile(exported: ExportPlayerProfile): PlayerProfile {
  return {
    name: exported.name,
    description: exported.description,
    personality: exported.personality,
    backstory: exported.backstory,
    appearance: exported.appearance,
    clothing: exported.clothing,
    accessories: exported.accessories,
    hairStyle: exported.hairStyle,
    hairColor: exported.hairColor,
    eyeColor: exported.eyeColor,
    currentHP: exported.currentHP,
    maxHP: exported.maxHP,
    level: exported.level,
    xp: exported.xp,
    playerClass: exported.playerClass,
    playerRace: exported.playerRace
  };
}

function fromExportAdditionalCharacter(exported: ExportAdditionalCharacter): AdditionalCharacter {
  return {
    id: exported.id,
    name: exported.name,
    description: exported.description,
    personality: exported.personality,
    appearance: exported.appearance,
    avatarBase64: exported.avatarBase64 || exported.avatarImageBase64
  };
}

function fromExportInventoryItem(exported: ExportInventoryItem): InventoryItem {
  return {
    id: exported.id,
    name: exported.name,
    description: exported.description,
    quantity: exported.quantity,
    type: exported.type || 'Misc',
    rarity: exported.rarity || 'Common',
    value: exported.value,
    imageUrl: exported.imageUrl || exported.imageBase64
  };
}

function fromExportMessage(exported: ExportMessage): Message {
  return {
    id: exported.id,
    role: exported.role || (exported.isFromUser ? 'user' : 'model'),
    text: exported.text,
    isSummarized: exported.isSummarized,
    timestamp: exported.timestamp || Date.now(),
    versions: exported.versions,
    activeVersionIndex: exported.activeVersionIndex,
    isPinned: exported.isPinned
  };
}

function fromExportCodexEntry(exported: ExportCodexEntry): CodexEntry {
  return {
    id: exported.id,
    title: exported.title || exported.name || '',
    content: exported.description || exported.content || '',
    category: (exported.category || exported.type) as CodexEntry['category'] || 'Lore',
    imageUrl: exported.imageUrl || exported.imageBase64
  };
}

function fromExportScenario(exported: ExportScenario): Scenario {
  return {
    id: exported.id,
    profile: fromExportCharacterProfile(exported.characterProfile),
    avatarBase64: exported.avatarBase64 || exported.avatarImageBase64 || '',
    lastUpdated: exported.lastUpdated || exported.createdAt || Date.now()
  };
}

export function importStory(exportData: PersonaForgeStoryExport): {
  scenario: Scenario;
  messages: Message[];
  codex: CodexEntry[];
  inventory: InventoryItem[];
  summary?: string;
} | null {
  if (!validateExport(exportData)) {
    console.error('Invalid export data');
    return null;
  }
  
  if (exportData.schemaVersion !== TRANSFER_SCHEMA_VERSION) {
    console.warn(`Schema version mismatch: expected ${TRANSFER_SCHEMA_VERSION}, got ${exportData.schemaVersion}`);
  }
  
  return {
    scenario: fromExportScenario(exportData.scenario),
    messages: exportData.messages.map(fromExportMessage),
    codex: exportData.codex.map(fromExportCodexEntry),
    inventory: exportData.inventory.map(fromExportInventoryItem),
    summary: exportData.summary
  };
}

export function downloadExport(exportData: PersonaForgeStoryExport, filename?: string): void {
  const json = JSON.stringify(exportData, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || `personaforge-story-${Date.now()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function readExportFile(file: File): Promise<PersonaForgeStoryExport | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const json = JSON.parse(e.target?.result as string);
        if (validateExport(json)) {
          resolve(json);
        } else {
          console.error('Invalid export file format');
          resolve(null);
        }
      } catch (err) {
        console.error('Failed to parse export file', err);
        resolve(null);
      }
    };
    reader.onerror = () => resolve(null);
    reader.readAsText(file);
  });
}