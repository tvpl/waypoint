"use client";
import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { AlertTriangle, Check, ChevronRight, ExternalLink, Eye, Link2, Loader2, MousePointer2, Minus, PanelRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Kbd, SiteIcon } from "@/components/ui/misc";
import { cn, domainOf } from "@/lib/utils";
import { monogramColors } from "@/lib/color";
import { createLinkAction, updateLinkAction } from "@/app/(app)/links/actions";
import { CollectionPicker } from "./collection-picker";
import { TagInput } from "./tag-input";
import { ImageField } from "./image-field";
import type { LinkItem, OpenBehavior, SummaryBehavior, TagCount, TreeNode } from "./types";

export type LinkDialogState = { mode: "add"; url?: string; collectionId?: string | null } | { mode: "edit"; link: LinkItem } | null;

type Meta = { title?: string; description?: string; image?: string; favicon?: string; siteName?: string; error?: string };
type MetaStatus = { state: "idle" } | { state: "loading" } | { state: "found"; meta: Meta } | { state: "error"; message: string };

const looksLikeUrl = (s: string) => /^(https?:\/\/)?[^\s/$.?#]+\.[^\s]{2,}/i.test(s.trim());

function RadioCards<T extends string>({
  name,
  label,
  value,
  onChange,
  options,
}: {
  name: string;
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; icon: React.ReactNode; label: string; sub: string }[];
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-xs font-medium text-ink-2">{label}</legend>
      <div role="radiogroup" aria-label={label} className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {options.map((o) => {
          const on = o.value === value;
          return (
            <label
              key={o.value}
              className={cn(
                "flex cursor-pointer flex-col gap-1.5 rounded-control border px-3 py-2.5 transition-colors max-sm:flex-row max-sm:items-baseline max-sm:gap-2 max-sm:py-2 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent",
                on ? "border-accent bg-accent-soft" : "border-line-2 bg-surface hover:bg-surface-2",
              )}
            >
              <span className={cn("flex items-center gap-2 text-body font-medium [&_svg]:size-[15px]", on ? "text-accent-ink" : "text-ink")}>
                <input type="radio" name={name} checked={on} onChange={() => onChange(o.value)} className="m-0 accent-[var(--accent)]" />
                {o.icon}
                <span>{o.label}</span>
              </span>
              <span className="pl-[21px] text-xs text-muted max-sm:truncate max-sm:pl-0">{o.sub}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

export function LinkDialog({
  state,
  onClose,
  tree,
  tags,
  onSaved,
}: {
  state: LinkDialogState;
  onClose: () => void;
  tree: TreeNode[];
  tags: TagCount[];
  onSaved?: (id: string) => void;
}) {
  return (
    <Dialog open={!!state} onOpenChange={(o) => !o && onClose()}>
      {state && (
        <DialogContent
          title={state.mode === "add" ? "Adicionar link" : "Editar link"}
          className="max-w-[660px]"
          onOpenAutoFocus={(e) => {
            if (state.mode === "edit") e.preventDefault();
          }}
        >
          <LinkForm key={state.mode === "edit" ? state.link.id : "add"} state={state} onClose={onClose} tree={tree} tags={tags} onSaved={onSaved} />
        </DialogContent>
      )}
    </Dialog>
  );
}

function LinkForm({
  state,
  onClose,
  tree,
  tags,
  onSaved,
}: {
  state: NonNullable<LinkDialogState>;
  onClose: () => void;
  tree: TreeNode[];
  tags: TagCount[];
  onSaved?: (id: string) => void;
}) {
  const editing = state.mode === "edit" ? state.link : null;
  const [url, setUrl] = React.useState(editing?.url ?? (state.mode === "add" ? (state.url ?? "") : ""));
  const [title, setTitle] = React.useState(editing?.title ?? "");
  const [collectionId, setCollectionId] = React.useState<string | null>(editing ? editing.collectionId : state.mode === "add" ? (state.collectionId ?? null) : null);
  const [tagList, setTagList] = React.useState<string[]>(editing?.tags ?? []);
  const [openBehavior, setOpenBehavior] = React.useState<OpenBehavior>(editing?.openBehavior ?? "new_tab");
  const [summaryBehavior, setSummaryBehavior] = React.useState<SummaryBehavior>(editing?.summaryBehavior ?? "always");
  const [description, setDescription] = React.useState(editing?.description ?? "");
  const [keywords, setKeywords] = React.useState(editing?.keywords ?? "");
  const [notes, setNotes] = React.useState(editing?.notes ?? "");
  const [coverImage, setCoverImage] = React.useState(editing?.coverImage ?? "");
  const [icon, setIcon] = React.useState(editing?.icon ?? "");
  const [favicon, setFavicon] = React.useState(editing?.favicon ?? "");
  const [more, setMore] = React.useState(!!editing && !!(editing.description || editing.keywords || editing.coverImage || editing.icon));
  const [meta, setMeta] = React.useState<MetaStatus>({ state: "idle" });
  const [dup, setDup] = React.useState<{ id: string; title: string; archived: boolean } | null>(null);
  const [saving, setSaving] = React.useState(false);
  const touched = React.useRef({ title: !!editing, description: !!editing?.description, coverImage: !!editing?.coverImage });

  // Debounced metadata + duplicate lookup whenever the URL changes.
  React.useEffect(() => {
    const u = url.trim();
    if (!looksLikeUrl(u) || (editing && u === editing.url)) {
      setMeta({ state: "idle" });
      setDup(null);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setMeta({ state: "loading" });
      const q = encodeURIComponent(u);
      fetch(`/api/links/lookup?url=${q}`, { signal: ctrl.signal })
        .then((r) => (r.ok ? r.json() : null))
        .then((d: { duplicate: { id: string; title: string; archived: boolean } | null } | null) => {
          const hit = d?.duplicate ?? null;
          setDup(hit && hit.id !== editing?.id ? hit : null);
        })
        .catch(() => {});
      try {
        const r = await fetch(`/api/metadata?url=${q}`, { signal: ctrl.signal });
        const m = (await r.json()) as Meta;
        if (m.error || !r.ok) {
          setMeta({ state: "error", message: m.error ?? "Não foi possível ler a página." });
          return;
        }
        setMeta({ state: "found", meta: m });
        if (!touched.current.title && m.title) setTitle(m.title);
        if (!touched.current.description && m.description) setDescription(m.description);
        if (!touched.current.coverImage && m.image) setCoverImage(m.image);
        if (m.favicon) setFavicon(m.favicon);
      } catch (e) {
        if ((e as Error).name !== "AbortError") setMeta({ state: "error", message: "Não foi possível ler a página." });
      }
    }, 450);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [url, editing]);

  const save = async () => {
    if (!url.trim()) {
      toast.error("Informe a URL.");
      return;
    }
    setSaving(true);
    const input = {
      url: url.trim(),
      title: title.trim(),
      collectionId,
      tags: tagList,
      openBehavior,
      summaryBehavior,
      description: description.trim() || null,
      keywords: keywords.trim() || null,
      notes: notes.trim() || null,
      coverImage: coverImage.trim() || null,
      icon: icon.trim() || null,
      favicon: favicon.trim() || null,
    };
    const res = editing ? await updateLinkAction(editing.id, input) : await createLinkAction(input);
    setSaving(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(editing ? "Link atualizado" : "Link salvo");
    const savedId = editing ? editing.id : (res.data as { id: string } | undefined)?.id;
    onClose();
    if (savedId) onSaved?.(savedId);
  };

  const domain = domainOf(/^https?:\/\//i.test(url.trim()) ? url.trim() : `https://${url.trim()}`);
  const found = meta.state === "found" ? meta.meta : null;
  const tint = monogramColors(domain || "link");
  const previewTitle = title || found?.title;
  const previewDesc = description || found?.description;
  const previewImage = coverImage || found?.image;

  return (
    <form
      className="flex min-h-0 flex-col"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          save();
        }
      }}
    >
      <DialogBody className="gap-4 pt-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="link-url">URL</Label>
          <div className="flex h-11 items-center gap-2.5 rounded-control border-2 border-line-2 bg-surface px-3 focus-within:border-accent">
            <Link2 className="size-4 shrink-0 text-accent-ink" aria-hidden />
            <input
              id="link-url"
              type="text"
              inputMode="url"
              autoFocus={!editing}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="Cole ou digite um endereço — https://…"
              className="h-full min-w-0 flex-1 bg-transparent font-mono text-body text-ink outline-none"
              autoComplete="off"
              spellCheck={false}
            />
            <span aria-live="polite" className="shrink-0 text-xs">
              {meta.state === "loading" && (
                <span className="inline-flex items-center gap-1 text-muted">
                  <Loader2 className="size-3.5 animate-spin" aria-hidden />
                  Buscando…
                </span>
              )}
              {meta.state === "found" && (
                <span className="inline-flex items-center gap-1 text-success-ink">
                  <Check className="size-3.5" aria-hidden />
                  Metadados encontrados
                </span>
              )}
              {meta.state === "error" && (
                <span className="inline-flex items-center gap-1 text-muted" title={meta.message}>
                  <AlertTriangle className="size-3.5" aria-hidden />
                  Sem metadados
                </span>
              )}
            </span>
          </div>
          {meta.state === "error" && <p className="text-xs text-muted">{meta.message} Você pode salvar mesmo assim e preencher os campos à mão.</p>}
          {dup && (
            <p className="flex items-center gap-1.5 rounded-lg border border-amber-line bg-amber-bg px-3 py-2 text-xs text-amber-ink">
              <AlertTriangle className="size-3.5 shrink-0" aria-hidden />
              <span className="min-w-0 flex-1">
                Este endereço já está na biblioteca{dup.archived ? " (arquivado)" : ""}:{" "}
                <Link href={`/links?open=${dup.id}${dup.archived ? "&scope=archived" : ""}`} className="font-medium underline" onClick={onClose}>
                  {dup.title}
                </Link>
              </span>
            </p>
          )}
        </div>

        {(found || (editing && (previewTitle || previewImage))) && (
          <div className="flex gap-3.5 rounded-xl border border-line bg-surface-2 p-3">
            <div
              className="flex h-[88px] w-[148px] shrink-0 items-end overflow-hidden rounded-lg p-2"
              style={
                previewImage
                  ? undefined
                  : { backgroundColor: tint.bg, backgroundImage: "radial-gradient(rgba(255,255,255,.6) 1.2px, transparent 1.2px)", backgroundSize: "12px 12px" }
              }
            >
              {previewImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={previewImage} alt="" referrerPolicy="no-referrer" loading="lazy" className="-m-2 h-[88px] w-[148px] max-w-none object-cover" />
              ) : (
                <span className="font-mono text-micro" style={{ color: tint.fg }}>
                  sem imagem
                </span>
              )}
            </div>
            <div className="flex min-w-0 flex-col gap-1">
              <span className="flex items-center gap-2">
                <SiteIcon src={icon || favicon || null} label={domain || "?"} size={18} />
                <span className="truncate font-mono text-xs text-muted">{found?.siteName || domain}</span>
              </span>
              <span className="line-clamp-1 text-lead font-semibold">{previewTitle || domain}</span>
              {previewDesc && <span className="line-clamp-2 text-body leading-[18px] text-ink-2">{previewDesc}</span>}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="link-title">Título</Label>
            <Input
              id="link-title"
              className="h-[38px]"
              value={title}
              placeholder={found?.title ?? (domain || "Título do link")}
              onChange={(e) => {
                touched.current.title = true;
                setTitle(e.target.value);
              }}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="link-col">Coleção</Label>
            <CollectionPicker id="link-col" tree={tree} value={collectionId} onChange={setCollectionId} />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="link-tags">Tags</Label>
          <TagInput id="link-tags" value={tagList} onChange={setTagList} suggestions={tags} />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="link-notes">
            Notas <span className="font-normal text-muted">— por que salvou, o que lembrar (entram na busca)</span>
          </Label>
          <Textarea id="link-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ex.: ler a parte de Server Components antes da reunião" className="min-h-[60px] resize-y" />
        </div>

        <RadioCards
          name="openBehavior"
          label="Ao abrir"
          value={openBehavior}
          onChange={setOpenBehavior}
          options={[
            { value: "new_tab", icon: <ExternalLink />, label: "Nova aba", sub: "Padrão do navegador" },
            { value: "preview", icon: <PanelRight />, label: "Preview interno", sub: "Modal no Waypoint" },
            { value: "ask", icon: <Sparkles />, label: "Perguntar", sub: "Escolher a cada clique" },
          ]}
        />
        <RadioCards
          name="summaryBehavior"
          label="Resumo no card"
          value={summaryBehavior}
          onChange={setSummaryBehavior}
          options={[
            { value: "always", icon: <Eye />, label: "Sempre", sub: "Mostra a descrição" },
            { value: "hover", icon: <MousePointer2 />, label: "No hover", sub: "Aparece ao passar" },
            { value: "hidden", icon: <Minus />, label: "Oculto", sub: "Só ícone e título" },
          ]}
        />

        <button
          type="button"
          aria-expanded={more}
          onClick={() => setMore((m) => !m)}
          className="inline-flex items-center gap-1.5 self-start rounded-md text-body text-ink-2 hover:text-ink"
        >
          <ChevronRight className={cn("size-3.5 transition-transform", more && "rotate-90")} aria-hidden />
          Mais opções — ícone, imagem de capa, palavras-chave, descrição
        </button>
        {more && (
          <div className="flex flex-col gap-3 border-l-2 border-line pl-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="link-desc">Descrição</Label>
              <Textarea
                id="link-desc"
                rows={3}
                value={description}
                onChange={(e) => {
                  touched.current.description = true;
                  setDescription(e.target.value);
                }}
                placeholder="Um resumo curto — aparece nos cards."
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="link-kw">Palavras-chave</Label>
              <Input id="link-kw" className="h-[38px]" value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder="Termos extras para a busca (não aparecem nos cards)" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="link-cover">Imagem de capa</Label>
              <ImageField
                id="link-cover"
                value={coverImage}
                onChange={(v) => {
                  touched.current.coverImage = true;
                  setCoverImage(v);
                }}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="link-icon">Ícone</Label>
              <ImageField id="link-icon" value={icon} onChange={setIcon} square placeholder="Substitui o favicon do site" />
            </div>
          </div>
        )}
      </DialogBody>
      <DialogFooter>
        <span className="flex-1 text-xs text-muted">Só a URL é obrigatória.</span>
        <Button variant="ghost" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" variant="primary" disabled={saving || !url.trim()}>
          {saving && <Loader2 className="animate-spin" />}
          {editing ? "Salvar alterações" : "Salvar link"}
          <Kbd className="border-0 bg-transparent p-0 text-inherit opacity-80">⌘↵</Kbd>
        </Button>
      </DialogFooter>
    </form>
  );
}
