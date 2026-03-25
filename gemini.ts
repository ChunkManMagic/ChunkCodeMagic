// ─────────────────────────────────────────────
// AI API layer — all Gemini / OpenRouter calls live here.
// Types are imported from lib/types.ts (not duplicated).
// ─────────────────────────────────────────────

import { GoogleGenAI, Type } from '@google/genai';
import type { CharacterProfile, AppSettings, CodexEntry } from './types';
import { getSettings } from './types';

export { AppMode, getSettings, saveSettings, defaultSettings } from './types';
export type {
  CharacterProfile,
  Scenario,
  CodexEntry,
  AppSettings,
  Message,
  VoiceSettings,
} from './types';

// ─────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────

export function generateId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `id-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }
}

/**
 * Returns a Gemini client.
 * SECURITY NOTE: VITE_ prefixed env vars are embedded in the client bundle
 * and visible to anyone who inspects the JS. For production, route AI calls
 * through your own backend and inject GEMINI_API_KEY server-side only.
 */
export function getGenAI(): GoogleGenAI {
  const key =
    (import.meta as any).env?.GEMINI_API_KEY ||
    (import.meta as any).env?.VITE_GEMINI_API_KEY ||
    '';

  if (!key) {
    throw new Error(
      'No Gemini API key found. Set GEMINI_API_KEY in your environment ' +
      '(or VITE_GEMINI_API_KEY for local dev only).',
    );
  }

  return new GoogleGenAI({ apiKey: key });
}

/**
 * Exponential back-off with jitter for 429 / rate-limit responses.
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  retries = 3,
  baseDelay = 2000,
): Promise<T> {
  try {
    return await fn();
  } catch (error: any) {
    const is429 =
      error?.status === 429 ||
      error?.code === 429 ||
      String(error?.message).includes('429') ||
      String(error?.message).toLowerCase().includes('quota');

    if (retries > 0 && is429) {
      const jitter = Math.random() * 1000;
      await new Promise(res => setTimeout(res, baseDelay + jitter));
      return withRetry(fn, retries - 1, baseDelay * 2);
    }
    throw error;
  }
}

// ─────────────────────────────────────────────
// System prompt builder — single source of truth
// (previously duplicated in two streaming functions)
// ─────────────────────────────────────────────

function buildSystemInstruction(
  profile: CharacterProfile,
  codexEntries: CodexEntry[],
  currentSummary: string,
): string {
  const codexContext =
    codexEntries.length > 0
      ? `\nWORLD CODEX (Lore & Rules):\n${codexEntries
          .map(e => `[${e.category}: ${e.title}] - ${e.content}`)
          .join('\n')}\n`
      : '';

  const summaryContext = currentSummary
    ? `\nSTORY SUMMARY SO FAR:\n${currentSummary}\n`
    : '';

  return `You are playing the role of the following character. Stay in character at all times. Never break character.
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
}

function buildHistory(messages: { role: string; text: string }[]) {
  return messages
    .filter(m => m.text?.trim())
    .map(m => ({ role: m.role, parts: [{ text: m.text }] }));
}

// ─────────────────────────────────────────────
// Character generation
// ─────────────────────────────────────────────

export async function generateCharacterProfile(
  idea: string,
  mode: import('./types').AppMode,
): Promise<CharacterProfile> {
  const ai = getGenAI();
  const response = await withRetry(() =>
    ai.models.generateContent({
      model: 'gemini-2.5-flash-preview-05-20',
      contents: `Generate a detailed character profile based on this idea: "${idea}" for a ${mode} mode.`,
      config: {
        responseMimeType: 'application/json',
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
          required: ['name', 'personality', 'backstory', 'appearance', 'storyTone', 'relationship'],
        },
      },
    }),
  );

  const data = JSON.parse(response.text || '{}');
  return {
    mode,
    name: data.name || 'Unknown',
    personality: data.personality || '',
    backstory: data.backstory || '',
    appearance: data.appearance || '',
    clothing: data.clothing || '',
    accessories: data.accessories || '',
    hairStyle: data.hairStyle || '',
    hairColor: data.hairColor || '',
    eyeColor: data.eyeColor || '',
    voiceName: 'Kore',
    voiceSettings: { pitch: 'Normal', speed: 'Normal', accent: 'None' },
    traits: { friendliness: 50, assertiveness: 50, empathy: 50 },
    storyTone: data.storyTone || 'Dramatic',
    relationship: data.relationship || 'Strangers',
    playerProfile: { name: 'The Protagonist', description: 'A mysterious traveler.' },
    worldAtmosphere: data.worldAtmosphere || '',
    keyLocations: data.keyLocations || '',
    characterFlaws: data.characterFlaws || '',
    secretMotive: data.secretMotive || '',
    gameSystem: data.gameSystem || '',
    questObjective: data.questObjective || '',
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

  const response = await withRetry(() =>
    ai.models.generateContent({
      model: 'gemini-2.5-flash-preview-05-20',
      contents: { parts: [{ text: prompt }] },
    }),
  );

  for (const part of (response as any).candidates?.[0]?.content?.parts || []) {
    if (part.inlineData) {
      return `data:image/png;base64,${part.inlineData.data}`;
    }
  }
  return '';
}

