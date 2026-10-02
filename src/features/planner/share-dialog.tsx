"use client";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, ChevronDown, Copy, CopyPlus, Eye, Globe, History, Link2, Loader2, Lock, Plus, RefreshCw, TriangleAlert, UserRound, Users } from "lucide-react";
import { Dialog, DialogBody, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/misc";
import { SectionLabel } from "@/components/ui/input";
import { Tooltip } from "@/components/ui/popover";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/menu";
import { cn, formatDateTime } from "@/lib/utils";
import type { PlanDocument } from "@/domain/plan";
import type { Role, Visibility } from "@/server/db/schema";
import {
  getShareStateAction,
  inviteMemberAction,
  publishPlanAction,
  regenerateShareLinkAction,
  restoreVersionAction,
  setMemberRoleAction,
  setVisibilityAction,
  unpublishPlanAction,
  type ShareState,
} from "./actions";
import { duplicatePlanAction } from "@/app/(app)/plans/actions";
import { ask } from "@/components/ui/ask";

const VIS: { value: Visibility; label: string; hint: (ws: string) => string; icon: typeof Lock }[] = [
  { value: "private", label: "Privado", hint: () => "Só você e as pessoas convidadas", icon: Lock },
  { value: "workspace", label: "Workspace", hint: (ws) => `Todos em ${ws} podem ver`, icon: Users },
  { value: "specific", label: "Pessoas específicas", hint: () => "Somente quem você convidar por e-mail", icon: UserRound },
  { value: "link", label: "Qualquer pessoa com o link", hint: () => "Somente leitura, sem precisar de conta", icon: Link2 },
  { value: "public", label: "Público", hint: () => "Qualquer pessoa pode abrir a versão publicada", icon: Globe },
];

const ROLE_LABEL: Record<Role, string> = { owner: "Owner", editor: "Editor", viewer: "Viewer" };

export type RestoredDraft = { document: PlanDocument; version: number; title: string; description: string | null };

export function ShareDialog({
  planId,
  open,
  onOpenChange,
  section = "share",
  workspaceName,
  beforePublish,
  onPublished,
  onRestored,
  onVisibility,
}: {
  planId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  section?: "share" | "history";
  workspaceName: string;
  beforePublish?: () => Promise<boolean>;
  onPublished?: (v: { version: number; createdAt: number }) => void;
  onRestored?: (r: RestoredDraft) => void;
  onVisibility?: (v: Visibility) => void;
}) {
  const router = useRouter();
  const [state, setState] = useState<ShareState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const historyRef = useRef<HTMLDivElement>(null);
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);

  const load = useCallback(async () => {
    const r = await getShareStateAction(planId);
    if (r.ok) {
      setState(r.state);
      setLoadError(null);
    } else setLoadError(r.error);
  }, [planId]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  useEffect(() => {
    if (open && state && section === "history") historyRef.current?.scrollIntoView({ block: "start" });
  }, [open, state, section]);

  const isOwner = state?.access === "owner";

  const publish = async () => {
    setBusy("publish");
    try {
      if (beforePublish && !(await beforePublish())) {
        toast.error("Não foi possível salvar o rascunho antes de publicar.");
        return;
      }
      const r = await publishPlanAction(planId);
      if (!r.ok) return void toast.error(r.error);
      toast.success(`Publicado v${r.version}`);
      onPublished?.({ version: r.version, createdAt: r.createdAt });
      await load();
      startTransition(() => router.refresh());
    } finally {
      setBusy(null);
    }
  };

  const unpublish = async () => {
    setBusy("unpublish");
    const r = await unpublishPlanAction(planId);
    setBusy(null);
    if (!r.ok) return void toast.error(r.error);
    toast.success("Plan despublicado. Viewers não veem mais a versão publicada.");
    onPublished?.({ version: 0, createdAt: 0 });
    await load();
    startTransition(() => router.refresh());
  };

  const changeVisibility = async (v: Visibility) => {
    if (!state || v === state.plan.visibility) return;
    const prev = state;
    setState({ ...state, plan: { ...state.plan, visibility: v } });
    const r = await setVisibilityAction(planId, v);
    if (!r.ok) {
      setState(prev);
      return void toast.error(r.error);
    }
    setState((s) => (s ? { ...s, shareToken: r.token } : s));
    onVisibility?.(v);
    startTransition(() => router.refresh());
  };

  const link = state ? `${origin}/plans/${planId}${state.plan.visibility === "link" && state.shareToken ? `?token=${state.shareToken}` : ""}` : "";

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      toast.success("Link copiado");
    } catch {
      toast.error("Não foi possível copiar. Selecione e copie manualmente.");
    }
  };

  const regenerate = async () => {
    const r = await regenerateShareLinkAction(planId);
    if (!r.ok) return void toast.error(r.error);
    setState((s) => (s ? { ...s, shareToken: r.token } : s));
    toast.success("Novo link gerado. O link anterior deixou de funcionar.");
  };

  const restore = async (versionId: string, v: number) => {
    const ok = await ask.confirm({
      title: `Restaurar a v${v}?`,
      description: "O rascunho atual será substituído por esta versão. A versão publicada não muda.",
      confirmLabel: "Restaurar",
    });
    if (!ok) return;
    setBusy(`restore:${versionId}`);
    const r = await restoreVersionAction(planId, versionId);
    setBusy(null);
    if (!r.ok) return void toast.error(r.error);
    toast.success(`v${v} restaurada no rascunho`);
    onRestored?.({ document: r.document, version: r.version, title: r.title, description: r.description });
    await load();
  };

  const duplicate = async (versionId: string) => {
    setBusy(`dup:${versionId}`);
    const r = await duplicatePlanAction(planId, { versionId });
    setBusy(null);
    if (!r.ok) return void toast.error(r.error);
    toast.success("Cópia criada", { action: { label: "Abrir", onClick: () => router.push(`/plans/${r.id}/edit`) } });
  };

  const published = state?.publishedVersion ?? null;
  const nextVersion = (state?.versions[0]?.version ?? 0) + 1;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Publicar e compartilhar" description={state?.plan.title ?? " "} className="top-[5vh] max-h-[90vh] max-w-[960px]">
        {!state ? (
          <DialogBody className="items-center justify-center py-16">
            {loadError ? <p className="text-sm text-danger">{loadError}</p> : <Loader2 className="size-5 animate-spin text-muted" aria-label="Carregando" />}
          </DialogBody>
        ) : (
          <div className="scrollbar-thin grid min-h-0 overflow-y-auto border-t border-line md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
            {/* ---------------------------------------------------- left */}
            <div className="flex flex-col gap-[22px] border-line px-6 py-[22px] md:border-r">
              {state.unpublished || published == null ? (
                <div className="flex flex-wrap items-center gap-3.5 rounded-xl border border-amber-line bg-amber-bg px-4 py-3.5 text-amber-ink">
                  <TriangleAlert className="size-[18px] shrink-0" aria-hidden />
                  <p className="min-w-[200px] flex-1 text-body leading-[18px]">
                    {published == null ? (
                      <>
                        <b className="font-semibold">Ainda não publicado.</b> Publique para que viewers e links compartilhados vejam este plan.
                      </>
                    ) : (
                      <>
                        <b className="font-semibold">Alterações não publicadas.</b> Quem tem acesso continua vendo a v{published} até você publicar.
                      </>
                    )}
                  </p>
                  <Button variant="primary" size="sm" className="h-[34px]" onClick={publish} disabled={busy === "publish"}>
                    {busy === "publish" && <Loader2 className="animate-spin" />} Publicar v{nextVersion}
                  </Button>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-3.5 rounded-xl border border-line bg-success-bg px-4 py-3.5 text-success-ink">
                  <Check className="size-[18px] shrink-0" aria-hidden />
                  <p className="min-w-[200px] flex-1 text-body leading-[18px]">
                    <b className="font-semibold">Tudo publicado.</b> A v{published} é o que as pessoas veem.
                  </p>
                  {isOwner && (
                    <Button variant="ghost" size="sm" onClick={unpublish} disabled={busy === "unpublish"}>
                      Despublicar
                    </Button>
                  )}
                </div>
              )}

              <section className="flex flex-col gap-2.5" aria-labelledby="vis-label">
                <SectionLabel id="vis-label">Quem pode ver</SectionLabel>
                <div role="radiogroup" aria-labelledby="vis-label" className="flex flex-col gap-1.5">
                  {VIS.map((o) => {
                    const on = state.plan.visibility === o.value;
                    return (
                      <label
                        key={o.value}
                        className={cn(
                          "flex items-center gap-3 rounded-control border px-3 py-2.5",
                          on ? "border-accent bg-accent-soft/50" : "border-line bg-surface",
                          isOwner ? "cursor-pointer hover:bg-surface-2" : "cursor-not-allowed opacity-75",
                        )}
                      >
                        <input type="radio" name="visibility" className="m-0 accent-[var(--accent)]" checked={on} disabled={!isOwner} onChange={() => changeVisibility(o.value)} />
                        <o.icon className={cn("size-4 shrink-0", on ? "text-accent-ink" : "text-muted")} aria-hidden />
                        <span className="flex flex-col">
                          <span className="text-body font-medium">{o.label}</span>
                          <span className="text-xs text-muted">{o.hint(workspaceName)}</span>
                        </span>
                      </label>
                    );
                  })}
                </div>
                {!isOwner && <p className="text-xs text-muted">Só o dono do plan pode alterar a visibilidade e as pessoas.</p>}
              </section>
            </div>

            {/* ---------------------------------------------------- right */}
            <div className="flex flex-col gap-[22px] px-6 py-[22px]">
              <section className="flex flex-col gap-2.5">
                <SectionLabel>Link publicado</SectionLabel>
                <div className="flex gap-2">
                  <span className="flex h-9 min-w-0 flex-1 items-center overflow-hidden rounded-control border border-line-2 bg-surface-2 px-3 font-mono text-xs text-ink-2">
                    <span className="truncate" title={link}>
                      {link.replace(/^https?:\/\//, "")}
                    </span>
                  </span>
                  <Button variant="secondary" onClick={copy}>
                    <Copy /> Copiar
                  </Button>
                </div>
                <p className="text-xs leading-[18px] text-muted">
                  {state.plan.visibility === "private" && "Privado: só você e pessoas convidadas conseguem abrir."}
                  {state.plan.visibility === "workspace" && `Membros de ${workspaceName} veem a versão publicada.`}
                  {state.plan.visibility === "specific" && "Somente as pessoas listadas abaixo conseguem abrir."}
                  {state.plan.visibility === "link" && "Quem tiver este link vê a versão publicada, sem editar."}
                  {state.plan.visibility === "public" && "Qualquer pessoa pode abrir a versão publicada."} Editor em{" "}
                  <span className="font-mono">/plans/{planId}/edit</span> — nunca visível para viewers.
                </p>
                {state.plan.visibility === "link" && isOwner && (
                  <button type="button" onClick={regenerate} className="inline-flex items-center gap-1.5 self-start text-xs text-accent-ink hover:underline">
                    <RefreshCw className="size-3" /> Gerar novo link (invalida o atual)
                  </button>
                )}
              </section>

              <People state={state} planId={planId} isOwner={isOwner} onChange={load} />

              <section ref={historyRef} className="flex scroll-mt-4 flex-col gap-1" aria-labelledby="hist-label">
                <div className="flex items-center justify-between">
                  <SectionLabel id="hist-label">Histórico</SectionLabel>
                  <span className="text-xs text-muted">snapshots a cada publicação</span>
                </div>
                <ul className="flex flex-col">
                  <li className="flex items-center gap-3 border-b border-line py-2.5">
                    <span className="size-2 shrink-0 rounded-full bg-[#C98A00]" aria-hidden />
                    <span className="flex flex-1 flex-col">
                      <span className="text-body font-semibold">Rascunho atual</span>
                      <span className="text-xs text-muted">{state.unpublished || published == null ? "alterações não publicadas" : `igual à v${published}`}</span>
                    </span>
                  </li>
                  {state.versions.length === 0 && <li className="py-3 text-xs text-muted">Nenhuma versão publicada ainda.</li>}
                  {state.versions.map((v) => {
                    const isPub = v.id === state.publishedVersionId;
                    return (
                      <li key={v.id} className="flex items-center gap-3 border-b border-line py-2.5 last:border-b-0">
                        <span className={cn("size-2 shrink-0 rounded-full", isPub ? "bg-[#1F8A4C]" : "bg-line-2")} aria-hidden />
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="flex items-center gap-2 text-body font-semibold">
                            v{v.version}
                            {isPub && <Badge tone="success">Publicada</Badge>}
                          </span>
                          <span className="truncate text-xs text-muted">
                            {formatDateTime(v.createdAt)} · {v.authorName ?? "—"}
                          </span>
                        </span>
                        <span className="flex gap-0.5">
                          <Tooltip content={`Ver v${v.version}`}>
                            <Button asChild variant="ghost" size="icon-sm" aria-label={`Ver v${v.version}`}>
                              <a href={`/plans/${planId}?version=${v.id}`} target="_blank" rel="noopener">
                                <Eye />
                              </a>
                            </Button>
                          </Tooltip>
                          <Tooltip content={`Restaurar v${v.version} no rascunho`}>
                            <Button variant="ghost" size="icon-sm" aria-label={`Restaurar v${v.version}`} disabled={!!busy} onClick={() => restore(v.id, v.version)}>
                              {busy === `restore:${v.id}` ? <Loader2 className="animate-spin" /> : <History />}
                            </Button>
                          </Tooltip>
                          <Tooltip content={`Duplicar v${v.version} como novo plan`}>
                            <Button variant="ghost" size="icon-sm" aria-label={`Duplicar v${v.version}`} disabled={!!busy} onClick={() => duplicate(v.id)}>
                              {busy === `dup:${v.id}` ? <Loader2 className="animate-spin" /> : <CopyPlus />}
                            </Button>
                          </Tooltip>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </section>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function People({ state, planId, isOwner, onChange }: { state: ShareState; planId: string; isOwner: boolean; onChange: () => void }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("editor");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const invite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setBusy(true);
    setErr(null);
    const r = await inviteMemberAction(planId, email, role);
    setBusy(false);
    if (!r.ok) return setErr(r.error);
    setEmail("");
    toast.success(`${r.member.name} agora é ${ROLE_LABEL[r.member.role].toLowerCase()}`);
    onChange();
  };

  const change = async (userId: string, r: Role | null) => {
    const res = await setMemberRoleAction(planId, userId, r);
    if (!res.ok) return void toast.error(res.error);
    onChange();
  };

  return (
    <section className="flex flex-col gap-1.5">
      <SectionLabel>Pessoas</SectionLabel>
      {isOwner && (
        <form onSubmit={invite} className="flex flex-col gap-1.5">
          <div className="flex h-9 items-center gap-2 rounded-control border border-line-2 pl-3 pr-1 focus-within:border-accent focus-within:ring-3 focus-within:ring-accent/15">
            <Plus className="size-[15px] shrink-0 text-muted" aria-hidden />
            <input
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setErr(null);
              }}
              placeholder="Convidar por e-mail"
              aria-label="E-mail para convidar"
              className="min-w-0 flex-1 bg-transparent text-body outline-none"
            />
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
              aria-label="Papel"
              className="h-7 rounded-md bg-transparent px-1 text-body text-ink-2 outline-none hover:bg-hover"
            >
              <option value="editor">Editor</option>
              <option value="viewer">Viewer</option>
            </select>
            <Button type="submit" size="sm" variant="soft" className="h-7" disabled={busy || !email.trim()}>
              {busy ? <Loader2 className="animate-spin" /> : "Convidar"}
            </Button>
          </div>
          {err && (
            <p role="alert" className="text-xs text-danger">
              {err}
            </p>
          )}
        </form>
      )}
      <ul className="flex flex-col">
        {state.owner && (
          <PersonRow name={state.owner.name} sub={`${state.owner.email} · dono`} role="owner" />
        )}
        {state.members.map((m) => (
          <PersonRow
            key={m.userId}
            name={m.name}
            sub={m.email}
            role={m.role}
            control={
              isOwner ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button type="button" className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-body text-ink-2 hover:bg-hover" aria-label={`Papel de ${m.name}`}>
                      {ROLE_LABEL[m.role]} <ChevronDown className="size-3.5" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="min-w-[160px]">
                    {(["owner", "editor", "viewer"] as Role[]).map((r) => (
                      <DropdownMenuItem key={r} onSelect={() => change(m.userId, r)}>
                        {ROLE_LABEL[r]}
                        {m.role === r && <Check className="ml-auto" />}
                      </DropdownMenuItem>
                    ))}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem danger onSelect={() => change(m.userId, null)}>
                      Remover acesso
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : undefined
            }
          />
        ))}
      </ul>
      {state.members.length === 0 && <p className="text-xs text-muted">Ninguém foi convidado individualmente.</p>}
    </section>
  );
}

const TINTS = [
  ["#DCE2FB", "#2440B8"],
  ["#DDF4EE", "#0F6E5C"],
  ["#FFEADB", "#A84A0F"],
  ["#EFE9FF", "#5B3FC4"],
];

function PersonRow({ name, sub, role, control }: { name: string; sub: string; role: Role; control?: React.ReactNode }) {
  const ini = name
    .trim()
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const [bg, fg] = TINTS[h % TINTS.length];
  return (
    <li className="flex items-center gap-2.5 py-1.5">
      <span className="inline-flex size-[30px] shrink-0 items-center justify-center rounded-full text-caption font-semibold" style={{ background: bg, color: fg }} aria-hidden>
        {ini || "?"}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-body font-medium">{name}</span>
        <span className="truncate text-xs text-muted">{sub}</span>
      </span>
      {control ?? <span className="px-1.5 text-body text-ink-2">{ROLE_LABEL[role]}</span>}
    </li>
  );
}
