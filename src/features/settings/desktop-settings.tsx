"use client";
import * as React from "react";
import { Archive, Check, Copy, FolderOpen } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/misc";
import { getDesktop, useDesktop, type DesktopInfo } from "@/lib/desktop";
import { Card } from "./settings-forms";

const MAC_KEYS: Record<string, string> = { CommandOrControl: "⌘", Shift: "⇧", Alt: "⌥" };

/** "CommandOrControl+Shift+Space" → "⇧⌘Espaço" / "Ctrl+Shift+Espaço". */
const formatShortcut = (acc: string, mac: boolean) =>
  acc
    .split("+")
    .map((p) => (p === "Space" ? "Espaço" : mac ? (MAC_KEYS[p] ?? p) : p === "CommandOrControl" ? "Ctrl" : p))
    .join(mac ? "" : "+");

/** Desktop app only: where the data lives, backups, the address for the browser extension. */
export function DesktopSettings() {
  const desktop = useDesktop();
  const [info, setInfo] = React.useState<DesktopInfo | null>(null);
  const [copied, setCopied] = React.useState(false);

  const load = React.useCallback(() => void getDesktop()?.info().then(setInfo), []);
  React.useEffect(load, [load]);
  React.useEffect(() => getDesktop()?.onWindowState(load), [load]);

  if (!desktop || !info) return null;
  const mac = info.platform === "darwin";
  return (
    <Card
      id="aplicativo"
      title="Aplicativo"
      description={
        info.portable
          ? "Modo portátil: os dados ficam na pasta WaypointData, ao lado do aplicativo. Leve a pasta junto para usar em outro computador."
          : "Seus dados ficam neste computador. Para o modo portátil, crie uma pasta WaypointData ao lado do aplicativo."
      }
    >
      <div className="flex flex-col gap-1.5">
        <span className="text-caption font-semibold uppercase tracking-[.06em] text-muted">Pasta de dados</span>
        <code className="break-all rounded-control border border-line bg-surface-2 px-3 py-2 font-mono text-body text-ink-2">{info.dataDir}</code>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => desktop.run("open-data")}>
          <FolderOpen /> Abrir pasta
        </Button>
        <Button onClick={() => desktop.run("backup")}>
          <Archive /> Fazer backup agora
        </Button>
      </div>
      <p className="text-body text-muted">Um backup automático é feito uma vez por dia, ao abrir o aplicativo; os dez mais recentes ficam em backups/.</p>

      <div className="flex flex-col gap-1.5 pt-2">
        <span className="text-caption font-semibold uppercase tracking-[.06em] text-muted">Endereço para a extensão do navegador</span>
        <div className="flex max-w-md items-center gap-2">
          <code className="flex-1 truncate rounded-control border border-line bg-surface-2 px-3 py-2 font-mono text-body text-ink-2">{info.origin}</code>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Copiar endereço"
            onClick={async () => {
              await navigator.clipboard.writeText(info.origin).catch(() => toast.error("Não foi possível copiar."));
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
          >
            {copied ? <Check /> : <Copy />}
          </Button>
        </div>
        <p className="text-body text-muted">Use este endereço e um token de API (acima) nas opções da extensão. Ela funciona enquanto o aplicativo estiver aberto.</p>
      </div>

      <div className="flex flex-col gap-2 pt-2">
        <span className="text-caption font-semibold uppercase tracking-[.06em] text-muted">Janela</span>
        <label className="flex cursor-pointer items-center gap-2.5 text-body">
          <input
            type="checkbox"
            className="size-4 accent-[var(--accent)]"
            checked={!!info.closeToTray}
            onChange={() => {
              desktop.run("close-to-tray");
              setTimeout(load, 100);
            }}
          />
          {mac ? "Continuar na barra de menus ao fechar a janela" : "Continuar na bandeja do sistema ao fechar a janela"}
        </label>
        <p className="flex flex-wrap items-center gap-1.5 text-body text-muted">
          <Kbd>{formatShortcut(info.quickShortcut, mac)}</Kbd> abre a busca do Waypoint de qualquer lugar.
        </p>
      </div>
      <p className="text-caption text-muted">Waypoint {info.version}</p>
    </Card>
  );
}
