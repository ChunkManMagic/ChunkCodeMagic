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
  geminiApiKey: string;
  openRouterApiKey: string;
  elevenLabsApiKey: string;
  openAiApiKey: string;
  activeTextProvider: 'Google' | 'OpenRouter';
  activeModel: string;
  voiceEngine: 'Cinematic' | 'Fast Browser' | 'ElevenLabs' | 'OpenAI';
  elevenLabsVoiceId?: string;
  openAiVoiceId?: string;
}

export const defaultSettings: AppSettings = {
  geminiApiKey: '',
  openRouterApiKey: '',
  elevenLabsApiKey: '',
  openAiApiKey: '',
  activeTextProvider: 'Google',
  activeModel: 'gemini-3-flash-preview',
  voiceEngine: 'Cinematic'
};

export function getSettings(): AppSettings {
  try {
    const saved = localStorage.getItem('personaforge_settings');
    if (saved) {
      return { ...defaultSettings, ...JSON.parse(saved) };
    }
  } catch (e) {}
  return defaultSettings;
}

export function getGenAI() {
  const settings = getSettings();
  const key = settings.geminiApiKey || process.env.GEMINI_API_KEY || (import.meta as any).env.VITE_GEMINI_API_KEY;
  return new GoogleGenAI({ apiKey: key });
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
  const settings = getSettings();
  const isGoogle = settings.activeTextProvider === 'Google';
  const prompt = `Generate a detailed character profile based on this idea: "${idea}" for a ${mode} mode.`;

  let data: any = {};

  if (isGoogle) {
    const ai = getGenAI();
    const response = await withRetry(() => ai.models.generateContent({
      model: "gemini-3.1-flash-lite-preview",
      contents: prompt,
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
    data = JSON.parse(response.text || "{}");
  } else {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${settings.openRouterApiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": window.location.origin,
        "X-Title": "PersonaForge"
      },
      body: JSON.stringify({
        model: settings.activeModel || "meta-llama/llama-3-8b-instruct:free",
        messages: [{ role: "user", content: prompt + "\n\nRespond ONLY with a valid JSON object containing the following string keys: name, personality, backstory, appearance, clothing, accessories, hairStyle, hairColor, eyeColor, storyTone, relationship, worldAtmosphere, keyLocations, characterFlaws, secretMotive, gameSystem, questObjective." }]
      })
    });
    if (!response.ok) throw new Error(`OpenRouter error: ${response.statusText}`);
    const resData = await response.json();
    let text = resData.choices?.[0]?.message?.content?.trim() || "{}";
    if (text.startsWith("```json")) text = text.replace(/```json/g, "").replace(/```/g, "").trim();
    try {
      data = JSON.parse(text);
    } catch (e) {
      data = {};
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
  const settings = getSettings();
  const isGoogle = settings.activeTextProvider === 'Google';
  const prompt = `Refine the ${field} for this character: ${JSON.stringify(profile)}`;

  if (isGoogle) {
    const ai = getGenAI();
    const response = await withRetry(() => ai.models.generateContent({
      model: "gemini-3.1-flash-lite-preview",
      contents: prompt
    }));
    return response.text || "";
  } else {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${settings.openRouterApiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": window.location.origin,
        "X-Title": "PersonaForge"
      },
      body: JSON.stringify({
        model: settings.activeModel || "meta-llama/llama-3-8b-instruct:free",
        messages: [{ role: "user", content: prompt }]
      })
    });
    if (!response.ok) throw new Error(`OpenRouter error: ${response.statusText}`);
    const data = await response.json();
    return data.choices?.[0]?.message?.content?.trim() || "";
  }
}

export async function refineTraits(profile: CharacterProfile): Promise<any> {
  const settings = getSettings();
  const isGoogle = settings.activeTextProvider === 'Google';
  const prompt = `Suggest traits (0-100) for this character: ${JSON.stringify(profile)}`;

  if (isGoogle) {
    const ai = getGenAI();
    const response = await withRetry(() => ai.models.generateContent({
      model: "gemini-3.1-flash-lite-preview",
      contents: prompt,
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
  } else {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${settings.openRouterApiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": window.location.origin,
        "X-Title": "PersonaForge"
      },
      body: JSON.stringify({
        model: settings.activeModel || "meta-llama/llama-3-8b-instruct:free",
        messages: [{ role: "user", content: prompt + "\n\nRespond ONLY with a valid JSON object containing integer values (0-100) for these keys: friendliness, assertiveness, empathy, danger, mystery, supernatural, strictness, generosity, lethality." }]
      })
    });
    if (!response.ok) throw new Error(`OpenRouter error: ${response.statusText}`);
    const data = await response.json();
    let text = data.choices?.[0]?.message?.content?.trim() || "{}";
    if (text.startsWith("```json")) text = text.replace(/```json/g, "").replace(/```/g, "").trim();
    try {
      return JSON.parse(text);
    } catch (e) {
      return {};
    }
  }
}

export async function summarizeHistory(history: any[], previousSummary: string = ""): Promise<string> {
  if (!history || history.length === 0) return previousSummary;
  
  const settings = getSettings();
  const isGoogle = settings.activeTextProvider === 'Google';
  const prompt = `Summarize the following roleplay history into a concise 'Story So Far' narrative. 
Focus on key events, character development, and important plot points.
${previousSummary ? `Previous Summary:\n${previousSummary}\n\n` : ''}
New History to Summarize:\n${JSON.stringify(history)}

Provide only the updated summary text.`;

  if (isGoogle) {
    const ai = getGenAI();
    const response = await withRetry(() => ai.models.generateContent({
      model: "gemini-3.1-flash-lite-preview",
      contents: prompt
    }));
    
    return response.text?.trim() || previousSummary;
  } else {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${settings.openRouterApiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": window.location.origin,
        "X-Title": "PersonaForge"
      },
      body: JSON.stringify({
        model: settings.activeModel || "meta-llama/llama-3-8b-instruct:free",
        messages: [{ role: "user", content: prompt }]
      })
    });
    if (!response.ok) throw new Error(`OpenRouter error: ${response.statusText}`);
    const data = await response.json();
    return data.choices?.[0]?.message?.content?.trim() || previousSummary;
  }
}

