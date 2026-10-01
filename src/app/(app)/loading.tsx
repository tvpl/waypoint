export default function Loading() {
  return (
    <div className="flex flex-1 items-start justify-center pt-24" aria-busy="true" aria-label="Carregando">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-line-2 border-t-accent" />
    </div>
  );
}
