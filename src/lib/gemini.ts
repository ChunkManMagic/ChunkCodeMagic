import { GoogleGenAI, Type } from "@google/genai";
import { CharacterProfile, CodexEntry, InventoryItem, AppMode, VoiceSettings } from "./types";
import { compressImage } from "./utils";

export { AppMode };
export type { CharacterProfile, CodexEntry, InventoryItem, VoiceSettings };

/**
 * WARNING: The API key is exposed in the client bundle when using VITE_ prefixed keys.
 * For production, use a backend proxy to keep keys secure.
 */
export function getGenAI() {
  const apiKey = process.env.GEMINI_API_KEY || (import.meta as any).env.VITE_GEMINI_API_KEY;
  if (!apiKey) {
    console.error("Gemini API key is missing!");
    throw new Error("Gemini API key is missing. Please check your environment configuration.");
  }
  return new GoogleGenAI({ apiKey });
}

export function generateId(): string {
  try {
    return crypto.randomUUID();
  } catch (e) {
    return `id-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

async function withRetry<T>(fn: () => Promise<T>, retries = 2, delay = 2000): Promise<T> {
  try {
    return await fn();
  } catch (error: any) {
    const errorMessage = error?.message || String(error);
    const status = error?.status || error?.code;
    
    if (errorMessage.includes('API key not valid')) {
      throw new Error("Invalid Gemini API Key. Please check your settings.");
    }
    
    if (status === 403 || errorMessage.includes('PERMISSION_DENIED') || errorMessage.includes('403')) {
      throw new Error("Permission Denied: The current model may not be available with the default key. Try switching to a 'Stable' model in Settings.");
    }

    if (errorMessage.includes('User location is not supported')) {
      throw new Error("Gemini is not available in your current location.");
    }

    if (retries > 0 && (status === 429 || status === 500 || errorMessage.includes('429') || errorMessage.includes('500') || errorMessage.includes('quota') || errorMessage.includes('limit'))) {
      const waitTime = delay + Math.random() * 2000;
      console.warn(`Transient error hit (status ${status}), retrying in ${Math.round(waitTime)}ms... (${retries} retries left)`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      return withRetry(fn, retries - 1, delay * 2.5);
    }
    
    throw error;
  }
}

function buildPlayerBlock(profile: CharacterProfile): string {
  const inventoryBlock = profile.inventory?.length
    ? `\nPLAYER INVENTORY:\n${profile.inventory.map(i => `- ${i.name} (${i.type}${i.rarity ? `, ${i.rarity}` : ''}): ${i.description} [Qty: ${i.quantity}]`).join('\n')}\n`
    : '';

  const pp = profile.playerProfile;
  return `\nPLAYER CHARACTER:
Name: ${pp?.name || 'The Protagonist'}
Description: ${pp?.description || 'A mysterious traveler'}
Personality: ${pp?.personality || 'Unknown'}
Backstory: ${pp?.backstory || 'Unknown'}
Appearance: ${pp?.appearance || 'Unknown'}
Clothing: ${pp?.clothing || 'Unknown'}
Accessories: ${pp?.accessories || 'None'}
Hair: ${pp?.hairStyle || 'Unknown'} ${pp?.hairColor || ''}
Eyes: ${pp?.eyeColor || 'Unknown'}
${profile.mode === AppMode.GAME ? `Class: ${pp?.playerClass || 'Unknown'}\nRace: ${pp?.playerRace || 'Unknown'}\nHP: ${pp?.currentHP ?? '?'}/${pp?.maxHP ?? '?'}\nLevel: ${pp?.level ?? 1}\nXP: ${pp?.xp ?? 0}` : ''}
${inventoryBlock}`;
}

function buildSystemInstruction(profile: CharacterProfile, codexEntries: CodexEntry[], currentSummary: string, customInstructions?: string): string {
  const codexContext = codexEntries.length > 0
    ? `\nWORLD CODEX (Lore & Rules):\n${codexEntries.map(e => `[${e.category}: ${e.title}] - ${e.content}`).join('\n')}\n`
    : '';

  const summaryContext = currentSummary ? `\nSTORY SUMMARY SO FAR:\n${currentSummary}\n` : '';

  const additionalChars = profile.additionalCharacters?.length 
    ? `\nADDITIONAL CHARACTERS / NPCs:\n${profile.additionalCharacters.map(c => `- ${c.name} (${c.description}): ${c.personality || ''} ${c.appearance || ''}`).join('\n')}\n`
    : '';

  const playerBlock = buildPlayerBlock(profile);

  const styleInstruction = customInstructions
    ? `\nCUSTOM WRITING STYLE INSTRUCTIONS (Follow these strictly):\n${customInstructions}\n`
    : '';

  if (profile.mode === AppMode.ROLEPLAY) {
    const t = profile.traits;
    const traitDirectives = [
      t.friendliness !== undefined ? `- Friendliness ${t.friendliness}/100: ${t.friendliness >= 70 ? 'Be warm, approachable, and eager to help.' : t.friendliness <= 30 ? 'Be cold, guarded, and reluctant to open up.' : 'Balance warmth and reservation.'}` : '',
      t.assertiveness !== undefined ? `- Assertiveness ${t.assertiveness}/100: ${t.assertiveness >= 70 ? 'Be direct, confident, and take initiative in conversation.' : t.assertiveness <= 30 ? 'Be passive, deferential, and let the player lead.' : 'Be moderately assertive.'}` : '',
      t.empathy !== undefined ? `- Empathy ${t.empathy}/100: ${t.empathy >= 70 ? 'Show deep emotional understanding and sensitivity.' : t.empathy <= 30 ? 'Be emotionally detached and pragmatic.' : 'Show moderate emotional awareness.'}` : '',
    ].filter(Boolean).join('\n');

    return `You are playing the role of the following character. Stay in character at all times. Never break character unless responding to a [Director's Note].

CHARACTER:
Name: ${profile.name}
Personality: ${profile.personality}
Backstory: ${profile.backstory}
Appearance: ${profile.appearance}
Story Tone: ${profile.storyTone}
Relationship with player: ${profile.relationship}
${profile.currentMood ? `Current Mood: ${profile.currentMood}` : ''}

BEHAVIORAL DIRECTIVES (follow these as rules, not suggestions):
${traitDirectives}
- Character Flaws: ${profile.characterFlaws || 'None specified'} — Let these flaws actively surface in your responses.
- Secret Motive: ${profile.secretMotive || 'None specified'} — Never reveal this directly; let it subtly color your decisions.
- Speech Pattern: ${profile.speechPattern || 'Natural'} — Maintain this speech style consistently.
- Likes / Dislikes: ${profile.likesAndDislikes || 'Not specified'} — React authentically when these are relevant.
- Core Beliefs: ${profile.coreBeliefs || 'Not specified'} — These are lines you will not cross.
- Quirks: ${profile.quirks || 'None'} — Express these organically.
${playerBlock}${additionalChars}
${codexContext}${summaryContext}
${styleInstruction}
If the player provides a [Director's Note: ...], use it to guide your next response. If the note asks a direct question or requires an out-of-character (OOC) reply, wrap your OOC response in <ooc></ooc> tags at the very end. The rest of your response must remain strictly in-character.

IMPORTANT: You MUST start every single response with your character's current mood in brackets, like this: [MOOD: Happy] or [MOOD: Suspicious]. Then, write your response.`;
  }

  if (profile.mode === AppMode.SCENARIO) {
    const t = profile.traits;
    const dangerLevel = t.danger ?? 50;
    const mysteryLevel = t.mystery ?? 50;
    const supernaturalLevel = t.supernatural ?? 50;

    const traitDirectives = [
      `- Danger ${dangerLevel}/100: ${dangerLevel >= 70 ? 'The world is actively hostile. Threats are real, consequences are severe, and safety is never guaranteed.' : dangerLevel <= 30 ? 'The world is relatively safe. Conflicts simmer beneath the surface but rarely erupt.' : 'Danger is present but manageable with the right choices.'}`,
      `- Mystery ${mysteryLevel}/100: ${mysteryLevel >= 70 ? 'Weave cryptic details, hidden meanings, and unanswered questions into every scene. Nothing is fully explained.' : mysteryLevel <= 30 ? 'The world is mostly legible. What you see is what you get.' : 'Include some mysteries but also provide satisfying answers.'}`,
      `- Supernatural ${supernaturalLevel}/100: ${supernaturalLevel >= 70 ? 'The supernatural is undeniably present — actively shape scenes with it.' : supernaturalLevel <= 30 ? 'The supernatural is absent or deeply suppressed.' : 'The supernatural exists at the edges, glimpsed but not confirmed.'}`,
    ].join('\n');

    return `You are the **Narrator and Story Director** of an interactive story. You are NOT a single character — you give voice to ALL NPCs, describe all environments, and control the flow of the world. The player is the protagonist; you are the world they inhabit.

WORLD:
Name / Setting: ${profile.name}
Atmosphere: ${profile.worldAtmosphere || 'Not specified'}
Key Locations: ${profile.keyLocations || 'Not specified'}
Time Period: ${profile.timePeriod || 'Not specified'}
Magic / Tech Level: ${profile.magicOrTechnologyLevel || 'Not specified'}
Factions: ${profile.factions || 'Not specified'}
Tone: ${profile.storyTone}

STORY ENGINE:
Inciting Incident: ${profile.incitingIncident || 'Not specified'} — This is the ignition point; ensure its consequences are still felt.
Scenario Stakes: ${profile.scenarioStakes || 'Not specified'} — Keep escalating toward these stakes.
Core Conflict: ${profile.scenarioConflict || 'Not specified'} — This drives every scene.

NARRATIVE DIALS (these shape how you write every response):
${traitDirectives}

NARRATOR RULES:
- Describe the environment immersively before dialogue or action.
- Give distinct voices to different NPCs. They have their own agendas.
- Let player choices have real, visible consequences on the world.
- Use the faction dynamics to create friction and opportunity.
- Do not resolve the core conflict too early — maintain tension.
- IMPORTANT: You are the narrator, NOT the player. Do not make decisions for the player character or describe their internal thoughts unless they have explicitly stated them. Wait for the player's input to advance their actions.
${playerBlock}${additionalChars}
${codexContext}${summaryContext}
${styleInstruction}
If the player provides a [Director's Note: ...], use it to redirect the narrative. Wrap any OOC reply in <ooc></ooc> tags at the very end.`;
  }

  // AppMode.GAME
  const t = profile.traits;
  const strictness = t.strictness ?? 50;
  const generosity = t.generosity ?? 50;
  const lethality = t.lethality ?? 50;

  const traitDirectives = [
    `- Strictness ${strictness}/100: ${strictness >= 70 ? 'Enforce rules rigorously. Players cannot bypass mechanics with clever wording.' : strictness <= 30 ? 'Rules are flexible. Prioritize fun and narrative flow over strict RAW enforcement.' : 'Balance fair rule enforcement with narrative flexibility.'}`,
    `- Generosity ${generosity}/100: ${generosity >= 70 ? 'Be generous with loot, information, and second chances.' : generosity <= 30 ? 'Resources are scarce. Make players earn every reward.' : 'Distribute rewards at a measured pace.'}`,
    `- Lethality ${lethality}/100: ${lethality >= 70 ? 'Death is always on the table. Mistakes have permanent consequences.' : lethality <= 30 ? 'The players are unlikely to die from normal encounters. Failures lead to setbacks, not death.' : 'Combat is dangerous but survivable with smart play.'}`,
  ].join('\n');

  return `You are the **Dungeon Master** running a tabletop RPG session. Your name is ${profile.name}. You control ALL NPCs, describe all environments, adjudicate rules, and simulate dice outcomes. The player is their character; you are everything else.

CAMPAIGN SETUP:
Game System: ${profile.gameSystem || 'Flexible / Narrative'}
Quest Objective: ${profile.questObjective || 'Not specified'}
Current Campaign Arc: ${profile.currentCampaignArc || 'Opening chapter'}
Party: ${profile.partyComposition || 'Solo adventurer'}
Starting Equipment: ${profile.startingEquipment || 'Standard adventuring gear'}
Difficulty: ${profile.difficultyLevel || 'Balanced'}
Rules Complexity: ${profile.rulesComplexity || 'Moderate'}
DM Style: ${profile.personality}
Tone: ${profile.storyTone}

DM BEHAVIOR DIALS:
${traitDirectives}

DUNGEON MASTER RULES:
- When the player attempts an action with uncertain outcome, describe the roll result narratively (e.g., "You roll a 14 — just enough to..."). Simulate dice based on the game system and difficulty.
- Track the fiction's internal logic: wounds slow characters down, resources deplete, NPCs remember past interactions.
- Give NPCs distinct personalities, motivations, and secrets. They are not just obstacles.
- Present clear decision points with meaningful consequences.
- Use the quest objective and current arc to keep the session on track without railroading.
- Reward clever play and creative thinking (adjust based on Generosity dial).
- Signal danger clearly before it becomes lethal (adjust based on Lethality dial).
- IMPORTANT: You are the DM, NOT the player. Do not make decisions for the player character or describe their internal thoughts. Wait for the player to declare their actions before resolving them.
${playerBlock}${additionalChars}
${codexContext}${summaryContext}
${styleInstruction}
If the player provides a [Director's Note: ...], use it to adjust the session. Wrap any OOC reply in <ooc></ooc> tags at the very end.`;
}

function buildHistory(messages: any[]) {
  return messages
    .filter(m => m.parts && m.parts.length > 0 && m.parts[0].text && m.parts[0].text.trim())
    .map(m => ({
      role: m.role,
      parts: m.parts
    }));
}

export async function generateAdditionalCharacter(idea: string, mode: AppMode | string): Promise<{ name: string; description: string; personality: string; appearance: string }> {
  const ai = getGenAI();
  
  const contents = `Generate a detailed NPC or additional character based on this idea: "${idea}" for a ${mode} setting.`;

  const response = await withRetry(() => ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          description: { type: Type.STRING },
          personality: { type: Type.STRING },
          appearance: { type: Type.STRING },
        },
        required: ["name", "description", "personality", "appearance"]
      }
    }
  }));

  const text = response.text;
  if (!text) throw new Error("No response from AI");
  
  return JSON.parse(text);
}

