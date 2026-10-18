import { LoadingRegion, Skeleton } from "@/components/ui/misc";

/** Settings skeleton: title, the tab list and a section. */
export default function Loading() {
  return (
    <LoadingRegion label="Carregando configurações" className="scrollbar-thin flex-1 overflow-hidden">
      <div className="mx-auto flex w-full max-w-[1080px] flex-col gap-8 px-6 pt-10 sm:px-10">
        <div className="flex flex-col gap-3">
          <Skeleton className="h-10 w-64 rounded-control" />
          <Skeleton className="h-4 w-96 max-w-full" />
        </div>
        <div className="flex flex-col gap-6 md:flex-row md:gap-10">
          <div className="flex gap-1 md:w-56 md:flex-col">
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="h-9 w-28 rounded-lg md:w-full" style={{ animationDelay: `${i * 60}ms` }} />
            ))}
          </div>
          <div className="flex flex-1 flex-col gap-4">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-80 max-w-full" />
            <Skeleton className="h-24 w-full rounded-card" />
            <Skeleton className="h-40 w-full rounded-card" />
          </div>
        </div>
      </div>
    </LoadingRegion>
  );
}
