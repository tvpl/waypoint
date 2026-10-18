import { LoadingRegion, Skeleton } from "@/components/ui/misc";

/** Trash skeleton: title, filters and rows. */
export default function Loading() {
  return (
    <LoadingRegion label="Carregando a lixeira" className="scrollbar-thin flex-1 overflow-hidden">
      <div className="mx-auto flex w-full max-w-[960px] flex-col gap-6 px-6 pt-10 sm:px-10">
        <div className="flex flex-col gap-3">
          <Skeleton className="h-10 w-48 rounded-control" />
          <Skeleton className="h-4 w-80 max-w-full" />
        </div>
        <Skeleton className="h-8 w-72 rounded-lg" />
        <div className="flex flex-col gap-2">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-control" style={{ animationDelay: `${i * 60}ms` }} />
          ))}
        </div>
      </div>
    </LoadingRegion>
  );
}
