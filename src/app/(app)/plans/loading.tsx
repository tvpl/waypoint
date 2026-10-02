import { LoadingRegion, Skeleton } from "@/components/ui/misc";

/** Plans list skeleton: title, tabs and plan cards with a thumbnail area. */
export default function Loading() {
  return (
    <LoadingRegion label="Carregando plans" className="flex-1 overflow-hidden">
      <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-8 px-6 pt-12 sm:px-12 sm:pt-14">
        <div className="flex flex-col gap-3">
          <Skeleton className="h-11 w-44 rounded-control" />
          <Skeleton className="h-4 w-[420px] max-w-full" />
        </div>
        <div className="flex gap-2">
          {[64, 112, 84, 88].map((w, i) => (
            <Skeleton key={i} className="h-8 rounded-lg" style={{ width: w }} />
          ))}
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="flex flex-col overflow-hidden rounded-card border border-line bg-surface">
              <Skeleton className="h-[116px] rounded-none" style={{ animationDelay: `${i * 70}ms` }} />
              <div className="flex flex-col gap-2 p-4">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-1/3" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </LoadingRegion>
  );
}
