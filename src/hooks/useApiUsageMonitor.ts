/**
 * Port of Android ApiUsageMonitor.kt — browser localStorage-backed hook
 * Same FREE_TIER limits, daily reset at midnight Pacific.
 */
import { useState, useEffect, useCallback } from 'react';

export const FREE_TIER_RPD: Record<string, number> = {
  'gemini-2.5-flash': 1500,
  'gemini-2.5-pro': 50,
  'gemini-2.0-flash': 1500,
  'gemini-3-flash': 1500,
  'gemini-3.1-flash-lite': 1000,
  'gemini-2.5-pro-preview-tts': 200,
  'gemini-3.1-flash-tts-preview': 500,
  'gemini-2.5-flash-preview-tts': 500,
  'gemini-3.1-flash-live-preview': 200,
  'gemini-2.5-flash-native-audio-preview-12-2025': 200,
};

export const FREE_TIER_RPM: Record<string, number> = {
  'gemini-2.5-flash': 10,
  'gemini-2.5-pro': 5,
  'gemini-2.0-flash': 15,
  'gemini-3-flash': 10,
  'gemini-3.1-flash-lite': 15,
  'gemini-2.5-pro-preview-tts': 20,
  'gemini-3.1-flash-tts-preview': 15,
  'gemini-2.5-flash-preview-tts': 15,
};

export interface ModelUsage {
  modelId: string;
  dailyCount: number;
  dailyLimit: number;
  minuteRequests: number[]; // timestamps
  rpmLimit: number;
  dailyPercent: number;
  currentRpm: number;
  isNearDailyLimit: boolean;
  isAtDailyLimit: boolean;
  isNearRpmLimit: boolean;
}

export interface UsageSnapshot {
  models: ModelUsage[];
  lastUpdated: number;
}

function todayKey(): string {
  try {
    // midnight Pacific
    return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

function countKey(modelId: string, today: string) { return `count_${modelId}_${today}`; }
function tsKey(modelId: string) { return `timestamps_${modelId}`; }

function buildSnapshot(): UsageSnapshot {
  const today = todayKey();
  const now = Date.now();
  const models: ModelUsage[] = Object.keys(FREE_TIER_RPD).map(modelId => {
    const dailyCount = parseInt(localStorage.getItem(countKey(modelId, today)) || '0', 10) || 0;
    const dailyLimit = FREE_TIER_RPD[modelId] || 0;
    const rpmLimit = FREE_TIER_RPM[modelId] || 10;
    let minuteRequests: number[] = [];
    try {
      const raw = localStorage.getItem(tsKey(modelId)) || '';
      minuteRequests = raw.split(',').filter(Boolean).map(v => parseInt(v, 10)).filter(n => !isNaN(n) && now - n < 60000);
    } catch {}
    const currentRpm = minuteRequests.length;
    const dailyPercent = dailyLimit ? Math.min(1, dailyCount / dailyLimit) : 0;
    return {
      modelId,
      dailyCount,
      dailyLimit,
      minuteRequests,
      rpmLimit,
      dailyPercent,
      currentRpm,
      isNearDailyLimit: dailyPercent >= 0.8,
      isAtDailyLimit: dailyCount >= dailyLimit,
      isNearRpmLimit: currentRpm >= Math.floor(rpmLimit * 0.8),
    };
  });
  return { models, lastUpdated: now };
}

export function recordRequest(modelId: string) {
  try {
    const today = todayKey();
    const ck = countKey(modelId, today);
    const tk = tsKey(modelId);
    const now = Date.now();
    const prev = parseInt(localStorage.getItem(ck) || '0', 10) || 0;
    localStorage.setItem(ck, String(prev + 1));
    let existing: number[] = [];
    try {
      const raw = localStorage.getItem(tk) || '';
      existing = raw.split(',').filter(Boolean).map(v => parseInt(v, 10)).filter(n => !isNaN(n) && now - n < 60000);
    } catch {}
    existing.push(now);
    localStorage.setItem(tk, existing.join(','));
    // Notify listeners via storage event hack + custom event
    window.dispatchEvent(new CustomEvent('api-usage-updated'));
  } catch (e) {
    console.warn('recordRequest failed', e);
  }
}

export function getWarningMessage(modelId: string, snapshot?: UsageSnapshot): string | null {
  const snap = snapshot || buildSnapshot();
  const usage = snap.models.find(m => m.modelId === modelId);
  if (!usage) return null;
  if (usage.isAtDailyLimit) return `⚠️ Daily limit reached for ${modelId}. Switching to fallback.`;
  if (usage.isNearDailyLimit) return `Daily usage at ${Math.floor(usage.dailyPercent * 100)}% for ${modelId}.`;
  if (usage.isNearRpmLimit) return `Approaching rate limit for ${modelId} (${usage.currentRpm}/${usage.rpmLimit} RPM).`;
  return null;
}

export function getAnyWarning(snapshot?: UsageSnapshot): string | null {
  const snap = snapshot || buildSnapshot();
  for (const m of snap.models) {
    const w = getWarningMessage(m.modelId, snap);
    if (w) return w;
  }
  return null;
}

export function useApiUsageMonitor() {
  const [snapshot, setSnapshot] = useState<UsageSnapshot>(() => {
    try { return buildSnapshot(); } catch { return { models: [], lastUpdated: Date.now() }; }
  });

  const refresh = useCallback(() => {
    try { setSnapshot(buildSnapshot()); } catch {}
  }, []);

  useEffect(() => {
    const handler = () => refresh();
    window.addEventListener('api-usage-updated', handler);
    window.addEventListener('storage', handler);
    const id = setInterval(refresh, 30000); // refresh RPM window
    return () => {
      window.removeEventListener('api-usage-updated', handler);
      window.removeEventListener('storage', handler);
      clearInterval(id);
    };
  }, [refresh]);

  const record = useCallback((modelId: string) => {
    recordRequest(modelId);
    refresh();
    return getWarningMessage(modelId, buildSnapshot());
  }, [refresh]);

  return {
    usageState: snapshot,
    recordRequest: record,
    getWarningMessage: (modelId: string) => getWarningMessage(modelId, snapshot),
    getAnyWarning: () => getAnyWarning(snapshot),
    refresh,
  };
}
