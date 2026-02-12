"use client";

export function MovieCardSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="aspect-[2/3] bg-card rounded-lg" />
      <div className="mt-2 space-y-2">
        <div className="h-3 bg-card rounded w-3/4" />
        <div className="h-3 bg-card rounded w-1/2" />
      </div>
    </div>
  );
}

export function MovieGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <MovieCardSkeleton key={i} />
      ))}
    </div>
  );
}

export function PlayerSkeleton() {
  return (
    <div className="animate-pulse aspect-video bg-card rounded-2xl flex items-center justify-center">
      <div className="w-20 h-20 rounded-full bg-muted" />
    </div>
  );
}

export function TextSkeleton({ lines = 3, className = "" }: { lines?: number; className?: string }) {
  return (
    <div className={`animate-pulse space-y-2 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className={`h-3 bg-card rounded ${i === lines - 1 ? "w-2/3" : "w-full"}`} />
      ))}
    </div>
  );
}

export function HistoryItemSkeleton() {
  return (
    <div className="animate-pulse flex items-center gap-4 p-3 bg-card border border-border rounded-xl">
      <div className="w-16 h-24 bg-muted rounded-lg flex-shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="h-4 bg-muted rounded w-3/4" />
        <div className="h-3 bg-muted rounded w-1/2" />
        <div className="h-1 bg-muted rounded w-full" />
      </div>
    </div>
  );
}
