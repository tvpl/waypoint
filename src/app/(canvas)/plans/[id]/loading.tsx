export default function LoadingPlan() {
  return (
    <div className="flex h-dvh flex-col bg-bg" aria-busy="true" aria-label="Carregando plan">
      <div className="h-14 shrink-0 border-b border-line bg-surface" />
      <div className="flex min-h-0 flex-1">
        <div className="hidden w-[248px] shrink-0 border-r border-line bg-surface md:block" />
        <div className="dot-grid flex flex-1 items-center justify-center">
          <span className="size-5 animate-spin rounded-full border-2 border-line-2 border-t-accent" />
        </div>
      </div>
    </div>
  );
}