export async function generateCharacterProfile(idea: string, mode: AppMode): Promise<CharacterProfile> {
  console.log("generateCharacterProfile: Calling Gemini API...");
  const ai = getGenAI();
  
  const modeGuidance = mode === AppMode.GAME
    ? `This is a GAME (tabletop RPG) mode. The "character" being created IS the Dungeon Master persona — not a player character. Populate gameSystem, questObjective, dungeonMasterStyle, rulesComplexity, difficultyLevel, partyComposition, startingEquipment, and currentCampaignArc with rich, specific values. The DM's "personality" is their DMing style. The "backstory" is the campaign's origin. The "appearance" is how the DM presents the game world aesthetically.`
    : mode === AppMode.SCENARIO
    ? `This is a SCENARIO (interactive story) mode. The "character" is actually the world/setting personified as a narrator. Populate worldAtmosphere, keyLocations, scenarioStakes, scenarioConflict, timePeriod, factions, magicOrTechnologyLevel, and incitingIncident with vivid, specific details. The narrator's "personality" is the world's narrative voice. The "backstory" is the world's history.`
    : `This is a ROLEPLAY mode. Create a compelling single character for deep one-on-one interaction. Populate characterFlaws, secretMotive, speechPattern, likesAndDislikes, coreBeliefs, and quirks with specific, interesting values that will create memorable interactions.`;

  const contents = `Generate a detailed character profile based on this idea: "${idea}"

${modeGuidance}

Also generate a detailed player character profile that would be a compelling fit for this story/session.`;

  const response = await withRetry(() => ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          personality: { type: Type.STRING },
          backstory: { type: Type.STRING },
          appearance: { type: Type.STRING },
          clothing: { type: Type.STRING },
          accessories: { type: Type.STRING },
          hairStyle: { type: Type.STRING },
          hairColor: { type: Type.STRING },
          eyeColor: { type: Type.STRING },
          storyTone: { type: Type.STRING },
          relationship: { type: Type.STRING },
          characterFlaws: { type: Type.STRING },
          secretMotive: { type: Type.STRING },
          speechPattern: { type: Type.STRING },
          likesAndDislikes: { type: Type.STRING },
          coreBeliefs: { type: Type.STRING },
          quirks: { type: Type.STRING },
          worldAtmosphere: { type: Type.STRING },
          keyLocations: { type: Type.STRING },
          scenarioStakes: { type: Type.STRING },
          scenarioConflict: { type: Type.STRING },
          timePeriod: { type: Type.STRING },
          factions: { type: Type.STRING },
          magicOrTechnologyLevel: { type: Type.STRING },
          incitingIncident: { type: Type.STRING },
          gameSystem: { type: Type.STRING },
          questObjective: { type: Type.STRING },
          dungeonMasterStyle: { type: Type.STRING },
          rulesComplexity: { type: Type.STRING },
          difficultyLevel: { type: Type.STRING },
          partyComposition: { type: Type.STRING },
          startingEquipment: { type: Type.STRING },
          currentCampaignArc: { type: Type.STRING },
          currentMood: { type: Type.STRING },
          playerProfile: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING },
              description: { type: Type.STRING },
              personality: { type: Type.STRING },
              backstory: { type: Type.STRING },
              appearance: { type: Type.STRING },
              clothing: { type: Type.STRING },
              accessories: { type: Type.STRING },
              hairStyle: { type: Type.STRING },
              hairColor: { type: Type.STRING },
              eyeColor: { type: Type.STRING },
            },
            required: ["name", "description"]
          }
        },
        required: ["name", "personality", "backstory", "appearance", "storyTone", "relationship", "playerProfile"]
      }
    }
  }));

  console.log("generateCharacterProfile: API call successful.");
  const responseText = response.text || "{}";
  let data;
  try {
    data = JSON.parse(responseText);
  } catch (e) {
    console.error("generateCharacterProfile: JSON Parse Error. Attempting recovery. Raw text length:", responseText.length);
    try {
      // Attempt to fix common truncation issues by ensuring the JSON is closed
      const fixedText = responseText.replace(/,\s*$/, "").replace(/\s*$/, "") + "}";
      data = JSON.parse(fixedText);
      console.log("generateCharacterProfile: Recovery successful.");
    } catch (e2) {
      console.error("generateCharacterProfile: Recovery failed.", e2);
      throw new Error("Failed to parse character profile JSON. The response may have been truncated.");
    }
  }
  
  return {
    mode,
    name: data.name || "Unknown",
    personality: data.personality || "",
    backstory: data.backstory || "",
    appearance: data.appearance || "",
    clothing: data.clothing || "",
    accessories: data.accessories || "",
    hairStyle: data.hairStyle || "",
    hairColor: data.hairColor || "",
    eyeColor: data.eyeColor || "",
    voiceName: "Kore",
    voiceSettings: { pitch: "Normal", speed: "Normal", accent: "None" },
    traits: { friendliness: 50, assertiveness: 50, empathy: 50 },
    storyTone: data.storyTone || "Dramatic",
    relationship: data.relationship || "Strangers",
    playerProfile: data.playerProfile || { name: "The Protagonist", description: "A mysterious traveler." },
    inventory: [],
    worldAtmosphere: data.worldAtmosphere || "",
    keyLocations: data.keyLocations || "",
    characterFlaws: data.characterFlaws || "",
    secretMotive: data.secretMotive || "",
    speechPattern: data.speechPattern || "",
    likesAndDislikes: data.likesAndDislikes || "",
    coreBeliefs: data.coreBeliefs || "",
    quirks: data.quirks || "",
    gameSystem: data.gameSystem || "",
    questObjective: data.questObjective || "",
    scenarioStakes: data.scenarioStakes || "",
    scenarioConflict: data.scenarioConflict || "",
    timePeriod: data.timePeriod || "",
    factions: data.factions || "",
    magicOrTechnologyLevel: data.magicOrTechnologyLevel || "",
    incitingIncident: data.incitingIncident || "",
    dungeonMasterStyle: data.dungeonMasterStyle || "",
    rulesComplexity: data.rulesComplexity || "",
    difficultyLevel: data.difficultyLevel || "",
    partyComposition: data.partyComposition || "",
    startingEquipment: data.startingEquipment || "",
    currentCampaignArc: data.currentCampaignArc || "",
    currentMood: data.currentMood || "Neutral"
  };
}

