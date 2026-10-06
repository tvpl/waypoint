"use client";
import { useEffect, useState } from "react";

function greet(d: Date) {
  const h = d.getHours();
  return h < 5 ? "Boa noite" : h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
}

/** One line: greeting and today's date (the date is client-side, in the person's time zone). */
export function Greeting({ name }: { name: string }) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => setNow(new Date()), []);
  const first = name.split(/\s+/)[0];
  const date = now ? new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long" }).format(now) : "";
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <h1 className="font-display text-[22px] font-semibold leading-tight tracking-[-0.02em]">
        {now ? greet(now) : "Olá"}, {first}
      </h1>
      <p className="min-h-[20px] text-body text-muted first-letter:uppercase">{date}</p>
    </div>
  );
}
