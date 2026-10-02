"use client";
import * as React from "react";
import { ImageUp, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export async function uploadImage(file: File): Promise<string | null> {
  const body = new FormData();
  body.set("file", file);
  const res = await fetch("/api/assets", { method: "POST", body }).catch(() => null);
  const json = (await res?.json().catch(() => null)) as { url?: string; error?: string } | null;
  if (!res?.ok || !json?.url) {
    toast.error(json?.error ?? "Não foi possível enviar a imagem.");
    return null;
  }
  return json.url;
}

/** URL text field + upload button + small preview. */
export function ImageField({
  id,
  value,
  onChange,
  placeholder = "https://… ou envie uma imagem",
  square,
}: {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  square?: boolean;
}) {
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [busy, setBusy] = React.useState(false);
  const [broken, setBroken] = React.useState(false);
  React.useEffect(() => setBroken(false), [value]);
  return (
    <div className="flex items-center gap-2">
      <span
        className="inline-flex shrink-0 items-center justify-center overflow-hidden rounded-lg border border-line bg-surface-2"
        style={{ width: square ? 38 : 60, height: 38 }}
      >
        {value && !broken ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={value} alt="" referrerPolicy="no-referrer" loading="lazy" onError={() => setBroken(true)} className="h-full w-full object-cover" />
        ) : (
          <ImageUp className="size-4 text-muted" aria-hidden />
        )}
      </span>
      <Input id={id} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="h-[38px] font-mono text-xs" />
      {value && (
        <Button size="icon" variant="ghost" aria-label="Remover imagem" onClick={() => onChange("")}>
          <X />
        </Button>
      )}
      <Button size="sm" variant="secondary" className="h-[38px]" disabled={busy} onClick={() => fileRef.current?.click()}>
        {busy ? <Loader2 className="animate-spin" /> : <ImageUp />}
        Enviar
      </Button>
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp,image/avif"
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          setBusy(true);
          const url = await uploadImage(f);
          setBusy(false);
          if (url) onChange(url);
        }}
      />
    </div>
  );
}
