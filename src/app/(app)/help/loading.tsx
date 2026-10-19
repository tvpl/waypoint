import { LoadingRegion, Skeleton } from "@/components/ui/misc";

/** Help center skeleton: title, search and the module cards. */
export default function Loading() {
  return (
    <LoadingRegion label="Carregando a ajuda" className="scrollbar-thin flex-1 overflow-hidden">
      <div className="mx-auto flex w-full max-w-[1080px] flex-col gap-8 px-6 pt-10 sm:px-10 sm:pt-12">
        <div className="flex flex-col gap-3">
          <Skeleton className="h-10 w-72 rounded-control" />
          <Skeleton className="h-4 w-[28rem] max-w-full" />
        </div>
        <Skeleton className="h-14 w-full rounded-2xl" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-40 rounded-card" style={{ animationDelay: `${i * 70}ms` }} />
          ))}
        </div>
      </div>
    </LoadingRegion>
  );
}
