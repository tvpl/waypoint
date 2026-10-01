"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { PlanDocument } from "@/domain/plan";
import { contentSignature } from "@/domain/canvas-adapter";

export type SaveStatus = "saved" | "dirty" | "saving" | "offline" | "conflict" | "error";

export type Conflict = { version: number; document: PlanDocument };

type Backup = { document: PlanDocument; at: number; baseVersion: number };

const DEBOUNCE_MS = 800;
const backupKey = (planId: string) => `wp-plan-backup:${planId}`;

export function readBackup(planId: string): Backup | null {
  try {
    const raw = localStorage.getItem(backupKey(planId));
    return raw ? (JSON.parse(raw) as Backup) : null;
  } catch {
    return null;
  }
}

export function clearBackup(planId: string) {
  try {
    localStorage.removeItem(backupKey(planId));
  } catch {}
}

function writeBackup(planId: string, b: Backup) {
  try {
    localStorage.setItem(backupKey(planId), JSON.stringify(b));
  } catch {}
}

/**
 * Debounced draft autosave with optimistic concurrency.
 * - local state is the source of truth; the server is updated ~800ms after the last change
 * - network failures retry with exponential backoff (status "offline") and a
 *   localStorage copy is kept as a safety net until the save lands
 * - 409 stops saving and exposes the server copy (`conflict`) until resolved
 */
export function useAutosave(opts: {
  planId: string;
  initialVersion: number;
  initialSignature: string;
  getDocument: () => PlanDocument;
  onSaved?: () => void;
}) {
  const { planId } = opts;
  const [status, setStatus] = useState<SaveStatus>("saved");
  const [conflict, setConflict] = useState<Conflict | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const version = useRef(opts.initialVersion);
  const savedSig = useRef(opts.initialSignature);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inflight = useRef(false);
  const again = useRef(false);
  const attempt = useRef(0);
  const statusRef = useRef<SaveStatus>("saved");
  const getDoc = useRef(opts.getDocument);
  getDoc.current = opts.getDocument;
  const onSaved = useRef(opts.onSaved);
  onSaved.current = opts.onSaved;

  /** Read through a function so TS doesn't narrow across awaits. */
  const st = () => statusRef.current as SaveStatus;
  const set = useCallback((s: SaveStatus) => {
    statusRef.current = s;
    setStatus(s);
  }, []);

  const save = useCallback(async (): Promise<void> => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (st() === "conflict") return;
    if (inflight.current) {
      again.current = true;
      return;
    }
    const doc = getDoc.current();
    const sig = contentSignature(doc);
    if (sig === savedSig.current) {
      set("saved");
      clearBackup(planId);
      return;
    }
    inflight.current = true;
    set("saving");
    try {
      const res = await fetch(`/api/plans/${planId}/document`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedVersion: version.current, document: doc }),
      });
      if (res.ok) {
        const body = (await res.json()) as { version: number; updatedAt: number };
        version.current = body.version;
        savedSig.current = sig;
        attempt.current = 0;
        setSavedAt(body.updatedAt);
        setError(null);
        onSaved.current?.();
        const latest = contentSignature(getDoc.current());
        if (latest === sig) {
          clearBackup(planId);
          set("saved");
        } else set("dirty");
      } else if (res.status === 409) {
        const body = (await res.json()) as { version: number; document: PlanDocument };
        setConflict({ version: body.version, document: body.document });
        set("conflict");
      } else if (res.status >= 500 || res.status === 408 || res.status === 429) {
        throw new Error(`HTTP ${res.status}`);
      } else {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(
          res.status === 401
            ? "Sua sessão expirou. Entre novamente para salvar."
            : res.status === 403
              ? "Você não tem mais permissão para editar este plan."
              : (body.error ?? "Não foi possível salvar."),
        );
        set("error");
      }
    } catch {
      attempt.current += 1;
      set("offline");
      const delay = Math.min(30_000, 1000 * 2 ** Math.min(attempt.current, 5));
      timer.current = setTimeout(() => void save(), delay);
    } finally {
      inflight.current = false;
      if (again.current) {
        again.current = false;
        if (st() !== "conflict" && st() !== "offline") void save();
      }
    }
  }, [planId, set]);

  /** Call after every content change. */
  const notifyChange = useCallback(() => {
    const doc = getDoc.current();
    const sig = contentSignature(doc);
    if (sig === savedSig.current) {
      if (st() === "dirty") set("saved");
      return;
    }
    writeBackup(planId, { document: doc, at: Date.now(), baseVersion: version.current });
    if (st() === "conflict") return;
    if (st() !== "offline" && st() !== "error") set("dirty");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void save(), st() === "offline" ? 2000 : DEBOUNCE_MS);
  }, [planId, save, set]);

  /** Server copy replaced the local one (reload after conflict, version restore…). */
  const adopt = useCallback(
    (doc: PlanDocument, v: number) => {
      version.current = v;
      savedSig.current = contentSignature(doc);
      setConflict(null);
      setError(null);
      clearBackup(planId);
      set("saved");
    },
    [planId, set],
  );

  /** Keep the local document: overwrite the server copy using its current version. */
  const keepMine = useCallback(() => {
    if (!conflict) return;
    version.current = conflict.version;
    setConflict(null);
    set("dirty");
    void save();
  }, [conflict, save, set]);

  /** Saves now and waits until the server has the current document. */
  const flush = useCallback(async (): Promise<boolean> => {
    for (let i = 0; i < 80; i++) {
      if (!inflight.current) {
        if (contentSignature(getDoc.current()) === savedSig.current) return true;
        if (st() === "conflict" || st() === "error") return false;
        await save();
        if (contentSignature(getDoc.current()) === savedSig.current) return true;
        if (st() === "offline" || st() === "conflict" || st() === "error") return false;
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    return false;
  }, [save]);

  // flush when leaving / hiding the tab
  useEffect(() => {
    const flushKeepalive = () => {
      const doc = getDoc.current();
      const sig = contentSignature(doc);
      if (sig === savedSig.current || st() === "conflict") return false;
      writeBackup(planId, { document: doc, at: Date.now(), baseVersion: version.current });
      try {
        void fetch(`/api/plans/${planId}/document`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ expectedVersion: version.current, document: doc }),
          keepalive: true,
        }).catch(() => {});
      } catch {}
      return true;
    };
    const onHide = () => {
      if (document.visibilityState === "hidden" && !inflight.current) void save();
    };
    const onUnload = (e: BeforeUnloadEvent) => {
      const pending = flushKeepalive();
      if (pending && (st() === "offline" || st() === "error")) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    const onOnline = () => {
      if (st() === "offline") void save();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("beforeunload", onUnload);
    window.addEventListener("online", onOnline);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("beforeunload", onUnload);
      window.removeEventListener("online", onOnline);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [planId, save]);

  return {
    status,
    conflict,
    error,
    savedAt,
    version: () => version.current,
    notifyChange,
    /** Saves immediately (e.g. before publishing). Resolves true once the server is up to date. */
    flush,
    adopt,
    keepMine,
  };
}