export async function generateAvatar(profile: CharacterProfile): Promise<string> {
  console.log("generateAvatar: Calling Gemini API...");
  const ai = getGenAI();
  let prompt = '';

  if (profile.mode === AppMode.SCENARIO) {
    prompt = `A highly detailed, photorealistic 8k concept art of a scenario setting.
Setting Description: ${profile.appearance}
Environment Type: ${profile.clothing || 'appropriate for the setting'}
Lighting/Weather: ${profile.accessories || 'natural'}
Color Palette: ${profile.hairStyle || 'natural'} ${profile.hairColor || ''}
Key Landmark: ${profile.eyeColor || 'none'}
Style: Cinematic lighting, professional photography, sharp focus, intricate textures, epic scale.
The environment should be the central focus.`;
  } else if (profile.mode === AppMode.GAME) {
    prompt = `A highly detailed, photorealistic 8k concept art of a tabletop RPG campaign setting.
Setting Description: ${profile.appearance}
Key Elements: ${profile.clothing || 'appropriate for the setting'}
Atmosphere: ${profile.accessories || 'natural'}
Color Theme: ${profile.hairStyle || 'natural'} ${profile.hairColor || ''}
Art Style: ${profile.eyeColor || 'none'}
Style: Cinematic lighting, professional photography, sharp focus, intricate textures, epic scale.
The environment should be the central focus.`;
  } else {
    prompt = `A highly detailed, photorealistic 8k portrait of a character.
Appearance: ${profile.appearance}
Clothing: ${profile.clothing || 'appropriate for the character'}
Accessories: ${profile.accessories || 'none'}
Hair: ${profile.hairStyle || 'natural'} in ${profile.hairColor || 'natural color'}
Eyes: ${profile.eyeColor || 'natural color'}
Style: Cinematic lighting, professional photography, sharp focus, intricate textures, realistic skin and fabric rendering. 
The character should be the central focus, looking towards the camera.`;
  }

  const response = await withRetry(() => ai.models.generateContent({
    model: 'gemini-2.5-flash-image',
    contents: {
      parts: [{ text: prompt }]
    },
    config: {
      imageConfig: {
        aspectRatio: "1:1"
      }
    }
  }));
  
  console.log("generateAvatar: API call successful.");
  for (const part of response.candidates?.[0]?.content?.parts || []) {
    if (part.inlineData) {
      const base64 = `data:image/png;base64,${part.inlineData.data}`;
      return await compressImage(base64, 512, 0.7);
    }
  }
  return "";
}

