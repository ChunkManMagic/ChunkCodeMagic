import Dexie, { type Table } from 'dexie';

// Define the interface for Character and Scenario data models
export interface Character {
  id?: string;
  name: string;
  detailedProfile: string;
  idea: string;
  updatedAt: number;
}

export interface Scenario {
  id?: string;
  title: string;
  content: string;
  vibeTags: string[];
  updatedAt: number;
}

// Initialize the Dexie Database
class PersonaForgeDatabase extends Dexie {
  characters!: Table<Character>;
  scenarios!: Table<Scenario>;

  constructor() {
    super('PersonaForgeDatabase');
    
    // Define the schema and versioning for safe reactive data management
    this.version(1).stores({
      characters: 'id, name, updatedAt',
      scenarios: 'id, title, *vibeTags, updatedAt'
    });
  }
}

export const db = new PersonaForgeDatabase();

/**
 * Custom Dexie hook example demonstrating safe reactive state bindings
 * and main-thread non-blocking storage writes.
 */
export function useDexieStorage() {
  const saveCharacter = async (character: Character) => {
    return await db.transaction('rw', db.characters, async () => {
      character.updatedAt = Date.now();
      await db.characters.put(character);
    });
  };

  const saveScenario = async (scenario: Scenario) => {
    return await db.transaction('rw', db.scenarios, async () => {
      scenario.updatedAt = Date.now();
      await db.scenarios.put(scenario);
    });
  };

  return {
    saveCharacter,
    saveScenario
  };
}
