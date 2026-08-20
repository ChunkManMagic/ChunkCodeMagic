import { useEffect, useMemo, useState } from 'react';
import {
  startAmbientSoundscape,
  stopAmbientSoundscape,
  resumeAmbient,
  setAmbientVolume,
  setAmbientDucked,
  mapToAmbientPreset,
  getAmbientState,
} from '../lib/ambientSound';
import { AmbientPresetId } from '../lib/ambientPresets';
import { getSettings, CharacterProfile } from '../lib/types';

// Plays a procedural ambient soundscape matched to the scene's world
// atmosphere / story tone while the chat screen is open. Reads settings fresh
// (via the personaforge:settings event) so toggles take effect without the
// component re-rendering, and ducks the ambience while a Live Voice call is
// active so the open mic never feeds it back to the model.
export function useAmbientSoundscape(profile: CharacterProfile, isLiveVoiceActive: boolean): void {
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    const onSettings = () => setNonce((n) => n + 1);
    window.addEventListener('personaforge:settings', onSettings);
    return () => window.removeEventListener('personaforge:settings', onSettings);
  }, []);

  const settings = getSettings();
  const enabled = settings.enableAmbientSoundscape !== false;
  const manualPreset = settings.ambientSoundscape as AmbientPresetId | undefined;
  const volume = settings.ambientVolume ?? 0.15;

  const preset = useMemo<AmbientPresetId>(
    () => manualPreset || mapToAmbientPreset(profile.worldAtmosphere || '', profile.storyTone || ''),
    [manualPreset, profile.worldAtmosphere, profile.storyTone]
  );

  useEffect(() => {
    const state = getAmbientState();
    if (!enabled) {
      if (state.active) stopAmbientSoundscape();
      return;
    }
    if (!state.active || state.preset !== preset) {
      startAmbientSoundscape(preset);
    }
    return () => stopAmbientSoundscape();
  }, [enabled, preset, nonce]);

  // Volume is a live tweak — never tear the graph down for it.
  useEffect(() => {
    setAmbientVolume(volume);
  }, [volume]);

  useEffect(() => {
    setAmbientDucked(isLiveVoiceActive);
  }, [isLiveVoiceActive]);

  // Autoplay policy can leave a freshly created context suspended until a
  // user gesture; resume on the first interaction.
  useEffect(() => {
    const resume = () => resumeAmbient();
    window.addEventListener('pointerdown', resume);
    window.addEventListener('keydown', resume);
    window.addEventListener('touchend', resume);
    return () => {
      window.removeEventListener('pointerdown', resume);
      window.removeEventListener('keydown', resume);
      window.removeEventListener('touchend', resume);
    };
  }, []);
}