export default function LoadingTasks() {
  return (
    <div
      className="flex h-full flex-col gap-8 p-8"
      aria-label="Carregando tarefas"
    >
      <div className="wp-skeleton h-10 w-48" />
      <div className="wp-skeleton h-10 w-full" />
      <div className="grid flex-1 grid-cols-2 gap-5 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="wp-skeleton min-h-64" />
        ))}
      </div>
    </div>
  );
}
