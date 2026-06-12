import { cn } from "@/lib/utils";

export function LoadingSkeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn("animate-pulse rounded-[2px] bg-[var(--surface-panel)]", className)} />;
}

export function PageSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="grid gap-5">
      <div className="pb-2">
        <LoadingSkeleton className="h-4 w-36" />
        <LoadingSkeleton className="mt-3 h-8 w-72 max-w-full" />
        <LoadingSkeleton className="mt-3 h-4 w-[32rem] max-w-full" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <LoadingSkeleton key={index} className="h-28" />
        ))}
      </div>
      <div className="overflow-hidden rounded-[4px] border border-[var(--border)] bg-white">
        {Array.from({ length: rows }).map((_, index) => (
          <div key={index} className="border-b border-[var(--border)] p-4 last:border-b-0">
            <LoadingSkeleton className="h-4 w-48" />
            <LoadingSkeleton className="mt-3 h-3 w-full max-w-[36rem]" />
          </div>
        ))}
      </div>
    </div>
  );
}
