import { useState, useCallback } from 'react';
import { defaultTtsEngine } from '../lib/ttsEngine';
import { buildDirectorPromptFromProfile } from '../lib/voiceDirector';
import { getSettings } from '../lib/types';
import type { CharacterProfile, VoiceSettings } from '../lib/types';

export function useVoice(voiceName: string, _voiceSettings?: VoiceSettings, _storyTone?: string) {
  const [isPlaying, setIsPlaying] = useState(false);

  const handleReadAloud = useCallback((text: string, profile?: CharacterProfile) => {
    try {
      const settings = getSettings();
      // Strip OOC, markdown, and inline audio tags from spoken text
      const clean = text
        .replace(/<ooc>[\s\S]*?<\/ooc>/gi, '')
        .replace(/\[.*?\]/g, '')
        .replace(/[*#_~`]/g, '')
        .trim();
      if (!clean) return;

      // Stop anything currently playing
      defaultTtsEngine.stop();
      window.speechSynthesis.cancel();

      const voiceNameToUse = settings.liveVoiceName || voiceName || 'Kore';
      const useFast = settings.voiceQuality !== 'quality';

      // Build director prompt if profile is available
      const directorPrompt = profile
        ? (buildDirectorPromptFromProfile(profile, '', '', clean) ?? null)
        : null;

      setIsPlaying(true);
      defaultTtsEngine.onSpeakingChanged = (speaking) => {
        setIsPlaying(speaking);
      };
      defaultTtsEngine.speak(clean, voiceNameToUse, directorPrompt, useFast, () => {
        setIsPlaying(false);
      });
    } catch (err) {
      console.error('Speech Error:', err);
      setIsPlaying(false);
    }
  }, [voiceName]);

  const stopAudio = useCallback(() => {
    defaultTtsEngine.stop();
    setIsPlaying(false);
  }, []);

  return {
    isPlaying,
    handleReadAloud,
    togglePause: () => defaultTtsEngine.stop(),
    stopAudio,
  };
}