export async function generateCodexImage(entry: CodexEntry, profile: CharacterProfile): Promise<string> {
  const ai = getGenAI();
  const prompt = `A highly detailed, cinematic 8k illustration of the following:
Title: ${entry.title}
Category: ${entry.category}
Description: ${entry.content}
World Atmosphere: ${profile.worldAtmosphere || 'atmospheric'}
Tone: ${profile.storyTone}
Style: Digital art, detailed, atmospheric, professional concept art, sharp focus, intricate textures. 
The subject should be the central focus, capturing the essence of the description.`;

  const response = await withRetry(() => ai.models.generateContent({
    model: 'gemini-2.5-flash-image',
    contents: {
      parts: [{ text: prompt }]
    },
    config: {
      imageConfig: {
        aspectRatio: "1:1"
      }
    }
  }));
  
  for (const part of response.candidates?.[0]?.content?.parts || []) {
    if (part.inlineData) {
      const base64 = `data:image/png;base64,${part.inlineData.data}`;
      return await compressImage(base64, 512, 0.7);
    }
  }
  return "";
}

export async function generateItemImage(item: InventoryItem, profile: CharacterProfile): Promise<string> {
  const ai = getGenAI();
  const prompt = `A highly detailed, cinematic 8k illustration of a game item:
Item Name: ${item.name}
Type: ${item.type}
Description: ${item.description}
World Atmosphere: ${profile.worldAtmosphere || 'atmospheric'}
Tone: ${profile.storyTone}
Style: RPG item icon, digital art, detailed, atmospheric, professional concept art, sharp focus, intricate textures, centered on a neutral background.`;

  const response = await withRetry(() => ai.models.generateContent({
    model: 'gemini-2.5-flash-image',
    contents: {
      parts: [{ text: prompt }]
    },
    config: {
      imageConfig: {
        aspectRatio: "1:1"
      }
    }
  }));
  
  for (const part of response.candidates?.[0]?.content?.parts || []) {
    if (part.inlineData) {
      const base64 = `data:image/png;base64,${part.inlineData.data}`;
      return await compressImage(base64, 512, 0.7);
    }
  }
  return "";
}

