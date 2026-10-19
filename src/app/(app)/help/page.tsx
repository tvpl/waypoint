import { requireWorkspace } from "@/server/services/workspaces";
import { HelpCenter } from "@/features/help/help-center";
import { ShortcutsButton } from "@/features/help/help-actions";

export const metadata = { title: "Ajuda" };

export default async function HelpPage() {
  await requireWorkspace();
  return (
    <main className="scrollbar-thin flex-1 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-[1080px] flex-col gap-8 px-6 pb-16 pt-10 sm:px-10 sm:pt-12">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-2">
            <h1 className="font-display font-semibold text-display-sm leading-[1.05] tracking-[-0.025em] sm:text-display">Central de ajuda</h1>
            <p className="max-w-2xl text-lead text-muted">Para que serve cada módulo, o que dá para fazer e tours guiados que mostram tudo na própria tela.</p>
          </div>
          <ShortcutsButton />
        </header>
        <HelpCenter />
      </div>
    </main>
  );
}
