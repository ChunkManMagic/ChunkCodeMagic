import { UsageSnapshot } from '../hooks/useApiUsageMonitor';

export function UsageMonitorCard({ usageState }: { usageState: UsageSnapshot }) {
  const modelsToShow = usageState.models.filter(m => m.dailyCount > 0 || m.isNearDailyLimit);

  return (
    <div className="w-full p-4 rounded-2xl bg-white/[0.04] border border-white/10 space-y-3">
      <div>
        <h4 className="text-sm font-bold text-white">API Usage Monitor</h4>
        <p className="text-xs text-zinc-400">Free tier · Resets midnight Pacific</p>
      </div>

      {modelsToShow.length === 0 ? (
        <p className="text-sm text-zinc-500">No API calls recorded today.</p>
      ) : (
        <div className="space-y-3">
          {modelsToShow.map(model => (
            <div key={model.modelId} className="space-y-1">
              <div className="flex justify-between items-center">
                <span className="text-xs font-medium text-zinc-300 truncate max-w-[60%]">{model.modelId.replace('gemini-','').slice(0,30)}</span>
                <span className={`text-xs ${model.isAtDailyLimit ? 'text-red-400' : model.isNearDailyLimit ? 'text-amber-400' : 'text-zinc-500'}`}>
                  {model.dailyCount} / {model.dailyLimit} today  |  {model.currentRpm} RPM
                </span>
              </div>
              <div className="h-1.5 w-full bg-black/40 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${model.isAtDailyLimit ? 'bg-red-500' : model.isNearDailyLimit ? 'bg-amber-500' : 'bg-emerald-500'}`}
                  style={{ width: `${Math.min(100, model.dailyPercent * 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="pt-3 border-t border-white/10 space-y-2">
        <h5 className="text-xs font-bold text-white">Free Tier Reference</h5>
        {[
          ['2.5 Flash (chat)', '10 RPM', '1,500/day'],
          ['2.5 Pro (chat)', '5 RPM', '50/day ⚠️'],
          ['3.1 Flash TTS', '~15 QPM', '~500/day'],
          ['2.5 Pro TTS', '~20 QPM', '~200/day'],
          ['Live API', '3 sessions', '1M TPM'],
        ].map(([name, rpm, rpd]) => (
          <div key={name} className="flex justify-between text-xs">
            <span className="text-zinc-300 flex-1">{name}</span>
            <span className="text-zinc-400 w-24 text-center">{rpm}</span>
            <span className={rpd.includes('⚠️') ? 'text-red-400' : 'text-zinc-500'}>{rpd}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