export async function extractInventoryUpdates(history: any[], currentInventory: InventoryItem[]): Promise<{
  added: Partial<InventoryItem>[];
  removed: string[];
  updated: { id: string; quantity: number }[];
}> {
  const ai = getGenAI();
  const response = await withRetry(() => ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Analyze the following roleplay history and identify any changes to the player's inventory.
Current Inventory: ${JSON.stringify(currentInventory)}
Recent History: ${JSON.stringify(history.slice(-10))}

Identify:
1. New items gained (name, description, type, quantity).
2. Items lost or consumed (name or id).
3. Changes in quantity of existing items.

Return a JSON object with:
- "added": Array of new items.
- "removed": Array of item names or IDs that were lost.
- "updated": Array of { id, quantity } for existing items.

Only include items that were explicitly mentioned as gained, lost, or used in the recent history.`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          added: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                description: { type: Type.STRING },
                type: { type: Type.STRING, enum: ['Weapon', 'Armor', 'Consumable', 'Quest', 'Misc'] },
                quantity: { type: Type.INTEGER },
                rarity: { type: Type.STRING, enum: ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary'] },
                value: { type: Type.STRING }
              },
              required: ["name", "description", "type", "quantity"]
            }
          },
          removed: {
            type: Type.ARRAY,
            items: { type: Type.STRING }
          },
          updated: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                name: { type: Type.STRING },
                quantity: { type: Type.INTEGER }
              }
            }
          }
        }
      }
    }
  }));

  try {
    return JSON.parse(response.text || '{"added":[], "removed":[], "updated":[]}');
  } catch (e) {
    return { added: [], removed: [], updated: [] };
  }
}

export async function refineText(text: string, context?: string, guidance?: string): Promise<string> {
  const ai = getGenAI();
  const contextText = context ? `\nContext: ${context}` : '';
  const guidanceText = guidance ? `\nGuidance: ${guidance}` : '';
  const response = await withRetry(() => ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Refine the following text.${contextText}${guidanceText}\nText: "${text}"\nReturn ONLY the refined text.`
  }));
  return response.text?.trim() || text;
}

