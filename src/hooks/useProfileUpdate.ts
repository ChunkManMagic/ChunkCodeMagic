import { useState, useCallback } from 'react';
import { CharacterProfile } from '../lib/types';
import { updateCharacterProfilesFromHistory } from '../lib/gemini';

export function useProfileUpdate(profile: CharacterProfile, onUpdateProfile: (profile: CharacterProfile) => void) {
  const [isAutoProfileEnabled, setIsAutoProfileEnabled] = useState(false);
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);

  const handleAutoUpdateProfile = useCallback(async (messages: any[], force = false, historyOverride?: any[]) => {
    const currentHistory = historyOverride || messages.map(m => ({ role: m.role, parts: [{ text: m.text }] }));
    if (isUpdatingProfile || currentHistory.length < 5) return;
    if (!force && (!isAutoProfileEnabled || currentHistory.length % 20 !== 0)) return;

    setIsUpdatingProfile(true);
    try {
      const updates = await updateCharacterProfilesFromHistory(currentHistory, profile);
      if (updates && Object.keys(updates).length > 0) {
        onUpdateProfile({ ...profile, ...updates });
      }
    } catch (e) {
      console.error("Auto-profile update failed", e);
    } finally {
      setIsUpdatingProfile(false);
    }
  }, [profile, isAutoProfileEnabled, isUpdatingProfile, onUpdateProfile]);

  return {
    isAutoProfileEnabled,
    setIsAutoProfileEnabled,
    isUpdatingProfile,
    handleAutoUpdateProfile
  };
}
