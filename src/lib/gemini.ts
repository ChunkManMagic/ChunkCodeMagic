import { GoogleGenAI, Type } from "@google/genai";

export enum AppMode {
  SCENARIO = 'Scenario',
  ROLEPLAY = 'Roleplay',
  GAME = 'Game'
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
  voiceSettings: {
    pitch: string;
    speed: string;
    accent: string;
  };
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
}

export const defaultSettings: AppSettings = {
  activeTextProvider: 'Google',
  activeModel: 'gemini-3-flash-preview',
  voiceEngine: 'Cinematic'
};

export function getSettings(): AppSettings {
  try {
    const stored = localStorage.getItem('personaforge_settings');
    if (stored) {
      return { ...defaultSettings, ...JSON.parse(stored) };
    }
  } catch (e) {
    console.error('Failed to load settings', e);
  }
  return defaultSettings;
}

export function getGenAI() {
  return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || (import.meta as any).env.VITE_GEMINI_API_KEY });
}

export function generateId(): string {
  try {
    return crypto.randomUUID();
  } catch (e) {
    return `id-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

async function withRetry<T>(fn: () => Promise<T>, retries = 5, delay = 2000): Promise<T> {
  try {
    return await fn();
  } catch (error: any) {
    if (retries > 0 && (error?.status === 429 || error?.code === 429 || error?.message?.includes('429'))) {
      // Add jitter to delay
      const jitter = Math.random() * 1000;
      await new Promise(resolve => setTimeout(resolve, delay + jitter));
      return withRetry(fn, retries - 1, delay * 2);
    }
    throw error;
  }
}

export async function generateCharacterProfile(idea: string, mode: AppMode): Promise<CharacterProfile> {
  const ai = getGenAI();
  const response = await withRetry(() => ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Generate a detailed character profile based on this idea: "${idea}" for a ${mode} mode.`,
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
          worldAtmosphere: { type: Type.STRING },
          keyLocations: { type: Type.STRING },
          characterFlaws: { type: Type.STRING },
          secretMotive: { type: Type.STRING },
          gameSystem: { type: Type.STRING },
          questObjective: { type: Type.STRING },
        },
        required: ["name", "personality", "backstory", "appearance", "storyTone", "relationship"]
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
    playerProfile: { name: "The Protagonist", description: "A mysterious traveler." },
    worldAtmosphere: data.worldAtmosphere || "",
    keyLocations: data.keyLocations || "",
    characterFlaws: data.characterFlaws || "",
    secretMotive: data.secretMotive || "",
    gameSystem: data.gameSystem || "",
    questObjective: data.questObjective || ""
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
      parts: [
        { text: prompt }
      ]
    }
  }));
  
  for (const part of response.candidates?.[0]?.content?.parts || []) {
    if (part.inlineData) {
      return `data:image/png;base64,${part.inlineData.data}`;
    }
  }
  return "";
}

export async function refineField(field: string, profile: CharacterProfile): Promise<string> {
  const ai = getGenAI();
  const response = await withRetry(() => ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Refine the ${field} for this character: ${JSON.stringify(profile)}`
  }));
  return response.text || "";
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

export async function generateTextReply(history: any[], profile: CharacterProfile, userInput: string, codexEntries: CodexEntry[] = [], currentSummary: string = ""): Promise<string> {
  const ai = getGenAI();
  
  const codexContext = codexEntries.length > 0 
    ? `\nWORLD CODEX (Lore & Rules):\n${codexEntries.map(e => `[${e.category}: ${e.title}] - ${e.content}`).join('\n')}\n`
    : '';

  const summaryContext = currentSummary ? `\nSTORY SUMMARY SO FAR:\n${currentSummary}\n` : '';

  const systemInstruction = `You are playing the role of the following character. Stay in character at all times. Never break character.
Name: ${profile.name}
Personality: ${profile.personality}
Backstory: ${profile.backstory}
Appearance: ${profile.appearance}
Tone: ${profile.storyTone}
Relationship with player: ${profile.relationship}
Player Name: ${profile.playerProfile?.name || 'The Protagonist'}
Player Description: ${profile.playerProfile?.description || 'A mysterious traveler'}
${codexContext}${summaryContext}
If the player provides a [Director's Note: ...], use it to guide your next response, actions, or the story's direction. If the note asks a direct question, requests brainstorming, or requires an out-of-character (OOC) reply, you may provide an OOC response. You MUST wrap any OOC response in <ooc> and </ooc> tags at the very end of your message. The rest of your response must remain strictly in-character.
`;
  const chat = ai.chats.create({
    model: "gemini-3-flash-preview",
    config: { systemInstruction },
    history: history
      .filter(m => m.parts && m.parts.length > 0 && m.parts[0].text && m.parts[0].text.trim())
      .map(m => ({
        role: m.role,
        parts: m.parts
      }))
  });
  
  const response = await withRetry(() => chat.sendMessage({ message: userInput }));
  return response.text || "";
}

export async function* generateTextReplyStream(history: any[], profile: CharacterProfile, userInput: string, codexEntries: CodexEntry[] = [], currentSummary: string = "") {
  const ai = getGenAI();
  
  const codexContext = codexEntries.length > 0 
    ? `\nWORLD CODEX (Lore & Rules):\n${codexEntries.map(e => `[${e.category}: ${e.title}] - ${e.content}`).join('\n')}\n`
    : '';

  const summaryContext = currentSummary ? `\nSTORY SUMMARY SO FAR:\n${currentSummary}\n` : '';

  const systemInstruction = `You are playing the role of the following character. Stay in character at all times. Never break character.
Name: ${profile.name}
Personality: ${profile.personality}
Backstory: ${profile.backstory}
Appearance: ${profile.appearance}
Tone: ${profile.storyTone}
Relationship with player: ${profile.relationship}
Player Name: ${profile.playerProfile?.name || 'The Protagonist'}
Player Description: ${profile.playerProfile?.description || 'A mysterious traveler'}
${codexContext}${summaryContext}
If the player provides a [Director's Note: ...], use it to guide your next response, actions, or the story's direction. If the note asks a direct question, requests brainstorming, or requires an out-of-character (OOC) reply, you may provide an OOC response. You MUST wrap any OOC response in <ooc> and </ooc> tags at the very end of your message. The rest of your response must remain strictly in-character.
`;
  const chat = ai.chats.create({
    model: "gemini-3-flash-preview",
    config: { systemInstruction },
    history: history
      .filter(m => m.parts && m.parts.length > 0 && m.parts[0].text && m.parts[0].text.trim())
      .map(m => ({
        role: m.role,
        parts: m.parts
      }))
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
    model: "gemini-3-flash-preview",
    config: { systemInstruction },
    history: history
      .filter(m => m.parts && m.parts.length > 0 && m.parts[0].text && m.parts[0].text.trim())
      .map(m => ({
        role: m.role,
        parts: m.parts
      }))
  });
  
  const response = await withRetry(() => chat.sendMessage({ message: `Suggest the next action or dialogue for my character.` }));
  return response.text?.trim() || "";
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
    model: "gemini-3-flash-preview",
    config: { systemInstruction },
    history: history
      .filter(m => m.parts && m.parts.length > 0 && m.parts[0].text && m.parts[0].text.trim())
      .map(m => ({
        role: m.role,
        parts: m.parts
      }))
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
    model: "gemini-3-flash-preview",
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
  
  try {
    return JSON.parse(response.text || "[]");
  } catch (e) {
    console.error("Failed to parse extracted codex entries", e);
    return [];
  }
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

export async function generateVeoAnimation() {
  return "";
}

export async function generateVoiceReply() {
  return "";
}
