import type { WikiPageRow, WikiTreeNode } from "./types";

export function buildWikiTree(pages: WikiPageRow[]): WikiTreeNode[] {
  const byId = new Map<string, WikiTreeNode>();
  for (const p of pages) {
    byId.set(p.id, { ...p, children: [] });
  }
  const roots: WikiTreeNode[] = [];
  for (const p of pages) {
    const node = byId.get(p.id)!;
    if (!p.parent_id) {
      roots.push(node);
    } else {
      const parent = byId.get(p.parent_id);
      if (parent) parent.children.push(node);
      else roots.push(node);
    }
  }
  const sortRec = (nodes: WikiTreeNode[]) => {
    nodes.sort((a, b) => a.sort_order - b.sort_order);
    for (const n of nodes) sortRec(n.children);
  };
  sortRec(roots);
  return roots;
}

export function findWikiPageBySlug(pages: WikiPageRow[], slug: string): WikiPageRow | undefined {
  return pages.find((p) => p.slug === slug);
}

/** Slugs des ancêtres (parents), du plus proche au plus lointain — pour déplier le menu. */
export function getAncestorSlugs(pages: WikiPageRow[], slug: string): string[] {
  const byId = new Map(pages.map((p) => [p.id, p]));
  const page = pages.find((p) => p.slug === slug);
  if (!page) return [];
  const out: string[] = [];
  let cur: WikiPageRow | undefined = page;
  while (cur?.parent_id) {
    const parent = byId.get(cur.parent_id);
    if (!parent) break;
    out.push(parent.slug);
    cur = parent;
  }
  return out;
}

/** Slugs de tous les descendants (profondeur quelconque), sans le nœud racine passé en argument. */
export function collectDescendantSlugs(node: WikiTreeNode): string[] {
  const out: string[] = [];
  for (const c of node.children) {
    out.push(c.slug);
    out.push(...collectDescendantSlugs(c));
  }
  return out;
}

/** Repère le nœud et la liste des frères (même parent : enfants du parent, ou racines). */
export function findNodeWithSiblings(
  roots: WikiTreeNode[],
  slug: string
): { node: WikiTreeNode; siblings: WikiTreeNode[] } | null {
  function walk(nodes: WikiTreeNode[]): { node: WikiTreeNode; siblings: WikiTreeNode[] } | null {
    for (const n of nodes) {
      if (n.slug === slug) return { node: n, siblings: nodes };
      const sub = walk(n.children);
      if (sub) return sub;
    }
    return null;
  }
  return walk(roots);
}

export function filterWikiPagesByQuery(pages: WikiPageRow[], query: string): WikiPageRow[] {
  const q = query.trim().toLowerCase();
  if (!q) return pages;
  const tokens = q.split(/\s+/).filter(Boolean);
  return pages.filter((p) =>
    tokens.every(
      (t) =>
        p.title.toLowerCase().includes(t) ||
        p.search_text.toLowerCase().includes(t) ||
        p.slug.toLowerCase().includes(t)
    )
  );
}

/** Racines qui ont au moins une page correspondante (elle-même ou un descendant). */
export function filterTreeByQuery(tree: WikiTreeNode[], query: string): WikiTreeNode[] {
  const q = query.trim().toLowerCase();
  if (!q) return tree;
  const tokens = q.split(/\s+/).filter(Boolean);

  const pageMatches = (p: WikiPageRow) =>
    tokens.every(
      (t) =>
        p.title.toLowerCase().includes(t) ||
        p.search_text.toLowerCase().includes(t) ||
        p.slug.toLowerCase().includes(t)
    );

  const filterNode = (node: WikiTreeNode): WikiTreeNode | null => {
    const childFiltered = node.children.map(filterNode).filter(Boolean) as WikiTreeNode[];
    if (pageMatches(node)) {
      return { ...node, children: childFiltered.length ? childFiltered : node.children };
    }
    if (childFiltered.length) {
      return { ...node, children: childFiltered };
    }
    return null;
  };

  return tree.map(filterNode).filter(Boolean) as WikiTreeNode[];
}
