async function run() {
  try {
    const res = await fetch('http://localhost:3000/api/gemini/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gemini-2.5-flash',
        contents: `Generate a detailed character profile based on this idea: "unknown"
This is a SCENARIO (interactive story) mode.
Instructions:
1. You MUST fill in EVERY field in the schema. Do not leave any field empty or as a placeholder.
2. Ensure the content is HIGHLY creative, deeply immersive, and fits the SCENARIO mode perfectly.
3. For all descriptive text fields (e.g., backstory, appearance, personality, worldAtmosphere, keyLocations, etc.), you MUST write detailed, multi-sentence paragraphs (at least 3-5 sentences). DO NOT use single-word or generic answers. Be highly descriptive, rich in narrative detail, and creative.
4. Also generate a detailed player character profile (playerProfile) that would be a compelling fit for this story/session. Fill in all fields for the player character too with rich descriptions.`,
        config: {
          maxOutputTokens: 8192,
          responseMimeType: "application/json",
          responseSchema: {
            type: "OBJECT",
            properties: {
              name: { type: "STRING" },
              personality: { type: "STRING" },
              playerProfile: {
                type: "OBJECT",
                properties: {
                  name: { type: "STRING" },
                  description: { type: "STRING" },
                  personality: { type: "STRING" },
                }
              }
            }
          }
        }
      })
    });
    const text = await res.text();
    console.log("RESPONSE:", text);
  } catch(e) {
    console.error(e);
  }
}
run();
