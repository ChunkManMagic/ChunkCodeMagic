import { exportStory, importStory } from '../src/lib/transfer';
import { AppMode } from '../src/lib/types';
import type { Scenario, CharacterProfile, Message, CodexEntry, InventoryItem } from '../src/lib/types';

const profile: CharacterProfile = {
  mode: AppMode.SCENARIO,
  name: 'Morgan the Grey',
  personality: 'Cynical but warm-hearted wanderer.',
  backstory: 'A former soldier haunted by the war.',
  appearance: 'Tall, silver-haired, grey cloak.',
  clothing: 'Worn travelling cloak',
  accessories: 'Silver compass',
  hairStyle: 'Long',
  hairColor: 'Silver',
  eyeColor: 'Grey',
  voiceName: 'en-US-Standard-A',
  voiceSettings: { pitch: '0', speed: '1.0', accent: 'none' },
  traits: { friendliness: 50, danger: 65 },
  storyTone: 'Grim fantasy',
  relationship: 'Player is a refugee Morgan protects.',
  playerProfile: { name: 'Rin', description: 'Young refugee' },
  inventory: [
    { id: 'i1', name: 'Old Map', description: 'Torn map', quantity: 1, type: 'Quest', rarity: 'Common' }
  ],
  additionalCharacters: [
    { id: 'c1', name: 'Seraph', description: 'A strange glowing bird', personality: 'Curious', appearance: 'Blue flame', avatarBase64: 'ZmFrZQ==' }
  ],
  worldAtmosphere: 'Ash-choked valleys',
  currentMood: 'Weary'
};

const scenario: Scenario = {
  id: 'scenario-1',
  profile,
  avatarBase64: 'ZmFrZUF2YXRhcg==',
  lastUpdated: Date.now()
};

const messages: Message[] = [
  { id: 'm1', role: 'user', text: 'We should hide in the ruins.', timestamp: 1 },
  { id: 'm2', role: 'model', text: 'The ruins groan above us.', timestamp: 2, isPinned: true }
];

const codex: CodexEntry[] = [
  { id: 'k1', title: 'The Grey Waste', content: 'A haunted plain.', category: 'Location', imageUrl: 'https://picsum.photos/seed/1/512/512' }
];

const inventory: InventoryItem[] = [
  { id: 'inv1', name: 'Ration', description: 'Dried meat', quantity: 3, type: 'Consumable', rarity: 'Common' }
];

const exported = exportStory(scenario, messages, codex, inventory, 'A grim journey.');
const json = JSON.stringify(exported);
console.log('--- EXPORTED JSON (first 600 chars) ---');
console.log(json.slice(0, 600));
console.log('schemaVersion:', exported.schemaVersion, 'sourceApp:', exported.sourceApp);

const imported = importStory(JSON.parse(json));
if (!imported) {
  console.error('FAIL: importStory returned null');
  process.exit(1);
}
console.log('--- ROUND TRIP CHECK ---');
console.log('name:', imported.scenario.profile.name);
console.log('mode:', imported.scenario.profile.mode);
console.log('avatarBase64:', imported.scenario.avatarBase64);
console.log('personality:', imported.scenario.profile.personality);
console.log('traits:', JSON.stringify(imported.scenario.profile.traits));
console.log('messages:', imported.messages.length);
console.log('msg2 text:', imported.messages[1]?.text, '| pinned:', imported.messages[1]?.isPinned);
console.log('codex:', imported.codex.length, imported.codex[0]?.title, imported.codex[0]?.imageUrl);
console.log('inventory:', imported.inventory.length, imported.inventory[0]?.name, 'qty', imported.inventory[0]?.quantity);
console.log('summary:', imported.summary);

const ok =
  imported.scenario.profile.name === 'Morgan the Grey' &&
  imported.scenario.profile.mode === AppMode.SCENARIO &&
  imported.scenario.avatarBase64 === 'ZmFrZUF2YXRhcg==' &&
  imported.messages.length === 2 &&
  imported.messages[1].isPinned === true &&
  imported.codex.length === 1 &&
  imported.inventory[0]?.quantity === 3 &&
  imported.summary === 'A grim journey.';

if (ok) {
  console.log('PASS: web round-trip OK');
} else {
  console.error('FAIL: web round-trip mismatch');
  process.exit(1);
}