export async function refineField(field: string, profile: CharacterProfile, guidance?: string): Promise<string> {
  const ai = getGenAI();
  const guidanceText = guidance ? `\nGuidance: ${guidance}` : '';
  const response = await withRetry(() => ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Refine the ${field} for this character: ${JSON.stringify(profile)}.${guidanceText}\nReturn ONLY the refined text.`
  }));
  return response.text?.trim() || "";
}

export async function refinePlayerProfile(field: string, profile: CharacterProfile, guidance?: string): Promise<string> {
  const ai = getGenAI();
  const guidanceText = guidance ? `\nGuidance: ${guidance}` : '';
  const response = await withRetry(() => ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Refine the player's ${field} for this roleplay scenario.
Player Profile: ${JSON.stringify(profile.playerProfile || {})}
Character they are interacting with: ${profile.name}
World Atmosphere: ${profile.worldAtmosphere || 'Not specified'}
${guidanceText}

Return ONLY the refined ${field} text.`
  }));
  return response.text?.trim() || "";
}

export async function refineTraits(profile: CharacterProfile): Promise<any> {
  const ai = getGenAI();
  const response = await withRetry(() => ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Suggest traits (0-100) for this character: ${JSON.stringify(profile)}`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          friendliness: { type: Type.INTEGER },
          assertiveness: { type: Type.INTEGER },
          empathy: { type: Type.INTEGER },
          danger: { type: Type.INTEGER },
          mystery: { type: Type.INTEGER },
          supernatural: { type: Type.INTEGER },
          strictness: { type: Type.INTEGER },
          generosity: { type: Type.INTEGER },
          lethality: { type: Type.INTEGER }
        }
      }
    }
  }));
  return JSON.parse(response.text || "{}");
}

export async function summarizeHistory(history: any[], previousSummary: string = ""): Promise<string> {
  const ai = getGenAI();
  const response = await withRetry(() => ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Summarize the following story history. Keep it concise but include key events, character development, and important details.
Previous Summary: ${previousSummary}
New Events:
${JSON.stringify(history)}
Please provide an updated summary.`
  }));
  return response.text?.trim() || previousSummary;
}

export async function streamOpenRouter(history: any[], profile: CharacterProfile, userInput: string, codexEntries: CodexEntry[] = [], currentSummary: string = "") {
  return generateTextReplyStream(history, profile, userInput, codexEntries, currentSummary);
}

export async function* generateTextReplyStream(history: any[], profile: CharacterProfile, userInput: string, codexEntries: CodexEntry[] = [], currentSummary: string = "", customInstructions?: string) {
  const ai = getGenAI();
  
  const systemInstruction = buildSystemInstruction(profile, codexEntries, currentSummary, customInstructions);
 
  const chat = ai.chats.create({
    model: "gemini-3-flash-preview",
    config: { systemInstruction },
    history: buildHistory(history)
  });
  
  const responseStream = await chat.sendMessageStream({ message: userInput });
  for await (const chunk of responseStream) {
    yield chunk.text || "";
  }
}

export async function suggestNextAction(history: any[], profile: CharacterProfile, guide?: string, customInstructions?: string): Promise<string> {
  const ai = getGenAI();

  const styleInstruction = customInstructions
    ? `\nCustom Writing Style Instructions (Apply these to the suggestion):\n${customInstructions}\n`
    : '';

  const modeInstruction = profile.mode === AppMode.GAME
    ? `You are assisting a player in a tabletop RPG. Suggest one compelling next action — it should feel like a real game decision (attack, investigate, negotiate, use an item, cast a spell, etc.).`
    : profile.mode === AppMode.SCENARIO
    ? `You are assisting a player in an interactive narrative. Suggest one compelling next action that meaningfully advances or complicates the story.`
    : `You are assisting a player in a character roleplay. Suggest one compelling next dialogue line or action that fits their character voice and advances the scene.`;

  const guideInstruction = guide ? `\nThe player has provided a hint/guide for what they want to do: "${guide}". Use this to shape your suggestion.\n` : '';

  const systemInstruction = `${modeInstruction}
${guideInstruction}
${styleInstruction}
${buildPlayerBlock(profile)}

They are interacting with / in the world of:
Name: ${profile.name}
Personality: ${profile.personality}
Relationship: ${profile.relationship}

World Context: ${profile.worldAtmosphere || 'Not specified'}
Key Locations: ${profile.keyLocations || 'Not specified'}

Return ONLY the suggested text, ready to use as player input. No quotes, no explanations.`;

  const chat = ai.chats.create({
    model: "gemini-3-flash-preview",
    config: { systemInstruction },
    history: buildHistory(history)
  });

  const response = await withRetry(() => chat.sendMessage({ message: `Suggest the next action or dialogue for my character.` }));
  return response.text?.trim() || "";
}

