import Link from "next/link";
import { Logo } from "@/components/shell/logo";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex min-h-app flex-col items-center justify-center gap-6 bg-bg px-6 text-center">
      <Logo size={40} />
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-display-lg leading-none tracking-[-0.01em]">Página não encontrada</h1>
        <p className="text-lead text-muted">O endereço pode ter mudado, ou você não tem acesso a este conteúdo.</p>
      </div>
      <Button asChild variant="primary">
        <Link href="/">Voltar ao início</Link>
      </Button>
    </main>
  );
}
