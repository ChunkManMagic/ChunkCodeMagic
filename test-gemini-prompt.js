import { GoogleGenAI } from '@google/genai';
import { Type } from '@google/genai';
import dotenv from 'dotenv';
dotenv.config();

const ai = new GoogleGenAI({ apiKey: process.env.VITE_GEMINI_API_KEY });
const modeGuidance = `This is a SCENARIO (interactive story) mode.
        - "name" is the Scenario Title.
       - "personality" is the world's narrative voice (e.g., "Noir detective style", "Epic poetic").
       - "backstory" is the world's history.
       - "appearance" is a visual description of the setting.
       - "clothing" is the Environment Type (e.g., "Cyberpunk City", "Fantasy Forest").
       - "accessories" are Lighting/Weather (e.g., "Neon glow", "Moonlit").
       - "hairStyle" is the Primary Color Palette (e.g., "Cool blues").
       - "hairColor" is the Secondary Color Palette (e.g., "Gritty browns").
       - "eyeColor" is the Key Landmark (e.g., "Giant glowing tree").
       - Populate worldAtmosphere, keyLocations, scenarioStakes, scenarioConflict, timePeriod, factions, magicOrTechnologyLevel, and incitingIncident with vivid, specific details.
        - The narrator's "personality" is the world's narrative voice.`;

const contents = `Generate a detailed character profile based on this idea: "unknown"${modeGuidance}
Instructions:
1. You MUST fill in EVERY field in the schema. Do not leave any field empty or as a placeholder.
2. Ensure the content is HIGHLY creative, deeply immersive, and fits the SCENARIO mode perfectly.
3. For all descriptive text fields (e.g., backstory, appearance, personality, worldAtmosphere, keyLocations, etc.), you MUST write detailed, multi-sentence paragraphs (at least 3-5 sentences). DO NOT use single-word or generic answers. Be highly descriptive, rich in narrative detail, and creative.
4. Also generate a detailed player character profile (playerProfile) that would be a compelling fit for this story/session. Fill in all fields for the player character too with rich descriptions.`;

const schemaConfig = {
      maxOutputTokens: 8192,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING, description: "A creative and fitting name." },
          personality: { type: Type.STRING, description: "Detailed, multi-sentence paragraph describing personality." },
          backstory: { type: Type.STRING, description: "Detailed, rich multi-sentence paragraph detailing backstory." },
          appearance: { type: Type.STRING, description: "Detailed, multi-sentence paragraph detailing physical appearance." },
          clothing: { type: Type.STRING, description: "Detailed description of clothing/environment." },
          accessories: { type: Type.STRING, description: "Detailed description of accessories/weather/lighting." },
          hairStyle: { type: Type.STRING, description: "Detailed description of hair style/atmosphere." },
          hairColor: { type: Type.STRING, description: "Detailed description of color palette." },
          eyeColor: { type: Type.STRING, description: "Detailed description of eyes or landmarks." },
          storyTone: { type: Type.STRING, description: "Detailed description of the story tone." },
          relationship: { type: Type.STRING, description: "Detailed description of relationships." },
          characterFlaws: { type: Type.STRING, description: "Detailed description of character flaws." },
          secretMotive: { type: Type.STRING, description: "Detailed description of secret motives." },
          speechPattern: { type: Type.STRING, description: "Detailed description of speech patterns." },
          likesAndDislikes: { type: Type.STRING, description: "Detailed description of likes and dislikes." },
          coreBeliefs: { type: Type.STRING, description: "Detailed description of core beliefs." },
          quirks: { type: Type.STRING, description: "Detailed description of quirks." },
          worldAtmosphere: { type: Type.STRING, description: "Detailed, multi-sentence paragraph describing world atmosphere." },
          keyLocations: { type: Type.STRING, description: "Detailed, multi-sentence paragraph describing key locations." },
          scenarioStakes: { type: Type.STRING, description: "Detailed description of stakes." },
          scenarioConflict: { type: Type.STRING, description: "Detailed description of conflict." },
          timePeriod: { type: Type.STRING, description: "Detailed description of time period." },
          factions: { type: Type.STRING, description: "Detailed description of factions." },
          magicOrTechnologyLevel: { type: Type.STRING, description: "Detailed description of magic/tech level." },
          incitingIncident: { type: Type.STRING, description: "Detailed description of inciting incident." },
          gameSystem: { type: Type.STRING, description: "Detailed description of game system." },
          questObjective: { type: Type.STRING, description: "Detailed description of quest objective." },
          dungeonMasterStyle: { type: Type.STRING, description: "Detailed description of DM style." },
          rulesComplexity: { type: Type.STRING, description: "Detailed description of rules complexity." },
          difficultyLevel: { type: Type.STRING, description: "Detailed description of difficulty." },
          partyComposition: { type: Type.STRING, description: "Detailed description of party composition." },
          startingEquipment: { type: Type.STRING, description: "Detailed description of starting equipment." },
          currentCampaignArc: { type: Type.STRING, description: "Detailed description of current campaign arc." },
          currentMood: { type: Type.STRING, description: "Detailed description of mood." },
          playerProfile: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING },
              description: { type: Type.STRING, description: "Detailed, multi-sentence paragraph." },
              personality: { type: Type.STRING, description: "Detailed, multi-sentence paragraph." },
              backstory: { type: Type.STRING, description: "Detailed, multi-sentence paragraph." },
              appearance: { type: Type.STRING, description: "Detailed, multi-sentence paragraph." },
              clothing: { type: Type.STRING },
              accessories: { type: Type.STRING },
              hairStyle: { type: Type.STRING },
              hairColor: { type: Type.STRING },
              eyeColor: { type: Type.STRING },
            }
          }
        },
      }
    };

async function run() {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: contents,
      config: schemaConfig,
    });
    console.log(response.text);
  } catch(e) {
    console.error(e);
  }
}
run();