export async function refineField(
  field: string,
  profile: CharacterProfile,
): Promise<string> {
  const ai = getGenAI();
  const response = await withRetry(() =>
    ai.models.generateContent({
      model: 'gemini-2.5-flash-preview-05-20',
      contents: `Refine the ${field} for this character: ${JSON.stringify(profile)}`,
    }),
  );
  return response.text || '';
}

export async function refineTraits(
  profile: CharacterProfile,
): Promise<Record<string, number>> {
  const ai = getGenAI();
  const response = await withRetry(() =>
    ai.models.generateContent({
      model: 'gemini-2.5-flash-preview-05-20',
      contents: `Suggest traits (0-100) for this character: ${JSON.stringify(profile)}`,
      config: {
        responseMimeType: 'application/json',
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
            lethality: { type: Type.INTEGER },
          },
        },
      },
    }),
  );
  return JSON.parse(response.text || '{}');
}

// ─────────────────────────────────────────────
// Chat & streaming — single deduplicated implementation
// ─────────────────────────────────────────────

export async function* generateTextReplyStream(
  history: { role: string; text: string }[],
  profile: CharacterProfile,
  userInput: string,
  codexEntries: CodexEntry[] = [],
  currentSummary = '',
  settings?: AppSettings,
): AsyncGenerator<string> {
  const resolvedSettings = settings ?? getSettings();
  const systemInstruction = buildSystemInstruction(profile, codexEntries, currentSummary);

  if (resolvedSettings.activeTextProvider === 'OpenRouter') {
    yield* streamOpenRouter(history, userInput, systemInstruction, resolvedSettings);
    return;
  }

  const ai = getGenAI();
  const chat = ai.chats.create({
    model: resolvedSettings.activeModel || 'gemini-2.5-flash-preview-05-20',
    config: { systemInstruction },
    history: buildHistory(history),
  });

  const responseStream = await chat.sendMessageStream({ message: userInput });
  for await (const chunk of responseStream) {
    yield chunk.text || '';
  }
}

async function* streamOpenRouter(
  history: { role: string; text: string }[],
  userInput: string,
  systemInstruction: string,
  settings: AppSettings,
): AsyncGenerator<string> {
  const apiKey = (import.meta as any).env?.VITE_OPENROUTER_API_KEY || '';
  if (!apiKey) throw new Error('No OpenRouter API key configured.');

  const messages = [
    { role: 'system', content: systemInstruction },
    ...history.map(m => ({
      role: m.role === 'model' ? 'assistant' : 'user',
      content: m.text,
    })),
    { role: 'user', content: userInput },
  ];

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model: settings.activeModel, messages, stream: true }),
  });

  if (!response.ok) throw new Error(`OpenRouter error: ${response.statusText}`);
  if (!response.body) return;

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();
      if (data === '[DONE]') return;
      try {
        const json = JSON.parse(data);
        yield json.choices?.[0]?.delta?.content || '';
      } catch {
        // Malformed chunk — skip
      }
    }
  }
}

// ─────────────────────────────────────────────
// Utility AI calls
// ─────────────────────────────────────────────

export async function summarizeHistory(
  history: { role: string; text: string }[],
  previousSummary = '',
): Promise<string> {
  const ai = getGenAI();
  const response = await withRetry(() =>
    ai.models.generateContent({
      model: 'gemini-2.5-flash-preview-05-20',
      contents: `Summarize the following story history. Keep it concise but include key events, character development, and important details.
Previous Summary: ${previousSummary}
New Events:
${JSON.stringify(history)}
Please provide an updated summary.`,
    }),
  );
  return response.text?.trim() || previousSummary;
}

