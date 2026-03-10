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

export function getGenAI() {
  return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || (import.meta as any).env.VITE_GEMINI_API_KEY });
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
    model: "gemini-3.1-flash-lite-preview",
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

export async function generateAvatar(appearance: string): Promise<string> {
  const ai = getGenAI();
  const response = await withRetry(() => ai.models.generateContent({
    model: 'gemini-2.5-flash-image',
    contents: {
      parts: [
        { text: `A portrait of a character with this appearance: ${appearance}` }
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

export async function generateTextReply(history: any[], profile: CharacterProfile, userInput: string): Promise<string> {
  const ai = getGenAI();
  const systemInstruction = `You are playing the role of the following character. Stay in character at all times. Never break character.
Name: ${profile.name}
Personality: ${profile.personality}
Backstory: ${profile.backstory}
Appearance: ${profile.appearance}
Tone: ${profile.storyTone}
Relationship with player: ${profile.relationship}
Player Name: ${profile.playerProfile.name}
Player Description: ${profile.playerProfile.description}

If the player sends a message in the format ((OOC: ...)), treat it as an out-of-character meta-instruction, question, or correction. Respond to it directly as the AI assistant, not as the character, and then continue the roleplay if appropriate. Do not incorporate the OOC content into the story itself.
`;
  const chat = ai.chats.create({
    model: "gemini-3.1-flash-lite-preview",
    config: { systemInstruction }
  });
  
  for (const msg of history) {
    if (msg.role === 'user') {
      await withRetry(() => chat.sendMessage({ message: msg.parts[0].text }));
    } else {
      // We can't easily set model history in chats.create without using history array,
      // but for simplicity we just send the latest message.
    }
  }
  const response = await withRetry(() => chat.sendMessage({ message: userInput }));
  return response.text || "";
}

export async function refineInput(input: string, playerProfile: { name: string; description: string }): Promise<string> {
  const ai = getGenAI();
  const response = await withRetry(() => ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `You are assisting in a roleplay. Refine the following user input to be more descriptive, immersive, and in-character for the player.
Player Character Context:
Name: ${playerProfile.name}
Description: ${playerProfile.description}
Current User Input: "${input}"
Please return only the refined input text, maintaining the narrative style.`
  }));
  return response.text?.trim() || input;
}

export async function generateSpeech(text: string, voiceName: string, _voiceSettings: any): Promise<string> {
  const ai = getGenAI();
  const response = await withRetry(() => ai.models.generateContent({
    model: "gemini-2.5-flash-preview-tts",
    contents: [{ parts: [{ text }] }],
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

export async function generateVeoAnimation() {
  return "";
}

export async function generateVoiceReply() {
  return "";
}
