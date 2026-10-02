import Link from "next/link";
import { Logo } from "@/components/shell/logo";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-bg px-6 text-center">
      <Logo size={40} />
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-5xl leading-none">Página não encontrada</h1>
        <p className="text-[15px] text-muted">O endereço pode ter mudado, ou você não tem acesso a este conteúdo.</p>
      </div>
      <Link href="/" className="inline-flex h-9 items-center rounded-[9px] bg-accent px-4 text-sm font-medium text-white">
        Voltar ao início
      </Link>
    </main>
  );
}
