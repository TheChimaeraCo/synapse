/**
 * Page-specific skeleton loaders for loading states.
 * Uses the shared Skeleton primitive from ./skeleton.tsx
 */

import { Skeleton } from "./skeleton";

/* ── Chat page skeleton ── */
export function ChatSkeleton() {
  return (
    <div className="flex flex-col gap-4 p-4 animate-fade-in">
      {/* Incoming message */}
      <div className="flex gap-3 max-w-[70%]">
        <Skeleton className="h-8 w-8 rounded-full shrink-0" />
        <div className="space-y-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-16 w-64 rounded-2xl rounded-tl-md" />
        </div>
      </div>
      {/* Outgoing message */}
      <div className="flex gap-3 max-w-[70%] ml-auto flex-row-reverse">
        <Skeleton className="h-8 w-8 rounded-full shrink-0" />
        <div className="space-y-2 flex flex-col items-end">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-12 w-48 rounded-2xl rounded-tr-md" />
        </div>
      </div>
      {/* Another incoming */}
      <div className="flex gap-3 max-w-[70%]">
        <Skeleton className="h-8 w-8 rounded-full shrink-0" />
        <div className="space-y-2">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-24 w-80 rounded-2xl rounded-tl-md" />
        </div>
      </div>
      {/* Outgoing */}
      <div className="flex gap-3 max-w-[70%] ml-auto flex-row-reverse">
        <Skeleton className="h-8 w-8 rounded-full shrink-0" />
        <div className="space-y-2 flex flex-col items-end">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-10 w-36 rounded-2xl rounded-tr-md" />
        </div>
      </div>
    </div>
  );
}

/* ── Knowledge page skeleton ── */
export function KnowledgeSkeleton() {
  return (
    <div className="space-y-5 animate-fade-in">
      {/* Graph + category row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Skeleton className="lg:col-span-2 h-64 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-2xl" />
        ))}
      </div>
      {/* List items */}
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-16 rounded-xl" style={{ animationDelay: `${i * 75}ms` }} />
        ))}
      </div>
    </div>
  );
}

/* ── Projects page skeleton ── */
export function ProjectsSkeleton() {
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-48 rounded-xl" style={{ animationDelay: `${i * 75}ms` }} />
        ))}
      </div>
    </div>
  );
}

/* ── Analytics page skeleton ── */
export function AnalyticsSkeleton() {
  return (
    <div className="p-4 lg:p-6 space-y-6 animate-fade-in">
      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-2xl" />
        ))}
      </div>
      {/* Main chart */}
      <Skeleton className="h-64 rounded-2xl" />
      {/* Two charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Skeleton className="h-48 rounded-2xl" />
        <Skeleton className="h-48 rounded-2xl" />
      </div>
    </div>
  );
}

/* ── Files page skeleton ── */
export function FilesSkeleton() {
  return (
    <div className="flex h-full animate-fade-in">
      {/* Tree panel */}
      <div className="w-[280px] border-r border-white/10 p-3 space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-2" style={{ paddingLeft: `${(i % 3) * 16}px` }}>
            <Skeleton className="h-4 w-4 rounded" />
            <Skeleton className="h-4 rounded" style={{ width: `${60 + Math.random() * 80}px` }} />
          </div>
        ))}
      </div>
      {/* Content */}
      <div className="flex-1 p-4 space-y-1">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-3 py-2">
            <Skeleton className="h-4 w-4 rounded" />
            <Skeleton className="h-4 flex-1 rounded max-w-[200px]" />
            <Skeleton className="h-3 w-12 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}
