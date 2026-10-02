import { LoadingRegion, Skeleton } from "@/components/ui/misc";

/** Library skeleton: collections sidebar, header, toolbar and a card grid. */
export default function Loading() {
  return (
    <LoadingRegion label="Carregando links" className="flex min-h-0 flex-1">
      <aside className="flex w-[272px] shrink-0 flex-col gap-2 border-r border-line bg-surface-2 p-4 max-md:hidden">
        <Skeleton className="mb-3 h-5 w-20" />
        {Array.from({ length: 7 }, (_, i) => (
          <Skeleton key={i} className="h-7 rounded-lg" style={{ width: `${88 - (i % 3) * 14}%` }} />
        ))}
        <Skeleton className="mb-1 mt-5 h-3 w-24" />
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-7 rounded-lg" style={{ width: `${80 - (i % 2) * 20}%` }} />
        ))}
      </aside>
      <div className="min-w-0 flex-1 overflow-hidden">
        <div className="mx-auto flex max-w-[1480px] flex-col gap-[22px] px-4 py-7 sm:px-6 lg:px-10">
          <div className="flex flex-col gap-2.5">
            <Skeleton className="h-3 w-12" />
            <Skeleton className="h-10 w-64 rounded-control" />
            <Skeleton className="h-4 w-80 max-w-full" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-9 w-64 rounded-control" />
            <Skeleton className="h-9 w-28 rounded-full" />
          </div>
          <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(232px,1fr))]">
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} className="flex flex-col overflow-hidden rounded-card border border-line bg-surface">
                <Skeleton className="h-28 rounded-none" style={{ animationDelay: `${i * 60}ms` }} />
                <div className="flex flex-col gap-2 p-4">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/3" />
                  <Skeleton className="h-3 w-full" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </LoadingRegion>
  );
}