export async function refineInput(input: string, profile: CharacterProfile, history: any[], customInstructions?: string): Promise<string> {
  const ai = getGenAI();

  const styleInstruction = customInstructions
    ? `\nCustom Writing Style Instructions:\n${customInstructions}\n`
    : '';

  const modeInstruction = profile.mode === AppMode.GAME
    ? `Refine the player's input to feel like a clear, immersive RPG action declaration. Keep the mechanical intent (what they're trying to do) but add flavor, physicality, and character voice. Don't add outcomes — just the action.`
    : profile.mode === AppMode.SCENARIO
    ? `Refine the player's input to be more vivid and cinematic. Add sensory details, intentions, and character presence without changing the core action.`
    : `Refine the player's input to be more emotionally resonant and in-character. Enhance the voice, word choice, and intent to match the character's personality and the scene's tone.`;

  const systemInstruction = `You are an AI writing assistant. ${modeInstruction}

${buildPlayerBlock(profile)}

They are interacting with:
Name: ${profile.name}
Personality: ${profile.personality}
Relationship: ${profile.relationship}
${styleInstruction}
Return ONLY the refined text. No quotes, no explanations.`;

  const chat = ai.chats.create({
    model: "gemini-3-flash-preview",
    config: { systemInstruction },
    history: buildHistory(history)
  });

  const response = await withRetry(() => chat.sendMessage({ message: `Refine this input: "${input}"` }));
  return response.text?.trim() || input;
}

export async function generateSpeech(text: string, voiceName: string, voiceSettings: any, tone: string): Promise<string> {
  if (!text || !text.trim()) return "";
  const ai = getGenAI();
  
  const accentNote = voiceSettings?.accent && voiceSettings.accent !== 'None'
    ? ` Accent: ${voiceSettings.accent}.`
    : '';

  const prompt = `Perform this text as a cinematic audiobook narrator.
Tone: ${tone || 'natural'}.
Voice: ${voiceSettings?.pitch || 'Normal'} pitch, ${voiceSettings?.speed || 'Normal'} speed.${accentNote}
Text: ${text}`;

  const config = {
    responseModalities: ["AUDIO" as const],
    speechConfig: {
      voiceConfig: {
        prebuiltVoiceConfig: { voiceName: voiceName || 'Kore' },
      },
    },
  };

  const modelsToTry = [
    "gemini-2.5-pro-preview-tts",
    "gemini-2.5-flash-preview-tts"
  ];

  let lastError: any = null;

  for (let i = 0; i < modelsToTry.length; i++) {
    const model = modelsToTry[i];
    const isLast = i === modelsToTry.length - 1;
    
    try {
      console.log(`Attempting TTS with model: ${model}`);
      const response = await withRetry(() => ai.models.generateContent({
        model,
        contents: [{ parts: [{ text: prompt }] }],
        config,
      }), isLast ? 1 : 0, 1000); // Only retry on the very last fallback model
      
      const audioData = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (audioData) {
        return audioData;
      }
      throw new Error(`Model ${model} returned no audio data.`);
    } catch (error: any) {
      console.warn(`TTS model ${model} failed: ${error.message}`);
      lastError = error;
      continue; // Move to next model
    }
  }

  throw lastError || new Error("All TTS models failed.");
}

export async function extractCodexEntries(history: any[], profile: CharacterProfile, existingEntries: CodexEntry[]): Promise<Partial<CodexEntry>[]> {
  const ai = getGenAI();
  const existingTitles = existingEntries.map(e => e.title).join(', ');
  
  const modeHint = profile.mode === AppMode.GAME
    ? 'Focus especially on: game mechanics, rules established in play, named items/weapons, and notable locations visited. Prioritize "Mechanics" and "Item" categories.'
    : profile.mode === AppMode.SCENARIO
    ? 'Focus especially on: world lore, faction details, discovered locations, and historical events. Prioritize "Lore" and "Location" categories.'
    : 'Focus especially on: character lore, interpersonal history, revealed secrets, and meaningful objects. Prioritize "Lore" and "Item" categories.';

  const response = await withRetry(() => ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Analyze the following roleplay history and character profile. Identify significant new lore, locations, items, or mechanics that should be added to the world codex.
Do not suggest entries that already exist: [${existingTitles}]

${modeHint}

Character Profile: ${JSON.stringify(profile)}
History: ${JSON.stringify(history.slice(-20))}

Return a JSON array of new codex entries. Each must have:
- title: Short, clear name
- content: Concise description (1-3 sentences)
- category: One of "Lore", "Mechanics", "Location", "Item"`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            content: { type: Type.STRING },
            category: { type: Type.STRING, enum: ["Lore", "Mechanics", "Location", "Item"] }
          },
          required: ["title", "content", "category"]
        }
      }
    }
  }));
  
  return JSON.parse(response.text || "[]");
}

export async function refineCodexEntry(entry: Partial<CodexEntry>, profile: CharacterProfile): Promise<Partial<CodexEntry>> {
  const ai = getGenAI();
  const response = await withRetry(() => ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Refine this codex entry to be more descriptive, immersive, and consistent with the world of ${profile.name}.
Current Entry: ${JSON.stringify(entry)}
World Context: ${profile.worldAtmosphere || 'Not specified'}
 
Return the refined entry as JSON with the same fields (title, content, category).`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          content: { type: Type.STRING },
          category: { type: Type.STRING, enum: ["Lore", "Mechanics", "Location", "Item"] }
        },
        required: ["title", "content", "category"]
      }
    }
  }));
  
  try {
    return JSON.parse(response.text || JSON.stringify(entry));
  } catch (e) {
    return entry;
  }
}

