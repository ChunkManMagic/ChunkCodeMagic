// Port of Android ChatViewModel.buildDirectorPrompt()
export function buildDirectorPrompt(
  characterName: string,
  characterArchetype: string,
  sceneContext: string,
  style: string,
  pacing: string,
  accent: string,
  transcript: string
): string {
  const lines: string[] = [];
  lines.push(`# AUDIO PROFILE: ${characterName}`);
  lines.push(`## "${characterArchetype}"`);
  lines.push('');
  lines.push('## THE SCENE');
  lines.push(sceneContext);
  lines.push('');
  lines.push("### DIRECTOR'S NOTES");
  if (style) lines.push(`Style: ${style}`);
  if (pacing) lines.push(`Pacing: ${pacing}`);
  if (accent) lines.push(`Accent: ${accent}`);
  lines.push('');
  lines.push('### TRANSCRIPT');
  lines.push(transcript);
  return lines.join('\n');
}

import type { CharacterProfile } from './types';

export function buildDirectorPromptFromProfile(
  profile: CharacterProfile,
  storySummary: string,
  backstory: string | undefined,
  transcript: string
): string | undefined {
  const hasVoiceProfile = !!(profile.voiceArchetype || profile.voiceStyle || profile.voicePacing || profile.voiceAccent);
  if (!hasVoiceProfile) return undefined;
  const sceneContext = storySummary?.slice(-200) || backstory?.slice(0, 200) || '';
  return buildDirectorPrompt(
    profile.name || 'Character',
    profile.voiceArchetype || profile.name || 'Character',
    sceneContext,
    profile.voiceStyle || '',
    profile.voicePacing || '',
    profile.voiceAccent || '',
    transcript
  );
}
