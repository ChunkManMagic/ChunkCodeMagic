import { GoogleGenAI, Type } from "@google/genai";
import { CharacterProfile, CodexEntry, InventoryItem, AppMode, VoiceSettings } from "./types";

export { AppMode };
export type { CharacterProfile, CodexEntry, InventoryItem, VoiceSettings };

/**
 * WARNING: The API key is exposed in the client bundle when using VITE_ prefixed keys.
 * For production, use a backend proxy to keep keys secure.
 */
export function getGenAI() {
  const apiKey = process.env.GEMINI_API_KEY || (import.meta as any).env.VITE_GEMINI_API_KEY;
  return new GoogleGenAI({ apiKey });
}

export function generateId(): string {
  try {
    return crypto.randomUUID();
  } catch (e) {
    return `id-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

async function withRetry<T>(fn: () => Promise<T>, retries = 3, delay = 2000): Promise<T> {
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

    if (retries > 0 && (status === 429 || errorMessage.includes('429') || errorMessage.includes('quota'))) {
      console.warn(`Rate limit hit, retrying in ${delay}ms... (${retries} retries left)`);
      const jitter = Math.random() * 1000;
      await new Promise(resolve => setTimeout(resolve, delay + jitter));
      return withRetry(fn, retries - 1, delay * 2);
    }
    
    throw error;
  }
}

function buildSystemInstruction(profile: CharacterProfile, codexEntries: CodexEntry[], currentSummary: string): string {
  const codexContext = codexEntries.length > 0 
    ? `\nWORLD CODEX (Lore & Rules):\n${codexEntries.map(e => `[${e.category}: ${e.title}] - ${e.content}`).join('\n')}\n`
    : '';

  const summaryContext = currentSummary ? `\nSTORY SUMMARY SO FAR:\n${currentSummary}\n` : '';
  
  const modeSpecificContext = profile.mode === AppMode.SCENARIO 
    ? `\nSCENARIO CONTEXT:\nStakes: ${profile.scenarioStakes || 'Not specified'}\nConflict: ${profile.scenarioConflict || 'Not specified'}\nAtmosphere: ${profile.worldAtmosphere || 'Not specified'}\nTime Period: ${profile.timePeriod || 'Not specified'}\nFactions: ${profile.factions || 'Not specified'}\nMagic/Tech Level: ${profile.magicOrTechnologyLevel || 'Not specified'}\nInciting Incident: ${profile.incitingIncident || 'Not specified'}`
    : profile.mode === AppMode.GAME
    ? `\nGAME CONTEXT:\nSystem: ${profile.gameSystem || 'Not specified'}\nObjective: ${profile.questObjective || 'Not specified'}\nDM Style: ${profile.dungeonMasterStyle || 'Not specified'}\nComplexity: ${profile.rulesComplexity || 'Not specified'}\nDifficulty: ${profile.difficultyLevel || 'Not specified'}\nParty: ${profile.partyComposition || 'Not specified'}\nStarting Equipment: ${profile.startingEquipment || 'Not specified'}\nCurrent Arc: ${profile.currentCampaignArc || 'Not specified'}`
    : `\nROLEPLAY CONTEXT:\nFlaws: ${profile.characterFlaws || 'Not specified'}\nMotive: ${profile.secretMotive || 'Not specified'}\nSpeech Pattern: ${profile.speechPattern || 'Not specified'}\nLikes/Dislikes: ${profile.likesAndDislikes || 'Not specified'}\nCore Beliefs: ${profile.coreBeliefs || 'Not specified'}\nQuirks: ${profile.quirks || 'Not specified'}`;

  return `You are playing the role of the following character. Stay in character at all times. Never break character.
Name: ${profile.name}
Personality: ${profile.personality}
Backstory: ${profile.backstory}
Appearance: ${profile.appearance}
Tone: ${profile.storyTone}
Relationship with player: ${profile.relationship}${modeSpecificContext}
Player Name: ${profile.playerProfile?.name || 'The Protagonist'}
Player Description: ${profile.playerProfile?.description || 'A mysterious traveler'}
${codexContext}${summaryContext}
If the player provides a [Director's Note: ...], use it to guide your next response, actions, or the story's direction. If the note asks a direct question, requests brainstorming, or requires an out-of-character (OOC) reply, you may provide an OOC response. You MUST wrap any OOC response in <ooc> and </ooc> tags at the very end of your message. The rest of your response must remain strictly in-character.
`;
}

function buildHistory(messages: any[]) {
  return messages
    .filter(m => m.parts && m.parts.length > 0 && m.parts[0].text && m.parts[0].text.trim())
    .map(m => ({
      role: m.role,
      parts: m.parts
    }));
}

export async function generateCharacterProfile(idea: string, mode: AppMode): Promise<CharacterProfile> {
  const ai = getGenAI();
  const response = await withRetry(() => ai.models.generateContent({
    model: "gemini-3.1-flash-lite-preview",
    contents: `Generate a detailed character profile based on this idea: "${idea}" for a ${mode} mode. 
    Also generate a detailed profile for the player character that would be a good fit for this story.`,
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

  const data = JSON.parse(response.text || "{}");
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
    currentCampaignArc: data.currentCampaignArc || ""
  };
}

export async function generateAvatar(profile: CharacterProfile): Promise<string> {
  const ai = getGenAI();
  const prompt = `A highly detailed, photorealistic 8k portrait of a character.
Appearance: ${profile.appearance}
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
      return `data:image/png;base64,${part.inlineData.data}`;
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
      return `data:image/png;base64,${part.inlineData.data}`;
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
      return `data:image/png;base64,${part.inlineData.data}`;
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

export async function refineField(field: string, profile: CharacterProfile): Promise<string> {
  const ai = getGenAI();
  const response = await withRetry(() => ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Refine the ${field} for this character: ${JSON.stringify(profile)}. Return ONLY the refined text.`
  }));
  return response.text?.trim() || "";
}

export async function refinePlayerProfile(field: string, profile: CharacterProfile): Promise<string> {
  const ai = getGenAI();
  const response = await withRetry(() => ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Refine the player's ${field} for this roleplay scenario.
Player Profile: ${JSON.stringify(profile.playerProfile || {})}
Character they are interacting with: ${profile.name}
World Atmosphere: ${profile.worldAtmosphere || 'Not specified'}

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
    model: "gemini-3.1-flash-lite-preview",
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

export async function* generateTextReplyStream(history: any[], profile: CharacterProfile, userInput: string, codexEntries: CodexEntry[] = [], currentSummary: string = "") {
  const ai = getGenAI();
  
  const systemInstruction = buildSystemInstruction(profile, codexEntries, currentSummary);

  const chat = ai.chats.create({
    model: "gemini-3.1-flash-lite-preview",
    config: { systemInstruction },
    history: buildHistory(history)
  });
  
  const responseStream = await chat.sendMessageStream({ message: userInput });
  for await (const chunk of responseStream) {
    yield chunk.text || "";
  }
}

export async function suggestNextAction(history: any[], profile: CharacterProfile): Promise<string> {
  const ai = getGenAI();
  
  const systemInstruction = `You are an AI assistant helping a player roleplay. 
The player is playing as:
Name: ${profile.playerProfile?.name || 'The Protagonist'}
Description: ${profile.playerProfile?.description || 'A mysterious traveler'}

They are interacting with:
Name: ${profile.name}
Personality: ${profile.personality}
Relationship: ${profile.relationship}

World Context: ${profile.worldAtmosphere || 'Not specified'}
Key Locations: ${profile.keyLocations || 'Not specified'}

Your task is to suggest a compelling next action or dialogue for the player character based on the story history.
Return ONLY the suggested text, ready to be used as user input. Make it immersive, descriptive, and perfectly in-character for the player. Do not include quotes, explanations, or any other text.`;

  const chat = ai.chats.create({
    model: "gemini-3.1-flash-lite-preview",
    config: { systemInstruction },
    history: buildHistory(history)
  });
  
  const response = await withRetry(() => chat.sendMessage({ message: `Suggest the next action or dialogue for my character.` }));
  return response.text?.trim() || "";
}

export async function suggestMultipleActions(history: any[], profile: CharacterProfile): Promise<string[]> {
  const ai = getGenAI();
  
  const systemInstruction = `You are an AI assistant helping a player roleplay. 
The player is playing as:
Name: ${profile.playerProfile?.name || 'The Protagonist'}
Description: ${profile.playerProfile?.description || 'A mysterious traveler'}

They are interacting with:
Name: ${profile.name}
Personality: ${profile.personality}
Relationship: ${profile.relationship}

World Context: ${profile.worldAtmosphere || 'Not specified'}
Key Locations: ${profile.keyLocations || 'Not specified'}

Your task is to suggest 3 distinct, compelling possible next actions or dialogue choices for the player character based on the story history.
IMPORTANT: Analyze the VERY LAST message in the history carefully. The suggestions must be a logical NEXT STEP from that message. 
Do NOT suggest actions that have already been performed or dialogue that has already been spoken.

Return them as a JSON array of strings. Each string should be a complete, immersive, and descriptive action or dialogue.
Return ONLY the JSON. No other text.`;

  const chat = ai.chats.create({
    model: "gemini-3.1-flash-lite-preview",
    config: { 
      systemInstruction,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: { type: Type.STRING }
      }
    },
    history: buildHistory(history)
  });
  
  const response = await withRetry(() => chat.sendMessage({ message: `Give me 3 possible next actions.` }));
  const text = response.text?.trim() || "[]";
  return JSON.parse(text);
}

export async function refineInput(input: string, profile: CharacterProfile, history: any[], customInstructions?: string): Promise<string> {
  const ai = getGenAI();
  
  const styleInstruction = customInstructions 
    ? `\nCustom Writing Style Instructions:\n${customInstructions}\n` 
    : '';

  const systemInstruction = `You are an AI assistant helping a player roleplay. 
The player is playing as:
Name: ${profile.playerProfile?.name || 'The Protagonist'}
Description: ${profile.playerProfile?.description || 'A mysterious traveler'}

They are interacting with:
Name: ${profile.name}
Personality: ${profile.personality}
Relationship: ${profile.relationship}
${styleInstruction}
Your task is to refine the player's next input to be more descriptive, immersive, and in-character. 
Return ONLY the refined text. Do not include quotes, explanations, or any other text.`;

  const chat = ai.chats.create({
    model: "gemini-3.1-flash-lite-preview",
    config: { systemInstruction },
    history: buildHistory(history)
  });
  
  const response = await withRetry(() => chat.sendMessage({ message: `Refine this input: "${input}"` }));
  return response.text?.trim() || input;
}

export async function generateSpeech(text: string, voiceName: string, voiceSettings: any, tone: string): Promise<string> {
  if (!text || !text.trim()) return "";
  const ai = getGenAI();
  
  // Cinematic Audiobook Prompt
  const prompt = `Perform the following text as a cinematic, deep audiobook storyteller. 
Use a ${tone || 'natural'} tone with rich emotional prosody. 
Incorporate natural breath pauses and human-like pacing. 
Avoid all robotic, flat, or whiny artifacts. 
The delivery should be immersive, professional, and evocative.

Voice Parameters: ${voiceSettings?.pitch || 'Normal'} pitch, ${voiceSettings?.speed || 'Normal'} speed, ${voiceSettings?.accent || 'No'} accent.

Text to perform:
${text}`;

  const response = await withRetry(() => ai.models.generateContent({
    model: "gemini-2.5-flash-preview-tts",
    contents: [{ parts: [{ text: prompt }] }],
    config: {
      responseModalities: ["AUDIO"],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: voiceName || 'Kore' },
        },
      },
    },
  }));
  return response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data || "";
}

export async function extractCodexEntries(history: any[], profile: CharacterProfile, existingEntries: CodexEntry[]): Promise<Partial<CodexEntry>[]> {
  const ai = getGenAI();
  const existingTitles = existingEntries.map(e => e.title).join(', ');
  
  const response = await withRetry(() => ai.models.generateContent({
    model: "gemini-3.1-flash-lite-preview",
    contents: `Analyze the following roleplay history and character profile. Identify any significant new lore, locations, items, or mechanics that should be added to the world codex. 
Do not suggest entries that already exist: [${existingTitles}]

Character Profile: ${JSON.stringify(profile)}
History: ${JSON.stringify(history.slice(-20))}

Return a JSON array of new codex entries. Each entry must have:
- title: A short, clear name
- content: A concise description (1-3 sentences)
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
    model: "gemini-3.1-flash-lite-preview",
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
    model: "gemini-3.1-flash-lite-preview",
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

export async function generateVeoAnimation() {
  return "";
}

export async function generateVoiceReply() {
  return "";
}
