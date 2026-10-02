"use client";
import { useEffect, useState } from "react";

function greet(d: Date) {
  const h = d.getHours();
  return h < 5 ? "Boa noite" : h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
}

export function Greeting({ name }: { name: string }) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => setNow(new Date()), []);
  const first = name.split(/\s+/)[0];
  const date = now
    ? new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long" }).format(now)
    : "";
  return (
    <div className="flex flex-col gap-2.5">
      <h1 className="font-display text-[52px] leading-none tracking-[-0.01em] sm:text-[64px]">
        {now ? greet(now) : "Olá"}, {first}
        <span className="text-accent">.</span>
      </h1>
      <p className="min-h-[26px] text-title text-muted first-letter:uppercase">{date && `${date} — o que vamos organizar hoje?`}</p>
    </div>
  );
}