export async function updateCharacterProfilesFromHistory(history: any[], profile: CharacterProfile): Promise<Partial<CharacterProfile>> {
  const ai = getGenAI();
  const response = await withRetry(() => ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Analyze the following roleplay history and suggest updates to the character's profile based on recent events, character development, and changes in relationships.
Current Profile: ${JSON.stringify(profile)}
Recent History: ${JSON.stringify(history.slice(-15))}
 
Return a JSON object with any fields that should be updated. Only include fields that have meaningful changes.
Fields you can update: personality, backstory, appearance, relationship, worldAtmosphere, keyLocations, characterFlaws, secretMotive, questObjective, scenarioStakes, scenarioConflict, dungeonMasterStyle, rulesComplexity, speechPattern, likesAndDislikes, coreBeliefs, quirks, timePeriod, factions, magicOrTechnologyLevel, incitingIncident, difficultyLevel, partyComposition, startingEquipment, currentCampaignArc.`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          personality: { type: Type.STRING },
          backstory: { type: Type.STRING },
          appearance: { type: Type.STRING },
          relationship: { type: Type.STRING },
          worldAtmosphere: { type: Type.STRING },
          keyLocations: { type: Type.STRING },
          characterFlaws: { type: Type.STRING },
          secretMotive: { type: Type.STRING },
          speechPattern: { type: Type.STRING },
          likesAndDislikes: { type: Type.STRING },
          coreBeliefs: { type: Type.STRING },
          quirks: { type: Type.STRING },
          questObjective: { type: Type.STRING },
          scenarioStakes: { type: Type.STRING },
          scenarioConflict: { type: Type.STRING },
          timePeriod: { type: Type.STRING },
          factions: { type: Type.STRING },
          magicOrTechnologyLevel: { type: Type.STRING },
          incitingIncident: { type: Type.STRING },
          dungeonMasterStyle: { type: Type.STRING },
          rulesComplexity: { type: Type.STRING },
          difficultyLevel: { type: Type.STRING },
          partyComposition: { type: Type.STRING },
          startingEquipment: { type: Type.STRING },
          currentCampaignArc: { type: Type.STRING }
        }
      }
    }
  }));
  
  return JSON.parse(response.text || "{}");
}

export async function detectMood(history: any[]): Promise<string> {
  const ai = getGenAI();
  try {
    const response = await withRetry(() => ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Analyze the last 3 messages of this roleplay and determine the character's current mood.
      History: ${JSON.stringify(history.slice(-3))}
      
      Return ONLY one word from this list: Neutral, Happy, Sad, Angry, Fearful, Surprised, Disgusted, Excited, Exhausted, Flirty, Mysterious, Gritty.`,
    }));
    return response.text?.trim() || "Neutral";
  } catch (e) {
    return "Neutral";
  }
}

export async function generateContextualAvatar(profile: CharacterProfile, history: any[]): Promise<string> {
  const ai = getGenAI();
  
  // First, analyze the context to determine the current emotion, background, and any changes
  const contextResponse = await withRetry(() => ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Analyze the recent roleplay history and determine the character's current state.
Character Name: ${profile.name}
Character Appearance: ${profile.appearance}
Recent History: ${JSON.stringify(history.slice(-10))}

Identify:
1. Current Emotion/Expression.
2. Current Location/Background.
3. Any temporary changes (wounds, new accessories, different clothing).

Return a JSON object with:
- "emotion": string
- "background": string
- "changes": string (any temporary additions or changes)`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          emotion: { type: Type.STRING },
          background: { type: Type.STRING },
          changes: { type: Type.STRING }
        },
        required: ["emotion", "background", "changes"]
      }
    }
  }));

  const context = JSON.parse(contextResponse.text || '{"emotion":"neutral", "background":"neutral", "changes":""}');

  const prompt = `A highly detailed, photorealistic 8k portrait of ${profile.name}.
Base Appearance: ${profile.appearance}
Current Emotion/Expression: ${context.emotion}
Current Background: ${context.background}
Temporary Changes/Details: ${context.changes}
Clothing: ${profile.clothing || 'appropriate for the character'}
Accessories: ${profile.accessories || 'none'}
Hair: ${profile.hairStyle || 'natural'} in ${profile.hairColor || 'natural color'}
Eyes: ${profile.eyeColor || 'natural color'}
Style: Cinematic lighting, professional photography, sharp focus, intricate textures, realistic skin and fabric rendering. 
The character should be the central focus, looking towards the camera.`;

  const response = await withRetry(() => ai.models.generateContent({
    model: 'gemini-2.5-flash-image',
    contents: {
      parts: [{ text: prompt }]
    },
    config: {
      imageConfig: {
        aspectRatio: "1:1"
      }
    }
  }));
  
  for (const part of response.candidates?.[0]?.content?.parts || []) {
    if (part.inlineData) {
      const base64 = `data:image/png;base64,${part.inlineData.data}`;
      return await compressImage(base64, 512, 0.7);
    }
  }
  return "";
}

export async function generateVeoAnimation() {
  return "";
}

export async function generateVoiceReply() {
  return "";
}
