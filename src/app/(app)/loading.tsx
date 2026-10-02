import { LoadingRegion, Skeleton } from "@/components/ui/misc";

/** Generic page skeleton: title, subtitle and a grid of cards (Home, Tags, Settings…). */
export default function Loading() {
  return (
    <LoadingRegion className="scrollbar-thin flex-1 overflow-hidden">
      <div className="mx-auto flex w-full max-w-[1000px] flex-col gap-10 px-6 pt-12 sm:px-12 sm:pt-16">
        <div className="flex flex-col gap-3">
          <Skeleton className="h-11 w-72 rounded-control" />
          <Skeleton className="h-4 w-96 max-w-full" />
        </div>
        <Skeleton className="h-[58px] w-full rounded-card" />
        <div className="grid gap-4 sm:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-40 rounded-card" style={{ animationDelay: `${i * 80}ms` }} />
          ))}
        </div>
      </div>
    </LoadingRegion>
  );
}
