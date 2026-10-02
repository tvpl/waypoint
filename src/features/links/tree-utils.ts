import type { TreeNode } from "./types";

/** Depth-first list of every node (client-safe). */
export function flatNodesClient(nodes: TreeNode[]): TreeNode[] {
  return nodes.flatMap((n) => [n, ...flatNodesClient(n.children)]);
}
