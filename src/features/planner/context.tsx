"use client";
import { createContext, useContext } from "react";
import type { NodeData } from "@/domain/plan";
import type { ResolvedResource } from "./resource-types";

export type PlannerMode = "edit" | "view";

export type PlannerContextValue = {
  mode: PlannerMode;
  resourceFor: (node: { id: string; data: Pick<NodeData, "resource"> }) => ResolvedResource | null;
  /** Node whose title is being edited inline. */
  editingId: string | null;
  setEditingId: (id: string | null) => void;
  commitTitle: (id: string, title: string) => void;
  toggleCollapsed: (id: string) => void;
  childCount: (id: string) => number;
  /** Only node selected (shows the size badge). */
  singleSelectedId: string | null;
  highlightId: string | null;
  dropTargetId: string | null;
  connectSourceId: string | null;
  /** View mode: whether a node reacts to clicks. */
  isInteractive: (node: { id: string; data: NodeData; type?: string }) => boolean;
};

const noop = () => {};

export const PlannerContext = createContext<PlannerContextValue>({
  mode: "view",
  resourceFor: () => null,
  editingId: null,
  setEditingId: noop,
  commitTitle: noop,
  toggleCollapsed: noop,
  childCount: () => 0,
  singleSelectedId: null,
  highlightId: null,
  dropTargetId: null,
  connectSourceId: null,
  isInteractive: () => false,
});

export const usePlanner = () => useContext(PlannerContext);
