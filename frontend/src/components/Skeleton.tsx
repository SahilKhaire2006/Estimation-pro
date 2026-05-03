import React from "react";

/** Single shimmer block */
export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`relative overflow-hidden rounded-lg bg-slate-100 ${className}`}
    >
      <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.4s_infinite] bg-gradient-to-r from-transparent via-white/60 to-transparent" />
    </div>
  );
}

/** Dashboard card skeleton */
export function ProjectCardSkeleton() {
  return (
    <div className="rounded-2xl border border-border bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 space-y-2">
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-3 w-1/3" />
        </div>
        <Skeleton className="h-6 w-16 rounded-full" />
      </div>
      <div className="mt-4 flex gap-2">
        <Skeleton className="h-5 w-14 rounded-full" />
        <Skeleton className="h-5 w-16 rounded-full" />
        <Skeleton className="h-5 w-18 rounded-full" />
      </div>
      <Skeleton className="mt-5 h-9 w-full" />
    </div>
  );
}

/** Session page header skeleton */
export function SessionHeaderSkeleton() {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="space-y-2">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-7 w-64" />
        <div className="flex gap-2 pt-1">
          <Skeleton className="h-5 w-28 rounded-full" />
          <Skeleton className="h-5 w-36 rounded-full" />
        </div>
      </div>
      <div className="flex gap-2">
        <Skeleton className="h-9 w-24" />
        <Skeleton className="h-9 w-20" />
      </div>
    </div>
  );
}

/** Estimation card skeleton */
export function EstCardSkeleton() {
  return (
    <div className="rounded-2xl border border-border bg-white p-5 shadow-sm space-y-3">
      <div className="flex items-center justify-between">
        <Skeleton className="h-5 w-16 rounded-full" />
        <Skeleton className="h-4 w-20" />
      </div>
      <Skeleton className="h-3 w-32" />
      {[1, 2, 3].map((i) => (
        <div key={i} className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-3 w-12" />
        </div>
      ))}
    </div>
  );
}

/** Stats chart skeleton */
export function ChartSkeleton({ height = "h-64" }: { height?: string }) {
  return (
    <div className={`rounded-2xl border border-border bg-white p-5 shadow-sm`}>
      <Skeleton className="h-4 w-40 mb-4" />
      <Skeleton className={`w-full ${height}`} />
    </div>
  );
}

/** Table row skeleton */
export function TableRowSkeleton({ cols = 4 }: { cols?: number }) {
  return (
    <div className="flex gap-3 px-3 py-2">
      {Array.from({ length: cols }).map((_, i) => (
        <Skeleton key={i} className="h-4 flex-1" />
      ))}
    </div>
  );
}
