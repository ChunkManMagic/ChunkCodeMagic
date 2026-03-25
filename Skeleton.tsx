import { cn } from '../lib/utils';

interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      className={cn(
        'animate-pulse rounded-lg bg-white/5',
        className,
      )}
      aria-hidden="true"
    />
  );
}

/** Full chat loading state — shown while IndexedDB messages load */
export function ChatSkeleton() {
  return (
    <div className="flex flex-col gap-4 p-6" aria-label="Loading messages…">
      {/* Model message */}
      <div className="flex gap-3 items-start">
        <Skeleton className="w-8 h-8 rounded-full shrink-0" />
        <div className="flex flex-col gap-2 flex-1">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      </div>
      {/* User message */}
      <div className="flex gap-3 items-start justify-end">
        <div className="flex flex-col gap-2 items-end" style={{ maxWidth: '60%' }}>
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-4 w-32" />
        </div>
      </div>
      {/* Model message */}
      <div className="flex gap-3 items-start">
        <Skeleton className="w-8 h-8 rounded-full shrink-0" />
        <div className="flex flex-col gap-2 flex-1">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-4/5" />
          <Skeleton className="h-4 w-3/5" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      </div>
    </div>
  );
}

/** Scenario card loading placeholder */
export function ScenarioCardSkeleton() {
  return (
    <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-4 flex gap-4">
      <Skeleton className="w-16 h-16 rounded-xl shrink-0" />
      <div className="flex flex-col gap-2 flex-1">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-3 w-full" />
      </div>
    </div>
  );
}