export async function generateTextReply(history: any[], profile: CharacterProfile, userInput: string, codexEntries: CodexEntry[] = [], storySummary: string = ""): Promise<string> {
  const settings = getSettings();
  const isGoogle = settings.activeTextProvider === 'Google';
  
  const codexContext = codexEntries.length > 0 
    ? `\nWORLD CODEX (Lore & Rules):\n${codexEntries.map(e => `[${e.category}: ${e.title}] - ${e.content}`).join('\n')}\n`
    : '';

  const summaryContext = storySummary ? `\nSTORY SO FAR:\n${storySummary}\n` : '';

  const systemInstruction = `You are playing the role of the following character. Stay in character at all times. Never break character.
Name: ${profile.name}
Personality: ${profile.personality}
Backstory: ${profile.backstory}
Appearance: ${profile.appearance}
Tone: ${profile.storyTone}
Relationship with player: ${profile.relationship}
Player Name: ${profile.playerProfile.name}
Player Description: ${profile.playerProfile.description}
${summaryContext}${codexContext}
If the player provides a [Director's Note: ...], use it to guide your next response, actions, or the story's direction. If the note asks a direct question, requests brainstorming, or requires an out-of-character (OOC) reply, you may provide an OOC response. You MUST wrap any OOC response in <ooc> and </ooc> tags at the very end of your message. The rest of your response must remain strictly in-character.
`;

  if (isGoogle) {
    const ai = getGenAI();
    const chat = ai.chats.create({
      model: settings.activeModel || "gemini-3-flash-preview",
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
  } else {
    const messages = [
      { role: "system", content: systemInstruction },
      ...history
        .filter(m => m.parts && m.parts.length > 0 && m.parts[0].text && m.parts[0].text.trim())
        .map(m => ({
          role: m.role === 'model' ? 'assistant' : 'user',
          content: m.parts[0].text
        })),
      { role: "user", content: userInput }
    ];

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${settings.openRouterApiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: settings.activeModel || "meta-llama/llama-3-8b-instruct:free",
        messages: messages
      })
    });

    if (!response.ok) {
      throw new Error(`OpenRouter API error: ${response.statusText}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || "";
  }
}

export async function* generateTextReplyStream(history: any[], profile: CharacterProfile, userInput: string, codexEntries: CodexEntry[] = [], storySummary: string = "") {
  const settings = getSettings();
  const isGoogle = settings.activeTextProvider === 'Google';
  
  const codexContext = codexEntries.length > 0 
    ? `\nWORLD CODEX (Lore & Rules):\n${codexEntries.map(e => `[${e.category}: ${e.title}] - ${e.content}`).join('\n')}\n`
    : '';

  const summaryContext = storySummary ? `\nSTORY SO FAR:\n${storySummary}\n` : '';

  const systemInstruction = `You are playing the role of the following character. Stay in character at all times. Never break character.
Name: ${profile.name}
Personality: ${profile.personality}
Backstory: ${profile.backstory}
Appearance: ${profile.appearance}
Tone: ${profile.storyTone}
Relationship with player: ${profile.relationship}
Player Name: ${profile.playerProfile.name}
Player Description: ${profile.playerProfile.description}
${summaryContext}${codexContext}
If the player provides a [Director's Note: ...], use it to guide your next response, actions, or the story's direction. If the note asks a direct question, requests brainstorming, or requires an out-of-character (OOC) reply, you may provide an OOC response. You MUST wrap any OOC response in <ooc> and </ooc> tags at the very end of your message. The rest of your response must remain strictly in-character.
`;

  if (isGoogle) {
    const ai = getGenAI();
    const chat = ai.chats.create({
      model: settings.activeModel || "gemini-3-flash-preview",
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
  } else {
    const messages = [
      { role: "system", content: systemInstruction },
      ...history
        .filter(m => m.parts && m.parts.length > 0 && m.parts[0].text && m.parts[0].text.trim())
        .map(m => ({
          role: m.role === 'model' ? 'assistant' : 'user',
          content: m.parts[0].text
        })),
      { role: "user", content: userInput }
    ];

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${settings.openRouterApiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": window.location.origin,
        "X-Title": "PersonaForge"
      },
      body: JSON.stringify({
        model: settings.activeModel || "meta-llama/llama-3-8b-instruct:free",
        messages,
        stream: true
      })
    });

    if (!response.ok) {
      throw new Error(`OpenRouter error: ${response.statusText}`);
    }

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    if (!reader) throw new Error("No reader");

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n').filter(line => line.trim() !== '');
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') continue;
          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices[0]?.delta?.content;
            if (content) {
              yield content;
            }
          } catch (e) {
            // ignore parse error
          }
        }
      }
    }
  }
}

export async function suggestNextAction(history: any[], profile: CharacterProfile): Promise<string> {
  const settings = getSettings();
  const isGoogle = settings.activeTextProvider === 'Google';
  const prompt = `You are assisting a player in a roleplay. Based on the current story, character profile, and world context, suggest a compelling next action or dialogue for the player character.
Character Profile: ${JSON.stringify(profile)}
World Context: ${profile.worldAtmosphere || 'Not specified'}
Key Locations: ${profile.keyLocations || 'Not specified'}
Current Story History: ${JSON.stringify(history.slice(-15))}
Please return only the suggested text, ready to be used as user input. Make it immersive, descriptive, and perfectly in-character for the player (${profile.playerProfile.name}: ${profile.playerProfile.description}).`;

  if (isGoogle) {
    const ai = getGenAI();
    const response = await withRetry(() => ai.models.generateContent({
      model: "gemini-3.1-flash-lite-preview",
      contents: prompt
    }));
    return response.text?.trim() || "";
  } else {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${settings.openRouterApiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": window.location.origin,
        "X-Title": "PersonaForge"
      },
      body: JSON.stringify({
        model: settings.activeModel || "meta-llama/llama-3-8b-instruct:free",
        messages: [{ role: "user", content: prompt }]
      })
    });
    if (!response.ok) throw new Error(`OpenRouter error: ${response.statusText}`);
    const data = await response.json();
    return data.choices?.[0]?.message?.content?.trim() || "";
  }
}

export async function refineInput(input: string, profile: CharacterProfile, history: any[]): Promise<string> {
  const settings = getSettings();
  const isGoogle = settings.activeTextProvider === 'Google';
  const prompt = `You are assisting in a roleplay. Refine the following user input to be more descriptive, immersive, and in-character for the player, taking into account the current character they are interacting with and the story history.
Player Character Context:
Name: ${profile.playerProfile.name}
Description: ${profile.playerProfile.description}

Interacting With:
Name: ${profile.name}
Personality: ${profile.personality}
Relationship: ${profile.relationship}

Story Context (Recent History):
${JSON.stringify(history.slice(-5))}

Current User Input: "${input}"
Please return only the refined input text, maintaining the narrative style and ensuring it fits perfectly into the current scene.`;

  if (isGoogle) {
    const ai = getGenAI();
    const response = await withRetry(() => ai.models.generateContent({
      model: "gemini-3.1-flash-lite-preview",
      contents: prompt
    }));
    return response.text?.trim() || input;
  } else {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${settings.openRouterApiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": window.location.origin,
        "X-Title": "PersonaForge"
      },
      body: JSON.stringify({
        model: settings.activeModel || "meta-llama/llama-3-8b-instruct:free",
        messages: [{ role: "user", content: prompt }]
      })
    });
    if (!response.ok) throw new Error(`OpenRouter error: ${response.statusText}`);
    const data = await response.json();
    return data.choices?.[0]?.message?.content?.trim() || input;
  }
}

export async function generateSpeech(text: string, voiceName: string, voiceSettings: any, tone: string): Promise<string> {
  if (!text || !text.trim()) return "";
  
  const settings = getSettings();
  
  // If user explicitly wants Fast Browser, we skip the cloud engines here
  // and let the UI handle it via the error/fallback mechanism or by returning empty.
  if (settings.voiceEngine === 'Fast Browser') {
    throw new Error("Fast Browser requested");
  }
  
  // Fallback Chain: ElevenLabs -> OpenAI -> Gemini TTS
  
  // 1. Try ElevenLabs
  const elevenKey = settings.elevenLabsApiKey || process.env.ELEVENLABS_API_KEY;
  if (elevenKey) {
    try {
      const voiceId = settings.elevenLabsVoiceId || "pNInz6obpg8nEByWQX7d"; // Default: Adam
      const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
        method: "POST",
        headers: {
          "xi-api-key": elevenKey,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          text: text,
          model_id: "eleven_monolingual_v1",
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.5
          }
        })
      });
      if (response.ok) {
        const blob = await response.blob();
        return new Promise((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            const base64 = (reader.result as string).split(',')[1];
            resolve(base64);
          };
          reader.readAsDataURL(blob);
        });
      }
    } catch (e) {
      console.error("ElevenLabs Error:", e);
    }
  }

  // 2. Try OpenAI
  const openAiKey = settings.openAiApiKey || process.env.OPENAI_API_KEY;
  if (openAiKey) {
    try {
      const response = await fetch("https://api.openai.com/v1/audio/speech", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${openAiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "tts-1",
          input: text,
          voice: settings.openAiVoiceId || "alloy"
        })
      });
      if (response.ok) {
        const blob = await response.blob();
        return new Promise((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            const base64 = (reader.result as string).split(',')[1];
            resolve(base64);
          };
          reader.readAsDataURL(blob);
        });
      }
    } catch (e) {
      console.error("OpenAI TTS Error:", e);
    }
  }

  // 3. Fallback to Gemini TTS (Free)
  try {
    const ai = getGenAI();
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
  } catch (e) {
    console.error("Gemini TTS Error:", e);
    throw e; // Final fallback to Browser TTS in ChatInterface.tsx
  }
}

export async function extractCodexEntries(history: any[], profile: CharacterProfile, existingEntries: CodexEntry[]): Promise<Partial<CodexEntry>[]> {
  const settings = getSettings();
  const isGoogle = settings.activeTextProvider === 'Google';
  const existingTitles = existingEntries.map(e => e.title).join(', ');
  const prompt = `Analyze the following roleplay history and character profile. Identify any significant new lore, locations, items, or mechanics that should be added to the world codex. 
Do not suggest entries that already exist: [${existingTitles}]

Character Profile: ${JSON.stringify(profile)}
History: ${JSON.stringify(history.slice(-20))}

Return a JSON array of new codex entries. Each entry must have:
- title: A short, clear name
- content: A concise description (1-3 sentences)
- category: One of "Lore", "Mechanics", "Location", "Item"`;

  if (isGoogle) {
    const ai = getGenAI();
    const response = await withRetry(() => ai.models.generateContent({
      model: "gemini-3.1-flash-lite-preview",
      contents: prompt,
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
  } else {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${settings.openRouterApiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": window.location.origin,
        "X-Title": "PersonaForge"
      },
      body: JSON.stringify({
        model: settings.activeModel || "meta-llama/llama-3-8b-instruct:free",
        messages: [{ role: "user", content: prompt + "\n\nRespond ONLY with valid JSON array." }]
      })
    });
    if (!response.ok) throw new Error(`OpenRouter error: ${response.statusText}`);
    const data = await response.json();
    let text = data.choices?.[0]?.message?.content?.trim() || "[]";
    if (text.startsWith("```json")) text = text.replace(/```json/g, "").replace(/```/g, "").trim();
    try {
      return JSON.parse(text);
    } catch (e) {
      console.error("Failed to parse extracted codex entries", e);
      return [];
    }
  }
}

export async function refineCodexEntry(entry: Partial<CodexEntry>, profile: CharacterProfile): Promise<Partial<CodexEntry>> {
  const settings = getSettings();
  const isGoogle = settings.activeTextProvider === 'Google';
  const prompt = `Refine this codex entry to be more descriptive, immersive, and consistent with the world of ${profile.name}.
Current Entry: ${JSON.stringify(entry)}
World Context: ${profile.worldAtmosphere || 'Not specified'}

Return the refined entry as JSON with the same fields (title, content, category).`;

  if (isGoogle) {
    const ai = getGenAI();
    const response = await withRetry(() => ai.models.generateContent({
      model: "gemini-3.1-flash-lite-preview",
      contents: prompt,
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
  } else {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${settings.openRouterApiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": window.location.origin,
        "X-Title": "PersonaForge"
      },
      body: JSON.stringify({
        model: settings.activeModel || "meta-llama/llama-3-8b-instruct:free",
        messages: [{ role: "user", content: prompt + "\n\nRespond ONLY with a valid JSON object." }]
      })
    });
    if (!response.ok) throw new Error(`OpenRouter error: ${response.statusText}`);
    const data = await response.json();
    let text = data.choices?.[0]?.message?.content?.trim() || JSON.stringify(entry);
    if (text.startsWith("```json")) text = text.replace(/```json/g, "").replace(/```/g, "").trim();
    try {
      return JSON.parse(text);
    } catch (e) {
      return entry;
    }
  }
}

export async function generateVeoAnimation() {
  return "";
}

export async function generateVoiceReply() {
  return "";
}