export async function suggestNextAction(
  history: { role: string; text: string }[],
  profile: CharacterProfile,
): Promise<string> {
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

Return ONLY the suggested text, ready to be used as user input. Make it immersive, descriptive, and perfectly in-character for the player. Do not include quotes, explanations, or any other text.`;

  const chat = ai.chats.create({
    model: 'gemini-2.5-flash-preview-05-20',
    config: { systemInstruction },
    history: buildHistory(history),
  });

  const response = await withRetry(() =>
    chat.sendMessage({ message: 'Suggest the next action or dialogue for my character.' }),
  );
  return response.text?.trim() || '';
}

export async function refineInput(
  input: string,
  profile: CharacterProfile,
  history: { role: string; text: string }[],
  customInstructions?: string,
): Promise<string> {
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
Return ONLY the refined text. Do not include quotes, explanations, or any other text.`;

  const chat = ai.chats.create({
    model: 'gemini-2.5-flash-preview-05-20',
    config: { systemInstruction },
    history: buildHistory(history),
  });

  const response = await withRetry(() =>
    chat.sendMessage({ message: `Refine this input: "${input}"` }),
  );
  return response.text?.trim() || input;
}

export async function generateSpeech(
  text: string,
  voiceName: string,
  voiceSettings: { pitch?: string; speed?: string; accent?: string },
  tone: string,
): Promise<string> {
  if (!text?.trim()) return '';
  const ai = getGenAI();

  const prompt = `Perform the following text as a cinematic, deep audiobook storyteller.
Use a ${tone || 'natural'} tone with rich emotional prosody.
Incorporate natural breath pauses and human-like pacing.
Avoid all robotic, flat, or whiny artifacts.
The delivery should be immersive, professional, and evocative.

Voice Parameters: ${voiceSettings?.pitch || 'Normal'} pitch, ${voiceSettings?.speed || 'Normal'} speed, ${voiceSettings?.accent || 'No'} accent.

Text to perform:
${text}`;

  const response = await withRetry(() =>
    ai.models.generateContent({
      model: 'gemini-2.5-flash-preview-tts',
      contents: [{ parts: [{ text: prompt }] }],
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: voiceName || 'Kore' },
          },
        },
      },
    } as any),
  );

  return (response as any).candidates?.[0]?.content?.parts?.[0]?.inlineData?.data || '';
}

export async function extractCodexEntries(
  history: { role: string; text: string }[],
  profile: CharacterProfile,
  existingEntries: CodexEntry[],
): Promise<Partial<CodexEntry>[]> {
  const ai = getGenAI();
  const existingTitles = existingEntries.map(e => e.title).join(', ');

  const response = await withRetry(() =>
    ai.models.generateContent({
      model: 'gemini-2.5-flash-preview-05-20',
      contents: `Analyze the following roleplay history and character profile. Identify any significant new lore, locations, items, or mechanics that should be added to the world codex.
Do not suggest entries that already exist: [${existingTitles}]

Character Profile: ${JSON.stringify(profile)}
History: ${JSON.stringify(history.slice(-20))}

Return a JSON array of new codex entries.`,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              content: { type: Type.STRING },
              category: { type: Type.STRING, enum: ['Lore', 'Mechanics', 'Location', 'Item'] },
            },
            required: ['title', 'content', 'category'],
          },
        },
      },
    }),
  );

  try {
    return JSON.parse(response.text || '[]');
  } catch {
    return [];
  }
}

export async function refineCodexEntry(
  entry: Partial<CodexEntry>,
  profile: CharacterProfile,
): Promise<Partial<CodexEntry>> {
  const ai = getGenAI();
  const response = await withRetry(() =>
    ai.models.generateContent({
      model: 'gemini-2.5-flash-preview-05-20',
      contents: `Refine this codex entry to be more descriptive, immersive, and consistent with the world of ${profile.name}.
Current Entry: ${JSON.stringify(entry)}
World Context: ${profile.worldAtmosphere || 'Not specified'}

Return the refined entry as JSON with the same fields (title, content, category).`,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            content: { type: Type.STRING },
            category: { type: Type.STRING, enum: ['Lore', 'Mechanics', 'Location', 'Item'] },
          },
          required: ['title', 'content', 'category'],
        },
      },
    }),
  );

  try {
    return JSON.parse(response.text || JSON.stringify(entry));
  } catch {
    return entry;
  }
}

// Stubs retained for future implementation
export async function generateVeoAnimation(): Promise<string> { return ''; }
export async function generateVoiceReply(): Promise<string> { return ''; }
