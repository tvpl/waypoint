"use client";
import { useCallback, useEffect, useMemo, useState } from "react";

/**
 * Side panels of the editor. Properties: "auto" floats over the canvas only while something is
 * selected; "pinned" docks beside it. Either can be folded away (I). The left panel folds into a
 * strip of icons. Focus mode (⌘\) hides both until it is turned off.
 */
export type Panels = {
  inspector: "auto" | "pinned";
  inspectorOpen: boolean;
  leftCollapsed: boolean;
  focus: boolean;
  setInspector: (mode: "auto" | "pinned") => void;
  setInspectorOpen: (open: boolean) => void;
  setLeftCollapsed: (collapsed: boolean) => void;
  setFocus: (on: boolean) => void;
};

const KEYS = { inspector: "wp-planner-inspector", inspectorOpen: "wp-planner-inspector-open", left: "wp-planner-left-collapsed" };

const read = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const write = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {}
};

export function usePanels(): Panels {
  const [inspector, setInspectorState] = useState<"auto" | "pinned">("auto");
  const [inspectorOpen, setOpenState] = useState(true);
  const [leftCollapsed, setLeftState] = useState(false);
  const [focus, setFocus] = useState(false);
  useEffect(() => {
    if (read(KEYS.inspector) === "pinned") setInspectorState("pinned");
    if (read(KEYS.inspectorOpen) === "0") setOpenState(false);
    if (read(KEYS.left) === "1") setLeftState(true);
  }, []);
  const setInspector = useCallback((m: "auto" | "pinned") => {
    setInspectorState(m);
    setOpenState(true);
    write(KEYS.inspector, m);
    write(KEYS.inspectorOpen, "1");
  }, []);
  const setInspectorOpen = useCallback((o: boolean) => {
    setOpenState(o);
    setFocus(false);
    write(KEYS.inspectorOpen, o ? "1" : "0");
  }, []);
  const setLeftCollapsed = useCallback((c: boolean) => {
    setLeftState(c);
    setFocus(false);
    write(KEYS.left, c ? "1" : "0");
  }, []);
  return useMemo(
    () => ({ inspector, inspectorOpen, leftCollapsed, focus, setInspector, setInspectorOpen, setLeftCollapsed, setFocus }),
    [inspector, inspectorOpen, leftCollapsed, focus, setInspector, setInspectorOpen, setLeftCollapsed],
  );
}
